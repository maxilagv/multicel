'use strict';

const { body, validationResult } = require('express-validator');
const repo = require('../db/repositories/fabricacionRepository');
const inv  = require('../services/inventoryService');
const logger = require('../lib/logger');

function getUserId(req) {
  const v = req.user?.sub || req.user?.id || null;
  return v != null ? Number(v) : null;
}

function getUserNombre(req) {
  return req.user?.nombre || req.user?.name || null;
}

function sendValidationErrors(res, errors) {
  return res.status(400).json({ errors: errors.array() });
}

// ─── Recetas ──────────────────────────────────────────────────────────────────

async function listRecetas(req, res) {
  try {
    const rows = await repo.listRecetas(req.query || {});
    res.json(rows);
  } catch (err) {
    logger.error({ err }, '[fabricacion] listRecetas');
    res.status(500).json({ error: 'No se pudieron obtener las recetas' });
  }
}

const validateReceta = [
  body('nombre').trim().notEmpty().withMessage('nombre requerido'),
  body('rendimiento').optional().isFloat({ min: 0.001 }),
  body('producto_terminado_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('tiempo_produccion_horas').optional({ nullable: true }).isFloat({ min: 0 }),
  body('items').optional().isArray(),
  body('items.*.producto_id').if(body('items').exists()).isInt({ gt: 0 }),
  body('items.*.cantidad').if(body('items').exists()).isFloat({ min: 0.0001 }),
];

async function createReceta(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);
  try {
    const row = await repo.createReceta(req.body);
    res.status(201).json(row);
  } catch (err) {
    logger.error({ err }, '[fabricacion] createReceta');
    res.status(err.status || 500).json({ error: err.message || 'No se pudo crear la receta' });
  }
}

async function getReceta(req, res) {
  try {
    const row = await repo.getRecetaById(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Receta no encontrada' });
    res.json(row);
  } catch (err) {
    logger.error({ err }, '[fabricacion] getReceta');
    res.status(500).json({ error: 'No se pudo obtener la receta' });
  }
}

async function updateReceta(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);
  try {
    const row = await repo.updateReceta(Number(req.params.id), req.body || {});
    if (!row) return res.status(404).json({ error: 'Receta no encontrada' });
    res.json(row);
  } catch (err) {
    logger.error({ err }, '[fabricacion] updateReceta');
    res.status(err.status || 500).json({ error: err.message || 'No se pudo actualizar la receta' });
  }
}

async function calcularCosto(req, res) {
  try {
    const result = await repo.calcularCostoReceta(Number(req.params.id));
    res.json(result);
  } catch (err) {
    logger.error({ err }, '[fabricacion] calcularCosto');
    res.status(500).json({ error: 'No se pudo calcular el costo' });
  }
}

// ─── Órdenes ──────────────────────────────────────────────────────────────────

async function listOrdenes(req, res) {
  try {
    const rows = await repo.listOrdenes(req.query || {});
    res.json(rows);
  } catch (err) {
    logger.error({ err }, '[fabricacion] listOrdenes');
    res.status(500).json({ error: 'No se pudieron obtener las órdenes' });
  }
}

async function tablero(req, res) {
  try {
    const rows = await repo.tablero();
    res.json(rows);
  } catch (err) {
    logger.error({ err }, '[fabricacion] tablero');
    res.status(500).json({ error: 'No se pudo obtener el tablero' });
  }
}

const validateOrden = [
  body('receta_id').isInt({ gt: 0 }).withMessage('receta_id requerido'),
  body('cantidad_planificada').isFloat({ min: 0.001 }).withMessage('cantidad_planificada requerida'),
  body('fecha_inicio_planificada').optional({ nullable: true }).isISO8601(),
  body('fecha_fin_planificada').optional({ nullable: true }).isISO8601(),
  body('responsable_usuario_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('deposito_destino_id').optional({ nullable: true }).isInt({ gt: 0 }),
];

async function createOrden(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);
  try {
    const row = await repo.createOrden(req.body, getUserId(req));
    res.status(201).json(row);
  } catch (err) {
    logger.error({ err }, '[fabricacion] createOrden');
    res.status(err.status || 500).json({ error: err.message || 'No se pudo crear la orden' });
  }
}

