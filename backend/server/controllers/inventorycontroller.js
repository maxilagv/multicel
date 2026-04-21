const { query } = require('../db/pg');
const inv = require('../services/inventoryService');
const { body, validationResult } = require('express-validator');
const categoryRepo = require('../db/repositories/categoryRepository');
const { resolveScopedDepositoId } = require('../lib/depositoScope');
const { buildSaleVisibility, buildSaleVisibilityClause } = require('../lib/saleVisibility');

async function list(req, res) {
  try {
    const { q, category_id, include_descendants, limit, offset, deposito_id } = req.query || {};
    const scopedDepositoId = await resolveScopedDepositoId(req, deposito_id, {
      preferSingle: false,
    });
    const params = [];
    const where = [];
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      where.push(
        `(LOWER(p.nombre) LIKE $${params.length} OR LOWER(p.codigo) LIKE $${params.length})`,
      );
    }
    if (category_id) {
      const includeDescendants =
        String(include_descendants || '').toLowerCase() === '1' ||
        String(include_descendants || '').toLowerCase() === 'true';
      const ids = await categoryRepo.getCategoryFilterIds(category_id, {
        includeDescendants,
        onlyActive: true,
      });
      if (!ids.length) return res.json([]);
      const start = params.length + 1;
      const marks = ids.map((_, idx) => `$${start + idx}`).join(', ');
      params.push(...ids);
      where.push(`p.categoria_id IN (${marks})`);
    }
    let joinInventario = 'LEFT JOIN inventario i ON i.producto_id = p.id';
    if (scopedDepositoId) {
      params.push(Number(scopedDepositoId));
      const idx = params.length;
      joinInventario = `LEFT JOIN inventario_depositos i ON i.producto_id = p.id AND i.deposito_id = $${idx}`;
    }
    const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const off = Math.max(parseInt(offset, 10) || 0, 0);
    params.push(lim);
    params.push(off);
    const sql = `
      SELECT p.id AS producto_id,
             p.codigo,
             p.nombre,
             p.categoria_id AS categoria_id,
             c.nombre AS categoria,
             p.precio_costo_pesos::float AS costo_pesos,
             COALESCE(i.cantidad_disponible,0) AS cantidad_disponible,
             COALESCE(i.cantidad_reservada,0) AS cantidad_reservada,
             p.stock_minimo
        FROM productos p
        JOIN categorias c ON c.id = p.categoria_id
   ${joinInventario}
       WHERE p.activo = TRUE AND c.activo = TRUE ${where.length ? 'AND ' + where.join(' AND ') : ''}
       ORDER BY p.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo obtener inventario' });
  }
}

async function movimientos(req, res) {
  try {
    const { producto_id, tipo, desde, hasta, limit, offset, deposito_id } = req.query || {};
    const scopedDepositoId = await resolveScopedDepositoId(req, deposito_id, {
      preferSingle: false,
    });
    const where = [];
    const params = [];
    if (producto_id) { params.push(Number(producto_id)); where.push(`m.producto_id = $${params.length}`); }
    if (tipo) { params.push(tipo); where.push(`m.tipo = $${params.length}`); }
    if (scopedDepositoId) { params.push(Number(scopedDepositoId)); where.push(`m.deposito_id = $${params.length}`); }
    if (desde) { params.push(new Date(desde)); where.push(`m.fecha >= $${params.length}`); }
    if (hasta) { params.push(new Date(hasta)); where.push(`m.fecha <= $${params.length}`); }
    const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const off = Math.max(parseInt(offset, 10) || 0, 0);
    params.push(lim); params.push(off);
    const { rows } = await query(
      `SELECT m.id,
              m.producto_id,
              p.nombre AS producto_nombre,
              p.codigo AS producto_codigo,
              m.deposito_id,
              d.nombre AS deposito_nombre,
              m.tipo,
              m.cantidad,
              m.motivo,
              m.referencia,
              m.fecha,
              m.usuario_id,
              u.nombre AS usuario_nombre
         FROM movimientos_stock m
    LEFT JOIN productos p ON p.id = m.producto_id
    LEFT JOIN depositos d ON d.id = m.deposito_id
    LEFT JOIN usuarios u ON u.id = m.usuario_id
        ${where.length? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY m.fecha DESC, m.id DESC
        LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudieron obtener movimientos' });
  }
}

