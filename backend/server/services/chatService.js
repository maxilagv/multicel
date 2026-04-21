'use strict';

/**
 * chatService.js — Asistente conversacional absoluto con Gemini
 *
 * Herramientas disponibles (15 total):
 *   - obtener_resumen_ventas          → total, cantidad, ticket promedio por período
 *   - obtener_top_productos           → top productos por ingresos/cantidad/margen
 *   - obtener_oportunidades_marketing → productos con mejor potencial comercial
 *   - obtener_top_clientes            → top clientes por compras
 *   - obtener_stock_critico           → productos en o bajo stock mínimo
 *   - obtener_deudas_clientes         → clientes con saldo pendiente
 *   - obtener_resumen_financiero      → ingresos, gastos, ganancia estimada
 *   - obtener_ventas_por_vendedor     → ranking de vendedores
 *   - obtener_compras_recientes       → últimas compras a proveedores
 *   - obtener_ventas_producto         → ventas de un producto específico por nombre/SKU
 *   - obtener_comparativa_periodos    → comparación de dos períodos consecutivos
 *   - obtener_tendencia_mensual       → evolución mes a mes de ventas
 *   - obtener_info_cliente            → perfil, historial y deuda de un cliente
 *   - obtener_pendientes_hoy          → dashboard diario: ventas pendientes, stock, cobros
 *   - obtener_ventas_por_categoria    → ingresos desglosados por categoría de producto
 */

const http  = require('http');
const https = require('https');
const { URL } = require('url');
const { query } = require('../db/pg');
const logger = require('../lib/logger');
const {
  GeminiModelResolver,
  extractGeminiErrorMessage,
  isGeminiModelNotFoundError,
  normalizeGeminiModelName,
} = require('../lib/geminiModelResolver');

// ─── Config ───────────────────────────────────────────────────────────────────
const GEMINI_API_KEY      = process.env.GEMINI_API_KEY;
const GEMINI_CHAT_MODEL   = process.env.GEMINI_CHAT_MODEL || '';
const TIMEOUT_MS          = Number(process.env.AI_CHAT_TIMEOUT_MS || 30000);
const MAX_TOOL_CALLS      = 6; // suficiente para consultas multi-paso complejas
const geminiModelResolver = new GeminiModelResolver({
  apiKey:    GEMINI_API_KEY,
  logger,
  timeoutMs: Math.min(TIMEOUT_MS, 15000),
});

let _resolvedModel = null;
let _modelDetected = false;
const MODEL_PRIORITY = [normalizeGeminiModelName(GEMINI_CHAT_MODEL)].filter(Boolean);

async function resolveModel() {
  if (_modelDetected && _resolvedModel) return _resolvedModel;

  try {
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}&pageSize=50`;
    const res = await httpGet(url);
    if (!res.ok) throw new Error(`ListModels HTTP ${res.status}`);

    const data   = JSON.parse(res.text || '{}');
    const models = (data.models || [])
      .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => m.name.replace('models/', ''));

    logger.info({ availableModels: models }, 'chatService: modelos disponibles');

    for (const preferred of MODEL_PRIORITY) {
      if (models.includes(preferred)) {
        _resolvedModel = preferred;
        _modelDetected = true;
        logger.info({ model: preferred }, 'chatService: modelo seleccionado');
        return _resolvedModel;
      }
    }

    if (models.length > 0) {
      _resolvedModel = models[0];
      _modelDetected = true;
      logger.info({ model: _resolvedModel }, 'chatService: usando primer modelo disponible');
      return _resolvedModel;
    }

    throw new Error('No hay modelos disponibles para esta API key');
  } catch (err) {
    logger.warn({ err }, 'chatService: error al detectar modelo, usando fallback');
    _resolvedModel = _resolvedModel || 'gemini-1.5-flash';
    _modelDetected = true;
    return _resolvedModel;
  }
}

// ─── Date helpers ────────────────────────────────────────────────────────────
const _pad = (n) => String(n).padStart(2, '0');
const _fmt = (d) => `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;

function normalizePeriodo(periodo) {
  const raw = String(periodo || 'mes').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // strip accents

  // Alias normalization
  if (raw === 'ano' || raw === 'anual') return 'ano';
  if (raw === 'ano_anterior' || raw === 'anio_anterior' || raw === 'año_anterior' || raw === 'ano anterior' || raw === 'año anterior') return 'ano_anterior';
  if (raw === 'mes_anterior' || raw === 'mes anterior') return 'mes_anterior';
  if (raw === 'semana_pasada' || raw === 'semana anterior' || raw === 'semana pasada') return 'semana_pasada';
  if (raw === 'trimestre_anterior' || raw === 'trimestre anterior') return 'trimestre_anterior';

  return raw;
}

function getDateRange(periodo) {
  const now  = new Date();
  const norm = normalizePeriodo(periodo);

  switch (norm) {
    case 'hoy':
      return { desde: _fmt(now), hasta: _fmt(now) };

    case 'ayer': {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      return { desde: _fmt(d), hasta: _fmt(d) };
    }

    case 'semana':
      return {
        desde: _fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)),
        hasta: _fmt(now),
      };

    case 'semana_pasada': {
      const hasta = new Date(now);
      hasta.setDate(hasta.getDate() - 1);
      const desde = new Date(hasta);
      desde.setDate(desde.getDate() - 6);
      return { desde: _fmt(desde), hasta: _fmt(hasta) };
    }

    case 'mes':
      return {
        desde: _fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
        hasta: _fmt(now),
      };

    case 'mes_anterior': {
      const lastDay  = new Date(now.getFullYear(), now.getMonth(), 0);
      const firstDay = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
      return { desde: _fmt(firstDay), hasta: _fmt(lastDay) };
    }

    case 'trimestre':
      return {
        desde: _fmt(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())),
        hasta: _fmt(now),
      };

    case 'trimestre_anterior': {
      const q      = Math.floor(now.getMonth() / 3);
      let year     = now.getFullYear();
      let prevQ    = q - 1;
      if (prevQ < 0) { prevQ = 3; year--; }
      const firstM = prevQ * 3;
      const desde  = new Date(year, firstM, 1);
      const hasta  = new Date(year, firstM + 3, 0);
      return { desde: _fmt(desde), hasta: _fmt(hasta) };
    }

    case 'ano':
      return { desde: `${now.getFullYear()}-01-01`, hasta: _fmt(now) };

    case 'ano_anterior': {
      const y = now.getFullYear() - 1;
      return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
    }

    default:
      return {
        desde: _fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
        hasta: _fmt(now),
      };
  }
}