async function getOrden(req, res) {
  try {
    const row = await repo.getOrdenById(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Orden no encontrada' });
    res.json(row);
  } catch (err) {
    logger.error({ err }, '[fabricacion] getOrden');
    res.status(500).json({ error: 'No se pudo obtener la orden' });
  }
}

async function getAnalisisAbastecimiento(req, res) {
  try {
    const rows = await repo.analisisAbastecimiento(Number(req.params.id));
    res.json(rows);
  } catch (err) {
    logger.error({ err }, '[fabricacion] analisis');
    res.status(500).json({ error: 'No se pudo obtener el análisis' });
  }
}

async function reservarInsumos(req, res) {
  const ofId = Number(req.params.id);
  const usuarioId = getUserId(req);
  try {
    const orden = await repo.getOrdenById(ofId);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    if (!['PLANIFICADA', 'ABASTECIENDO'].includes(orden.estado)) {
      return res.status(400).json({ error: 'Solo se puede reservar en estado PLANIFICADA o ABASTECIENDO' });
    }

    const advertencias = [];

    for (const insumo of orden.insumos) {
      const faltaReservar = parseFloat(insumo.cantidad_requerida) - parseFloat(insumo.cantidad_reservada || 0);
      if (faltaReservar <= 0) continue;

      try {
        await inv.reserveStock({
          producto_id: insumo.producto_id,
          cantidad: faltaReservar,
          referencia: `OF:${orden.numero_of}`,
          usuario_id: usuarioId,
        });

        await repo.actualizarCantidadConsumida(ofId, insumo.id, 0); // no-op update
        // Update reservada field
        const { query } = require('../db/pg');
        await query(
          'UPDATE of_insumos_requeridos SET cantidad_reservada = cantidad_requerida WHERE id = $1',
          [insumo.id]
        );
      } catch (e) {
        advertencias.push(`${insumo.producto_nombre}: ${e.message}`);
      }
    }

    // Transition to ABASTECIENDO if not already
    if (orden.estado === 'PLANIFICADA') {
      await repo.cambiarEstado(ofId, { estado: 'ABASTECIENDO', observacion: 'Insumos reservados' }, { id: usuarioId, nombre: getUserNombre(req) });
    }

    const updated = await repo.getOrdenById(ofId);
    res.json({ ...updated, advertencias });
  } catch (err) {
    logger.error({ err }, '[fabricacion] reservarInsumos');
    res.status(err.status || 500).json({ error: err.message || 'Error al reservar insumos' });
  }
}

async function generarPedidoCompra(req, res) {
  const ofId = Number(req.params.id);
  try {
    const analisis = await repo.analisisAbastecimiento(ofId);
    const faltantes = analisis.filter((r) => r.faltante > 0);

    if (!faltantes.length) {
      return res.json({ mensaje: 'No hay insumos faltantes', items: [] });
    }

    // Return items that would form a purchase order (creation of actual purchase is out of scope here)
    res.json({
      mensaje: `${faltantes.length} insumo(s) necesitan compra`,
      items: faltantes.map((r) => ({
        producto_id: r.producto_id,
        producto_nombre: r.producto_nombre,
        producto_codigo: r.producto_codigo,
        cantidad_faltante: r.faltante,
        stock_actual: r.stock_disponible,
        cantidad_requerida: r.cantidad_requerida,
      })),
    });
  } catch (err) {
    logger.error({ err }, '[fabricacion] generarPedidoCompra');
    res.status(500).json({ error: 'Error al generar pedido de compra' });
  }
}

async function iniciarProduccion(req, res) {
  const ofId = Number(req.params.id);
  const usuarioId = getUserId(req);
  try {
    const orden = await repo.getOrdenById(ofId);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    if (!['PLANIFICADA', 'ABASTECIENDO'].includes(orden.estado)) {
      return res.status(400).json({
        error: `Estado inválido para iniciar (actual: ${orden.estado}). Se requiere PLANIFICADA o ABASTECIENDO.`,
      });
    }

    const updated = await repo.cambiarEstado(
      ofId,
      { estado: 'EN_PRODUCCION', observacion: req.body?.observacion || 'Producción iniciada' },
      { id: usuarioId, nombre: getUserNombre(req) }
    );
    res.json(updated);
  } catch (err) {
    logger.error({ err }, '[fabricacion] iniciarProduccion');
    res.status(err.status || 500).json({ error: err.message || 'Error al iniciar producción' });
  }
}

const validateFinalizar = [
  body('cantidad_producida').isFloat({ min: 0.001 }).withMessage('cantidad_producida requerida'),
  body('metodo').optional().isIn(['automatico', 'planilla']),
];

async function finalizarOrden(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);

  const ofId = Number(req.params.id);
  const { cantidad_producida, metodo = 'automatico', notas } = req.body;
  const usuarioId = getUserId(req);

  try {
    const orden = await repo.getOrdenById(ofId);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    if (orden.estado !== 'EN_PRODUCCION') {
      return res.status(400).json({
        error: `La orden debe estar en EN_PRODUCCION (actual: ${orden.estado})`,
      });
    }

    const referencia = `OF:${orden.numero_of}`;
    const advertencias = [];

    // Build items to deduct from stock
    const insumoItems = (orden.insumos || []).map((insumo) => {
      const cantidad =
        metodo === 'planilla'
          ? parseFloat(insumo.cantidad_consumida) || 0
          : parseFloat(insumo.cantidad_requerida) || 0;
      return { producto_id: insumo.producto_id, cantidad };
    }).filter((i) => i.cantidad > 0);

    // EGRESO: deduct each insumo (best-effort, warn on insufficient stock)
    for (const item of insumoItems) {
      try {
        await inv.removeStockBatch({
          items: [item],
          motivo: 'fabricacion',
          referencia,
          usuario_id: usuarioId,
        });
      } catch (e) {
        advertencias.push(`Stock insuficiente para producto ${item.producto_id}: ${e.message}`);
      }
    }

    // INGRESO: add produced product to stock
    if (orden.producto_terminado_id && cantidad_producida > 0) {
      await inv.addStockBatch({
        items: [{ producto_id: orden.producto_terminado_id, cantidad: cantidad_producida }],
        motivo: 'fabricacion',
        referencia,
        usuario_id: usuarioId,
        deposito_id: orden.deposito_destino_id || null,
      });
    }

    // Calculate actual cost
    let costoTotal = null;
    try {
      const { costo_total } = await repo.calcularCostoReceta(orden.receta_id);
      costoTotal = costo_total * cantidad_producida;
    } catch (_) { /* non-critical */ }

    const updated = await repo.finalizarOrden(
      ofId,
      { cantidad_producida, costo_total: costoTotal, notas },
      { id: usuarioId, nombre: getUserNombre(req) }
    );

    res.json({ ...updated, advertencias });
  } catch (err) {
    logger.error({ err }, '[fabricacion] finalizarOrden');
    res.status(err.status || 500).json({ error: err.message || 'Error al finalizar la orden' });
  }
}