async function historialVentasProducto(req, res) {
  try {
    const productoId = Number(req.params.id);
    if (!Number.isInteger(productoId) || productoId <= 0) {
      return res.status(400).json({ error: 'ID de producto invalido' });
    }

    const depositoId = await resolveScopedDepositoId(req, req.query?.deposito_id, {
      preferSingle: false,
    });
    const visibility = await buildSaleVisibility(req);
    const where = [
      'vd.producto_id = $1',
      "(v.oculto IS NULL OR v.oculto = 0)",
      "v.estado_pago != 'cancelado'",
    ];
    const params = [productoId];

    if (depositoId != null) {
      params.push(Number(depositoId));
      where.push(`v.deposito_id = $${params.length}`);
    }

    const visibilityClause = buildSaleVisibilityClause(params, visibility, 'v');
    if (visibilityClause) {
      where.push(visibilityClause);
    }

    const lim = Math.min(Math.max(parseInt(req.query?.limit, 10) || 50, 1), 200);
    const off = Math.max(parseInt(req.query?.offset, 10) || 0, 0);
    params.push(lim);
    params.push(off);

    const { rows } = await query(
      `SELECT vd.venta_id,
              v.fecha,
              v.estado_pago,
              v.estado_entrega,
              v.usuario_id,
              v.deposito_id,
              d.nombre AS deposito_nombre,
              c.id AS cliente_id,
              c.nombre AS cliente_nombre,
              vd.cantidad::float AS cantidad,
              vd.precio_unitario::float AS precio_unitario,
              vd.subtotal::float AS subtotal,
              COALESCE(
                NULLIF(TRIM(v.vendedor_nombre), ''),
                NULLIF(TRIM(vp_directo.nombre), ''),
                NULLIF(TRIM(vp_usuario.nombre), ''),
                NULLIF(TRIM(u.nombre), ''),
                NULLIF(TRIM(u.email), '')
              ) AS vendedor_nombre
         FROM ventas_detalle vd
         JOIN ventas v ON v.id = vd.venta_id
    LEFT JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN usuarios u ON u.id = v.usuario_id
    LEFT JOIN vendedor_perfiles vp_directo ON vp_directo.id = v.vendedor_perfil_id
    LEFT JOIN vendedor_perfiles vp_usuario
           ON vp_usuario.usuario_id = COALESCE(vp_directo.usuario_id, v.usuario_id)
          AND vp_usuario.activo = 1
    LEFT JOIN depositos d ON d.id = v.deposito_id
        WHERE ${where.join(' AND ')}
        ORDER BY v.fecha DESC, vd.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json(rows);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo obtener el historial del producto' });
  }
}

const validateAjuste = [
  body('producto_id').isInt({ gt: 0 }),
  body('cantidad').isInt().withMessage('cantidad puede ser positiva o negativa'),
  body('motivo').optional().isString(),
  body('referencia').optional().isString(),
   body('deposito_id').optional().isInt({ gt: 0 }),
];

async function ajuste(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { producto_id, cantidad, motivo, referencia, deposito_id } = req.body;
    const scopedDepositoId = await resolveScopedDepositoId(req, deposito_id);
    const usuarioId = req.user?.sub ? Number(req.user.sub) : null;
    await inv.adjustStock({
      producto_id,
      cantidad,
      motivo,
      referencia,
      deposito_id: scopedDepositoId,
      usuario_id: usuarioId,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo ajustar stock' });
  }
}

const validateReserva = [
  body('producto_id').isInt({ gt: 0 }),
  body('cantidad').isInt({ gt: 0 }),
  body('referencia').optional().isString(),
  body('deposito_id').optional().isInt({ gt: 0 }),
];

async function reservar(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { producto_id, cantidad, referencia, deposito_id } = req.body;
    const scopedDepositoId = await resolveScopedDepositoId(req, deposito_id);
    const usuarioId = req.user?.sub ? Number(req.user.sub) : null;
    await inv.reserveStock({
      producto_id,
      cantidad,
      referencia,
      deposito_id: scopedDepositoId,
      usuario_id: usuarioId,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo reservar stock' });
  }
}

async function liberar(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { producto_id, cantidad, referencia, deposito_id } = req.body;
    const scopedDepositoId = await resolveScopedDepositoId(req, deposito_id);
    const usuarioId = req.user?.sub ? Number(req.user.sub) : null;
    await inv.releaseReservation({
      producto_id,
      cantidad,
      referencia,
      deposito_id: scopedDepositoId,
      usuario_id: usuarioId,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo liberar reserva' });
  }
}

const validateTransfer = [
  body('producto_id').isInt({ gt: 0 }),
  body('cantidad').isInt({ gt: 0 }),
  body('deposito_origen_id').isInt({ gt: 0 }),
  body('deposito_destino_id').isInt({ gt: 0 }),
  body('motivo').optional().isString(),
  body('referencia').optional().isString(),
];

const validateTransferBatch = [
  body('items').isArray({ min: 1 }),
  body('items.*.producto_id').isInt({ gt: 0 }),
  body('items.*.cantidad').isInt({ gt: 0 }),
  body('deposito_origen_id').isInt({ gt: 0 }),
  body('deposito_destino_id').isInt({ gt: 0 }),
  body('motivo').optional().isString(),
  body('referencia').optional().isString(),
];

async function transferir(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { producto_id, cantidad, deposito_origen_id, deposito_destino_id, motivo, referencia } = req.body;
    const usuarioId = req.user?.sub ? Number(req.user.sub) : null;
    await inv.transferStock({
      producto_id,
      cantidad,
      deposito_origen_id,
      deposito_destino_id,
      motivo,
      referencia,
      usuario_id: usuarioId,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo transferir stock' });
  }
}

async function transferirLote(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { items, deposito_origen_id, deposito_destino_id, motivo, referencia } = req.body;
    const usuarioId = req.user?.sub ? Number(req.user.sub) : null;
    await inv.transferStockBatch({
      items,
      deposito_origen_id,
      deposito_destino_id,
      motivo,
      referencia,
      usuario_id: usuarioId,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo transferir stock' });
  }
}

module.exports = {
  list,
  movimientos,
  historialVentasProducto,
  ajuste: [...validateAjuste, ajuste],
  reservar: [...validateReserva, reservar],
  liberar: [...validateReserva, liberar],
  transferir: [...validateTransfer, transferir],
  transferirLote: [...validateTransferBatch, transferirLote],
};
