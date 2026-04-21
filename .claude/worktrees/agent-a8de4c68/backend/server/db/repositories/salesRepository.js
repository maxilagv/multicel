const { withTransaction, query } = require('../../db/pg');
const inv = require('../../services/inventoryService');
const marketplaceService = require('../../services/marketplaceService');
const pricingRepo = require('./pricingRepository');

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

function normalizePriceListType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'distribuidor') return 'distribuidor';
  if (raw === 'final') return 'final';
  return 'local';
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

function resolveOfferForLine({ line, offers, priceListType, saleDate }) {
  const candidates = [];
  for (const offer of offers || []) {
    if (!offer || Number(offer.activo) !== 1) continue;
    const tipo = String(offer.tipo_oferta || '').trim().toLowerCase();
    const lista = String(offer.lista_precio_objetivo || 'todas').trim().toLowerCase();
    const productoId = offer.producto_id ? Number(offer.producto_id) : null;
    const descuentoPct = Number(offer.descuento_pct || 0);
    if (!Number.isFinite(descuentoPct) || descuentoPct <= 0) continue;
    if (productoId && Number(line.producto.id) !== productoId) continue;
    if (lista !== 'todas' && lista !== priceListType) continue;
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
}) {
  return withTransaction(async (client) => {
    const ventaFecha = normalizeVentaFecha(fecha);

    // Validate cliente
    const c = await client.query('SELECT id, estado FROM clientes WHERE id = $1', [cliente_id]);
    if (!c.rowCount) {
      const e = new Error('Cliente no encontrado');
      e.status = 400;
      throw e;
    }
    const cliente = c.rows[0];
    if (cliente.estado !== 'activo') {
      const e = new Error('El cliente est\u00e1 inactivo');
      e.status = 400;
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
              p.tipo_cambio::float AS tipo_cambio
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
    const selectedPriceListType = normalizePriceListType(price_list_type);

    const offersPromise = client
      .query(
        `SELECT id,
                tipo_oferta,
                producto_id,
                lista_precio_objetivo,
                cantidad_minima,
                descuento_pct,
                fecha_desde,
                fecha_hasta,
                prioridad,
                activo
           FROM ofertas_precios
          WHERE activo = 1`
      )
      .then((r) => r.rows || [])
      .catch(() => []);
    const commissionConfigPromise = pricingRepo.getCommissionConfig().catch(() => ({
      mode: 'producto',
      porcentajes: { local: 0, distribuidor: 0, final: 0, oferta: 0 },
    }));

    // Calculate totals (validación de stock se hará al momento de entrega)
    const preparedItems = [];
    let total = 0;
    for (const it of items) {
      const p = byId.get(Number(it.producto_id));
      if (!p) { const e = new Error(`Producto ${it.producto_id} inexistente`); e.status = 400; throw e; }
      const qty = Number(it.cantidad) || 0;
      const unitPrice = Number(it.precio_unitario) || p.price;
      const subtotal = unitPrice * qty;
      total += subtotal;
      preparedItems.push({
        raw: it,
        producto: p,
        cantidad: qty,
        precio_unitario: unitPrice,
        subtotal,
        selected_price_list_type: selectedPriceListType,
      });
    }

    const [offersRows, commissionConfig] = await Promise.all([
      offersPromise,
      commissionConfigPromise,
    ]);
    const saleDateForOffer = toComparableDate(ventaFecha) || new Date();
    let totalOfferDiscount = 0;
    for (const line of preparedItems) {
      const matched = resolveOfferForLine({
        line,
        offers: offersRows,
        priceListType: selectedPriceListType,
        saleDate: saleDateForOffer,
      });
      const pct = matched ? Number(matched.descuento_pct || 0) : 0;
      const lineOfferDiscount = roundMoney(line.subtotal * (pct / 100));
      line.offer_id = matched ? Number(matched.id) : null;
      line.offer_pct = pct > 0 ? pct : 0;
      line.offer_discount = lineOfferDiscount > 0 ? lineOfferDiscount : 0;
      line.effective_subtotal = roundMoney(line.subtotal - line.offer_discount);
      line.commission_list_code = line.offer_discount > 0 ? 'oferta' : selectedPriceListType;
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

    const resolvedDepositoId = await inv.resolveDepositoId(client, deposito_id);

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

    const insVenta = await client.query(
      `INSERT INTO ventas(cliente_id, fecha, total, descuento, impuestos, neto, estado_pago, deposito_id, es_reserva, usuario_id, caja_tipo, price_list_type)
       VALUES ($1, $2, $3, $4, $5, $6, 'pendiente', $7, $8, $9, $10, $11) RETURNING id`,
      [
        cliente_id,
        ventaFecha,
        total,
        baseDescuento + totalOfferDiscount,
        baseImpuestos,
        neto,
        resolvedDepositoId,
        isReserva ? 1 : 0,
        usuario_id,
        cajaTipoFinal,
        selectedPriceListType,
      ]
    );
    const ventaId = insVenta.rows[0].id;

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
      const commissionMode = String(commissionConfig?.mode || 'producto').trim().toLowerCase();
      let comisionPct = Number(p.comision_pct || 0);
      if (commissionMode === 'lista') {
        const listCode = it.commission_list_code || selectedPriceListType;
        comisionPct = Number(commissionConfig?.porcentajes?.[listCode] || 0);
      }
      const comisionMonto = roundMoney(baseLinea * (comisionPct / 100));
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
           costo_unitario_pesos,
           lista_precio_codigo,
           oferta_precio_id,
           descuento_oferta,
           descuento_oferta_pct
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          ventaId,
          Number(p.id),
          it.cantidad,
          it.precio_unitario,
          it.subtotal,
          baseLinea,
          comisionPct,
          comisionMonto,
          costoUnit,
          it.commission_list_code || selectedPriceListType,
          it.offer_id,
          it.offer_discount || 0,
          it.offer_pct || 0,
        ]
      );
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

    return {
      id: ventaId,
      total,
      neto,
      descuento_ofertas: totalOfferDiscount,
      comision_mode: String(commissionConfig?.mode || 'producto').trim().toLowerCase(),
    };
  });
}