function getPeriodDays(periodo) {
  switch (normalizePeriodo(periodo)) {
    case 'hoy':               return 1;
    case 'ayer':              return 1;
    case 'semana':            return 7;
    case 'semana_pasada':     return 7;
    case 'mes':               return 30;
    case 'mes_anterior':      return 30;
    case 'trimestre':         return 90;
    case 'trimestre_anterior':return 90;
    case 'ano':               return 365;
    case 'ano_anterior':      return 365;
    default:                  return 30;
  }
}

// ─── Inferencia del mensaje del usuario ──────────────────────────────────────
function normalizeText(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function inferPeriodoFromMessage(message) {
  const t = normalizeText(message);

  if (/\bayer\b/.test(t)) return 'ayer';
  if (/\bsemana pasada\b|\bsemana anterior\b/.test(t)) return 'semana_pasada';
  if (/\bmes pasado\b|\bmes anterior\b/.test(t)) return 'mes_anterior';
  if (/\btrimestre pasado\b|\btrimestre anterior\b/.test(t)) return 'trimestre_anterior';
  if (/\bano pasado\b|\bano anterior\b|\banio anterior\b/.test(t)) return 'ano_anterior';
  if (/\bhoy\b/.test(t)) return 'hoy';
  if (/\bsemana\b|\bsemanal\b/.test(t)) return 'semana';
  if (/\btrimestre\b|\btrimestral\b/.test(t)) return 'trimestre';
  if (/\bano\b|\banual\b/.test(t)) return 'ano';
  if (/\bmes\b|\bmensual\b/.test(t)) return 'mes';
  return null;
}

function inferLimiteFromMessage(message) {
  const t = normalizeText(message);
  const m = t.match(/\btop\s+(\d{1,2})\b/) || t.match(/\b(\d{1,2})\s+(?:productos|opciones|resultados|clientes)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function inferToolCallFromMessage(message) {
  const t = normalizeText(message);
  const mentionsProduct  = /\bproducto\b|\bproductos\b|\barticulo\b|\barticulos\b/.test(t);
  const marketingIntent  = /\bmarketing\b|\bpromocion\b|\bpromocionar\b|\bpublicidad\b|\bcampana\b|\bimpulsar\b|\bempujar\b|\bpotencial comercial\b/.test(t);

  if (mentionsProduct && marketingIntent) {
    return {
      name: 'obtener_oportunidades_marketing',
      args: {
        periodo: inferPeriodoFromMessage(message) || 'trimestre',
        limite:  inferLimiteFromMessage(message) || 5,
      },
    };
  }
  return null;
}

// ─── Tool: resumen de ventas ──────────────────────────────────────────────────
async function toolResumenVentas({ periodo = 'mes' } = {}) {
  const { desde, hasta } = getDateRange(periodo);
  const { rows } = await query(
    `SELECT COUNT(*)                             AS cantidad,
            COALESCE(SUM(total), 0)             AS total_vendido,
            COALESCE(AVG(total), 0)             AS ticket_promedio,
            COALESCE(SUM(total - descuento), 0) AS neto_total
       FROM ventas
      WHERE DATE(fecha) BETWEEN $1 AND $2
        AND estado_pago != 'cancelado'
        AND COALESCE(oculto, 0) = 0`,
    [desde, hasta]
  );
  const r = rows[0] || {};
  return {
    periodo, desde, hasta,
    cantidad_ventas:  Number(r.cantidad       || 0),
    total_vendido:    Number(r.total_vendido   || 0),
    ticket_promedio:  Number(r.ticket_promedio || 0),
    neto_total:       Number(r.neto_total      || 0),
  };
}

// ─── Tool: top productos ──────────────────────────────────────────────────────
async function toolTopProductos({ limite = 10, metrica = 'ingresos', periodo = 'mes' } = {}) {
  const { desde, hasta } = getDateRange(periodo);
  const lim = Math.min(Math.max(1, Number(limite || 10)), 20);
  const revenueExpr = 'COALESCE(dv.base_sin_iva, dv.subtotal)';
  const costExpr    = 'COALESCE(dv.costo_unitario_pesos, p.precio_costo_pesos, p.precio_costo, 0)';

  let selectExtra, orderBy;
  if (metrica === 'cantidad') {
    selectExtra = `SUM(dv.cantidad) AS total_unidades, SUM(${revenueExpr}) AS total_ingresos`;
    orderBy = 'total_unidades DESC';
  } else if (metrica === 'margen') {
    selectExtra = `SUM(${revenueExpr}) AS total_ingresos,
                   SUM(dv.cantidad) AS total_unidades,
                   SUM(${revenueExpr} - (${costExpr} * dv.cantidad)) AS margen_total`;
    orderBy = 'margen_total DESC';
  } else {
    selectExtra = `SUM(${revenueExpr}) AS total_ingresos, SUM(dv.cantidad) AS total_unidades`;
    orderBy = 'total_ingresos DESC';
  }

  const { rows } = await query(
    `SELECT p.nombre, p.codigo, ${selectExtra}
       FROM ventas_detalle dv
       JOIN ventas v    ON v.id = dv.venta_id
       JOIN productos p ON p.id = dv.producto_id
      WHERE DATE(v.fecha) BETWEEN $1 AND $2
        AND v.estado_pago != 'cancelado'
        AND COALESCE(v.oculto, 0) = 0
      GROUP BY p.id, p.nombre, p.codigo
      ORDER BY ${orderBy}
      LIMIT $3`,
    [desde, hasta, lim]
  );

  return {
    periodo, desde, hasta, metrica,
    productos: rows.map((r) => ({
      nombre:         r.nombre,
      codigo:         r.codigo || null,
      total_ingresos: Number(r.total_ingresos || 0),
      total_unidades: Number(r.total_unidades || 0),
      margen_total:   r.margen_total !== undefined ? Number(r.margen_total || 0) : undefined,
    })),
  };
}

// ─── Tool: oportunidades marketing ───────────────────────────────────────────
async function toolOportunidadesMarketing({ limite = 5, periodo = 'trimestre' } = {}) {
  const { desde, hasta } = getDateRange(periodo);
  const days = Math.max(1, getPeriodDays(periodo));
  const lim  = Math.min(Math.max(1, Number(limite || 5)), 20);

  const { rows } = await query(
    `SELECT p.id AS producto_id, p.nombre, p.codigo,
            COALESCE(i.cantidad_disponible, 0) AS stock_actual,
            COALESCE(p.stock_minimo, 0)        AS stock_minimo,
            COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN dv.cantidad ELSE 0 END), 0) AS unidades_vendidas,
            COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN COALESCE(dv.base_sin_iva, dv.subtotal) ELSE 0 END), 0) AS ingresos,
            COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN
              COALESCE(dv.base_sin_iva, dv.subtotal) -
              (dv.cantidad * COALESCE(dv.costo_unitario_pesos, p.precio_costo_pesos, p.precio_costo, 0))
            ELSE 0 END), 0) AS margen_total
       FROM productos p
       LEFT JOIN inventario i ON i.producto_id = p.id
       LEFT JOIN ventas_detalle dv ON dv.producto_id = p.id
       LEFT JOIN ventas v
              ON v.id = dv.venta_id
             AND DATE(v.fecha) BETWEEN $1 AND $2
             AND v.estado_pago != 'cancelado'
             AND COALESCE(v.oculto, 0) = 0
      WHERE p.activo = TRUE
      GROUP BY p.id, p.nombre, p.codigo, i.cantidad_disponible, p.stock_minimo`,
    [desde, hasta]
  );

  const base = (rows || [])
    .map((r) => {
      const unidadesVendidas = Number(r.unidades_vendidas || 0);
      const ingresos         = Number(r.ingresos || 0);
      const margenTotal      = Number(r.margen_total || 0);
      const stockActual      = Number(r.stock_actual || 0);
      const stockMinimo      = Number(r.stock_minimo || 0);
      const rotacionDiaria   = unidadesVendidas / days;
      const margenPct        = ingresos > 0 ? margenTotal / ingresos : 0;
      const coberturaDias    = rotacionDiaria > 0 ? stockActual / rotacionDiaria : null;
      return {
        producto_id: Number(r.producto_id),
        nombre: r.nombre, codigo: r.codigo || null,
        unidades_vendidas: unidadesVendidas, ingresos, margen_total: margenTotal,
        margen_pct: margenPct, stock_actual: stockActual, stock_minimo: stockMinimo,
        rotacion_diaria: rotacionDiaria, cobertura_dias: coberturaDias,
      };
    })
    .filter((r) => r.unidades_vendidas > 0);

  const maxRotacion = base.reduce((max, r) => Math.max(max, r.rotacion_diaria || 0), 0) || 1;
  const avgRotacion = base.length ? base.reduce((acc, r) => acc + (r.rotacion_diaria || 0), 0) / base.length : 0;

  const oportunidades = base.map((r) => {
    const marginScore   = Math.min(Math.max(r.margen_pct, 0), 0.6) / 0.6;
    const rotationScore = Math.min((r.rotacion_diaria || 0) / maxRotacion, 1);
    let stockScore = 0;
    if (r.cobertura_dias == null) stockScore = 0;
    else if (r.cobertura_dias >= 30) stockScore = 1;
    else if (r.cobertura_dias >= 21) stockScore = 0.85;
    else if (r.cobertura_dias >= 14) stockScore = 0.65;
    else if (r.cobertura_dias >= 7) stockScore = 0.35;
    else stockScore = 0.1;

    let score = (marginScore * 45) + (rotationScore * 35) + (stockScore * 20);
    if (r.stock_actual <= 0) score *= 0.2;
    else if (r.stock_actual <= r.stock_minimo) score *= 0.65;

    const motivos = [];
    if (r.margen_pct >= 0.25) motivos.push('margen saludable');
    if (r.rotacion_diaria >= avgRotacion) motivos.push('ya tiene traccion de ventas');
    if ((r.cobertura_dias || 0) >= 21) motivos.push('hay stock suficiente para impulsar');
    else if ((r.cobertura_dias || 0) >= 7) motivos.push('sirve para una campana chica');
    if (r.stock_actual <= r.stock_minimo) motivos.push('conviene vigilar reposicion');

    return { ...r, score_potencial: Math.round(score * 10) / 10, motivos };
  })
    .sort((a, b) => b.score_potencial - a.score_potencial || b.margen_total - a.margen_total)
    .slice(0, lim);

  return {
    periodo, desde, hasta,
    criterio: 'score_potencial = margen real (45%) + rotacion reciente (35%) + capacidad de stock (20%)',
    oportunidades: oportunidades.map((r) => ({
      nombre: r.nombre, codigo: r.codigo,
      score_potencial: r.score_potencial,
      ingresos: Number(r.ingresos.toFixed(2)),
      margen_total: Number(r.margen_total.toFixed(2)),
      margen_pct: Number((r.margen_pct * 100).toFixed(1)),
      unidades_vendidas: Number(r.unidades_vendidas.toFixed(2)),
      stock_actual: Number(r.stock_actual.toFixed(2)),
      cobertura_dias: r.cobertura_dias != null ? Number(r.cobertura_dias.toFixed(1)) : null,
      motivos: r.motivos,
    })),
  };
}

// ─── Tool: top clientes ───────────────────────────────────────────────────────
async function toolTopClientes({ limite = 10, metrica = 'ingresos', periodo = 'mes' } = {}) {
  const { desde, hasta } = getDateRange(periodo);
  const lim     = Math.min(Math.max(1, Number(limite || 10)), 20);
  const orderBy = metrica === 'cantidad_ventas' ? 'cantidad_ventas DESC' : 'total_comprado DESC';

  const { rows } = await query(
    `SELECT c.nombre, c.apellido, c.tipo_cliente,
            COUNT(v.id)  AS cantidad_ventas,
            SUM(v.neto)  AS total_comprado
       FROM ventas v
       JOIN clientes c ON c.id = v.cliente_id
      WHERE DATE(v.fecha) BETWEEN $1 AND $2
        AND v.estado_pago != 'cancelado'
        AND COALESCE(v.oculto, 0) = 0
      GROUP BY c.id, c.nombre, c.apellido, c.tipo_cliente
      ORDER BY ${orderBy}
      LIMIT $3`,
    [desde, hasta, lim]
  );

  return {
    periodo, desde, hasta,
    clientes: rows.map((r) => ({
      nombre:          [r.nombre, r.apellido].filter(Boolean).join(' '),
      tipo:            r.tipo_cliente || 'minorista',
      cantidad_ventas: Number(r.cantidad_ventas || 0),
      total_comprado:  Number(r.total_comprado  || 0),
    })),
  };
}

// ─── Tool: stock critico ──────────────────────────────────────────────────────
async function toolStockCritico({ limite = 20 } = {}) {
  const lim = Math.min(Math.max(1, Number(limite || 20)), 50);
  const { rows } = await query(
    `SELECT p.nombre, p.codigo, p.precio_venta AS precio,
            COALESCE(i.cantidad_disponible, 0) AS stock_actual,
            COALESCE(p.stock_minimo, 0)        AS stock_minimo
       FROM productos p
       LEFT JOIN inventario i ON i.producto_id = p.id
      WHERE p.activo = 1
        AND COALESCE(i.cantidad_disponible, 0) <= COALESCE(p.stock_minimo, 0)
      ORDER BY (COALESCE(i.cantidad_disponible, 0) - COALESCE(p.stock_minimo, 0)) ASC
      LIMIT $1`,
    [lim]
  );

  return {
    cantidad_total: rows.length,
    productos: rows.map((r) => ({
      nombre:       r.nombre,
      codigo:       r.codigo || null,
      precio:       Number(r.precio       || 0),
      stock_actual: Number(r.stock_actual || 0),
      stock_minimo: Number(r.stock_minimo || 0),
      deficit:      Number(r.stock_minimo || 0) - Number(r.stock_actual || 0),
    })),
  };
}

// ─── Tool: deudas de clientes ─────────────────────────────────────────────────
async function toolDeudasClientes({ limite = 15 } = {}) {
  const lim = Math.min(Math.max(1, Number(limite || 15)), 30);
  const { rows } = await query(
    `SELECT c.nombre, c.apellido, c.telefono,
            SUM(CASE WHEN (v.neto - COALESCE(p.total_pagado, 0)) > 0
                     THEN (v.neto - COALESCE(p.total_pagado, 0)) ELSE 0 END) AS deuda_total,
            SUM(CASE WHEN (v.neto - COALESCE(p.total_pagado, 0)) > 0 THEN 1 ELSE 0 END) AS ventas_pendientes
       FROM ventas v
       JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN (
         SELECT venta_id, SUM(monto) AS total_pagado FROM pagos GROUP BY venta_id
       ) p ON p.venta_id = v.id
      WHERE v.estado_pago IN ('pendiente', 'parcial')
        AND COALESCE(v.oculto, 0) = 0
      GROUP BY c.id, c.nombre, c.apellido, c.telefono
      HAVING SUM(CASE WHEN (v.neto - COALESCE(p.total_pagado, 0)) > 0
                      THEN (v.neto - COALESCE(p.total_pagado, 0)) ELSE 0 END) > 0
      ORDER BY deuda_total DESC
      LIMIT $1`,
    [lim]
  );

  const total_deuda = rows.reduce((acc, r) => acc + Number(r.deuda_total || 0), 0);
  return {
    total_deuda_cartera: total_deuda,
    clientes: rows.map((r) => ({
      nombre:            [r.nombre, r.apellido].filter(Boolean).join(' '),
      telefono:          r.telefono || null,
      deuda_total:       Number(r.deuda_total        || 0),
      ventas_pendientes: Number(r.ventas_pendientes  || 0),
    })),
  };
}

// ─── Tool: resumen financiero ─────────────────────────────────────────────────
async function toolResumenFinanciero({ periodo = 'mes' } = {}) {
  const { desde, hasta } = getDateRange(periodo);

  const [ventasRes, comprasRes] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(total), 0) AS ingresos, COALESCE(SUM(neto), 0) AS neto
         FROM ventas
        WHERE DATE(fecha) BETWEEN $1 AND $2
          AND estado_pago != 'cancelado'
          AND COALESCE(oculto, 0) = 0`,
      [desde, hasta]
    ),
    query(
      `SELECT COALESCE(SUM(total), 0) AS gastos_compras
         FROM compras
        WHERE DATE(fecha) BETWEEN $1 AND $2`,
      [desde, hasta]
    ),
  ]);

  const ingresos = Number(ventasRes.rows[0]?.ingresos        || 0);
  const neto     = Number(ventasRes.rows[0]?.neto            || 0);
  const gastos   = Number(comprasRes.rows[0]?.gastos_compras || 0);

  return {
    periodo, desde, hasta,
    ingresos_ventas:      ingresos,
    neto_ventas:          neto,
    gastos_compras:       gastos,
    ganancia_estimada:    neto - gastos,
    margen_estimado_pct:  ingresos > 0 ? Math.round(((neto - gastos) / ingresos) * 100 * 10) / 10 : 0,
  };
}

// ─── Tool: ventas por vendedor ────────────────────────────────────────────────
async function toolVentasPorVendedor({ periodo = 'mes' } = {}) {
  const { desde, hasta } = getDateRange(periodo);
  const { rows } = await query(
    `SELECT u.nombre, r.nombre AS rol,
            COUNT(v.id) AS cantidad_ventas,
            SUM(v.neto) AS total_vendido
       FROM ventas v
       JOIN usuarios u ON u.id = v.usuario_id
       LEFT JOIN roles r ON r.id = u.rol_id
      WHERE DATE(v.fecha) BETWEEN $1 AND $2
        AND v.estado_pago != 'cancelado'
        AND COALESCE(v.oculto, 0) = 0
      GROUP BY u.id, u.nombre, r.nombre
      ORDER BY total_vendido DESC
      LIMIT 20`,
    [desde, hasta]
  );

  return {
    periodo, desde, hasta,
    vendedores: rows.map((r) => ({
      nombre:          r.nombre,
      rol:             r.rol,
      cantidad_ventas: Number(r.cantidad_ventas || 0),
      total_vendido:   Number(r.total_vendido   || 0),
    })),
  };
}

// ─── Tool: compras recientes ──────────────────────────────────────────────────
async function toolComprasRecientes({ limite = 10 } = {}) {
  const lim = Math.min(Math.max(1, Number(limite || 10)), 30);
  const { rows } = await query(
    `SELECT c.fecha, p.nombre AS proveedor, c.total, c.estado
       FROM compras c
       LEFT JOIN proveedores p ON p.id = c.proveedor_id
      ORDER BY c.fecha DESC
      LIMIT $1`,
    [lim]
  );

  const total_gasto = rows.reduce((acc, r) => acc + Number(r.total || 0), 0);
  return {
    total_gasto,
    compras: rows.map((r) => ({
      fecha:     r.fecha,
      proveedor: r.proveedor || 'Sin proveedor',
      total:     Number(r.total || 0),
      estado:    r.estado || null,
    })),
  };
}

// ─── Tool: ventas de un producto específico ───────────────────────────────────
async function toolVentasProducto({ nombre_producto, periodo = 'mes' } = {}) {
  if (!nombre_producto) return { error: 'Se requiere nombre_producto para buscar.' };
  const { desde, hasta } = getDateRange(periodo);
  const busqueda = `%${nombre_producto}%`;

  const { rows } = await query(
    `SELECT p.nombre, p.codigo,
            COUNT(DISTINCT v.id)                                                      AS cantidad_ventas,
            SUM(dv.cantidad)                                                          AS unidades_vendidas,
            SUM(COALESCE(dv.base_sin_iva, dv.subtotal))                              AS ingresos_brutos,
            SUM(dv.cantidad * COALESCE(dv.costo_unitario_pesos, p.precio_costo_pesos, p.precio_costo, 0)) AS costo_total,
            SUM(COALESCE(dv.base_sin_iva, dv.subtotal) -
                dv.cantidad * COALESCE(dv.costo_unitario_pesos, p.precio_costo_pesos, p.precio_costo, 0)) AS margen_bruto,
            COALESCE(i.cantidad_disponible, 0)                                        AS stock_actual
       FROM ventas_detalle dv
       JOIN ventas v    ON v.id = dv.venta_id
       JOIN productos p ON p.id = dv.producto_id
       LEFT JOIN inventario i ON i.producto_id = p.id
      WHERE DATE(v.fecha) BETWEEN $1 AND $2
        AND v.estado_pago != 'cancelado'
        AND COALESCE(v.oculto, 0) = 0
        AND (p.nombre LIKE $3 OR p.codigo LIKE $3)
      GROUP BY p.id, p.nombre, p.codigo, i.cantidad_disponible
      ORDER BY ingresos_brutos DESC
      LIMIT 10`,
    [desde, hasta, busqueda]
  );

  return {
    periodo, desde, hasta, busqueda: nombre_producto,
    resultados: rows.map((r) => ({
      nombre:           r.nombre,
      codigo:           r.codigo || null,
      cantidad_ventas:  Number(r.cantidad_ventas  || 0),
      unidades_vendidas:Number(r.unidades_vendidas|| 0),
      ingresos_brutos:  Number(r.ingresos_brutos  || 0),
      costo_total:      Number(r.costo_total       || 0),
      margen_bruto:     Number(r.margen_bruto      || 0),
      stock_actual:     Number(r.stock_actual      || 0),
    })),
  };
}

// ─── Tool: comparativa de períodos ───────────────────────────────────────────
async function toolComparativaPeriodos({ periodo = 'mes' } = {}) {
  // Determina el período actual y el anterior equivalente
  const periodoAnterior = {
    mes:       'mes_anterior',
    trimestre: 'trimestre_anterior',
    ano:       'ano_anterior',
    semana:    'semana_pasada',
    hoy:       'ayer',
  }[normalizePeriodo(periodo)] || 'mes_anterior';

  const [actual, anterior] = await Promise.all([
    toolResumenVentas({ periodo }),
    toolResumenVentas({ periodo: periodoAnterior }),
  ]);

  const delta = (a, b) => b !== 0 ? Math.round(((a - b) / Math.abs(b)) * 100 * 10) / 10 : null;

  return {
    periodo_actual:   { nombre: periodo,        ...actual   },
    periodo_anterior: { nombre: periodoAnterior, ...anterior },
    variacion: {
      total_vendido_pct:   delta(actual.total_vendido,   anterior.total_vendido),
      cantidad_ventas_pct: delta(actual.cantidad_ventas,  anterior.cantidad_ventas),
      ticket_promedio_pct: delta(actual.ticket_promedio,  anterior.ticket_promedio),
    },
  };
}

// ─── Tool: tendencia mensual ──────────────────────────────────────────────────
async function toolTendenciaMensual({ anio } = {}) {
  const targetYear = Number(anio) || new Date().getFullYear();

  const { rows } = await query(
    `SELECT MONTH(fecha) AS mes,
            COUNT(*)     AS cantidad_ventas,
            SUM(total)   AS total_vendido,
            SUM(neto)    AS neto_total
       FROM ventas
      WHERE YEAR(fecha) = $1
        AND estado_pago != 'cancelado'
        AND COALESCE(oculto, 0) = 0
      GROUP BY MONTH(fecha)
      ORDER BY mes ASC`,
    [targetYear]
  );

  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  return {
    anio: targetYear,
    meses: rows.map((r) => ({
      mes:             MESES[Number(r.mes) - 1] || `Mes ${r.mes}`,
      numero_mes:      Number(r.mes),
      cantidad_ventas: Number(r.cantidad_ventas || 0),
      total_vendido:   Number(r.total_vendido   || 0),
      neto_total:      Number(r.neto_total      || 0),
    })),
  };
}

// ─── Tool: info de un cliente ─────────────────────────────────────────────────
async function toolInfoCliente({ nombre_cliente } = {}) {
  if (!nombre_cliente) return { error: 'Se requiere nombre_cliente para buscar.' };
  const busqueda = `%${nombre_cliente}%`;

  const { rows: clientes } = await query(
    `SELECT c.id, c.nombre, c.apellido, c.telefono, c.email, c.tipo_cliente,
            COUNT(v.id)                                  AS total_ventas,
            COALESCE(SUM(v.total), 0)                   AS total_comprado,
            COALESCE(SUM(v.neto), 0)                    AS total_neto,
            MAX(v.fecha)                                 AS ultima_compra
       FROM clientes c
       LEFT JOIN ventas v
              ON v.cliente_id = c.id
             AND v.estado_pago != 'cancelado'
             AND COALESCE(v.oculto, 0) = 0
      WHERE (c.nombre LIKE $1 OR c.apellido LIKE $1
             OR CONCAT(c.nombre, ' ', c.apellido) LIKE $1)
        AND COALESCE(c.activo, 1) = 1
      GROUP BY c.id, c.nombre, c.apellido, c.telefono, c.email, c.tipo_cliente
      ORDER BY total_comprado DESC
      LIMIT 5`,
    [busqueda]
  );

  if (!clientes.length) {
    return { busqueda: nombre_cliente, resultados: [], mensaje: 'No se encontraron clientes con ese nombre.' };
  }

  // Deuda de los clientes encontrados
  const ids = clientes.map((c) => c.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const { rows: deudas } = await query(
    `SELECT v.cliente_id,
            SUM(CASE WHEN (v.neto - COALESCE(p.total_pagado, 0)) > 0
                     THEN (v.neto - COALESCE(p.total_pagado, 0)) ELSE 0 END) AS deuda_total
       FROM ventas v
       LEFT JOIN (SELECT venta_id, SUM(monto) AS total_pagado FROM pagos GROUP BY venta_id) p
              ON p.venta_id = v.id
      WHERE v.cliente_id IN (${placeholders})
        AND v.estado_pago IN ('pendiente', 'parcial')
      GROUP BY v.cliente_id`,
    ids
  );

  const deudaMap = Object.fromEntries(deudas.map((d) => [d.cliente_id, Number(d.deuda_total || 0)]));

  return {
    busqueda: nombre_cliente,
    resultados: clientes.map((c) => ({
      nombre:         [c.nombre, c.apellido].filter(Boolean).join(' '),
      telefono:       c.telefono || null,
      email:          c.email    || null,
      tipo_cliente:   c.tipo_cliente || 'minorista',
      total_ventas:   Number(c.total_ventas   || 0),
      total_comprado: Number(c.total_comprado || 0),
      total_neto:     Number(c.total_neto     || 0),
      ultima_compra:  c.ultima_compra || null,
      deuda_actual:   deudaMap[c.id] || 0,
    })),
  };
}

// ─── Tool: pendientes del día ─────────────────────────────────────────────────
async function toolPendientesHoy() {
  const hoy = _fmt(new Date());

  const [ventasHoy, pendientes, stockCritico, cobrosHoy] = await Promise.all([
    // ventas realizadas hoy
    query(
      `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
         FROM ventas
        WHERE DATE(fecha) = $1 AND estado_pago != 'cancelado' AND COALESCE(oculto, 0) = 0`,
      [hoy]
    ),
    // ventas pendientes de pago (cualquier fecha)
    query(
      `SELECT COUNT(*) AS cantidad, COALESCE(SUM(neto - COALESCE(p.total_pagado, 0)), 0) AS monto_pendiente
         FROM ventas v
         LEFT JOIN (SELECT venta_id, SUM(monto) AS total_pagado FROM pagos GROUP BY venta_id) p
                ON p.venta_id = v.id
        WHERE v.estado_pago IN ('pendiente', 'parcial') AND COALESCE(v.oculto, 0) = 0`,
      []
    ),
    // productos en stock critico
    query(
      `SELECT COUNT(*) AS cantidad
         FROM productos p
         LEFT JOIN inventario i ON i.producto_id = p.id
        WHERE p.activo = 1 AND COALESCE(i.cantidad_disponible, 0) <= COALESCE(p.stock_minimo, 0)`,
      []
    ),
    // pagos recibidos hoy
    query(
      `SELECT COUNT(*) AS cantidad, COALESCE(SUM(monto), 0) AS total_cobrado
         FROM pagos
        WHERE DATE(fecha) = $1`,
      [hoy]
    ),
  ]);

  return {
    fecha: hoy,
    ventas_hoy: {
      cantidad: Number(ventasHoy.rows[0]?.cantidad || 0),
      total:    Number(ventasHoy.rows[0]?.total    || 0),
    },
    cobros_hoy: {
      cantidad:      Number(cobrosHoy.rows[0]?.cantidad      || 0),
      total_cobrado: Number(cobrosHoy.rows[0]?.total_cobrado || 0),
    },
    ventas_pendientes_pago: {
      cantidad:         Number(pendientes.rows[0]?.cantidad         || 0),
      monto_pendiente:  Number(pendientes.rows[0]?.monto_pendiente  || 0),
    },
    productos_stock_critico: Number(stockCritico.rows[0]?.cantidad || 0),
  };
}

// ─── Tool: ventas por categoría ───────────────────────────────────────────────
async function toolVentasPorCategoria({ periodo = 'mes' } = {}) {
  const { desde, hasta } = getDateRange(periodo);

  const { rows } = await query(
    `SELECT COALESCE(cat.nombre, 'Sin categoria') AS categoria,
            COUNT(DISTINCT v.id)                  AS cantidad_ventas,
            SUM(dv.cantidad)                      AS unidades_vendidas,
            SUM(COALESCE(dv.base_sin_iva, dv.subtotal)) AS ingresos,
            SUM(COALESCE(dv.base_sin_iva, dv.subtotal) -
                dv.cantidad * COALESCE(dv.costo_unitario_pesos, p.precio_costo_pesos, p.precio_costo, 0)) AS margen
       FROM ventas_detalle dv
       JOIN ventas v    ON v.id = dv.venta_id
       JOIN productos p ON p.id = dv.producto_id
       LEFT JOIN categorias cat ON cat.id = p.categoria_id
      WHERE DATE(v.fecha) BETWEEN $1 AND $2
        AND v.estado_pago != 'cancelado'
        AND COALESCE(v.oculto, 0) = 0
      GROUP BY cat.id, cat.nombre
      ORDER BY ingresos DESC`,
    [desde, hasta]
  );

  const total_ingresos = rows.reduce((acc, r) => acc + Number(r.ingresos || 0), 0);

  return {
    periodo, desde, hasta, total_ingresos,
    categorias: rows.map((r) => {
      const ingresos = Number(r.ingresos || 0);
      return {
        categoria:         r.categoria,
        cantidad_ventas:   Number(r.cantidad_ventas   || 0),
        unidades_vendidas: Number(r.unidades_vendidas || 0),
        ingresos,
        margen:            Number(r.margen            || 0),
        participacion_pct: total_ingresos > 0 ? Math.round((ingresos / total_ingresos) * 100 * 10) / 10 : 0,
      };
    }),
  };
}

// ─── Tool dispatcher ──────────────────────────────────────────────────────────
async function executeTool(name, args) {
  try {
    switch (name) {
      case 'obtener_resumen_ventas':          return await toolResumenVentas(args || {});
      case 'obtener_top_productos':           return await toolTopProductos(args || {});
      case 'obtener_oportunidades_marketing': return await toolOportunidadesMarketing(args || {});
      case 'obtener_top_clientes':            return await toolTopClientes(args || {});
      case 'obtener_stock_critico':           return await toolStockCritico(args || {});
      case 'obtener_deudas_clientes':         return await toolDeudasClientes(args || {});
      case 'obtener_resumen_financiero':      return await toolResumenFinanciero(args || {});
      case 'obtener_ventas_por_vendedor':     return await toolVentasPorVendedor(args || {});
      case 'obtener_compras_recientes':       return await toolComprasRecientes(args || {});
      case 'obtener_ventas_producto':         return await toolVentasProducto(args || {});
      case 'obtener_comparativa_periodos':    return await toolComparativaPeriodos(args || {});
      case 'obtener_tendencia_mensual':       return await toolTendenciaMensual(args || {});
      case 'obtener_info_cliente':            return await toolInfoCliente(args || {});
      case 'obtener_pendientes_hoy':          return await toolPendientesHoy();
      case 'obtener_ventas_por_categoria':    return await toolVentasPorCategoria(args || {});
      default:
        logger.warn({ toolName: name }, 'Chat: herramienta desconocida');
        return { error: `Herramienta desconocida: ${name}` };
    }
  } catch (err) {
    logger.error({ err, toolName: name, args }, 'Chat: error al ejecutar herramienta');
    return { error: `No se pudo consultar "${name}": ${err.message}` };
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
function httpGet(rawUrl) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Gemini: GET timeout')), 10000);
    try {
      const url  = new URL(rawUrl);
      const lib  = url.protocol === 'https:' ? https : http;
      const opts = { method: 'GET', hostname: url.hostname, port: url.port || 443, path: url.pathname + url.search };
      const req  = lib.request(opts, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode, ok: res.statusCode < 400, text: data }); });
      });
      req.on('error', (e) => { clearTimeout(timer); reject(e); });
      req.end();
    } catch (e) { clearTimeout(timer); reject(e); }
  });
}

function httpPost(rawUrl, bodyString) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Gemini Chat: timeout despues de ${TIMEOUT_MS}ms`)),
      TIMEOUT_MS
    );
    try {
      const url     = new URL(rawUrl);
      const isHttps = url.protocol === 'https:';
      const lib     = isHttps ? https : http;
      const opts    = {
        method:   'POST',
        hostname: url.hostname,
        port:     url.port || (isHttps ? 443 : 80),
        path:     url.pathname + url.search,
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyString) },
      };
      const req = lib.request(opts, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode || 0, ok: (res.statusCode || 0) < 400, text: data }); });
      });
      req.on('error', (e) => { clearTimeout(timer); reject(e); });
      req.write(bodyString);
      req.end();
    } catch (e) { clearTimeout(timer); reject(e); }
  });
}

