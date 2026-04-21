function normalizePeriodo(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['dia', 'día', 'diario'].includes(raw)) return 'dia';
  if (['semana', 'semanal'].includes(raw)) return 'semana';
  if (['mes', 'mensual'].includes(raw)) return 'mes';
  return 'mes';
}

function normalizeCommissionMode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['por_lista', 'lista', 'mixto'].includes(raw)) return 'por_lista';
  if (['por_total_venta', 'por_total', 'total', 'fijo'].includes(raw)) return 'por_total_venta';
  return 'por_producto';
}

function normalizeBaseType(value) {
  return String(value || '').trim().toLowerCase() === 'neto' ? 'neto' : 'bruto';
}

function toLocalDateString(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateInput(value) {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getTime());
  const str = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    return new Date(year, month, day);
  }
  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}

function resolveRange({ periodo, desde, hasta, baseDate } = {}) {
  const period = normalizePeriodo(periodo || 'mes');
  let fromDate = parseDateInput(desde);
  let toDate = parseDateInput(hasta);
  const base = parseDateInput(baseDate) || new Date();

  if (fromDate && !toDate) toDate = new Date(fromDate.getTime());
  if (!fromDate && toDate) fromDate = new Date(toDate.getTime());

  if (!fromDate || !toDate) {
    if (period === 'dia') {
      const d = fromDate || toDate || base;
      fromDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      toDate = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    } else if (period === 'semana') {
      const d = fromDate || toDate || base;
      const dow = d.getDay();
      const daysSinceMonday = (dow + 6) % 7;
      fromDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysSinceMonday);
      toDate = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + 5);
    } else {
      const d = fromDate || toDate || base;
      fromDate = new Date(d.getFullYear(), d.getMonth(), 1);
      toDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    }
  }

  if (fromDate && toDate && fromDate > toDate) {
    const tmp = fromDate;
    fromDate = toDate;
    toDate = tmp;
  }

  return {
    periodo: period,
    fromDate,
    toDate,
    fromStr: toLocalDateString(fromDate),
    toStr: toLocalDateString(toDate),
  };
}

