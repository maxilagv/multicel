const { query } = require('../db/pg');
const {
  buildDepositoScopeError,
  resolveScopedDepositoId,
} = require('../lib/depositoScope');

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

async function dashboard(req, res) {
  try {
    const depositoId = await resolveScopedDepositoId(req, req.query?.deposito_id);
    if (!depositoId) {
      throw buildDepositoScopeError('No hay una sucursal seleccionada para mostrar');
    }

    const [
      depositoResult,
      ventasHoyResult,
      pendientesResult,
      clientesResult,
      lowCountResult,
      lowItemsResult,
      recentSalesResult,
    ] = await Promise.all([
      query(
        `SELECT id, nombre, codigo, direccion
           FROM depositos
          WHERE id = $1
          LIMIT 1`,
        [depositoId]
      ),
      query(
        `SELECT COUNT(*) AS ventas_hoy,
                COALESCE(SUM(v.neto), 0) AS ingresos_hoy,
                COALESCE(AVG(v.neto), 0) AS ticket_promedio
           FROM ventas v
          WHERE v.deposito_id = $1
            AND DATE(v.fecha) = CURDATE()
            AND v.estado_pago <> 'cancelado'`,
        [depositoId]
      ),
      query(
        `SELECT
            SUM(CASE WHEN v.estado_entrega = 'pendiente' THEN 1 ELSE 0 END) AS pendientes_entrega,
            SUM(CASE WHEN v.es_reserva = 1 AND v.estado_entrega = 'pendiente' THEN 1 ELSE 0 END) AS reservas_pendientes
           FROM ventas v
          WHERE v.deposito_id = $1
            AND v.estado_pago <> 'cancelado'`,
        [depositoId]
      ),
      query(
        `SELECT COUNT(*) AS clientes_vinculados
           FROM clientes_depositos
          WHERE deposito_id = $1`,
        [depositoId]
      ),
      query(
        `SELECT COUNT(*) AS productos_bajo_stock
           FROM inventario_depositos i
           JOIN productos p ON p.id = i.producto_id
          WHERE i.deposito_id = $1
            AND p.activo = TRUE
            AND COALESCE(i.cantidad_disponible, 0) <= COALESCE(p.stock_minimo, 0)`,
        [depositoId]
      ),
      query(
        `SELECT
            p.id AS producto_id,
            p.nombre,
            p.codigo,
            COALESCE(i.cantidad_disponible, 0) AS cantidad_disponible,
            COALESCE(p.stock_minimo, 0) AS stock_minimo
           FROM inventario_depositos i
           JOIN productos p ON p.id = i.producto_id
          WHERE i.deposito_id = $1
            AND p.activo = TRUE
            AND COALESCE(i.cantidad_disponible, 0) <= COALESCE(p.stock_minimo, 0)
          ORDER BY COALESCE(i.cantidad_disponible, 0) ASC, p.nombre ASC
          LIMIT 6`,
        [depositoId]
      ),
      query(
        `SELECT
            v.id,
            v.fecha,
            v.neto,
            v.estado_pago,
            v.estado_entrega,
            v.es_reserva,
            c.nombre AS cliente_nombre
           FROM ventas v
           JOIN clientes c ON c.id = v.cliente_id
          WHERE v.deposito_id = $1
          ORDER BY v.fecha DESC, v.id DESC
          LIMIT 6`,
        [depositoId]
      ),
    ]);

    const deposito = depositoResult.rows[0] || null;
    if (!deposito) {
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }

    const ventasHoy = ventasHoyResult.rows[0] || {};
    const pendientes = pendientesResult.rows[0] || {};
    const clientes = clientesResult.rows[0] || {};
    const lowCount = lowCountResult.rows[0] || {};

    res.json({
      deposito: {
        id: Number(deposito.id),
        nombre: deposito.nombre,
        codigo: deposito.codigo || null,
        direccion: deposito.direccion || null,
      },
      resumen: {
        ventas_hoy: toNumber(ventasHoy.ventas_hoy),
        ingresos_hoy: toNumber(ventasHoy.ingresos_hoy),
        ticket_promedio: toNumber(ventasHoy.ticket_promedio),
        pendientes_entrega: toNumber(pendientes.pendientes_entrega),
        reservas_pendientes: toNumber(pendientes.reservas_pendientes),
        clientes_vinculados: toNumber(clientes.clientes_vinculados),
        productos_bajo_stock: toNumber(lowCount.productos_bajo_stock),
      },
      alertas_stock: (lowItemsResult.rows || []).map((row) => ({
        producto_id: Number(row.producto_id),
        nombre: row.nombre,
        codigo: row.codigo || null,
        cantidad_disponible: toNumber(row.cantidad_disponible),
        stock_minimo: toNumber(row.stock_minimo),
      })),
      actividad_reciente: (recentSalesResult.rows || []).map((row) => ({
        id: Number(row.id),
        fecha: row.fecha,
        neto: toNumber(row.neto),
        estado_pago: row.estado_pago,
        estado_entrega: row.estado_entrega,
        es_reserva: Number(row.es_reserva) === 1 || row.es_reserva === true,
        cliente_nombre: row.cliente_nombre,
      })),
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo obtener el dashboard de sucursal' });
  }
}

module.exports = {
  dashboard,
};