// ─── System prompt con todas las herramientas ─────────────────────────────────
function buildSystemWithTools() {
  return `Sos el asistente inteligente de Kaisen ERP, un sistema de gestion para PYMEs argentinas.
Tu rol es responder preguntas sobre el negocio usando datos reales del sistema.

REGLAS CRITICAS:
- Respondé SIEMPRE en español rioplatense (Argentina). Usa "vos" en lugar de "tu".
- Usa $ para valores en pesos argentinos con separadores de miles (ej: $1.500.000).
- NUNCA inventes, estimes ni supongas datos numericos. Solo usa las herramientas disponibles.
- Si el usuario pregunta algo que no tiene herramienta, indicalo amablemente.
- Se conciso y accionable. Maximo 350 palabras salvo que se pida mas detalle.
- Cuando presentes listas, usa guiones (-). Usa **negrita** para datos importantes.
- El periodo por defecto es el mes actual salvo que el usuario especifique otro.
- Si detectas un problema (stock bajo, deuda alta, caida de ventas), mencionalo y sugeri una accion.
- Para "mes pasado" o "mes anterior" usa periodo="mes_anterior".
- Para "ayer" usa periodo="ayer". Para "semana pasada" usa periodo="semana_pasada".
- Para "ano pasado" o "año anterior" usa periodo="ano_anterior".
- Para "trimestre anterior" usa periodo="trimestre_anterior".

═══════════════════════════════════════════
HERRAMIENTAS DISPONIBLES (base de datos real)
═══════════════════════════════════════════
Cuando necesites datos del negocio, respondé UNICAMENTE con este JSON (sin ningun texto antes ni despues):
{"tool":"nombre_herramienta","args":{"param":"valor"}}

LISTA DE HERRAMIENTAS:

1. obtener_resumen_ventas
   Descripcion: Total vendido, cantidad de ventas y ticket promedio de un periodo.
   Cuando usar: cuanto se vendio, cuantas ventas hubo, ingresos del periodo.
   Args: { "periodo": "hoy"|"ayer"|"semana"|"semana_pasada"|"mes"|"mes_anterior"|"trimestre"|"trimestre_anterior"|"ano"|"ano_anterior" }

2. obtener_top_productos
   Descripcion: Productos mas vendidos, con mayor ingreso o mayor margen en un periodo.
   Cuando usar: que productos se venden mas, cuales son los mas rentables, ranking de productos.
   Args: { "metrica": "ingresos"|"cantidad"|"margen", "periodo": "semana"|"mes"|"mes_anterior"|"trimestre"|"ano"|"ano_anterior", "limite": numero }

3. obtener_oportunidades_marketing
   Descripcion: Productos con mejor potencial para invertir en marketing segun margen real, rotacion y stock disponible.
   Cuando usar: que producto promocionar, donde invertir marketing, que producto empujar, potencial comercial.
   Args: { "periodo": "semana"|"mes"|"trimestre"|"ano", "limite": numero }

4. obtener_top_clientes
   Descripcion: Clientes que mas compraron en un periodo.
   Cuando usar: mejores clientes, quien compra mas, clientes VIP, ranking de clientes.
   Args: { "metrica": "ingresos"|"cantidad_ventas", "periodo": "semana"|"mes"|"mes_anterior"|"trimestre"|"ano", "limite": numero }

5. obtener_stock_critico
   Descripcion: Productos con stock en o bajo el minimo configurado.
   Cuando usar: que hay que reponer, que se esta agotando, alertas de stock.
   Args: { "limite": numero }

6. obtener_deudas_clientes
   Descripcion: Clientes con saldo pendiente de pago y monto adeudado.
   Cuando usar: quien debe plata, cobranzas pendientes, deudas de clientes, cuentas corrientes.
   Args: { "limite": numero }

7. obtener_resumen_financiero
   Descripcion: Ingresos por ventas, gastos por compras y ganancia estimada del periodo.
   Cuando usar: como le fue al negocio, cuanto se gano, ganancias del mes, resumen general.
   Args: { "periodo": "mes"|"mes_anterior"|"trimestre"|"trimestre_anterior"|"ano"|"ano_anterior" }

8. obtener_ventas_por_vendedor
   Descripcion: Ranking de ventas por vendedor/usuario en un periodo.
   Cuando usar: que vendedor vendio mas, rendimiento del equipo, ranking de vendedores.
   Args: { "periodo": "semana"|"mes"|"mes_anterior"|"trimestre"|"ano" }

9. obtener_compras_recientes
   Descripcion: Ultimas compras realizadas a proveedores y gasto total.
   Cuando usar: compras, gastos con proveedores, que se compro ultimamente.
   Args: { "limite": numero }

10. obtener_ventas_producto
    Descripcion: Ventas de un producto especifico buscado por nombre o codigo/SKU en un periodo.
    Cuando usar: cuanto se vendio de X producto, ventas de un articulo especifico, desempeno de un producto.
    Args: { "nombre_producto": "texto a buscar", "periodo": "hoy"|"semana"|"mes"|"mes_anterior"|"trimestre"|"ano" }

11. obtener_comparativa_periodos
    Descripcion: Compara ventas del periodo actual vs el periodo anterior equivalente (mes vs mes anterior, etc).
    Cuando usar: como estamos vs el mes pasado, crecimos o caimos, comparar periodos, evolucion.
    Args: { "periodo": "mes"|"trimestre"|"ano"|"semana" }

12. obtener_tendencia_mensual
    Descripcion: Evolucion de ventas mes a mes durante un año completo.
    Cuando usar: tendencia anual, como evolucionaron las ventas en el año, estacionalidad, grafico mensual.
    Args: { "anio": numero_del_año (ej: 2025) }

13. obtener_info_cliente
    Descripcion: Perfil completo de un cliente: historial de compras, total comprado, ultima compra y deuda actual.
    Cuando usar: informacion de un cliente, historial de compras de X cliente, cuanto compro X, que debe X.
    Args: { "nombre_cliente": "nombre o apellido a buscar" }

14. obtener_pendientes_hoy
    Descripcion: Dashboard del dia: ventas realizadas hoy, cobros recibidos hoy, ventas pendientes de cobro y alertas de stock critico.
    Cuando usar: como va el dia, resumen de hoy, que tengo pendiente, dashboard diario.
    Args: {} (sin argumentos)

15. obtener_ventas_por_categoria
    Descripcion: Ingresos, unidades vendidas y margen desglosados por categoria de producto en un periodo.
    Cuando usar: que categoria vende mas, desglose por rubro, participacion por categoria.
    Args: { "periodo": "semana"|"mes"|"mes_anterior"|"trimestre"|"ano" }

═══════════════════════════════════════════
FLUJO DE TRABAJO:
1. Si necesitas datos → respondé SOLO con el JSON de la herramienta (sin texto adicional).
2. Cuando recibas los datos → respondé al usuario en lenguaje natural con un analisis claro.
3. Podes llamar multiples herramientas en secuencia si la pregunta lo requiere.
4. Nunca inventes numeros. Siempre usa las herramientas para datos reales.
5. Si una herramienta devuelve un error, informalo amablemente y ofrecé alternativas.
═══════════════════════════════════════════`;
}

