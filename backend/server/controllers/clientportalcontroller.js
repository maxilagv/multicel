const { query } = require('../db/pg');
const clientRepo = require('../db/repositories/clientRepository');
const salesRepo = require('../db/repositories/salesRepository');

async function me(req, res) {
  const clienteId = Number(req.client?.id);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return res.status(401).json({ error: 'Cliente no autorizado' });
  }
  try {
    const cliente = await clientRepo.findById(clienteId);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(cliente);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener el perfil del cliente' });
  }
}

async function deuda(req, res) {
  const clienteId = Number(req.client?.id);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return res.status(401).json({ error: 'Cliente no autorizado' });
  }

  try {
    const { rows: resumenRows } = await query(
      `SELECT
         cliente_id,
         deuda_pendiente::float AS deuda_total,
         deuda_0_30::float AS deuda_0_30,
         deuda_31_60::float AS deuda_31_60,
         deuda_61_90::float AS deuda_61_90,
         deuda_mas_90::float AS deuda_mas_90,
         dias_promedio_atraso::float AS dias_promedio_atraso
       FROM vista_deudas
       WHERE cliente_id = $1`,
      [clienteId]
    );

    const resumen = resumenRows[0] || {
      cliente_id: clienteId,
      deuda_total: 0,
      deuda_0_30: 0,
      deuda_31_60: 0,
      deuda_61_90: 0,
      deuda_mas_90: 0,
      dias_promedio_atraso: null,
    };

    const { rows: ventasRows } = await query(
      `WITH pagos_venta AS (
         SELECT venta_id, SUM(monto)::float AS total_pagado
         FROM pagos
         GROUP BY venta_id
       )
       SELECT
         v.id AS venta_id,
         date(v.fecha) AS fecha,
         v.neto::float AS neto,
         COALESCE(p.total_pagado, 0)::float AS total_pagado,
         MAX(v.neto - COALESCE(p.total_pagado, 0), 0)::float AS saldo
       FROM ventas v
       LEFT JOIN pagos_venta p ON p.venta_id = v.id
       WHERE v.estado_pago <> 'cancelado'
         AND v.cliente_id = $1
         AND MAX(v.neto - COALESCE(p.total_pagado, 0), 0) > 0
       ORDER BY date(v.fecha) DESC, v.id DESC`,
      [clienteId]
    );

    const { rows: deudasIni } = await query(
      `SELECT id, monto::float AS monto, date(fecha) AS fecha, descripcion
         FROM clientes_deudas_iniciales
        WHERE cliente_id = $1
        ORDER BY fecha DESC`,
      [clienteId]
    );

    const { rows: pagosIni } = await query(
      `SELECT id, monto::float AS monto, date(fecha) AS fecha, descripcion
         FROM clientes_deudas_iniciales_pagos
        WHERE cliente_id = $1
        ORDER BY fecha DESC`,
      [clienteId]
    );

    res.json({
      resumen,
      ventas: ventasRows,
      deudas_iniciales: deudasIni,
      pagos_deudas_iniciales: pagosIni,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener la deuda del cliente' });
  }
}

async function compras(req, res) {
  const clienteId = Number(req.client?.id);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return res.status(401).json({ error: 'Cliente no autorizado' });
  }
  try {
    const rows = await salesRepo.listarVentas({ cliente_id: clienteId, limit: 200 });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener las compras' });
  }
}

async function compraDetalle(req, res) {
  const clienteId = Number(req.client?.id);
  const ventaId = Number(req.params.id);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return res.status(401).json({ error: 'Cliente no autorizado' });
  }
  if (!Number.isInteger(ventaId) || ventaId <= 0) {
    return res.status(400).json({ error: 'ID de compra invalido' });
  }
  try {
    const { rows } = await query(
      `SELECT 1 FROM ventas WHERE id = $1 AND cliente_id = $2 LIMIT 1`,
      [ventaId, clienteId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Compra no encontrada' });
    }
    const detalle = await salesRepo.getVentaDetalle(ventaId);
    res.json(detalle);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener el detalle de la compra' });
  }
}

module.exports = { me, deuda, compras, compraDetalle };