async function listarVentas({ cliente_id, limit = 100, offset = 0, view } = {}) {
  const where = [];
  const params = [];

  if (cliente_id != null) {
    const cid = Number(cliente_id);
    if (Number.isInteger(cid) && cid > 0) {
      params.push(cid);
      where.push(`v.cliente_id = $${params.length}`);
    }
  }

  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(lim);
  params.push(off);

  const viewMode = String(view || '').trim().toLowerCase();
  const selectColumns =
    viewMode === 'mobile'
      ? `v.id, v.cliente_id, c.nombre AS cliente_nombre, v.fecha,
         v.total::float AS total, v.neto::float AS neto,
         v.estado_pago, v.estado_entrega, v.caja_tipo, v.price_list_type, v.es_reserva,
         COALESCE(p.total_pagado, 0)::float AS total_pagado,
         (v.neto - COALESCE(p.total_pagado, 0))::float AS saldo_pendiente`
      : `v.id, v.cliente_id, c.nombre AS cliente_nombre, v.fecha, v.usuario_id,
         v.total::float AS total, v.descuento::float AS descuento, v.impuestos::float AS impuestos,
         v.neto::float AS neto, v.estado_pago, v.estado_entrega, v.caja_tipo, v.price_list_type, v.observaciones, v.oculto, v.es_reserva,
         COALESCE(p.total_pagado, 0)::float AS total_pagado,
         (v.neto - COALESCE(p.total_pagado, 0))::float AS saldo_pendiente`;

  const sql = `SELECT ${selectColumns}
                 FROM ventas v
                 JOIN clientes c ON c.id = v.cliente_id
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
            d.lista_precio_codigo,
            d.oferta_precio_id,
            o.nombre AS oferta_nombre,
            o.tipo_oferta AS oferta_tipo
       FROM ventas_detalle d
       JOIN productos p ON p.id = d.producto_id
  LEFT JOIN ofertas_precios o ON o.id = d.oferta_precio_id
      WHERE d.venta_id = $1`,
    [id]
  );
  return rows;
}

module.exports = { createVenta, listarVentas, getVentaDetalle, getVentaEntregaInfo };
 
async function entregarVenta(id) {
  return withTransaction(async (client) => {
    const v = await client.query('SELECT id, estado_entrega, deposito_id FROM ventas WHERE id = $1', [id]);
    if (!v.rowCount) { const e = new Error('Venta no encontrada'); e.status = 404; throw e; }
    const venta = v.rows[0];
    if (venta.estado_entrega === 'entregado') { const e = new Error('La venta ya está entregada'); e.status = 400; throw e; }
    const { rows: items } = await client.query(
      `SELECT producto_id, cantidad, precio_unitario FROM ventas_detalle WHERE venta_id = $1 ORDER BY id ASC`,
      [id]
    );
    for (const it of items) {
      await inv.removeStockTx(client, {
        producto_id: Number(it.producto_id),
        cantidad: Number(it.cantidad),
        motivo: 'venta_entrega',
        referencia: `VENTA ${id}`,
        deposito_id: venta.deposito_id,
      });
    }
    await client.query("UPDATE ventas SET estado_entrega = 'entregado', fecha_entrega = NOW() WHERE id = $1", [id]);
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

async function cancelarVenta(id, motivo) {
  const { rows } = await query(
    'SELECT id, estado_entrega, estado_pago, observaciones FROM ventas WHERE id = $1',
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
  await query(
    `UPDATE ventas
        SET estado_pago = 'cancelado',
            observaciones = $2
      WHERE id = $1`,
    [id, nuevaObs]
  );
  return { id, cancelado: true };
}

module.exports.cancelarVenta = cancelarVenta;
