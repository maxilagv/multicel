const { body, check, query, validationResult } = require('express-validator');
const oppRepo = require('../db/repositories/crmOpportunityRepository');
const actRepo = require('../db/repositories/crmActivityRepository');
const salesRepo = require('../db/repositories/salesRepository');
const systemProductService = require('../services/systemProductService');
const logger = require('../lib/logger');

function getUserId(req) {
  const value = req.user?.sub || req.user?.id || null;
  return value != null ? Number(value) : null;
}

function normalizeErrors(res, errors) {
  return res.status(400).json({ errors: errors.array() });
}

const validateOppCreate = [
  body('cliente_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('crm_cuenta_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('titulo').trim().notEmpty().withMessage('titulo requerido'),
  body('fase').optional().isIn(['lead', 'contacto', 'propuesta', 'negociacion', 'ganado', 'perdido']),
  body('valor_estimado').optional().isFloat({ min: 0 }),
  body('probabilidad').optional().isInt({ min: 0, max: 100 }),
  body('fecha_cierre_estimada').optional({ nullable: true }).isISO8601(),
  body('owner_usuario_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body().custom((value) => {
    if (!value?.cliente_id && !value?.crm_cuenta_id) {
      throw new Error('cliente_id o crm_cuenta_id requerido');
    }
    return true;
  }),
];

const validateOppUpdate = [
  body('cliente_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('crm_cuenta_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('titulo').optional().trim().notEmpty().withMessage('titulo requerido'),
  body('fase').optional().isIn(['lead', 'contacto', 'propuesta', 'negociacion', 'ganado', 'perdido']),
  body('valor_estimado').optional().isFloat({ min: 0 }),
  body('probabilidad').optional().isInt({ min: 0, max: 100 }),
  body('fecha_cierre_estimada').optional({ nullable: true }).isISO8601(),
  body('owner_usuario_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('oculto').optional().isBoolean(),
];

async function listOportunidades(req, res) {
  try {
    const { q, fase, cliente_id, crm_cuenta_id, owner_id, limit, offset } = req.query || {};
    const rows = await oppRepo.list({
      q,
      fase,
      cliente_id,
      crm_cuenta_id,
      owner_id,
      limit,
      offset,
    });
    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, '[crm] listOportunidades');
    res.status(500).json({ error: 'No se pudieron obtener las oportunidades' });
  }
}

async function crearOportunidadHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return normalizeErrors(res, errors);

  try {
    const result = await oppRepo.create(req.body, {
      changed_by_user_id: getUserId(req),
      notas_historial: 'Creacion de oportunidad',
    });
    res.status(201).json({ id: result.id });
  } catch (error) {
    logger.error({ err: error }, '[crm] crearOportunidad');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo crear la oportunidad' });
  }
}

async function actualizarOportunidadHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return normalizeErrors(res, errors);

  try {
    const id = Number(req.params.id);
    const before = await oppRepo.getById(id);
    if (!before) return res.status(404).json({ error: 'Oportunidad no encontrada' });

    const updated = await oppRepo.update(id, req.body, {
      changed_by_user_id: getUserId(req),
      notas_historial: req.body?.notas_historial || null,
    });
    if (!updated) return res.status(404).json({ error: 'Oportunidad no encontrada' });

    const after = await oppRepo.getById(id);
    if (before.fase !== 'ganado' && after?.fase === 'ganado' && after.cliente_id) {
      try {
        const productId = await systemProductService.ensureServiceProduct({
          code: 'CRMOPP',
          name: 'Servicio comercial cerrado',
          description: 'Producto tecnico para ventas creadas desde oportunidades CRM',
        });
        const valor = Number(after.valor_estimado || 0);
        if (valor > 0) {
          await salesRepo.createVenta({
            cliente_id: after.cliente_id,
            fecha: new Date(),
            descuento: 0,
            impuestos: 0,
            allow_custom_unit_price: true,
            items: [{ producto_id: productId, cantidad: 1, precio_unitario: valor }],
          });
        }
      } catch (error) {
        logger.error(
          { err: error, oportunidad_id: id },
          '[CRM] Error creando venta automatica por oportunidad ganada'
        );
      }
    }

    res.json({ message: 'Oportunidad actualizada' });
  } catch (error) {
    logger.error({ err: error }, '[crm] actualizarOportunidad');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo actualizar la oportunidad' });
  }
}

async function historialOportunidad(req, res) {
  try {
    const id = Number(req.params.id);
    const rows = await oppRepo.getHistory(id);
    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, '[crm] historialOportunidad');
    res.status(500).json({ error: 'No se pudo obtener el historial de la oportunidad' });
  }
}

const validateAct = [
  check('tipo')
    .isIn(['llamada', 'reunion', 'tarea', 'visita', 'email', 'recordatorio'])
    .withMessage('tipo invalido'),
  check('asunto').trim().notEmpty().withMessage('asunto requerido'),
  check('estado').optional().isIn(['pendiente', 'completado', 'cancelado']),
  check('fecha_hora').optional({ nullable: true }).isISO8601(),
  check('fecha_fin').optional({ nullable: true }).isISO8601(),
  check('cliente_id').optional({ nullable: true }).isInt({ gt: 0 }),
  check('crm_cuenta_id').optional({ nullable: true }).isInt({ gt: 0 }),
  check('oportunidad_id').optional({ nullable: true }).isInt({ gt: 0 }),
  check('proyecto_id').optional({ nullable: true }).isInt({ gt: 0 }),
  check('asignado_a_usuario_id').optional({ nullable: true }).isInt({ gt: 0 }),
  check('prioridad').optional().isIn(['baja', 'media', 'alta', 'critica']),
];

async function listActividades(req, res) {
  try {
    const {
      q,
      cliente_id,
      crm_cuenta_id,
      oportunidad_id,
      proyecto_id,
      estado,
      asignado_a_usuario_id,
      include_completed,
      limit,
      offset,
    } = req.query || {};
    const rows = await actRepo.list({
      q,
      cliente_id,
      crm_cuenta_id,
      oportunidad_id,
      proyecto_id,
      estado,
      asignado_a_usuario_id,
      include_completed: include_completed !== '0',
      limit,
      offset,
    });
    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, '[crm] listActividades');
    res.status(500).json({ error: 'No se pudieron obtener las actividades' });
  }
}

async function crearActividadHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return normalizeErrors(res, errors);

  try {
    const result = await actRepo.create(req.body);
    res.status(201).json({ id: result.id });
  } catch (error) {
    logger.error({ err: error }, '[crm] crearActividad');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo crear la actividad' });
  }
}

async function actualizarActividadHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return normalizeErrors(res, errors);

  try {
    const result = await actRepo.update(Number(req.params.id), req.body);
    if (!result) return res.status(404).json({ error: 'Actividad no encontrada' });
    res.json({ message: 'Actividad actualizada' });
  } catch (error) {
    logger.error({ err: error }, '[crm] actualizarActividad');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo actualizar la actividad' });
  }
}

async function analisis(req, res) {
  try {
    const data = await oppRepo.analytics();
    res.json(data);
  } catch (error) {
    logger.error({ err: error }, '[crm] analisis');
    res.status(500).json({ error: 'No se pudo obtener el analisis de CRM' });
  }
}

module.exports = {
  listOportunidades,
  crearOportunidad: [...validateOppCreate, crearOportunidadHandler],
  actualizarOportunidad: [...validateOppUpdate, actualizarOportunidadHandler],
  historialOportunidad,
  listActividades,
  crearActividad: [...validateAct, crearActividadHandler],
  actualizarActividad: [...validateAct, actualizarActividadHandler],
  analisis,
};