function roundMoney(value) {
  const n = Number(value) || 0;
  return Math.round(n * 100) / 100;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildPctMap(listConfigRows = []) {
  const map = new Map();
  for (const row of listConfigRows || []) {
    const code = String(row?.lista_codigo || '').trim().toLowerCase();
    if (!code) continue;
    map.set(code, toNumber(row?.porcentaje, 0));
  }
  return map;
}

function uniqueSetToValue(values) {
  const items = Array.from(values || []).filter((item) => item != null);
  return items.length === 1 ? items[0] : null;
}

function inferStoredFixedBaseType(line, pct, storedCommission) {
  const ratio = toNumber(pct, 0) / 100;
  if (!(ratio > 0)) return 'bruto';
  const subtotal = toNumber(line?.subtotal, 0);
  const baseSinIva = toNumber(line?.base_sin_iva, subtotal);
  const brutoCommission = roundMoney(subtotal * ratio);
  const netoCommission = roundMoney(baseSinIva * ratio);
  const brutoDiff = Math.abs(brutoCommission - storedCommission);
  const netoDiff = Math.abs(netoCommission - storedCommission);
  return netoDiff + 0.01 < brutoDiff ? 'neto' : 'bruto';
}

function calculateLineCommission(line, { fallbackMode, fixedCommission, listPctMap }) {
  const storedMode = line?.comision_tipo_calculo
    ? normalizeCommissionMode(line.comision_tipo_calculo)
    : null;
  const mode = storedMode || normalizeCommissionMode(fallbackMode);
  const subtotal = roundMoney(toNumber(line?.subtotal, 0));
  const baseSinIva = roundMoney(toNumber(line?.base_sin_iva, subtotal));
  const rawListCode = String(
    line?.lista_precio_codigo_resuelto ||
      line?.lista_precio_codigo ||
      line?.price_list_type ||
      ''
  )
    .trim()
    .toLowerCase();
  const listCode = rawListCode || 'sin_lista';
  const fixedPct = toNumber(fixedCommission?.porcentaje, 0);
  const fixedBaseType = normalizeBaseType(fixedCommission?.base_tipo);

  if (mode === 'por_lista') {
    const pct = storedMode ? toNumber(line?.comision_pct_guardado, 0) : toNumber(listPctMap.get(listCode), 0);
    const commission = storedMode
      ? roundMoney(toNumber(line?.comision_monto_guardado, 0))
      : roundMoney(subtotal * (pct / 100));
    return {
      mode,
      listCode,
      listName: line?.lista_precio_nombre || listCode,
      pct,
      commission,
      baseAmount: subtotal,
      baseType: 'bruto',
      source: storedMode ? 'historico_guardado' : 'recalculado_actual',
    };
  }

  if (mode === 'por_total_venta') {
    const pct = storedMode ? toNumber(line?.comision_pct_guardado, fixedPct) : fixedPct;
    const storedCommission = roundMoney(toNumber(line?.comision_monto_guardado, 0));
    const baseType = storedMode
      ? inferStoredFixedBaseType(line, pct, storedCommission)
      : fixedBaseType;
    const baseAmount = roundMoney(baseType === 'neto' ? baseSinIva : subtotal);
    const commission = storedMode
      ? storedCommission
      : roundMoney(baseAmount * (pct / 100));
    return {
      mode,
      listCode,
      listName: line?.lista_precio_nombre || listCode,
      pct,
      commission,
      baseAmount,
      baseType,
      source: storedMode ? 'historico_guardado' : 'recalculado_actual',
    };
  }

  const pct = toNumber(line?.comision_pct_guardado, 0);
  const commission = storedMode
    ? roundMoney(toNumber(line?.comision_monto_guardado, 0))
    : roundMoney(subtotal * (pct / 100));
  return {
    mode: 'por_producto',
    listCode,
    listName: line?.lista_precio_nombre || listCode,
    pct,
    commission,
    baseAmount: subtotal,
    baseType: 'bruto',
    source: storedMode ? 'historico_guardado' : 'recalculado_actual',
  };
}

function sanitizePago(row = {}) {
  return {
    id: Number(row.id || 0),
    usuario_id: Number(row.usuario_id || 0),
    periodo: normalizePeriodo(row.periodo || 'mes'),
    desde: row.desde || null,
    hasta: row.hasta || null,
    ventas_total: roundMoney(toNumber(row.ventas_total, 0)),
    porcentaje: roundMoney(toNumber(row.porcentaje, 0)),
    monto_calculado: roundMoney(toNumber(row.monto_calculado, 0)),
    monto_pagado: roundMoney(toNumber(row.monto_pagado, 0)),
    fecha_pago: row.fecha_pago || null,
    metodo: row.metodo || null,
    notas: row.notas || null,
  };
}

function sanitizeAdelanto(row = {}) {
  return {
    id: Number(row.id || 0),
    usuario_id: Number(row.usuario_id || 0),
    monto: roundMoney(toNumber(row.monto, 0)),
    fecha: row.fecha || null,
    notas: row.notas || null,
    creado_en: row.creado_en || null,
  };
}

function buildLiquidacion({
  vendedor,
  config,
  fixedCommission,
  listConfig,
  lines,
  pagos,
  adelantos,
  periodo,
  desde,
  hasta,
}) {
  const normalizedConfig = {
    usuario_id: Number(config?.usuario_id || vendedor?.id || 0),
    sueldo_fijo: roundMoney(toNumber(config?.sueldo_fijo, 0)),
    comision_tipo: normalizeCommissionMode(config?.comision_tipo),
    periodo_liquidacion: normalizePeriodo(config?.periodo_liquidacion || periodo || 'mes'),
  };
  const normalizedFixed = {
    porcentaje: roundMoney(toNumber(fixedCommission?.porcentaje, 0)),
    base_tipo: normalizeBaseType(fixedCommission?.base_tipo),
    vigencia_desde: fixedCommission?.vigencia_desde || null,
    vigencia_hasta: fixedCommission?.vigencia_hasta || null,
  };
  const effectiveListRows = Array.isArray(listConfig?.listas) ? listConfig.listas : [];
  const listPctMap = buildPctMap(effectiveListRows);
  const rows = Array.isArray(lines) ? lines : [];
  const pagosList = (pagos || []).map(sanitizePago);
  const adelantosList = (adelantos || []).map(sanitizeAdelanto);

  const salesById = new Map();
  const breakdownByList = new Map();
  const breakdownByProduct = new Map();
  const totalPctValues = new Set();
  const totalBaseTypes = new Set();
  const modesPresent = new Set();
  let comisionTotal = 0;
  let ventasBaseComisionTotal = 0;

  for (const line of rows) {
    const calc = calculateLineCommission(line, {
      fallbackMode: normalizedConfig.comision_tipo,
      fixedCommission: normalizedFixed,
      listPctMap,
    });
    modesPresent.add(calc.mode);
    comisionTotal += calc.commission;
    ventasBaseComisionTotal += calc.baseAmount;

    const saleId = Number(line.venta_id || 0);
    if (!salesById.has(saleId)) {
      salesById.set(saleId, {
        id: saleId,
        fecha: line.fecha_operacion || line.fecha_entrega || line.fecha || null,
        fecha_venta: line.fecha || null,
        fecha_entrega: line.fecha_entrega || null,
        cliente: [line.cliente_nombre, line.cliente_apellido].filter(Boolean).join(' ') || line.cliente_nombre || '-',
        total: roundMoney(toNumber(line.venta_total, 0)),
        neto: roundMoney(toNumber(line.venta_neto, 0)),
        estado_pago: line.estado_pago || null,
        estado_entrega: line.estado_entrega || null,
        listas: new Map(),
        productos: 0,
        comision_total: 0,
      });
    }
    const sale = salesById.get(saleId);
    if (calc.listCode) {
      sale.listas.set(calc.listCode, calc.listName || calc.listCode);
    }
    sale.productos += 1;
    sale.comision_total = roundMoney(sale.comision_total + calc.commission);

    if (calc.mode === 'por_lista') {
      const key = calc.listCode || 'sin_lista';
      if (!breakdownByList.has(key)) {
        breakdownByList.set(key, {
          lista_codigo: key,
          lista_nombre: calc.listName || key,
          total_vendido: 0,
          comision_monto: 0,
          porcentajes: new Set(),
          ventas_count: new Set(),
        });
      }
      const item = breakdownByList.get(key);
      item.total_vendido += calc.baseAmount;
      item.comision_monto += calc.commission;
      item.porcentajes.add(calc.pct);
      if (saleId > 0) item.ventas_count.add(saleId);
      continue;
    }

    if (calc.mode === 'por_total_venta') {
      totalPctValues.add(calc.pct);
      totalBaseTypes.add(calc.baseType);
      continue;
    }

    const productKey = Number(line.producto_id || 0);
    if (!breakdownByProduct.has(productKey)) {
      breakdownByProduct.set(productKey, {
        producto_id: productKey,
        producto_nombre: line.producto_nombre || `Producto ${productKey || '-'}`,
        cantidad: 0,
        total_vendido: 0,
        comision_monto: 0,
        porcentajes: new Set(),
      });
    }
    const item = breakdownByProduct.get(productKey);
    item.cantidad += toNumber(line.cantidad, 0);
    item.total_vendido += calc.baseAmount;
    item.comision_monto += calc.commission;
    item.porcentajes.add(calc.pct);
  }

  const ventas = Array.from(salesById.values())
    .map((sale) => ({
      ...sale,
      listas: Array.from(sale.listas.values()),
    }))
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));

  const ventasTotal = roundMoney(ventas.reduce((acc, sale) => acc + toNumber(sale.total, 0), 0));
  const pagadoTotal = roundMoney(pagosList.reduce((acc, item) => acc + toNumber(item.monto_pagado, 0), 0));
  const adelantosTotal = roundMoney(adelantosList.reduce((acc, item) => acc + toNumber(item.monto, 0), 0));
  comisionTotal = roundMoney(comisionTotal);
  ventasBaseComisionTotal = roundMoney(ventasBaseComisionTotal);

  const breakdownListaItems = Array.from(breakdownByList.values())
    .map((item) => ({
      lista_codigo: item.lista_codigo,
      lista_nombre: item.lista_nombre,
      total_vendido: roundMoney(item.total_vendido),
      comision_pct: uniqueSetToValue(item.porcentajes),
      comision_monto: roundMoney(item.comision_monto),
      ventas_count: item.ventas_count.size,
    }))
    .sort((a, b) => String(a.lista_nombre || '').localeCompare(String(b.lista_nombre || '')));

  const breakdownProductoItems = Array.from(breakdownByProduct.values())
    .map((item) => ({
      producto_id: item.producto_id,
      producto_nombre: item.producto_nombre,
      cantidad: roundMoney(item.cantidad),
      total_vendido: roundMoney(item.total_vendido),
      comision_pct: uniqueSetToValue(item.porcentajes),
      comision_monto: roundMoney(item.comision_monto),
    }))
    .sort((a, b) => String(a.producto_nombre || '').localeCompare(String(b.producto_nombre || '')));

  const devengadoTotal = roundMoney(normalizedConfig.sueldo_fijo + comisionTotal);
  const saldo = roundMoney(devengadoTotal - pagadoTotal - adelantosTotal);
  const activeMode = normalizedConfig.comision_tipo;
  const mixedModes = modesPresent.size > 1;

  return {
    vendedor: {
      id: Number(vendedor?.id || normalizedConfig.usuario_id || 0),
      nombre: vendedor?.nombre || null,
      email: vendedor?.email || null,
      activo: vendedor?.activo !== false,
    },
    periodo: {
      periodo: normalizePeriodo(periodo || normalizedConfig.periodo_liquidacion),
      desde: desde || null,
      hasta: hasta || null,
    },
    configuracion: {
      ...normalizedConfig,
      porcentaje_fijo: normalizedFixed.porcentaje,
      base_tipo: normalizedFixed.base_tipo,
      usa_configuracion_global: listConfig?.usa_configuracion_global !== false,
      listas_globales: Array.isArray(listConfig?.global) ? listConfig.global : [],
      listas_vendedor: Array.isArray(listConfig?.overrides) ? listConfig.overrides : [],
      listas_efectivas: effectiveListRows,
    },
    resumen: {
      ventas_count: ventas.length,
      ventas_total: ventasTotal,
      ventas_base_comision_total: ventasBaseComisionTotal,
      comision_monto: comisionTotal,
      sueldo_fijo: normalizedConfig.sueldo_fijo,
      pagado_total: pagadoTotal,
      adelantos_total: adelantosTotal,
      total_devengado: devengadoTotal,
      saldo,
      modo_activo: activeMode,
      modos_presentes: Array.from(modesPresent),
      mixed_modes: mixedModes,
    },
    ventas,
    breakdown: {
      active_mode: activeMode,
      mixed_modes: mixedModes,
      modes_presentes: Array.from(modesPresent),
      por_lista: {
        items: breakdownListaItems,
        total_vendido: roundMoney(
          breakdownListaItems.reduce((acc, item) => acc + toNumber(item.total_vendido, 0), 0)
        ),
        total_comision: roundMoney(
          breakdownListaItems.reduce((acc, item) => acc + toNumber(item.comision_monto, 0), 0)
        ),
      },
      por_producto: {
        items: breakdownProductoItems,
        total_vendido: roundMoney(
          breakdownProductoItems.reduce((acc, item) => acc + toNumber(item.total_vendido, 0), 0)
        ),
        total_comision: roundMoney(
          breakdownProductoItems.reduce((acc, item) => acc + toNumber(item.comision_monto, 0), 0)
        ),
      },
      por_total_venta: {
        porcentaje: uniqueSetToValue(totalPctValues) ?? normalizedFixed.porcentaje,
        base_tipo: uniqueSetToValue(totalBaseTypes) || normalizedFixed.base_tipo,
        total_base: roundMoney(
          rows
            .map((line) =>
              calculateLineCommission(line, {
                fallbackMode: normalizedConfig.comision_tipo,
                fixedCommission: normalizedFixed,
                listPctMap,
              })
            )
            .filter((item) => item.mode === 'por_total_venta')
            .reduce((acc, item) => acc + toNumber(item.baseAmount, 0), 0)
        ),
        total_comision: roundMoney(
          rows
            .map((line) =>
              calculateLineCommission(line, {
                fallbackMode: normalizedConfig.comision_tipo,
                fixedCommission: normalizedFixed,
                listPctMap,
              })
            )
            .filter((item) => item.mode === 'por_total_venta')
            .reduce((acc, item) => acc + toNumber(item.commission, 0), 0)
        ),
      },
    },
    pagos_periodo: pagosList,
    adelantos_periodo: adelantosList,
  };
}

module.exports = {
  normalizePeriodo,
  normalizeCommissionMode,
  normalizeBaseType,
  toLocalDateString,
  parseDateInput,
  resolveRange,
  roundMoney,
  calculateLineCommission,
  buildLiquidacion,
};
