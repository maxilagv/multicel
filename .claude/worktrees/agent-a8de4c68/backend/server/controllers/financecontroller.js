const { query } = require('../db/pg');
const categoryRepo = require('../db/repositories/categoryRepository');

// Helpers de fechas: rango [desde, hasta] en formato YYYY-MM-DD
function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toLocalDateString(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateRange(req) {
  const { desde, hasta, periodo } = req.query || {};
  const now = new Date();

  let from;
  let to;

  if (desde || hasta) {
    from = parseDate(desde) || new Date(now);
    to = parseDate(hasta) || new Date(now);
  } else {
    const p = (periodo || '30d').toString().toLowerCase();
    to = new Date(now);
    from = new Date(now);

    if (p === '24h') {
      from.setDate(from.getDate() - 1);
    } else if (p === '7d' || p === '1w' || p === 'semana') {
      from.setDate(from.getDate() - 6);
    } else {
      // Default: últimos 30 días (hoy incluido)
      from.setDate(from.getDate() - 29);
    }
  }

  // Normalizar a fecha local para SQL (evitar desfase UTC)
  const fromStr = toLocalDateString(from);
  const toStr = toLocalDateString(to);

  return { desde: fromStr, hasta: toStr };
}

function normalizePeriodo(value) {
  if (!value) return '';
  return value instanceof Date ? toLocalDateString(value) : String(value);
}

function normalizeTipoPresupuesto(tipo) {
  const raw = (tipo || '').toString().toLowerCase();
  if (['venta', 'ventas', 'ingreso', 'ingresos'].includes(raw)) return 'ventas';
  if (['gasto', 'gastos', 'egreso', 'egresos'].includes(raw)) return 'gastos';
  return '';
}

async function appendCategoriaFilter(where, params, {
  categoriaId,
  includeDescendants = false,
  column = 'categoria_id',
} = {}) {
  if (!categoriaId) return;
  const ids = await categoryRepo.getCategoryFilterIds(categoriaId, {
    includeDescendants: Boolean(includeDescendants),
    onlyActive: true,
  });
  if (!ids.length) {
    where.push('1 = 0');
    return;
  }
  const start = params.length + 1;
  const marks = ids.map((_, idx) => `$${start + idx}`).join(', ');
  params.push(...ids);
  where.push(`${column} IN (${marks})`);
}

// 1) Costos de productos (vinculado a compras)
async function costosProductos(req, res) {
  try {
    const { desde, hasta } = getDateRange(req);
    const { groupBy, producto_id, proveedor_id, categoria_id, include_descendants } = req.query || {};

    const gb = (groupBy || 'dia').toString().toLowerCase();
    const allowedGroupBy = new Set(['dia', 'producto', 'proveedor', 'categoria']);
    const group = allowedGroupBy.has(gb) ? gb : 'dia';
    const includeDescendants =
      String(include_descendants || '').toLowerCase() === '1' ||
      String(include_descendants || '').toLowerCase() === 'true';

    const params = [desde, hasta];
    const where = ["date(fecha, 'localtime') >= date($1)", "date(fecha, 'localtime') <= date($2)"];

    if (producto_id) {
      params.push(Number(producto_id));
      where.push(`producto_id = $${params.length}`);
    }
    if (proveedor_id) {
      params.push(Number(proveedor_id));
      where.push(`proveedor_id = $${params.length}`);
    }
    await appendCategoriaFilter(where, params, {
      categoriaId: categoria_id,
      includeDescendants,
      column: 'categoria_id',
    });

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Totales por moneda
    const { rows: totRows } = await query(
      `
      SELECT
        COALESCE(moneda, 'N/A') AS moneda,
        COALESCE(SUM(subtotal), 0)::float AS total_costos,
        COALESCE(SUM(cantidad), 0)::float AS total_cantidad
      FROM vista_costos_productos
      ${whereClause}
      GROUP BY COALESCE(moneda, 'N/A')
      ORDER BY moneda
    `,
      params
    );

    let detallesSql;
    if (group === 'producto') {
      detallesSql = `
        SELECT
          producto_id,
          producto_codigo,
          producto_nombre,
          COALESCE(moneda, 'N/A') AS moneda,
          COALESCE(SUM(cantidad), 0)::float AS cantidad,
          COALESCE(SUM(subtotal), 0)::float AS total_costos
        FROM vista_costos_productos
        ${whereClause}
        GROUP BY producto_id, producto_codigo, producto_nombre, COALESCE(moneda, 'N/A')
        ORDER BY total_costos DESC, producto_nombre ASC
      `;
    } else if (group === 'proveedor') {
      detallesSql = `
        SELECT
          proveedor_id,
          proveedor_nombre,
          COALESCE(moneda, 'N/A') AS moneda,
          COALESCE(SUM(cantidad), 0)::float AS cantidad,
          COALESCE(SUM(subtotal), 0)::float AS total_costos
        FROM vista_costos_productos
        ${whereClause}
        GROUP BY proveedor_id, proveedor_nombre, COALESCE(moneda, 'N/A')
        ORDER BY total_costos DESC, proveedor_nombre ASC
      `;
    } else if (group === 'categoria') {
      detallesSql = `
        SELECT
          categoria_id,
          categoria_nombre,
          COALESCE(moneda, 'N/A') AS moneda,
          COALESCE(SUM(cantidad), 0)::float AS cantidad,
          COALESCE(SUM(subtotal), 0)::float AS total_costos
        FROM vista_costos_productos
        ${whereClause}
        GROUP BY categoria_id, categoria_nombre, COALESCE(moneda, 'N/A')
        ORDER BY total_costos DESC, categoria_nombre ASC
      `;
    } else {
      // group === 'dia'
      detallesSql = `
        SELECT
          date(fecha, 'localtime') AS fecha,
          COALESCE(moneda, 'N/A') AS moneda,
          COALESCE(SUM(cantidad), 0)::float AS cantidad,
          COALESCE(SUM(subtotal), 0)::float AS total_costos
        FROM vista_costos_productos
        ${whereClause}
        GROUP BY date(fecha, 'localtime'), COALESCE(moneda, 'N/A')
        ORDER BY date(fecha, 'localtime') ASC, moneda ASC
      `;
    }

    const { rows: detRows } = await query(detallesSql, params);

    const totalesPorMoneda = totRows.map((r) => ({
      moneda: r.moneda,
      totalCostos: Number(r.total_costos || 0),
      totalCantidad: Number(r.total_cantidad || 0),
    }));

    let detalles;
    if (group === 'producto') {
      detalles = detRows.map((r) => ({
        productoId: r.producto_id,
        productoCodigo: r.producto_codigo,
        productoNombre: r.producto_nombre,
        moneda: r.moneda,
        cantidad: Number(r.cantidad || 0),
        totalCostos: Number(r.total_costos || 0),
      }));
    } else if (group === 'proveedor') {
      detalles = detRows.map((r) => ({
        proveedorId: r.proveedor_id,
        proveedorNombre: r.proveedor_nombre,
        moneda: r.moneda,
        cantidad: Number(r.cantidad || 0),
        totalCostos: Number(r.total_costos || 0),
      }));
    } else if (group === 'categoria') {
      detalles = detRows.map((r) => ({
        categoriaId: r.categoria_id,
        categoriaNombre: r.categoria_nombre,
        moneda: r.moneda,
        cantidad: Number(r.cantidad || 0),
        totalCostos: Number(r.total_costos || 0),
      }));
    } else {
      detalles = detRows.map((r) => ({
        fecha: r.fecha instanceof Date ? toLocalDateString(r.fecha) : r.fecha,
        moneda: r.moneda,
        cantidad: Number(r.cantidad || 0),
        totalCostos: Number(r.total_costos || 0),
      }));
    }

    res.json({
      desde,
      hasta,
      groupBy: group,
      totalesPorMoneda,
      detalles,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener los costos de productos' });
  }
}

// 2) Ganancia bruta (ingresos por ventas)
async function gananciaBruta(req, res) {
  try {
    const { desde, hasta } = getDateRange(req);
    const { agregado, detalle, limit } = req.query || {};

    const agg = (agregado || 'dia').toString().toLowerCase();
    const det = (detalle || '').toString().toLowerCase();
    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);

    const params = [desde, hasta];

    const { rows: totRows } = await query(
      `
      SELECT
        COALESCE(SUM(neto), 0)::float       AS total_ventas,
        COALESCE(SUM(descuento), 0)::float  AS total_descuentos,
        COALESCE(SUM(impuestos), 0)::float  AS total_impuestos
      FROM ventas
      WHERE estado_pago <> 'cancelado'
        AND date(fecha, 'localtime') >= date($1)
        AND date(fecha, 'localtime') <= date($2)
    `,
      params
    );

    const { rows: costoRows } = await query(
      `
      SELECT
        COALESCE(SUM(vd.cantidad * p.precio_costo), 0)::float AS total_costo_productos
      FROM ventas v
      JOIN ventas_detalle vd ON vd.venta_id = v.id
      JOIN productos p ON p.id = vd.producto_id
      WHERE v.estado_pago <> 'cancelado'
        AND date(v.fecha, 'localtime') >= date($1)
        AND date(v.fecha, 'localtime') <= date($2)
    `,
      params
    );

    const totals = totRows[0] || {
      total_ventas: 0,
      total_descuentos: 0,
      total_impuestos: 0,
    };
    const totalCostoProductos = Number(costoRows[0]?.total_costo_productos || 0);

    let ventasSerieSql;
    let costoSerieSql;
    if (agg === 'mes') {
      ventasSerieSql = `
        SELECT
          date(fecha, 'start of month') AS periodo,
          COALESCE(SUM(neto), 0)::float    AS total_ventas
        FROM ventas
        WHERE estado_pago <> 'cancelado'
          AND date(fecha, 'localtime') >= date($1)
          AND date(fecha, 'localtime') <= date($2)
        GROUP BY date(fecha, 'start of month')
        ORDER BY date(fecha, 'start of month')
      `;
      costoSerieSql = `
        SELECT
          date(v.fecha, 'start of month') AS periodo,
          COALESCE(SUM(vd.cantidad * p.precio_costo), 0)::float AS total_costo_productos
        FROM ventas v
        JOIN ventas_detalle vd ON vd.venta_id = v.id
        JOIN productos p ON p.id = vd.producto_id
        WHERE v.estado_pago <> 'cancelado'
          AND date(v.fecha, 'localtime') >= date($1)
          AND date(v.fecha, 'localtime') <= date($2)
        GROUP BY date(v.fecha, 'start of month')
        ORDER BY date(v.fecha, 'start of month')
      `;
    } else {
      ventasSerieSql = `
        SELECT
          date(fecha, 'localtime')                      AS periodo,
          COALESCE(SUM(neto), 0)::float    AS total_ventas
        FROM ventas
        WHERE estado_pago <> 'cancelado'
          AND date(fecha, 'localtime') >= date($1)
          AND date(fecha, 'localtime') <= date($2)
        GROUP BY date(fecha, 'localtime')
        ORDER BY date(fecha, 'localtime')
      `;
      costoSerieSql = `
        SELECT
          date(v.fecha, 'localtime') AS periodo,
          COALESCE(SUM(vd.cantidad * p.precio_costo), 0)::float AS total_costo_productos
        FROM ventas v
        JOIN ventas_detalle vd ON vd.venta_id = v.id
        JOIN productos p ON p.id = vd.producto_id
        WHERE v.estado_pago <> 'cancelado'
          AND date(v.fecha, 'localtime') >= date($1)
          AND date(v.fecha, 'localtime') <= date($2)
        GROUP BY date(v.fecha, 'localtime')
        ORDER BY date(v.fecha, 'localtime')
      `;
    }

    const [{ rows: ventasRows }, { rows: costoSerieRows }] = await Promise.all([
      query(ventasSerieSql, params),
      query(costoSerieSql, params),
    ]);

    const ventasMap = new Map(
      ventasRows.map((r) => [normalizePeriodo(r.periodo), Number(r.total_ventas || 0)])
    );
    const costoMap = new Map(
      costoSerieRows.map((r) => [
        normalizePeriodo(r.periodo),
        Number(r.total_costo_productos || 0),
      ])
    );
    const periodos = Array.from(new Set([...ventasMap.keys(), ...costoMap.keys()])).sort();
    const serie = periodos.map((periodo) => {
      const totalVentas = ventasMap.get(periodo) || 0;
      const totalCosto = costoMap.get(periodo) || 0;
      return {
        fecha: periodo,
        totalVentas,
        totalCostoProductos: totalCosto,
        gananciaBruta: totalVentas - totalCosto,
      };
    });

    let porProducto = [];
    let porCliente = [];

    if (det === 'producto') {
      const { rows } = await query(
        `
        SELECT
          vd.producto_id,
          p.codigo  AS producto_codigo,
          p.nombre  AS producto_nombre,
          COALESCE(SUM(vd.cantidad), 0)::float   AS unidades_vendidas,
          COALESCE(SUM(vd.subtotal), 0)::float   AS total_ventas
        FROM ventas_detalle vd
        JOIN ventas v   ON v.id = vd.venta_id
        JOIN productos p ON p.id = vd.producto_id
        WHERE v.estado_pago <> 'cancelado'
          AND date(v.fecha, 'localtime') >= date($1)
          AND date(v.fecha, 'localtime') <= date($2)
        GROUP BY vd.producto_id, p.codigo, p.nombre
        ORDER BY total_ventas DESC, producto_nombre ASC
        LIMIT $3
      `,
        [...params, lim]
      );
      porProducto = rows.map((r) => ({
        productoId: r.producto_id,
        productoCodigo: r.producto_codigo,
        productoNombre: r.producto_nombre,
        unidadesVendidas: Number(r.unidades_vendidas || 0),
        totalVentas: Number(r.total_ventas || 0),
      }));
    } else if (det === 'cliente') {
      const { rows } = await query(
        `
        SELECT
          v.cliente_id,
          c.nombre                        AS cliente_nombre,
          COALESCE(c.apellido, '')        AS cliente_apellido,
          COUNT(DISTINCT v.id)            AS cantidad_ventas,
          COALESCE(SUM(v.neto), 0)::float AS total_ventas
        FROM ventas v
        JOIN clientes c ON c.id = v.cliente_id
        WHERE v.estado_pago <> 'cancelado'
          AND date(v.fecha, 'localtime') >= date($1)
          AND date(v.fecha, 'localtime') <= date($2)
        GROUP BY v.cliente_id, c.nombre, c.apellido
        ORDER BY total_ventas DESC, cliente_nombre ASC
        LIMIT $3
      `,
        [...params, lim]
      );
      porCliente = rows.map((r) => ({
        clienteId: r.cliente_id,
        clienteNombre: r.cliente_nombre,
        clienteApellido: r.cliente_apellido,
        cantidadVentas: Number(r.cantidad_ventas || 0),
        totalVentas: Number(r.total_ventas || 0),
      }));
    }

    res.json({
      desde,
      hasta,
      agregado: agg === 'mes' ? 'mes' : 'dia',
      totalVentas: Number(totals.total_ventas || 0),
      totalCostoProductos,
      gananciaBruta: Number(totals.total_ventas || 0) - totalCostoProductos,
      totalDescuentos: Number(totals.total_descuentos || 0),
      totalImpuestos: Number(totals.total_impuestos || 0),
      serie,
      porProducto,
      porCliente,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener la ganancia bruta' });
  }
}

// 3) Ganancia neta (ventas - costo productos vendidos - gastos - inversiones)
async function gananciaNeta(req, res) {
  try {
    const { desde, hasta } = getDateRange(req);
    const params = [desde, hasta];

    // Serie diaria combinando ventas, costo de productos, gastos e inversiones
    const { rows } = await query(
      `
      WITH RECURSIVE rango(fecha) AS (
        SELECT date($1)
        UNION ALL
        SELECT date(fecha, '+1 day') FROM rango WHERE fecha < date($2)
      ),
      ventas_d AS (
        SELECT
          date(fecha, 'localtime')                      AS fecha,
          COALESCE(SUM(neto), 0)::float    AS total_ventas
        FROM ventas
        WHERE estado_pago <> 'cancelado'
          AND date(fecha, 'localtime') >= date($1)
          AND date(fecha, 'localtime') <= date($2)
        GROUP BY date(fecha, 'localtime')
      ),
      cogs_d AS (
        SELECT
          date(v.fecha, 'localtime') AS fecha,
          COALESCE(SUM(vd.cantidad * p.precio_costo), 0)::float AS total_costo_productos
        FROM ventas v
        JOIN ventas_detalle vd ON vd.venta_id = v.id
        JOIN productos p       ON p.id = vd.producto_id
        WHERE v.estado_pago <> 'cancelado'
          AND date(v.fecha, 'localtime') >= date($1)
          AND date(v.fecha, 'localtime') <= date($2)
        GROUP BY date(v.fecha, 'localtime')
      ),
      gastos_d AS (
        SELECT
          date(fecha, 'localtime')                      AS fecha,
          COALESCE(SUM(monto), 0)::float   AS total_gastos
        FROM gastos
        WHERE date(fecha, 'localtime') >= date($1)
          AND date(fecha, 'localtime') <= date($2)
        GROUP BY date(fecha, 'localtime')
      ),
      inv_d AS (
        SELECT
          date(fecha, 'localtime')                      AS fecha,
          COALESCE(SUM(monto), 0)::float   AS total_inversiones
        FROM inversiones
        WHERE date(fecha, 'localtime') >= date($1)
          AND date(fecha, 'localtime') <= date($2)
        GROUP BY date(fecha, 'localtime')
      )
      SELECT
        r.fecha,
        COALESCE(v.total_ventas, 0)        AS total_ventas,
        COALESCE(c.total_costo_productos, 0) AS total_costo_productos,
        COALESCE(g.total_gastos, 0)        AS total_gastos,
        COALESCE(i.total_inversiones, 0)   AS total_inversiones
      FROM rango r
      LEFT JOIN ventas_d v ON v.fecha = r.fecha
      LEFT JOIN cogs_d   c ON c.fecha = r.fecha
      LEFT JOIN gastos_d g ON g.fecha = r.fecha
      LEFT JOIN inv_d    i ON i.fecha = r.fecha
      ORDER BY r.fecha
    `,
      params
    );

    let totalVentas = 0;
    let totalCostoProductos = 0;
    let totalGastos = 0;
    let totalInversiones = 0;

    const serie = rows.map((r) => {
      const tv = Number(r.total_ventas || 0);
      const tc = Number(r.total_costo_productos || 0);
      const tg = Number(r.total_gastos || 0);
      const ti = Number(r.total_inversiones || 0);

      totalVentas += tv;
      totalCostoProductos += tc;
      totalGastos += tg;
      totalInversiones += ti;

      const gananciaBrutaDia = tv - tc;
      const gananciaNetaDia = gananciaBrutaDia - tg - ti;

      return {
        fecha: r.fecha instanceof Date ? toLocalDateString(r.fecha) : r.fecha,
        totalVentas: tv,
        totalCostoProductos: tc,
        totalGastos: tg,
        totalInversiones: ti,
        gananciaBruta: gananciaBrutaDia,
        gananciaNeta: gananciaNetaDia,
      };
    });

    const gananciaBruta = totalVentas - totalCostoProductos;
    const gananciaNetaTotal = gananciaBruta - totalGastos - totalInversiones;

    res.json({
      desde,
      hasta,
      totalVentas,
      totalCostoProductos,
      totalGastos,
      totalInversiones,
      gananciaBruta,
      gananciaNeta: gananciaNetaTotal,
      serie,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener la ganancia neta' });
  }
}

// 4) Ganancia por producto (top productos por rentabilidad)
async function gananciaPorProducto(req, res) {
  try {
    const { desde, hasta } = getDateRange(req);
    const { limit, orderBy, categoria_id, include_descendants } = req.query || {};

    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
    const order = (orderBy || 'ganancia').toString().toLowerCase();
    const allowedOrder = new Set(['ganancia', 'ingresos', 'cantidad', 'margen']);

    const orderKey = allowedOrder.has(order) ? order : 'ganancia';
    const includeDescendants =
      String(include_descendants || '').toLowerCase() === '1' ||
      String(include_descendants || '').toLowerCase() === 'true';

    const params = [desde, hasta];
    const where = [
      "v.estado_pago <> 'cancelado'",
      "date(v.fecha, 'localtime') >= date($1)",
      "date(v.fecha, 'localtime') <= date($2)",
    ];

    await appendCategoriaFilter(where, params, {
      categoriaId: categoria_id,
      includeDescendants,
      column: 'p.categoria_id',
    });

    let orderClause = 'ganancia_bruta DESC';
    if (orderKey === 'ingresos') {
      orderClause = 'ingresos DESC';
    } else if (orderKey === 'cantidad') {
      orderClause = 'unidades_vendidas DESC';
    } else if (orderKey === 'margen') {
      orderClause = '(margen_porcentaje IS NULL) ASC, margen_porcentaje DESC';
    }

    const sql = `
      SELECT
        p.id                            AS producto_id,
        p.codigo                        AS producto_codigo,
        p.nombre                        AS producto_nombre,
        COALESCE(SUM(vd.cantidad), 0)::float                   AS unidades_vendidas,
        COALESCE(SUM(vd.subtotal), 0)::float                   AS ingresos,
        COALESCE(SUM(vd.cantidad * p.precio_costo), 0)::float  AS costo_total,
        COALESCE(SUM(vd.subtotal - vd.cantidad * p.precio_costo), 0)::float AS ganancia_bruta,
        CASE
          WHEN SUM(vd.cantidad * p.precio_costo) > 0
            THEN (SUM(vd.subtotal - vd.cantidad * p.precio_costo) / SUM(vd.cantidad * p.precio_costo)) * 100
          ELSE NULL
        END AS margen_porcentaje
      FROM productos p
      JOIN ventas_detalle vd ON vd.producto_id = p.id
      JOIN ventas v          ON v.id = vd.venta_id
      WHERE ${where.join(' AND ')}
      GROUP BY p.id, p.codigo, p.nombre
      ORDER BY ${orderClause}
      LIMIT $${params.length + 1}
    `;

    const { rows } = await query(sql, [...params, lim]);

    const items = rows.map((r) => ({
      productoId: r.producto_id,
      productoCodigo: r.producto_codigo,
      productoNombre: r.producto_nombre,
      unidadesVendidas: Number(r.unidades_vendidas || 0),
      ingresos: Number(r.ingresos || 0),
      costoTotal: Number(r.costo_total || 0),
      gananciaBruta: Number(r.ganancia_bruta || 0),
      margenPorcentaje: r.margen_porcentaje != null ? Number(r.margen_porcentaje) : null,
    }));

    res.json({
      desde,
      hasta,
      orderBy: orderKey,
      limit: lim,
      items,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener la ganancia por producto' });
  }
}

// 5) Rentabilidad por categoría
async function rentabilidadPorCategoria(req, res) {
  try {
    const { desde, hasta } = getDateRange(req);
    const { limit } = req.query || {};

    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);

    const params = [desde, hasta, lim];

    const sql = `
      SELECT
        p.categoria_id                                         AS categoria_id,
        COALESCE(cat.nombre, 'Sin categoría')                  AS categoria_nombre,
        COALESCE(SUM(vd.cantidad), 0)::float                   AS unidades_vendidas,
        COALESCE(SUM(vd.subtotal), 0)::float                   AS ingresos,
        COALESCE(SUM(vd.cantidad * p.precio_costo), 0)::float  AS costo_total,
        COALESCE(SUM(vd.subtotal - vd.cantidad * p.precio_costo), 0)::float AS ganancia_bruta,
        CASE
          WHEN SUM(vd.cantidad * p.precio_costo) > 0
            THEN (SUM(vd.subtotal - vd.cantidad * p.precio_costo) / SUM(vd.cantidad * p.precio_costo)) * 100
          ELSE NULL
        END AS margen_porcentaje
      FROM ventas_detalle vd
      JOIN ventas v      ON v.id = vd.venta_id
      JOIN productos p   ON p.id = vd.producto_id
      LEFT JOIN categorias cat ON cat.id = p.categoria_id
      WHERE v.estado_pago <> 'cancelado'
        AND date(v.fecha, 'localtime') >= date($1)
        AND date(v.fecha, 'localtime') <= date($2)
      GROUP BY p.categoria_id, cat.nombre
      ORDER BY ganancia_bruta DESC
      LIMIT $3
    `;

    const { rows } = await query(sql, params);

    const items = rows.map((r) => ({
      categoriaId: r.categoria_id,
      categoriaNombre: r.categoria_nombre,
      unidadesVendidas: Number(r.unidades_vendidas || 0),
      ingresos: Number(r.ingresos || 0),
      costoTotal: Number(r.costo_total || 0),
      gananciaBruta: Number(r.ganancia_bruta || 0),
      margenPorcentaje: r.margen_porcentaje != null ? Number(r.margen_porcentaje) : null,
    }));

    res.json({
      desde,
      hasta,
      limit: lim,
      items,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener la rentabilidad por categoría' });
  }
}

// 6) Rentabilidad por cliente (incluye deuda actual)
async function rentabilidadPorCliente(req, res) {
  try {
    const { desde, hasta } = getDateRange(req);
    const { limit } = req.query || {};

    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);

    const params = [desde, hasta, lim];

    const sql = `
      SELECT
        v.cliente_id                                           AS cliente_id,
        c.nombre                                               AS cliente_nombre,
        COALESCE(c.apellido, '')                               AS cliente_apellido,
        COALESCE(SUM(vd.cantidad), 0)::float                   AS unidades_vendidas,
        COALESCE(SUM(vd.subtotal), 0)::float                   AS ingresos,
        COALESCE(SUM(vd.cantidad * p.precio_costo), 0)::float  AS costo_total,
        COALESCE(SUM(vd.subtotal - vd.cantidad * p.precio_costo), 0)::float AS ganancia_bruta,
        CASE
          WHEN SUM(vd.cantidad * p.precio_costo) > 0
            THEN (SUM(vd.subtotal - vd.cantidad * p.precio_costo) / SUM(vd.cantidad * p.precio_costo)) * 100
          ELSE NULL
        END AS margen_porcentaje,
        COALESCE(d.deuda_pendiente, 0)::float                  AS deuda
      FROM ventas_detalle vd
      JOIN ventas v      ON v.id = vd.venta_id
      JOIN productos p   ON p.id = vd.producto_id
      JOIN clientes c    ON c.id = v.cliente_id
      LEFT JOIN vista_deudas d ON d.cliente_id = v.cliente_id
      WHERE v.estado_pago <> 'cancelado'
        AND date(v.fecha, 'localtime') >= date($1)
        AND date(v.fecha, 'localtime') <= date($2)
      GROUP BY v.cliente_id, c.nombre, c.apellido, d.deuda_pendiente
      ORDER BY ganancia_bruta DESC
      LIMIT $3
    `;

    const { rows } = await query(sql, params);

    const items = rows.map((r) => ({
      clienteId: r.cliente_id,
      clienteNombre: r.cliente_nombre,
      clienteApellido: r.cliente_apellido,
      unidadesVendidas: Number(r.unidades_vendidas || 0),
      ingresos: Number(r.ingresos || 0),
      costoTotal: Number(r.costo_total || 0),
      gananciaBruta: Number(r.ganancia_bruta || 0),
      margenPorcentaje: r.margen_porcentaje != null ? Number(r.margen_porcentaje) : null,
      deuda: Number(r.deuda || 0),
    }));

    res.json({
      desde,
      hasta,
      limit: lim,
      items,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener la rentabilidad por cliente' });
  }
}

// 7) Cuentas por cobrar: deudas por cliente (con envejecimiento)
async function deudasClientes(req, res) {
  try {
    const { cliente_id, detalle } = req.query || {};
    const clienteId = cliente_id != null ? Number(cliente_id) : null;

    if (clienteId != null && (!Number.isInteger(clienteId) || clienteId <= 0)) {
      return res.status(400).json({ error: 'ID de cliente inválido' });
    }

    const params = [];
    let where = 'WHERE d.deuda_pendiente > 0';
    if (clienteId != null) {
      params.push(clienteId);
      where += ` AND d.cliente_id = $${params.length}`;
    }

    const { rows } = await query(
      `SELECT
          c.id                         AS cliente_id,
          c.nombre                     AS cliente_nombre,
          COALESCE(c.apellido, '')     AS cliente_apellido,
          COALESCE(d.deuda_pendiente, 0)::float AS deuda_total,
          COALESCE(d.deuda_0_30, 0)::float      AS deuda_0_30,
          COALESCE(d.deuda_31_60, 0)::float     AS deuda_31_60,
          COALESCE(d.deuda_61_90, 0)::float     AS deuda_61_90,
          COALESCE(d.deuda_mas_90, 0)::float    AS deuda_mas_90,
          d.dias_promedio_atraso::float         AS dias_promedio_atraso
        FROM vista_deudas d
        JOIN clientes c ON c.id = d.cliente_id
        ${where}
        ORDER BY d.deuda_pendiente DESC, c.nombre ASC`,
      params
    );

    const resumen = rows.map((r) => ({
      clienteId: r.cliente_id,
      clienteNombre: r.cliente_nombre,
      clienteApellido: r.cliente_apellido,
      deudaTotal: Number(r.deuda_total || 0),
      deuda0_30: Number(r.deuda_0_30 || 0),
      deuda31_60: Number(r.deuda_31_60 || 0),
      deuda61_90: Number(r.deuda_61_90 || 0),
      deudaMas90: Number(r.deuda_mas_90 || 0),
      diasPromedioAtraso:
        r.dias_promedio_atraso != null ? Number(r.dias_promedio_atraso) : null,
    }));

    if (clienteId != null && String(detalle) === '1') {
      const { rows: detalleRows } = await query(
        `WITH pagos_venta AS (
           SELECT venta_id, SUM(monto)::float AS total_pagado
           FROM pagos
           GROUP BY venta_id
         )
         SELECT
           v.id                        AS venta_id,
           date(v.fecha, 'localtime')               AS fecha,
           v.neto::float               AS neto,
           COALESCE(p.total_pagado, 0) AS total_pagado,
           MAX(v.neto - COALESCE(p.total_pagado, 0), 0)::float AS saldo,
           MAX(0, CAST(julianday(date('now', 'localtime')) - julianday(date(v.fecha, 'localtime')) AS INTEGER))::int AS dias
         FROM ventas v
         LEFT JOIN pagos_venta p ON p.venta_id = v.id
         WHERE v.estado_pago <> 'cancelado'
           AND v.cliente_id = $1
           AND MAX(v.neto - COALESCE(p.total_pagado, 0), 0) > 0
         ORDER BY date(v.fecha, 'localtime') DESC, v.id DESC`,
        [clienteId]
      );

      const ventas = detalleRows.map((r) => ({
        ventaId: r.venta_id,
        fecha: r.fecha instanceof Date ? toLocalDateString(r.fecha) : r.fecha,
        neto: Number(r.neto || 0),
        totalPagado: Number(r.total_pagado || 0),
        saldo: Number(r.saldo || 0),
        dias: Number(r.dias || 0),
      }));

      return res.json({
        cliente: resumen[0] || null,
        ventas,
      });
    }

    res.json(resumen);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener las deudas de clientes' });
  }
}

// 8) Cuentas por pagar: deudas con proveedores
async function deudasProveedores(req, res) {
  try {
    const { proveedor_id } = req.query || {};
    const proveedorId = proveedor_id != null ? Number(proveedor_id) : null;

    if (proveedorId != null && (!Number.isInteger(proveedorId) || proveedorId <= 0)) {
      return res.status(400).json({ error: 'ID de proveedor inválido' });
    }

    const params = [];
    let whereProv = '';
    if (proveedorId != null) {
      params.push(proveedorId);
      whereProv = 'WHERE pr.id = $1';
    }

    const { rows } = await query(
      `WITH compras_pendientes AS (
         SELECT
           c.id          AS compra_id,
           c.proveedor_id,
           date(c.fecha, 'localtime') AS fecha_compra,
           c.total_costo,
           COALESCE(SUM(pp.monto), 0)::float AS total_pagado,
           (c.total_costo - COALESCE(SUM(pp.monto), 0))::float AS saldo
         FROM compras c
         LEFT JOIN pagos_proveedores pp ON pp.compra_id = c.id
         WHERE c.estado <> 'cancelado'
         GROUP BY c.id, c.proveedor_id, date(c.fecha, 'localtime'), c.total_costo
       ),
       cp_con_dias AS (
         SELECT
           proveedor_id,
           saldo,
           MAX(0, CAST(julianday(date('now', 'localtime')) - julianday(fecha_compra) AS INTEGER))::INT AS dias
         FROM compras_pendientes
         WHERE saldo > 0
       )
       SELECT
         pr.id        AS proveedor_id,
         pr.nombre    AS proveedor_nombre,
         COALESCE(SUM(cp.saldo), 0)::float AS deuda_pendiente,
         COALESCE(SUM(CASE WHEN cp.dias BETWEEN 0 AND 30 THEN cp.saldo ELSE 0 END), 0)::float AS deuda_0_30,
         COALESCE(SUM(CASE WHEN cp.dias BETWEEN 31 AND 60 THEN cp.saldo ELSE 0 END), 0)::float AS deuda_31_60,
         COALESCE(SUM(CASE WHEN cp.dias BETWEEN 61 AND 90 THEN cp.saldo ELSE 0 END), 0)::float AS deuda_61_90,
         COALESCE(SUM(CASE WHEN cp.dias > 90 THEN cp.saldo ELSE 0 END), 0)::float AS deuda_mas_90,
         CASE
           WHEN COUNT(*) > 0 THEN ROUND(AVG(cp.dias), 2)
           ELSE NULL
         END AS dias_promedio_atraso
       FROM proveedores pr
       LEFT JOIN cp_con_dias cp ON cp.proveedor_id = pr.id
       ${whereProv}
       GROUP BY pr.id, pr.nombre
       HAVING COALESCE(SUM(cp.saldo), 0) > 0
       ORDER BY deuda_pendiente DESC, pr.nombre ASC`,
      params
    );

    const items = rows.map((r) => ({
      proveedorId: r.proveedor_id,
      proveedorNombre: r.proveedor_nombre,
      deudaTotal: Number(r.deuda_pendiente || 0),
      deuda0_30: Number(r.deuda_0_30 || 0),
      deuda31_60: Number(r.deuda_31_60 || 0),
      deuda61_90: Number(r.deuda_61_90 || 0),
      deudaMas90: Number(r.deuda_mas_90 || 0),
      diasPromedioAtraso:
        r.dias_promedio_atraso != null ? Number(r.dias_promedio_atraso) : null,
    }));

    // KPI global: días promedio de pago ponderado por deuda
    let diasPromedioPagoGlobal = null;
    const deudaTotal = items.reduce((acc, it) => acc + it.deudaTotal, 0);
    if (deudaTotal > 0) {
      let sum = 0;
      for (const it of items) {
        if (it.diasPromedioAtraso != null && it.deudaTotal > 0) {
          sum += it.diasPromedioAtraso * it.deudaTotal;
        }
      }
      if (sum > 0) {
        diasPromedioPagoGlobal = sum / deudaTotal;
      }
    }

    res.json({
      diasPromedioPagoGlobal:
        diasPromedioPagoGlobal != null ? Number(diasPromedioPagoGlobal) : null,
      items,
    });
  } catch (e) {
    res
      .status(500)
      .json({ error: 'No se pudieron obtener las deudas con proveedores' });
  }
}

// 9) Flujo de caja (cashflow) diario o mensual
async function cashflow(req, res) {
  try {
    const { desde, hasta } = getDateRange(req);
    const { agrupado } = req.query || {};
    const agg = (agrupado || 'dia').toString().toLowerCase() === 'mes' ? 'mes' : 'dia';

    // Parámetros de sistema: saldo inicial y umbral mínimo
    const { rows: paramRows } = await query(
      `SELECT clave, valor_num FROM parametros_sistema WHERE clave IN ('CASH_SALDO_INICIAL', 'CASH_UMBRAL_MINIMO')`
    );
    let saldoInicial = 0;
    let umbralMinimo = 0;
    for (const r of paramRows) {
      if (r.clave === 'CASH_SALDO_INICIAL') saldoInicial = Number(r.valor_num || 0);
      if (r.clave === 'CASH_UMBRAL_MINIMO') umbralMinimo = Number(r.valor_num || 0);
    }

    const params = [desde, hasta];

    const { rows } = await query(
      `WITH RECURSIVE rango(fecha) AS (
         SELECT date($1)
         UNION ALL
         SELECT date(fecha, '+1 day') FROM rango WHERE fecha < date($2)
       ),
       entradas_d AS (
         SELECT date(fecha, 'localtime') AS fecha, SUM(monto)::float AS total_entradas
           FROM pagos
          WHERE date(fecha, 'localtime') >= date($1)
            AND date(fecha, 'localtime') <= date($2)
          GROUP BY date(fecha, 'localtime')
       ),
       deudas_ini_d AS (
         SELECT date(fecha, 'localtime') AS fecha, SUM(monto)::float AS total_deudas_ini
           FROM clientes_deudas_iniciales_pagos
          WHERE date(fecha, 'localtime') >= date($1)
            AND date(fecha, 'localtime') <= date($2)
          GROUP BY date(fecha, 'localtime')
       ),
       gastos_d AS (
         SELECT date(fecha, 'localtime') AS fecha, SUM(monto)::float AS total_gastos
           FROM gastos
          WHERE date(fecha, 'localtime') >= date($1)
            AND date(fecha, 'localtime') <= date($2)
          GROUP BY date(fecha, 'localtime')
       ),
       inv_d AS (
         SELECT date(fecha, 'localtime') AS fecha, SUM(monto)::float AS total_inversiones
           FROM inversiones
          WHERE date(fecha, 'localtime') >= date($1)
            AND date(fecha, 'localtime') <= date($2)
          GROUP BY date(fecha, 'localtime')
       ),
       pagos_prov_d AS (
         SELECT date(fecha, 'localtime') AS fecha, SUM(monto)::float AS total_pagos_prov
           FROM pagos_proveedores
          WHERE date(fecha, 'localtime') >= date($1)
            AND date(fecha, 'localtime') <= date($2)
          GROUP BY date(fecha, 'localtime')
       )
       SELECT
         r.fecha,
         COALESCE(e.total_entradas, 0) + COALESCE(di.total_deudas_ini, 0) AS total_entradas,
         COALESCE(g.total_gastos, 0) +
         COALESCE(i.total_inversiones, 0) +
         COALESCE(pp.total_pagos_prov, 0) AS total_salidas
       FROM rango r
       LEFT JOIN entradas_d   e ON e.fecha = r.fecha
       LEFT JOIN deudas_ini_d di ON di.fecha = r.fecha
       LEFT JOIN gastos_d     g ON g.fecha = r.fecha
       LEFT JOIN inv_d        i ON i.fecha = r.fecha
       LEFT JOIN pagos_prov_d pp ON pp.fecha = r.fecha
       ORDER BY r.fecha`,
      params
    );

    // Agregar por día o por mes en memoria
    let puntos;
    if (agg === 'mes') {
      const map = new Map();
      for (const r of rows) {
        const fecha =
          r.fecha instanceof Date ? r.fecha : new Date(r.fecha);
        if (Number.isNaN(fecha.getTime())) continue;
        const monthKey = `${fecha.getFullYear()}-${String(
          fecha.getMonth() + 1
        ).padStart(2, '0')}-01`;
        const current = map.get(monthKey) || { fecha: monthKey, entradas: 0, salidas: 0 };
        current.entradas += Number(r.total_entradas || 0);
        current.salidas += Number(r.total_salidas || 0);
        map.set(monthKey, current);
      }
      puntos = Array.from(map.values()).sort((a, b) =>
        a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0
      );
    } else {
      puntos = rows.map((r) => ({
        fecha:
          r.fecha instanceof Date ? toLocalDateString(r.fecha) : r.fecha,
        entradas: Number(r.total_entradas || 0),
        salidas: Number(r.total_salidas || 0),
      }));
    }

    let saldo = saldoInicial;
    let saldoMinimo = saldoInicial;
    let saldoMaximo = saldoInicial;
    let diasPorDebajoUmbral = 0;

    const serie = puntos.map((p) => {
      const entradas = Number(p.entradas || 0);
      const salidas = Number(p.salidas || 0);
      saldo += entradas - salidas;
      if (saldo < saldoMinimo) saldoMinimo = saldo;
      if (saldo > saldoMaximo) saldoMaximo = saldo;
      if (umbralMinimo && saldo < umbralMinimo) diasPorDebajoUmbral += 1;
      return {
        fecha: p.fecha,
        entradas,
        salidas,
        saldoAcumulado: saldo,
      };
    });

    res.json({
      desde,
      hasta,
      agrupado: agg,
      saldoInicial,
      umbralMinimo,
      saldoMinimo,
      saldoMaximo,
      diasPorDebajoUmbral,
      serie,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener el flujo de caja' });
  }
}

// 10) Presupuestos: listado simple
async function listarPresupuestos(req, res) {
  try {
    const { anio, mes } = req.query || {};

    const where = [];
    const params = [];
    if (anio != null) {
      const y = Number(anio);
      if (!Number.isInteger(y)) {
        return res.status(400).json({ error: 'Año inválido' });
      }
      params.push(y);
      where.push(`anio = $${params.length}`);
    }
    if (mes != null) {
      const m = Number(mes);
      if (!Number.isInteger(m) || m < 1 || m > 12) {
        return res.status(400).json({ error: 'Mes inválido' });
      }
      params.push(m);
      where.push(`mes = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT
         id,
         anio,
         mes,
         tipo,
         categoria,
         monto::float AS monto
       FROM presupuestos
       ${whereSql}
       ORDER BY anio DESC, mes DESC, tipo, categoria`,
      params
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener los presupuestos' });
  }
}

// 11) Presupuestos: crear/actualizar (upsert por año, mes, tipo, categoría)
async function guardarPresupuesto(req, res) {
  try {
    const { anio, mes, tipo, categoria, monto } = req.body || {};

    const y = Number(anio);
    const m = Number(mes);
    const montoNum = Number(monto);
    const tipoNorm = normalizeTipoPresupuesto(tipo);
    const categoriaStr = (categoria || '').toString().trim();

    if (!Number.isInteger(y) || y < 2000) {
      return res.status(400).json({ error: 'Año inválido' });
    }
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      return res.status(400).json({ error: 'Mes inválido' });
    }
    if (!tipoNorm) {
      return res.status(400).json({ error: 'Tipo invalido' });
    }
    if (!categoriaStr) {
      return res.status(400).json({ error: 'Categoria requerida' });
    }
    if (!Number.isFinite(montoNum) || montoNum < 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }

    const { rows } = await query(
      `INSERT INTO presupuestos (anio, mes, tipo, categoria, monto)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (anio, mes, tipo, categoria)
       DO UPDATE SET monto = EXCLUDED.monto, actualizado_en = NOW()
       RETURNING id, anio, mes, tipo, categoria, monto::float AS monto`,
      [y, m, tipoNorm, categoriaStr, montoNum]
    );

    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo guardar el presupuesto' });
  }
}

// 11.1) Presupuestos: categorias sugeridas
async function presupuestoCategorias(req, res) {
  try {
    const [catRows, gastosRows] = await Promise.all([
      query(`SELECT nombre FROM categorias WHERE activo = 1 ORDER BY nombre`),
      query(
        `SELECT
           COALESCE(categoria, 'Otros') AS categoria,
           COUNT(*) AS total
         FROM gastos
         GROUP BY COALESCE(categoria, 'Otros')
         ORDER BY categoria`
      ),
    ]);

    const ventas = catRows.rows.map((r) => r.nombre).filter((n) => n);
    if (!ventas.includes('TOTAL')) {
      ventas.unshift('TOTAL');
    }
    const gastos = gastosRows.rows.map((r) => r.categoria).filter((n) => n);

    res.json({ ventas, gastos });
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener categorias de presupuesto' });
  }
}

// 11.2) Presupuestos: eliminar por id
async function eliminarPresupuesto(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const result = await query('DELETE FROM presupuestos WHERE id = $1', [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: 'Presupuesto no encontrado' });
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo eliminar el presupuesto' });
  }
}

// 12) Presupuesto vs real por mes
async function presupuestoVsReal(req, res) {
  try {
    const now = new Date();
    const y = req.query && req.query.anio ? Number(req.query.anio) : now.getFullYear();
    const m =
      req.query && req.query.mes ? Number(req.query.mes) : now.getMonth() + 1;

    if (!Number.isInteger(y) || y < 2000) {
      return res.status(400).json({ error: 'Año inválido' });
    }
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      return res.status(400).json({ error: 'Mes inválido' });
    }

    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const nextMonth = m === 12 ? 1 : m + 1;
    const nextYear = m === 12 ? y + 1 : y;
    const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const [presRows, ventasRows, gastosRows] = await Promise.all([
      query(
        `SELECT id, tipo, categoria, monto::float AS monto
         FROM presupuestos
         WHERE anio = $1 AND mes = $2`,
        [y, m]
      ),
      query(
        `SELECT
           COALESCE(cat.nombre, 'Sin categoria') AS categoria,
           COALESCE(SUM(vd.subtotal), 0)::float AS real
         FROM ventas_detalle vd
         JOIN ventas v ON v.id = vd.venta_id
         JOIN productos p ON p.id = vd.producto_id
         LEFT JOIN categorias cat ON cat.id = p.categoria_id
         WHERE v.estado_pago <> 'cancelado'
           AND date(v.fecha, 'localtime') >= date($1)
           AND date(v.fecha, 'localtime') < date($2)
         GROUP BY COALESCE(cat.nombre, 'Sin categoria')`,
        [start, end]
      ),
      query(
        `SELECT
           'gastos'                                    AS tipo,
           COALESCE(categoria, 'Otros')               AS categoria,
           COALESCE(SUM(monto), 0)::float             AS real
         FROM gastos
         WHERE date(fecha, 'localtime') >= date($1)
           AND date(fecha, 'localtime') < date($2)
         GROUP BY COALESCE(categoria, 'Otros')`,
        [start, end]
      ),
    ]);

    const presupuestoMap = new Map();
    const presupuestoVentas = [];
    for (const p of presRows.rows) {
      const tipo = normalizeTipoPresupuesto(p.tipo);
      if (!tipo) continue;
      const key = `${tipo}:${p.categoria}`;
      const monto = Number(p.monto || 0);
      presupuestoMap.set(key, monto);
      if (tipo === 'ventas') {
        presupuestoVentas.push({ categoria: p.categoria, monto });
      }
    }

    const actualMap = new Map();
    let totalRealVentas = 0;
    for (const r of ventasRows.rows) {
      const real = Number(r.real || 0);
      totalRealVentas += real;
      actualMap.set(`ventas:${r.categoria}`, real);
    }

    let totalRealGastos = 0;
    for (const r of gastosRows.rows) {
      const real = Number(r.real || 0);
      totalRealGastos += real;
      actualMap.set(`gastos:${r.categoria}`, real);
    }

    const hasVentasTotal = presupuestoVentas.some(
      (p) => String(p.categoria).toUpperCase() === 'TOTAL'
    );
    if (hasVentasTotal) {
      actualMap.set('ventas:TOTAL', totalRealVentas);
    }

    const keys = new Set([...presupuestoMap.keys(), ...actualMap.keys()]);
    const items = Array.from(keys)
      .map((key) => {
        const [tipo, categoria] = key.split(':');
        const presupuesto = presupuestoMap.get(key) || 0;
        const real = actualMap.get(key) || 0;
        return {
          tipo,
          categoria,
          presupuesto,
          real,
          diferencia: real - presupuesto,
        };
      })
      .sort((a, b) => {
        if (a.tipo !== b.tipo) return a.tipo.localeCompare(b.tipo);
        return a.categoria.localeCompare(b.categoria);
      });

    const totalPresupuestoVentas = hasVentasTotal
      ? presupuestoVentas
          .filter((p) => String(p.categoria).toUpperCase() === 'TOTAL')
          .reduce((acc, p) => acc + p.monto, 0)
      : presupuestoVentas.reduce((acc, p) => acc + p.monto, 0);

    const totalPresupuestoGastos = presRows.rows
      .filter((p) => normalizeTipoPresupuesto(p.tipo) === 'gastos')
      .reduce((acc, p) => acc + Number(p.monto || 0), 0);

    res.json({
      anio: y,
      mes: m,
      items,
      totales: {
        presupuestoVentas: totalPresupuestoVentas,
        realVentas: totalRealVentas,
        presupuestoGastos: totalPresupuestoGastos,
        realGastos: totalRealGastos,
      },
    });
  } catch (e) {
    res
      .status(500)
      .json({ error: 'No se pudo obtener el presupuesto vs real' });
  }
}

// 13) Simulador simple de escenarios "what-if"
async function simuladorFinanciero(req, res) {
  try {
    const body = req.body || {};
    const aumentoPrecios = Number(body.aumentoPrecios || 0) / 100;
    const aumentoCostos = Number(body.aumentoCostos || 0) / 100;
    const aumentoGastos = Number(body.aumentoGastos || 0) / 100;

    const periodoDias = Number(body.periodoDias || 30);
    const dias = Number.isInteger(periodoDias) && periodoDias > 0 ? periodoDias : 30;

    const { rows } = await query(
      `WITH ventas_d AS (
         SELECT
           COALESCE(SUM(vd.subtotal), 0)::float                          AS ingresos,
           COALESCE(SUM(vd.cantidad * p.precio_costo), 0)::float         AS costo
         FROM ventas v
         JOIN ventas_detalle vd ON vd.venta_id = v.id
         JOIN productos p       ON p.id = vd.producto_id
         WHERE v.estado_pago <> 'cancelado'
           AND date(v.fecha, 'localtime') >= date('now', '-' || $1 || ' days')
       ),
       gastos_d AS (
         SELECT COALESCE(SUM(monto), 0)::float AS gastos
         FROM gastos
         WHERE date(fecha, 'localtime') >= date('now', '-' || $1 || ' days')
       )
       SELECT
         COALESCE(ventas_d.ingresos, 0)::float AS total_ventas,
         COALESCE(ventas_d.costo, 0)::float    AS total_costo,
         COALESCE(gastos_d.gastos, 0)::float   AS total_gastos
       FROM ventas_d, gastos_d`,
      [String(dias)]
    );

    const base = rows[0] || {
      total_ventas: 0,
      total_costo: 0,
      total_gastos: 0,
    };

    const totalVentas = Number(base.total_ventas || 0);
    const totalCosto = Number(base.total_costo || 0);
    const totalGastos = Number(base.total_gastos || 0);

    const gananciaBruta = totalVentas - totalCosto;
    const gananciaNeta = gananciaBruta - totalGastos;

    const ventasSim = totalVentas * (1 + aumentoPrecios);
    const costoSim = totalCosto * (1 + aumentoCostos);
    const gastosSim = totalGastos * (1 + aumentoGastos);
    const gananciaBrutaSim = ventasSim - costoSim;
    const gananciaNetaSim = gananciaBrutaSim - gastosSim;

    res.json({
      periodoDias: dias,
      actual: {
        totalVentas,
        totalCosto,
        totalGastos,
        gananciaBruta,
        gananciaNeta,
      },
      simulado: {
        totalVentas: ventasSim,
        totalCosto: costoSim,
        totalGastos: gastosSim,
        gananciaBruta: gananciaBrutaSim,
        gananciaNeta: gananciaNetaSim,
      },
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo ejecutar el simulador financiero' });
  }
}

// Debug rapido para verificar si ventas/gastos caen en el rango esperado
async function debugFinanzas(req, res) {
  try {
    const { desde, hasta } = getDateRange(req);
    const params = [desde, hasta];

    const { rows: nowRows } = await query(
      "SELECT datetime('now','localtime') AS now_local, datetime('now') AS now_utc"
    );

    const { rows: ventasAgg } = await query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(neto), 0)::float AS total
         FROM ventas
        WHERE estado_pago <> 'cancelado'
          AND date(fecha, 'localtime') >= date($1)
          AND date(fecha, 'localtime') <= date($2)`,
      params
    );

    const { rows: gastosAgg } = await query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(monto), 0)::float AS total
         FROM gastos
        WHERE date(fecha, 'localtime') >= date($1)
          AND date(fecha, 'localtime') <= date($2)`,
      params
    );

    const { rows: ventasUlt } = await query(
      `SELECT id, fecha, neto, estado_pago
         FROM ventas
        ORDER BY id DESC
        LIMIT 5`
    );

    const { rows: gastosUlt } = await query(
      `SELECT id, fecha, monto, categoria
         FROM gastos
        ORDER BY id DESC
        LIMIT 5`
    );

    res.json({
      rango: { desde, hasta },
      now: nowRows[0] || null,
      ventas: {
        count: Number(ventasAgg[0]?.count || 0),
        total: Number(ventasAgg[0]?.total || 0),
        ultimas: ventasUlt,
      },
      gastos: {
        count: Number(gastosAgg[0]?.count || 0),
        total: Number(gastosAgg[0]?.total || 0),
        ultimos: gastosUlt,
      },
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener debug de finanzas' });
  }
}

module.exports = {
  costosProductos,
  gananciaBruta,
  gananciaNeta,
  gananciaPorProducto,
  rentabilidadPorCategoria,
  rentabilidadPorCliente,
  deudasClientes,
  deudasProveedores,
  cashflow,
  listarPresupuestos,
  guardarPresupuesto,
  presupuestoCategorias,
  eliminarPresupuesto,
  presupuestoVsReal,
  simuladorFinanciero,
  debugFinanzas,
};
