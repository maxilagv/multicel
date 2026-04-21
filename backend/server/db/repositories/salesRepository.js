const { withTransaction, query } = require('../../db/pg');
const inv = require('../../services/inventoryService');
const marketplaceService = require('../../services/marketplaceService');
const pricingRepo = require('./pricingRepository');
const priceListRepo = require('./priceListRepository');
const surchargeRepo = require('./paymentSurchargeRepository');
const vendorPayrollRepo = require('./vendorPayrollRepository');
const automationEventRepo = require('./automationEventRepository');
const supplierRepo = require('./supplierRepository');
const companyAccountRepo = require('./companyAccountRepository');
const clientDepositoRepo = require('./clientDepositoRepository');
const { buildSaleVisibilityClause } = require('../../lib/saleVisibility');

function roundMoney(value) {
  const n = Number(value) || 0;
  return Math.round(n * 100) / 100;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toMysqlDatetimeUTC(date) {
  return (
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ` +
    `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`
  );
}

function normalizeVentaFecha(fechaInput) {
  if (!fechaInput) return toMysqlDatetimeUTC(new Date());

  const candidate =
    fechaInput instanceof Date
      ? fechaInput
      : new Date(String(fechaInput).trim());

  if (Number.isNaN(candidate.getTime())) {
    const e = new Error('Fecha de venta invalida');
    e.status = 400;
    throw e;
  }

  return toMysqlDatetimeUTC(candidate);
}

function resolveCostoUnitario(product) {
  const costoPesos = Number(product?.costo_pesos || 0);
  if (costoPesos > 0) return costoPesos;
  const costoDolares = Number(product?.costo_dolares || 0);
  const tipoCambio = Number(product?.tipo_cambio || 0);
  if (costoDolares > 0 && tipoCambio > 0) return costoDolares * tipoCambio;
  return 0;
}

function matchesOfferList(offer, appliedList) {
  const rawTarget = String(offer?.lista_precio_objetivo || 'todas').trim().toLowerCase();
  const rawTargetId = Number(offer?.lista_precio_id || 0);
  if (!appliedList) return rawTarget === 'todas' && rawTargetId <= 0;
  if (rawTarget === 'todas' && rawTargetId <= 0) return true;
  if (rawTargetId > 0 && Number(appliedList.id) === rawTargetId) return true;

  const appliedCodes = [
    String(appliedList.legacy_code || '').trim().toLowerCase(),
    String(appliedList.slug || '').trim().toLowerCase(),
    String(appliedList.key || '').trim().toLowerCase(),
  ].filter(Boolean);

  return appliedCodes.includes(rawTarget);
}

function toComparableDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function dateInRange(target, from, to) {
  const t = toComparableDate(target);
  if (!t) return false;
  const f = toComparableDate(from);
  const h = toComparableDate(to);
  if (f && t < f) return false;
  if (h && t > h) return false;
  return true;
}

function resolveOfferForLine({ line, offers, appliedList, saleDate }) {
  const candidates = [];
  for (const offer of offers || []) {
    if (!offer || Number(offer.activo) !== 1) continue;
    const tipo = String(offer.tipo_oferta || '').trim().toLowerCase();
    const productoId = offer.producto_id ? Number(offer.producto_id) : null;
    const productoIds = Array.isArray(offer.producto_ids)
      ? offer.producto_ids
          .map((value) => Number(value))
          .filter((n) => Number.isInteger(n) && n > 0)
      : [];
    const descuentoPct = Number(offer.descuento_pct || 0);
    if (!Number.isFinite(descuentoPct) || descuentoPct <= 0) continue;
    if (productoIds.length) {
      if (!productoIds.includes(Number(line.producto.id))) continue;
    } else if (productoId && Number(line.producto.id) !== productoId) {
      continue;
    }
    if (!matchesOfferList(offer, appliedList)) continue;
    if (tipo === 'cantidad') {
      const minQty = Math.max(1, Number(offer.cantidad_minima || 1));
      if (Number(line.cantidad || 0) < minQty) continue;
    } else if (tipo === 'fecha') {
      if (!dateInRange(saleDate, offer.fecha_desde, offer.fecha_hasta)) continue;
    } else {
      continue;
    }
    candidates.push({
      id: Number(offer.id),
      descuento_pct: descuentoPct,
      prioridad: Number(offer.prioridad || 0),
    });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (b.descuento_pct !== a.descuento_pct) return b.descuento_pct - a.descuento_pct;
    if (b.prioridad !== a.prioridad) return b.prioridad - a.prioridad;
    return b.id - a.id;
  });
  return candidates[0];
}

async function createVenta({
  cliente_id,
  fecha,
  descuento = 0,
  impuestos = 0,
  items = [],
  deposito_id,
  es_reserva = false,
  usuario_id = null,
  referido_codigo,
  caja_tipo,
  price_list_type,
  price_list_id = null,
  metodo_pago_id = null,
  proveedor_cuenta_id = null,
  allow_custom_unit_price = false,
  vendedor_perfil_id = null,
  vendedor_nombre = null,
  strict_deposito = false,
}) {
  return withTransaction(async (client) => {
    const ventaFecha = normalizeVentaFecha(fecha);

    // Validate cliente
    const c = await client.query(
      'SELECT id, estado, deleted_at FROM clientes WHERE id = $1',
      [cliente_id]
    );
    if (!c.rowCount) {
      const e = new Error('Cliente no encontrado');
      e.status = 400;
      e.code = 'CLIENTE_NO_ENCONTRADO';
      throw e;
    }
    const cliente = c.rows[0];
    if (cliente.deleted_at) {
      const e = new Error('Cliente no encontrado');
      e.status = 400;
      e.code = 'CLIENTE_NO_ENCONTRADO';
      throw e;
    }
    if (cliente.estado !== 'activo') {
      const e = new Error('El cliente est\u00e1 inactivo');
      e.status = 400;
      e.code = 'CLIENTE_INACTIVO';
      throw e;
    }
    // Load and lock inventory for items
    const ids = items.map((i) => Number(i.producto_id));
    if (!ids.length) {
      const e = new Error('Debe incluir items');
      e.status = 400;
      throw e;
    }
    const uniqueIds = Array.from(
      new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))
    );
    if (!uniqueIds.length) {
      const e = new Error('Debe incluir items');
      e.status = 400;
      throw e;
    }
    const productPlaceholders = uniqueIds.map((_, idx) => `$${idx + 1}`).join(', ');
    const { rows: products } = await client.query(
      `SELECT p.id,
              p.nombre,
              p.precio_venta::float AS price,
              p.precio_local::float AS price_local,
              p.precio_distribuidor::float AS price_distribuidor,
              p.precio_final::float AS precio_final,
              p.comision_pct::float AS comision_pct,
              p.precio_costo_pesos::float AS costo_pesos,
              p.precio_costo_dolares::float AS costo_dolares,
              p.tipo_cambio::float AS tipo_cambio,
              p.deleted_at
         FROM productos p
        WHERE p.id IN (${productPlaceholders})`,
      uniqueIds
    );
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[ventas] productos solicitados', ids);
        console.debug('[ventas] productos encontrados', products.map((p) => p.id));
      }
    } catch {}
    const byId = new Map(products.map((p) => [Number(p.id), p]));
    const isReserva = Boolean(es_reserva);
    const priceLists = await priceListRepo.listPriceListsTx(client, { includeInactive: false });
    const selectedPriceList =
      (price_list_id ? await priceListRepo.getPriceListByIdTx(client, price_list_id) : null) ||
      (price_list_type ? await priceListRepo.getPriceListByCodeTx(client, price_list_type) : null) ||
      priceLists.find((item) => item.legacy_code === 'local') ||
      priceLists[0] ||
      null;

    if (!selectedPriceList) {
      const e = new Error('No hay listas de precio configuradas');
      e.status = 400;
      e.code = 'LISTA_PRECIO_INVALIDA';
      throw e;
    }
    if (selectedPriceList.enabled === false || selectedPriceList.activo === false) {
      const e = new Error('La lista de precio seleccionada esta inactiva');
      e.status = 400;
      e.code = 'LISTA_PRECIO_INVALIDA';
      throw e;
    }

    const selectedPriceListCode =
      selectedPriceList.legacy_code || selectedPriceList.slug || selectedPriceList.key || 'local';

    // Recargo por método de pago (puede ser null si no hay configuración o no se eligió método)
    const metodoPagoIdNorm = metodo_pago_id ? Number(metodo_pago_id) : null;
    const proveedorCuentaIdNorm = proveedor_cuenta_id ? Number(proveedor_cuenta_id) : null;
    let metodoPagoInfo = null;
    if (metodoPagoIdNorm) {
      const { rows } = await client.query(
        `SELECT id, nombre, activo
           FROM metodos_pago
          WHERE id = $1
          LIMIT 1`,
        [metodoPagoIdNorm]
      );
      if (!rows.length) {
        const e = new Error('Metodo de pago no encontrado');
        e.status = 400;
        e.code = 'METODO_PAGO_INVALIDO';
        throw e;
      }
      if (Number(rows[0].activo) !== 1) {
        const e = new Error('El metodo de pago seleccionado esta inactivo');
        e.status = 400;
        e.code = 'METODO_PAGO_INVALIDO';
        throw e;
      }
      metodoPagoInfo = rows[0];
    }
    const isCuentaEmpresa =
      String(metodoPagoInfo?.nombre || '')
        .trim()
        .toLowerCase() === 'cuenta empresa';
    let proveedorCuentaInfo = null;
    if (isCuentaEmpresa) {
      if (!proveedorCuentaIdNorm) {
        const e = new Error('Selecciona la cuenta empresa que corresponde a la venta');
        e.status = 400;
        e.code = 'PROVEEDOR_CUENTA_REQUERIDO';
        throw e;
      }
      if (!(await companyAccountRepo.canUseProveedorCuentaField(client))) {
        const e = new Error('La cuenta empresa todavia no esta lista en la base. Ejecuta la migracion V35.');
        e.status = 409;
        e.code = 'MIGRATION_REQUIRED';
        throw e;
      }
      proveedorCuentaInfo = await supplierRepo.findById(proveedorCuentaIdNorm, { includeSensitive: true });
      if (!proveedorCuentaInfo) {
        const e = new Error('Proveedor de cuenta empresa no encontrado');
        e.status = 400;
        e.code = 'PROVEEDOR_CUENTA_INVALIDO';
        throw e;
      }
      if (!proveedorCuentaInfo.activo) {
        const e = new Error('La cuenta empresa elegida ya no esta activa');
        e.status = 400;
        e.code = 'PROVEEDOR_CUENTA_INVALIDO';
        throw e;
      }
      if (!proveedorCuentaInfo.alias_cuenta) {
        const e = new Error('El proveedor seleccionado no tiene alias de cuenta configurado');
        e.status = 400;
        e.code = 'PROVEEDOR_CUENTA_INVALIDO';
        throw e;
      }
      await companyAccountRepo.ensureCuentaEmpresaReady(client);
    }
    const aplicableSurcharge = metodoPagoIdNorm
      ? await surchargeRepo.getApplicableSurcharge(metodoPagoIdNorm, selectedPriceList.id).catch(() => null)
      : null;

    const offersPromise = (async () => {
      try {
        const { rows: baseOffers } = await client.query(
          `SELECT id,
                  tipo_oferta,
                  producto_id,
                  lista_precio_id,
                  lista_precio_objetivo,
                  cantidad_minima,
                  descuento_pct,
                  fecha_desde,
                  fecha_hasta,
                  prioridad,
                  activo
             FROM ofertas_precios
            WHERE activo = 1`
        );
        const offers = baseOffers || [];
        const offerIds = Array.from(
          new Set(
            offers
              .map((offer) => Number(offer.id))
              .filter((n) => Number.isInteger(n) && n > 0)
          )
        );
        if (!offerIds.length) return offers;

        try {
          const marks = offerIds.map((_, idx) => `$${idx + 1}`).join(', ');
          const { rows: mappedRows } = await client.query(
            `SELECT oferta_id, producto_id
               FROM ofertas_precios_productos
              WHERE oferta_id IN (${marks})
              ORDER BY oferta_id ASC, producto_id ASC`,
            offerIds
          );
          const productIdsByOfferId = new Map();
          for (const row of mappedRows || []) {
            const offerId = Number(row.oferta_id);
            const productId = Number(row.producto_id);
            if (!Number.isInteger(offerId) || offerId <= 0) continue;
            if (!Number.isInteger(productId) || productId <= 0) continue;
            if (!productIdsByOfferId.has(offerId)) productIdsByOfferId.set(offerId, []);
            const list = productIdsByOfferId.get(offerId);
            if (!list.includes(productId)) list.push(productId);
          }
          return offers.map((offer) => ({
            ...offer,
            producto_ids: productIdsByOfferId.get(Number(offer.id)) || [],
          }));
        } catch {
          return offers.map((offer) => ({
            ...offer,
            producto_ids:
              offer.producto_id && Number.isInteger(Number(offer.producto_id))
                ? [Number(offer.producto_id)]
                : [],
          }));
        }
      } catch {
        return [];
      }
    })();
    // Calculate totals (validación de stock se hará al momento de entrega)
    const preparedItems = [];
    let total = 0;
    for (const it of items) {
      const p = byId.get(Number(it.producto_id));
      if (!p || p.deleted_at) {
        const e = new Error(`Producto ${it.producto_id} inexistente`);
        e.status = 400;
        e.code = 'PRODUCTO_NO_ENCONTRADO';
        throw e;
      }
      const qty = Number(it.cantidad) || 0;
      const requestedUnitPrice = Number(it.precio_unitario);
      const resolvedPrice =
        allow_custom_unit_price && Number.isFinite(requestedUnitPrice) && requestedUnitPrice > 0
          ? null
          : await priceListRepo.resolveProductPriceTx(client, {
              productId: Number(p.id),
              priceListId: selectedPriceList.id,
              quantity: qty,
            });
      const unitPrice =
        allow_custom_unit_price && Number.isFinite(requestedUnitPrice) && requestedUnitPrice > 0
          ? requestedUnitPrice
          : Number(resolvedPrice?.unit_price || 0);
      if (!(unitPrice > 0)) {
        const e = new Error(
          `Producto ${it.producto_id} sin precio valido para la lista ${selectedPriceListCode}`
        );
        e.status = 400;
        e.code = 'PRECIO_INVALIDO';
        throw e;
      }
      // Aplicar recargo por método de pago sobre el precio resuelto
      const surchargeResult = surchargeRepo.applySurcharge(unitPrice, aplicableSurcharge);
      const finalUnitPrice = surchargeResult.precio_final;
      const subtotal = finalUnitPrice * qty;
      total += subtotal;
      preparedItems.push({
        raw: it,
        producto: p,
        cantidad: qty,
        precio_unitario: finalUnitPrice,
        precio_sin_recargo: surchargeResult.precio_sin_recargo,
        recargo_pago_pct: surchargeResult.recargo_pct,
        subtotal,
        selected_price_list: selectedPriceList,
        selected_price_list_type: selectedPriceListCode,
        applied_price_list:
          resolvedPrice?.applied_list || selectedPriceList,
        applied_price_list_id:
          resolvedPrice?.applied_list_id || Number(selectedPriceList.id),
        applied_price_list_code:
          resolvedPrice?.applied_list_code || selectedPriceListCode,
        quantity_rule_id: resolvedPrice?.rule_id || null,
        quantity_rule_summary: resolvedPrice?.rule_summary || null,
      });
    }

    const offersRows = await offersPromise;
    const vendorConfig = usuario_id
      ? await vendorPayrollRepo.getVendorConfig(Number(usuario_id)).catch(() => null)
      : null;
    const vendorCommissionMode = String(vendorConfig?.comision_tipo || 'por_producto')
      .trim()
      .toLowerCase();
    const vendorPeriodo = String(vendorConfig?.periodo_liquidacion || 'mes').trim().toLowerCase();
    const fixedCommission =
      usuario_id && vendorCommissionMode === 'por_total_venta'
        ? await vendorPayrollRepo
            .getComisionActiva({
              usuario_id: Number(usuario_id),
              periodo: vendorPeriodo,
              fecha: String(ventaFecha).slice(0, 10),
            })
            .catch(() => null)
        : null;
    const listCommissionConfig =
      usuario_id && vendorCommissionMode === 'por_lista'
        ? await pricingRepo
            .getCommissionConfigTx(client, { usuarioId: Number(usuario_id) })
            .catch(() => ({ listas: [], porcentajes: {} }))
        : { listas: [], porcentajes: {} };
    const listPctByCode = new Map(
      (listCommissionConfig?.listas || []).map((row) => [
        String(row?.lista_codigo || '').trim().toLowerCase(),
        Number(row?.porcentaje || 0),
      ])
    );
    const saleDateForOffer = toComparableDate(ventaFecha) || new Date();
    let totalOfferDiscount = 0;
    for (const line of preparedItems) {
      const matched = resolveOfferForLine({
        line,
        offers: offersRows,
        appliedList: line.applied_price_list || selectedPriceList,
        saleDate: saleDateForOffer,
      });
      const pct = matched ? Number(matched.descuento_pct || 0) : 0;
      const lineOfferDiscount = roundMoney(line.subtotal * (pct / 100));
      line.offer_id = matched ? Number(matched.id) : null;
      line.offer_pct = pct > 0 ? pct : 0;
      line.offer_discount = lineOfferDiscount > 0 ? lineOfferDiscount : 0;
      line.effective_subtotal = roundMoney(line.subtotal - line.offer_discount);
      line.commission_list_code =
        line.offer_discount > 0
          ? 'oferta'
          : line.applied_price_list_code || selectedPriceListCode;
      totalOfferDiscount += line.offer_discount;
    }
    totalOfferDiscount = roundMoney(totalOfferDiscount);
    const baseDescuento = Number(descuento) || 0;
    const baseImpuestos = Number(impuestos) || 0;

    let referidoInfo = null;
    let referidoDescuento = 0;
    let referidoComision = 0;
    if (referido_codigo) {
      referidoInfo = await marketplaceService.resolveReferido({
        codigo: referido_codigo,
        total,
        client,
      });
      referidoDescuento = Number(referidoInfo.descuento_aplicado || 0);
      referidoComision = Number(referidoInfo.comision_monto || 0);
    }

    const baseSinIvaTotal = Math.max(0, total - baseDescuento - totalOfferDiscount - referidoDescuento);
    const neto = total - baseDescuento - totalOfferDiscount - referidoDescuento + baseImpuestos;

    const resolvedDepositoId = await inv.resolveDepositoId(client, deposito_id, {
      requireExplicit: strict_deposito,
    });

    if (!isReserva) {
      const placeholders = uniqueIds.map((_, idx) => `$${idx + 2}`).join(', ');
      const { rows: invRows } = await client.query(
        `SELECT producto_id, cantidad_disponible
           FROM inventario_depositos
          WHERE deposito_id = $1 AND producto_id IN (${placeholders})`,
        [resolvedDepositoId, ...uniqueIds]
      );
      const invById = new Map(
        invRows.map((r) => [Number(r.producto_id), Number(r.cantidad_disponible || 0)])
      );
      for (const it of items) {
        const qty = Number(it.cantidad) || 0;
        const prodId = Number(it.producto_id);
        const available = invById.has(prodId) ? Number(invById.get(prodId) || 0) : 0;
        if (available < qty) {
          const e = new Error(
            `Stock insuficiente para producto ${prodId} (disp ${available}, req ${qty}). Usa reserva si corresponde.`
          );
          e.status = 409;
          e.code = 'STOCK_INSUFICIENTE';
          throw e;
        }
      }
    }

    let cajaTipoFinal = typeof caja_tipo === 'string' ? caja_tipo.trim().toLowerCase() : '';
    if (!['home_office', 'sucursal'].includes(cajaTipoFinal)) {
      cajaTipoFinal = '';
    }
    if (!cajaTipoFinal && usuario_id) {
      const { rows: userRows } = await client.query(
        'SELECT caja_tipo_default FROM usuarios WHERE id = $1',
        [usuario_id]
      );
      const userCaja = userRows?.[0]?.caja_tipo_default;
      if (typeof userCaja === 'string' && ['home_office', 'sucursal'].includes(userCaja)) {
        cajaTipoFinal = userCaja;
      }
    }
    if (!cajaTipoFinal) cajaTipoFinal = 'sucursal';

    const ventaColumns = [
      'cliente_id',
      'fecha',
      'total',
      'descuento',
      'impuestos',
      'neto',
      'estado_pago',
      'deposito_id',
      'es_reserva',
      'usuario_id',
      'caja_tipo',
      'price_list_type',
      'price_list_id',
      'vendedor_perfil_id',
      'vendedor_nombre',
      'metodo_pago_id',
      'recargo_pago_pct',
    ];
    const ventaValues = [
      cliente_id,
      ventaFecha,
      total,
      baseDescuento + totalOfferDiscount,
      baseImpuestos,
      neto,
      'pendiente',
      resolvedDepositoId,
      isReserva ? 1 : 0,
      usuario_id,
      cajaTipoFinal,
      selectedPriceListCode,
      Number(selectedPriceList.id),
      vendedor_perfil_id || null,
      vendedor_nombre || null,
      metodoPagoIdNorm || null,
      aplicableSurcharge
        ? (String(aplicableSurcharge.tipo) === 'descuento' ? -aplicableSurcharge.valor_pct : aplicableSurcharge.valor_pct)
        : 0,
    ];
    if (await companyAccountRepo.canUseProveedorCuentaField(client)) {
      ventaColumns.push('proveedor_cuenta_id');
      ventaValues.push(proveedorCuentaInfo?.id || null);
    }
    const ventaPlaceholders = ventaColumns.map((_, idx) => `$${idx + 1}`);
    const insVenta = await client.query(
      `INSERT INTO ventas(${ventaColumns.join(', ')})
       VALUES (${ventaPlaceholders.join(', ')}) RETURNING id`,
      ventaValues
    );
    const ventaId = insVenta.rows[0].id;
    await clientDepositoRepo.linkClienteDepositoTx(client, cliente_id, resolvedDepositoId);
    if (isCuentaEmpresa && proveedorCuentaInfo) {
      await companyAccountRepo.createCuentaEmpresaTransaction(
        {
          proveedor_id: proveedorCuentaInfo.id,
          venta_id: ventaId,
          monto: neto,
          moneda: 'ARS',
          estado: 'pendiente',
          origen: 'venta',
          alias_cuenta_snapshot: proveedorCuentaInfo.alias_cuenta || null,
          banco_snapshot: proveedorCuentaInfo.banco || null,
          nota: `Venta #${ventaId} creada con Cuenta Empresa`,
          metadata_json: JSON.stringify({
            cliente_id,
            metodo_pago_id: metodoPagoIdNorm,
            venta_total: total,
            venta_neto: neto,
          }),
          creado_por_usuario_id: usuario_id || null,
        },
        client
      );
    }

    const effectiveSubtotalTotal = preparedItems.reduce(
      (acc, line) => acc + Number(line.effective_subtotal || 0),
      0
    );
    const baseTotalCents = Math.round(baseSinIvaTotal * 100);
    let baseAcumuladaCents = 0;
    for (let idx = 0; idx < preparedItems.length; idx += 1) {
      const it = preparedItems[idx];
      const p = it.producto;
      const share = effectiveSubtotalTotal > 0 ? it.effective_subtotal / effectiveSubtotalTotal : 0;
      const isLast = idx === preparedItems.length - 1;
      const baseLineaCents = isLast
        ? baseTotalCents - baseAcumuladaCents
        : Math.floor(baseTotalCents * share);
      baseAcumuladaCents += baseLineaCents;
      const baseLinea = baseLineaCents / 100;
      const listCode = String(it.commission_list_code || selectedPriceListCode || '')
        .trim()
        .toLowerCase();
      let comisionPct = 0;
      let comisionMonto = 0;
      let comisionTipoCalculo = vendorCommissionMode;

      if (vendorCommissionMode === 'por_lista') {
        comisionPct = Number(listPctByCode.get(listCode) || 0);
        comisionMonto = roundMoney(Number(it.subtotal || 0) * (comisionPct / 100));
      } else if (vendorCommissionMode === 'por_total_venta') {
        comisionPct = Number(fixedCommission?.porcentaje || 0);
        const baseTipo = String(fixedCommission?.base_tipo || 'bruto').trim().toLowerCase();
        const baseComision = baseTipo === 'neto' ? baseLinea : Number(it.subtotal || 0);
        comisionMonto = roundMoney(baseComision * (comisionPct / 100));
      } else {
        comisionTipoCalculo = 'por_producto';
        comisionPct = Number(p.comision_pct || 0);
        comisionMonto = roundMoney(Number(it.subtotal || 0) * (comisionPct / 100));
      }
      const costoUnit = roundMoney(resolveCostoUnitario(p));
      await client.query(
        `INSERT INTO ventas_detalle(
           venta_id,
           producto_id,
           cantidad,
           precio_unitario,
           subtotal,
           base_sin_iva,
           comision_pct,
           comision_monto,
           comision_tipo_calculo,
           costo_unitario_pesos,
           lista_precio_id,
           lista_precio_codigo,
           regla_precio_cantidad_id,
           oferta_precio_id,
           descuento_oferta,
           descuento_oferta_pct,
           recargo_pago_pct,
           precio_sin_recargo
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          ventaId,
          Number(p.id),
          it.cantidad,
          it.precio_unitario,
          it.subtotal,
          baseLinea,
          comisionPct,
          comisionMonto,
          comisionTipoCalculo,
          costoUnit,
          it.applied_price_list_id || Number(selectedPriceList.id),
          it.commission_list_code || selectedPriceListCode,
          it.quantity_rule_id,
          it.offer_id,
          it.offer_discount || 0,
          it.offer_pct || 0,
          it.recargo_pago_pct || 0,
          it.precio_sin_recargo || null,
        ]
      );
    }

    if (!isReserva) {
      for (const line of preparedItems) {
        await inv.removeStockTx(client, {
          producto_id: Number(line.producto.id),
          cantidad: Number(line.cantidad || 0),
          motivo: 'venta_creada',
          referencia: `VENTA ${ventaId}`,
          usuario_id: usuario_id || null,
          deposito_id: resolvedDepositoId,
        });
      }
    }

    if (referidoInfo) {
      const newUsos = Number(referidoInfo.usos_actuales || 0) + 1;
      await client.query(
        `UPDATE referidos
            SET usos_actuales = $2,
                estado = CASE WHEN $3 > 0 AND $2 >= $3 THEN 'agotado' ELSE estado END,
                actualizado_en = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [referidoInfo.referido_id, newUsos, Number(referidoInfo.max_usos || 0)]
      );
      await client.query(
        `INSERT INTO uso_referidos(
           referido_id, venta_id, total_venta, descuento_aplicado, comision_monto, usuario_id, notas
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          referidoInfo.referido_id,
          ventaId,
          total,
          referidoDescuento,
          referidoComision,
          usuario_id,
          `codigo:${referidoInfo.codigo}`,
        ]
      );
    }

    await automationEventRepo.enqueueTx(client, {
      eventName: 'venta_creada',
      aggregateType: 'venta',
      aggregateId: ventaId,
      idempotencyKey: `venta:${ventaId}:creada`,
      payload: {
        venta_id: ventaId,
        cliente_id,
        total,
        neto,
        descuento: baseDescuento + totalOfferDiscount,
        impuestos: baseImpuestos,
        usuario_id,
        deposito_id: resolvedDepositoId,
        es_reserva: isReserva,
        caja_tipo: cajaTipoFinal,
        price_list_type: selectedPriceListCode,
        price_list_id: Number(selectedPriceList.id),
        metodo_pago_id: metodoPagoIdNorm || null,
        proveedor_cuenta_id: proveedorCuentaInfo?.id || null,
        vendedor_perfil_id: vendedor_perfil_id || null,
        vendedor_nombre: vendedor_nombre || null,
        productos: preparedItems.map((line) => ({
          producto_id: Number(line.producto.id),
          nombre: line.producto.nombre,
          cantidad: Number(line.cantidad || 0),
          precio_unitario: Number(line.precio_unitario || 0),
          subtotal: Number(line.subtotal || 0),
        })),
      },
    });

    return {
      id: ventaId,
      total,
      neto,
      descuento_ofertas: totalOfferDiscount,
      comision_mode: vendorCommissionMode,
      es_reserva: isReserva,
    };
  });
}

async function listarVentas({
  cliente_id,
  deposito_id,
  limit = 100,
  offset = 0,
  view,
  visibility = null,
} = {}) {
  const where = [];
  const params = [];

  if (cliente_id != null) {
    const cid = Number(cliente_id);
    if (Number.isInteger(cid) && cid > 0) {
      params.push(cid);
      where.push(`v.cliente_id = $${params.length}`);
    }
  }
  if (deposito_id != null) {
    const depId = Number(deposito_id);
    if (Number.isInteger(depId) && depId > 0) {
      params.push(depId);
      where.push(`v.deposito_id = $${params.length}`);
    }
  }
  const visibilityClause = buildSaleVisibilityClause(params, visibility, 'v');
  if (visibilityClause) {
    where.push(visibilityClause);
  }

  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(lim);
  params.push(off);

  const viewMode = String(view || '').trim().toLowerCase();
  const selectColumns =
    viewMode === 'mobile'
      ? `v.id, v.cliente_id, c.nombre AS cliente_nombre, v.fecha,
         v.usuario_id, u.nombre AS usuario_nombre, u.email AS usuario_email,
         v.vendedor_perfil_id,
         COALESCE(NULLIF(TRIM(v.vendedor_nombre), ''), NULLIF(TRIM(vp.nombre), ''), NULLIF(TRIM(u.nombre), ''), NULLIF(TRIM(u.email), '')) AS vendedor_nombre,
         v.total::float AS total, v.neto::float AS neto,
         v.estado_pago, v.estado_entrega, v.caja_tipo, v.price_list_type, v.price_list_id, v.es_reserva, v.deposito_id,
         COALESCE(p.total_pagado, 0)::float AS total_pagado,
         (v.neto - COALESCE(p.total_pagado, 0))::float AS saldo_pendiente`
      : `v.id, v.cliente_id, c.nombre AS cliente_nombre, v.fecha, v.usuario_id,
         u.nombre AS usuario_nombre, u.email AS usuario_email,
         v.vendedor_perfil_id,
         COALESCE(NULLIF(TRIM(v.vendedor_nombre), ''), NULLIF(TRIM(vp.nombre), ''), NULLIF(TRIM(u.nombre), ''), NULLIF(TRIM(u.email), '')) AS vendedor_nombre,
         v.total::float AS total, v.descuento::float AS descuento, v.impuestos::float AS impuestos,
         v.neto::float AS neto, v.estado_pago, v.estado_entrega, v.caja_tipo, v.price_list_type, v.price_list_id, v.observaciones, v.oculto, v.es_reserva, v.deposito_id,
         COALESCE(p.total_pagado, 0)::float AS total_pagado,
         (v.neto - COALESCE(p.total_pagado, 0))::float AS saldo_pendiente`;

  const sql = `SELECT ${selectColumns}
                 FROM ventas v
                 JOIN clientes c ON c.id = v.cliente_id
            LEFT JOIN usuarios u ON u.id = v.usuario_id
            LEFT JOIN vendedor_perfiles vp ON vp.id = v.vendedor_perfil_id
            LEFT JOIN (
                      SELECT venta_id, SUM(monto) AS total_pagado
                        FROM pagos
                       GROUP BY venta_id
                     ) p ON p.venta_id = v.id
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY v.id DESC
                LIMIT $${params.length - 1}
               OFFSET $${params.length}`;

  const { rows } = await query(sql, params);
  return rows;
}

async function getVentaEntregaInfo(id) {
  const { rows } = await query(
    'SELECT id, estado_entrega, caja_tipo FROM ventas WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function getVentaDetalle(id) {
  const { rows } = await query(
    `SELECT d.id,
            d.producto_id,
            p.nombre AS producto_nombre,
            d.cantidad,
            d.precio_unitario::float AS precio_unitario,
            d.subtotal::float AS subtotal,
            COALESCE(d.descuento_oferta, 0)::float AS descuento_oferta,
            COALESCE(d.descuento_oferta_pct, 0)::float AS descuento_oferta_pct,
            (d.subtotal - COALESCE(d.descuento_oferta, 0))::float AS subtotal_neto,
            d.lista_precio_id,
            COALESCE(lp.nombre, d.lista_precio_codigo) AS lista_precio_nombre,
            COALESCE(lp.legacy_code, lp.slug, d.lista_precio_codigo) AS lista_precio_codigo,
            d.regla_precio_cantidad_id,
            d.oferta_precio_id,
            o.nombre AS oferta_nombre,
            o.tipo_oferta AS oferta_tipo
       FROM ventas_detalle d
       JOIN productos p ON p.id = d.producto_id
  LEFT JOIN listas_precio lp ON lp.id = d.lista_precio_id
  LEFT JOIN ofertas_precios o ON o.id = d.oferta_precio_id
      WHERE d.venta_id = $1`,
    [id]
  );
  return rows;
}

module.exports = { createVenta, listarVentas, getVentaDetalle, getVentaEntregaInfo };

async function hasCreateStockDiscountTx(client, ventaId) {
  const { rows } = await client.query(
    `SELECT 1
       FROM movimientos_stock
      WHERE referencia = $1
        AND tipo = 'salida'
        AND motivo = 'venta_creada'
      LIMIT 1`,
    [`VENTA ${ventaId}`]
  );
  return rows.length > 0;
}
 
async function entregarVenta(id, usuario_id = null) {
  return withTransaction(async (client) => {
    const v = await client.query(
      'SELECT id, estado_entrega, deposito_id, es_reserva FROM ventas WHERE id = $1',
      [id]
    );
    if (!v.rowCount) { const e = new Error('Venta no encontrada'); e.status = 404; throw e; }
    const venta = v.rows[0];
    if (venta.estado_entrega === 'entregado') { const e = new Error('La venta ya está entregada'); e.status = 400; throw e; }
    const { rows: items } = await client.query(
      `SELECT producto_id, cantidad, precio_unitario FROM ventas_detalle WHERE venta_id = $1 ORDER BY id ASC`,
      [id]
    );
    const isReserva = Number(venta.es_reserva || 0) === 1;
    const alreadyDiscountedOnCreate = await hasCreateStockDiscountTx(client, id);
    const shouldDiscountOnEntrega = isReserva || !alreadyDiscountedOnCreate;

    if (shouldDiscountOnEntrega) {
      for (const it of items) {
        await inv.removeStockTx(client, {
          producto_id: Number(it.producto_id),
          cantidad: Number(it.cantidad),
          motivo: isReserva ? 'venta_entrega_reserva' : 'venta_entrega',
          referencia: `VENTA ${id}`,
          usuario_id: usuario_id || null,
          deposito_id: venta.deposito_id,
        });
      }
    }
    await client.query("UPDATE ventas SET estado_entrega = 'entregado', fecha_entrega = NOW() WHERE id = $1", [id]);
    await automationEventRepo.enqueueTx(client, {
      eventName: 'venta_entregada',
      aggregateType: 'venta',
      aggregateId: id,
      idempotencyKey: `venta:${id}:entregada`,
      payload: {
        venta_id: Number(id),
        deposito_id: venta.deposito_id != null ? Number(venta.deposito_id) : null,
        items: (items || []).map((item) => ({
          producto_id: Number(item.producto_id),
          cantidad: Number(item.cantidad || 0),
          precio_unitario: Number(item.precio_unitario || 0),
        })),
      },
    });
    return { id, entregado: true };
  });
}

module.exports.entregarVenta = entregarVenta;

async function setOculto(id, oculto = true) {
  const { rows } = await query(
    'UPDATE ventas SET oculto = $2 WHERE id = $1 RETURNING id',
    [id, oculto]
  );
  return rows[0] || null;
}

module.exports.setOculto = setOculto;

async function cancelarVenta(id, motivo, usuario_id = null) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, cliente_id, deposito_id, es_reserva, estado_entrega, estado_pago, observaciones
         FROM ventas
        WHERE id = $1`,
      [id]
    );
    if (!rows.length) {
      const e = new Error('Venta no encontrada');
      e.status = 404;
      throw e;
    }
    const venta = rows[0];
    if (venta.estado_entrega === 'entregado') {
      const e = new Error('No se puede cancelar una venta entregada');
      e.status = 400;
      throw e;
    }
    if (venta.estado_pago === 'cancelado') {
      return { id, cancelado: true };
    }
    const motivoTexto = (motivo || '').trim() || 'Cancelado por el usuario';
    const nuevaObs =
      venta.observaciones && venta.observaciones.trim()
        ? `${venta.observaciones} | ${motivoTexto}`
        : motivoTexto;
    const shouldRestoreStock =
      Number(venta.es_reserva || 0) !== 1 && (await hasCreateStockDiscountTx(client, id));

    if (shouldRestoreStock) {
      const { rows: items } = await client.query(
        `SELECT producto_id, cantidad
           FROM ventas_detalle
          WHERE venta_id = $1
          ORDER BY id ASC`,
        [id]
      );
      for (const item of items) {
        await inv.addStockTx(client, {
          producto_id: Number(item.producto_id),
          cantidad: Number(item.cantidad || 0),
          motivo: 'venta_cancelada',
          referencia: `VENTA ${id}`,
          usuario_id: usuario_id || null,
          deposito_id: venta.deposito_id,
        });
      }
    }
    await client.query(
      `UPDATE ventas
          SET estado_pago = 'cancelado',
              observaciones = $2
        WHERE id = $1`,
      [id, nuevaObs]
    );
    await automationEventRepo.enqueueTx(client, {
      eventName: 'venta_cancelada',
      aggregateType: 'venta',
      aggregateId: id,
      idempotencyKey: `venta:${id}:cancelada`,
      payload: {
        venta_id: Number(id),
        cliente_id: venta.cliente_id != null ? Number(venta.cliente_id) : null,
        motivo: motivoTexto,
      },
    });
    return { id, cancelado: true };
  });
}

module.exports.cancelarVenta = cancelarVenta;