async function cancelarOrden(req, res) {
  const ofId = Number(req.params.id);
  const usuarioId = getUserId(req);
  try {
    const orden = await repo.getOrdenById(ofId);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    if (['FINALIZADA', 'CANCELADA'].includes(orden.estado)) {
      return res.status(400).json({ error: 'La orden ya está finalizada o cancelada' });
    }

    const updated = await repo.cambiarEstado(
      ofId,
      { estado: 'CANCELADA', observacion: req.body?.observacion || 'Cancelada' },
      { id: usuarioId, nombre: getUserNombre(req) }
    );
    res.json(updated);
  } catch (err) {
    logger.error({ err }, '[fabricacion] cancelarOrden');
    res.status(err.status || 500).json({ error: err.message || 'Error al cancelar la orden' });
  }
}

async function cargarPlanilla(req, res) {
  const ofId = Number(req.params.id);
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items requerido' });
  }
  try {
    const orden = await repo.getOrdenById(ofId);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    if (orden.estado !== 'EN_PRODUCCION') {
      return res.status(400).json({ error: 'La orden debe estar en EN_PRODUCCION' });
    }

    for (const item of items) {
      if (item.insumo_id && item.cantidad_consumida != null) {
        await repo.actualizarCantidadConsumida(ofId, item.insumo_id, item.cantidad_consumida);
      }
    }

    const updated = await repo.getOrdenById(ofId);
    res.json(updated);
  } catch (err) {
    logger.error({ err }, '[fabricacion] cargarPlanilla');
    res.status(500).json({ error: 'Error al guardar la planilla' });
  }
}

module.exports = {
  // Recetas
  listRecetas,
  createReceta: [...validateReceta, createReceta],
  getReceta,
  updateReceta: [...validateReceta.slice(0, 1).map((v) => v.optional()), updateReceta],
  calcularCosto,
  // Órdenes
  listOrdenes,
  tablero,
  createOrden: [...validateOrden, createOrden],
  getOrden,
  getAnalisisAbastecimiento,
  reservarInsumos,
  generarPedidoCompra,
  iniciarProduccion,
  finalizarOrden: [...validateFinalizar, finalizarOrden],
  cancelarOrden,
  cargarPlanilla,
};