// ─── Parsear tool call desde respuesta del modelo ────────────────────────────
function parseToolCall(text) {
  const trimmed = (text || '').trim();

  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed);
      if (json.tool && typeof json.tool === 'string') {
        return { name: json.tool, args: json.args || {} };
      }
    } catch {}
  }

  const codeBlock = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlock) {
    try {
      const json = JSON.parse(codeBlock[1]);
      if (json.tool && typeof json.tool === 'string') {
        return { name: json.tool, args: json.args || {} };
      }
    } catch {}
  }

  return null;
}

// ─── Llamada HTTP a Gemini v1 ─────────────────────────────────────────────────
async function callGeminiV1(contents) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada');

  const body = JSON.stringify({
    contents,
    generationConfig: { temperature: 0.15, maxOutputTokens: 1500 },
  });

  async function requestGemini(targetModel) {
    return httpPost(
      `https://generativelanguage.googleapis.com/v1/models/${targetModel}:generateContent?key=${GEMINI_API_KEY}`,
      body
    );
  }

  let model = await resolveModel();
  let res   = await requestGemini(model);

  if (!res.ok) {
    let errMsg = extractGeminiErrorMessage(res.text, res.status);

    if (isGeminiModelNotFoundError(errMsg)) {
      geminiModelResolver.invalidate(model);
      _modelDetected = false;
      _resolvedModel = null;

      const retryModel = await resolveModel();
      if (retryModel && retryModel !== model) {
        model = retryModel;
        res   = await requestGemini(model);
        if (!res.ok) errMsg = extractGeminiErrorMessage(res.text, res.status);
      }
    }

    if (!res.ok) throw new Error(errMsg);
  }

  const data      = JSON.parse(res.text || '{}');
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error('Gemini: sin candidatos en la respuesta');

  const parts    = candidate.content?.parts || [];
  const textPart = parts.find((p) => typeof p.text === 'string');
  if (textPart) return textPart.text;

  const finishReason = candidate.finishReason;
  if (finishReason && finishReason !== 'STOP') {
    throw new Error(`Gemini: respuesta bloqueada (${finishReason})`);
  }

  throw new Error('Gemini: respuesta de texto vacia');
}

// ─── Chat principal ───────────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.message  - Mensaje del usuario
 * @param {Array}  opts.history  - Historial previo [{ role, content }]
 * @returns {Promise<{ reply: string, history: Array }>}
 */
async function chat({ message, history = [] }) {
  if (!GEMINI_API_KEY) {
    return {
      reply:   'El asistente de IA no esta configurado. Pedile al administrador que configure GEMINI_API_KEY en el servidor.',
      history,
    };
  }

  const systemText = buildSystemWithTools();

  // Preamble: system prompt embebido como primer turno (para API v1 sin systemInstruction)
  const preamble = [
    { role: 'user',  parts: [{ text: systemText }] },
    { role: 'model', parts: [{ text: 'Entendido. Soy el asistente de Kaisen ERP. Tengo acceso a 15 herramientas para consultar datos reales del negocio. Puedo responder preguntas sobre ventas, clientes, stock, finanzas, compras, tendencias y mucho mas. ¿En que te puedo ayudar?' }] },
  ];

  const historyContents = history.slice(-20).map((h) => ({
    role:  h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.content }],
  }));

  let contents = [
    ...preamble,
    ...historyContents,
    { role: 'user', parts: [{ text: message }] },
  ];

  // Inferencia proactiva de herramienta (solo para marketing)
  let toolCallCount = 0;
  const inferredToolCall = inferToolCallFromMessage(message);

  if (inferredToolCall) {
    toolCallCount++;
    const toolResult = await executeTool(inferredToolCall.name, inferredToolCall.args);
    contents = [
      ...contents,
      { role: 'model', parts: [{ text: JSON.stringify({ tool: inferredToolCall.name, args: inferredToolCall.args }) }] },
      { role: 'user',  parts: [{ text: `Resultado de "${inferredToolCall.name}":\n\`\`\`json\n${JSON.stringify(toolResult, null, 2)}\n\`\`\`\n\nAhora respondé al usuario en lenguaje natural.` }] },
    ];
  }

  // Loop principal de herramientas
  while (toolCallCount <= MAX_TOOL_CALLS) {
    let rawReply;
    try {
      rawReply = await callGeminiV1(contents);
    } catch (err) {
      logger.error({ err }, 'chatService: error en callGeminiV1');
      const reply = `Lo siento, ocurrio un error al conectarme con la IA: ${err.message}. Intentá de nuevo en unos segundos.`;
      return {
        reply,
        history: [...history, { role: 'user', content: message }, { role: 'assistant', content: reply }],
      };
    }

    const toolCall = parseToolCall(rawReply);

    if (toolCall) {
      toolCallCount++;
      const toolResult = await executeTool(toolCall.name, toolCall.args);
      contents = [
        ...contents,
        { role: 'model', parts: [{ text: rawReply }] },
        {
          role:  'user',
          parts: [{ text: `Resultado de "${toolCall.name}":\n\`\`\`json\n${JSON.stringify(toolResult, null, 2)}\n\`\`\`\n\nAhora respondé al usuario en lenguaje natural.` }],
        },
      ];
      continue;
    }

    return {
      reply:   rawReply,
      history: [
        ...history,
        { role: 'user',      content: message  },
        { role: 'assistant', content: rawReply },
      ],
    };
  }

  const fallbackReply = 'Procese la consulta pero no pude generar una respuesta completa. Podés reformular la pregunta?';
  return {
    reply:   fallbackReply,
    history: [
      ...history,
      { role: 'user',      content: message       },
      { role: 'assistant', content: fallbackReply },
    ],
  };
}

module.exports = { chat };
