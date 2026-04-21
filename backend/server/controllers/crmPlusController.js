const { body, validationResult } = require('express-validator');
const { query } = require('../db/pg');
const crmAccountRepo = require('../db/repositories/crmAccountRepository');
const crmContactRepo = require('../db/repositories/crmContactRepository');
const crmProjectRepo = require('../db/repositories/crmProjectRepository');
const oppRepo = require('../db/repositories/crmOpportunityRepository');
const actRepo = require('../db/repositories/crmActivityRepository');
const whatsappMessageRepo = require('../db/repositories/whatsappMessageRepository');
const {
  buildClientInsight,
  calculateLeadScore,
  deriveLeadSegment,
} = require('../services/clientSegmentationService');
const logger = require('../lib/logger');

function getUserId(req) {
  const value = req.user?.sub || req.user?.id || null;
  return value != null ? Number(value) : null;
}

function sendValidationErrors(res, errors) {
  return res.status(400).json({ errors: errors.array() });
}

const validateCuenta = [
  body('tipo').optional().isIn(['potencial', 'cliente', 'proveedor']),
  body('nombre').trim().notEmpty().withMessage('nombre requerido'),
  body('cliente_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('proveedor_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('owner_usuario_id').optional({ nullable: true }).isInt({ gt: 0 }),
];

const validateCuentaUpdate = [
  body('tipo').optional().isIn(['potencial', 'cliente', 'proveedor']),
  body('nombre').optional().trim().notEmpty().withMessage('nombre requerido'),
  body('cliente_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('proveedor_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('owner_usuario_id').optional({ nullable: true }).isInt({ gt: 0 }),
];

async function listCuentas(req, res) {
  try {
    const rows = await crmAccountRepo.list(req.query || {});
    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, '[crm+] listCuentas');
    res.status(500).json({ error: 'No se pudieron obtener las cuentas CRM' });
  }
}

async function createCuentaHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);

  try {
    const row = await crmAccountRepo.create(req.body);
    res.status(201).json(row);
  } catch (error) {
    logger.error({ err: error }, '[crm+] createCuenta');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo crear la cuenta CRM' });
  }
}

async function updateCuentaHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);

  try {
    const row = await crmAccountRepo.update(Number(req.params.id), req.body || {});
    if (!row) return res.status(404).json({ error: 'Cuenta CRM no encontrada' });
    res.json(row);
  } catch (error) {
    logger.error({ err: error }, '[crm+] updateCuenta');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo actualizar la cuenta CRM' });
  }
}

const validateContacto = [
  body('crm_cuenta_id').isInt({ gt: 0 }).withMessage('crm_cuenta_id requerido'),
  body('nombre').trim().notEmpty().withMessage('nombre requerido'),
];

const validateContactoUpdate = [
  body('crm_cuenta_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('nombre').optional().trim().notEmpty().withMessage('nombre requerido'),
];

async function listContactos(req, res) {
  try {
    const rows = await crmContactRepo.list(req.query || {});
    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, '[crm+] listContactos');
    res.status(500).json({ error: 'No se pudieron obtener los contactos' });
  }
}

async function createContactoHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);

  try {
    const row = await crmContactRepo.create(req.body);
    res.status(201).json(row);
  } catch (error) {
    logger.error({ err: error }, '[crm+] createContacto');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo crear el contacto' });
  }
}

async function updateContactoHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);

  try {
    const row = await crmContactRepo.update(Number(req.params.id), req.body || {});
    if (!row) return res.status(404).json({ error: 'Contacto no encontrado' });
    res.json(row);
  } catch (error) {
    logger.error({ err: error }, '[crm+] updateContacto');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo actualizar el contacto' });
  }
}

async function getFichaCliente(req, res) {
  try {
    const clienteId = Number(req.params.id);
    const cuenta = await crmAccountRepo.ensureForClienteId(clienteId);

    const [clienteRes, ventasRes, deudaRes, opps, acts, contactos, proyectos, mensajes] = await Promise.all([
      query(
        `SELECT id,
                nombre,
                apellido,
                email,
                telefono,
                telefono_e164,
                whatsapp_opt_in,
                whatsapp_status,
                tipo_cliente,
                segmento,
                lead_score,
                lead_segmento,
                lead_score_updated_at,
                fecha_nacimiento,
                fecha_registro
           FROM clientes
          WHERE id = $1
          LIMIT 1`,
        [clienteId]
      ),
      query(
        `SELECT id, fecha, total, estado_pago, estado_entrega
           FROM ventas
          WHERE cliente_id = $1
            AND estado_pago <> 'cancelado'
          ORDER BY fecha DESC, id DESC
          LIMIT 12`,
        [clienteId]
      ),
      query(
        `SELECT COALESCE(SUM(GREATEST(v.total - COALESCE(p.pagado, 0), 0)), 0) AS deuda_pendiente
           FROM ventas v
           LEFT JOIN (
             SELECT venta_id, SUM(monto) AS pagado
               FROM pagos
              WHERE venta_id IS NOT NULL
              GROUP BY venta_id
           ) p ON p.venta_id = v.id
          WHERE v.cliente_id = $1
            AND v.estado_pago <> 'cancelado'`,
        [clienteId]
      ),
      oppRepo.list({ cliente_id: clienteId, crm_cuenta_id: cuenta?.id || undefined, limit: 20 }),
      actRepo.list({
        cliente_id: clienteId,
        crm_cuenta_id: cuenta?.id || undefined,
        include_completed: true,
        limit: 25,
      }),
      cuenta?.id ? crmContactRepo.list({ crm_cuenta_id: cuenta.id }) : [],
      crmProjectRepo.list({ cliente_id: clienteId, crm_cuenta_id: cuenta?.id || undefined, limit: 20 }),
      whatsappMessageRepo.listByCliente(clienteId, { limit: 30 }),
    ]);

    const cliente = clienteRes.rows[0] || null;
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const clientMetrics = cliente
      ? {
          ...cliente,
          total_compras: ventasRes.rows.length,
          total_gastado: ventasRes.rows.reduce(
            (acc, venta) => acc + Number(venta.total || 0),
            0
          ),
          ultima_compra_at: ventasRes.rows[0]?.fecha || null,
          deuda_pendiente: Number(deudaRes.rows[0]?.deuda_pendiente || 0),
          oportunidades_activas: opps.filter((opp) => !['ganado', 'perdido'].includes(opp.fase)).length,
          respondio_whatsapp: mensajes.some((message) => message.direccion === 'recibido'),
          whatsapp_opt_in: Boolean(cliente.whatsapp_opt_in),
        }
      : null;
    const calculatedLeadScore = clientMetrics ? calculateLeadScore(clientMetrics) : 0;
    const clienteInsight = clientMetrics
      ? buildClientInsight({
          ...clientMetrics,
          lead_score: calculatedLeadScore,
          lead_segmento: deriveLeadSegment(calculatedLeadScore),
        })
      : null;
    const timeline = [
      ...ventasRes.rows.map((venta) => ({
        fecha: venta.fecha,
        tipo: 'venta',
        titulo: `Compra #${venta.id}`,
        detalle: `Total $${Number(venta.total || 0).toFixed(0)} · Pago ${venta.estado_pago} · Entrega ${venta.estado_entrega}`,
      })),
      ...opps.map((opp) => ({
        fecha: opp.actualizado_en || opp.creado_en,
        tipo: 'oportunidad',
        titulo: opp.titulo,
        detalle: `Etapa ${opp.fase}${typeof opp.valor_estimado === 'number' ? ` · $${opp.valor_estimado.toFixed(0)}` : ''}`,
      })),
      ...acts.map((activity) => ({
        fecha: activity.fecha_hora || activity.creado_en,
        tipo: 'actividad',
        titulo: activity.asunto,
        detalle: `${activity.tipo}${activity.estado ? ` · ${activity.estado}` : ''}`,
      })),
      ...mensajes.map((message) => ({
        fecha: message.created_at,
        tipo: 'mensaje',
        titulo: message.direccion === 'recibido' ? 'Mensaje recibido' : 'Mensaje enviado',
        detalle: message.contenido || message.plantilla_codigo || message.automatizacion_nombre || 'WhatsApp',
      })),
    ]
      .filter((item) => item.fecha)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, 40);

    res.json({
      cliente,
      cliente_insight: clienteInsight,
      cuenta,
      resumen: {
        deuda_pendiente: Number(deudaRes.rows[0]?.deuda_pendiente || 0),
        total_ventas: ventasRes.rows.length,
        oportunidades_abiertas: opps.filter((opp) => !['ganado', 'perdido'].includes(opp.fase)).length,
        actividades_pendientes: acts.filter((activity) => activity.estado === 'pendiente').length,
        proyectos_activos: proyectos.filter((project) => !['completado', 'cancelado'].includes(project.estado)).length,
      },
      ventas: ventasRes.rows,
      oportunidades: opps,
      actividades: acts,
      contactos,
      proyectos,
      mensajes,
      timeline,
    });
  } catch (error) {
    logger.error({ err: error }, '[crm+] getFichaCliente');
    res.status(500).json({ error: 'No se pudo construir la ficha del cliente' });
  }
}

async function listMensajesCliente(req, res) {
  try {
    const clienteId = Number(req.query.cliente_id);
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return res.status(400).json({ error: 'cliente_id requerido' });
    }

    const rows = await whatsappMessageRepo.listByCliente(clienteId, {
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, '[crm+] listMensajesCliente');
    res.status(500).json({ error: 'No se pudieron obtener los mensajes del cliente' });
  }
}

const validateProyecto = [
  body('nombre').trim().notEmpty().withMessage('nombre requerido'),
  body('tipo').optional().isIn(['proyecto', 'programa']),
  body('estado').optional().isIn(['planificado', 'en_progreso', 'en_espera', 'completado', 'cancelado']),
  body('prioridad').optional().isIn(['baja', 'media', 'alta', 'critica']),
  body('crm_cuenta_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('cliente_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('responsable_usuario_id').optional({ nullable: true }).isInt({ gt: 0 }),
];

const validateProyectoUpdate = [
  body('nombre').optional().trim().notEmpty().withMessage('nombre requerido'),
  body('tipo').optional().isIn(['proyecto', 'programa']),
  body('estado').optional().isIn(['planificado', 'en_progreso', 'en_espera', 'completado', 'cancelado']),
  body('prioridad').optional().isIn(['baja', 'media', 'alta', 'critica']),
  body('crm_cuenta_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('cliente_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('responsable_usuario_id').optional({ nullable: true }).isInt({ gt: 0 }),
];

async function listProyectos(req, res) {
  try {
    const rows = await crmProjectRepo.list(req.query || {});
    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, '[crm+] listProyectos');
    res.status(500).json({ error: 'No se pudieron obtener los proyectos' });
  }
}

async function createProyectoHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);

  try {
    const row = await crmProjectRepo.createProject({
      ...req.body,
      created_by: getUserId(req),
    });
    res.status(201).json(row);
  } catch (error) {
    logger.error({ err: error }, '[crm+] createProyecto');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo crear el proyecto' });
  }
}

async function updateProyectoHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);

  try {
    const row = await crmProjectRepo.updateProject(Number(req.params.id), req.body || {});
    if (!row) return res.status(404).json({ error: 'Proyecto no encontrado' });
    res.json(row);
  } catch (error) {
    logger.error({ err: error }, '[crm+] updateProyecto');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo actualizar el proyecto' });
  }
}

async function detalleProyecto(req, res) {
  try {
    const id = Number(req.params.id);
    const proyecto = await crmProjectRepo.getById(id);
    if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
    const tareas = await crmProjectRepo.listTareas(id);
    res.json({ ...proyecto, tareas });
  } catch (error) {
    logger.error({ err: error }, '[crm+] detalleProyecto');
    res.status(500).json({ error: 'No se pudo obtener el proyecto' });
  }
}

const validateTarea = [
  body('nombre').trim().notEmpty().withMessage('nombre requerido'),
  body('estado').optional().isIn(['pendiente', 'en_progreso', 'bloqueada', 'completada', 'cancelada']),
  body('prioridad').optional().isIn(['baja', 'media', 'alta', 'critica']),
  body('responsable_usuario_id').optional({ nullable: true }).isInt({ gt: 0 }),
];

const validateTareaUpdate = [
  body('nombre').optional().trim().notEmpty().withMessage('nombre requerido'),
  body('estado').optional().isIn(['pendiente', 'en_progreso', 'bloqueada', 'completada', 'cancelada']),
  body('prioridad').optional().isIn(['baja', 'media', 'alta', 'critica']),
  body('responsable_usuario_id').optional({ nullable: true }).isInt({ gt: 0 }),
];

async function syncTaskAgenda(task) {
  if (!task?.id) return;
  const project = await crmProjectRepo.getById(task.proyecto_id);
  if (!project) return;

  const existingIds = await actRepo.findByOrigin('proyecto_tarea', task.id);
  const payload = {
    cliente_id: project.cliente_id || null,
    crm_cuenta_id: project.crm_cuenta_id || null,
    proyecto_id: project.id,
    tipo: 'tarea',
    asunto: task.nombre,
    descripcion: task.descripcion || null,
    fecha_hora: task.fecha_inicio || null,
    fecha_fin: task.fecha_fin || null,
    estado: task.estado === 'completada' ? 'completado' : task.estado === 'cancelada' ? 'cancelado' : 'pendiente',
    prioridad: task.prioridad || 'media',
    asignado_a_usuario_id: task.responsable_usuario_id || null,
    origen_tipo: 'proyecto_tarea',
    origen_id: task.id,
  };

  if (!existingIds.length) {
    if (task.requiere_agenda) await actRepo.create(payload);
    return;
  }

  for (const activityId of existingIds) {
    await actRepo.update(activityId, payload);
  }
}

async function createTareaHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);

  try {
    const task = await crmProjectRepo.createTask(Number(req.params.id), {
      ...req.body,
      created_by: getUserId(req),
    });
    if (!task) return res.status(404).json({ error: 'Proyecto no encontrado' });
    await syncTaskAgenda(task);
    res.status(201).json(task);
  } catch (error) {
    logger.error({ err: error }, '[crm+] createTarea');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo crear la tarea' });
  }
}

async function updateTareaHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);

  try {
    const task = await crmProjectRepo.updateTask(Number(req.params.id), req.body || {});
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
    await syncTaskAgenda(task);
    res.json(task);
  } catch (error) {
    logger.error({ err: error }, '[crm+] updateTarea');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo actualizar la tarea' });
  }
}

module.exports = {
  listCuentas,
  createCuenta: [...validateCuenta, createCuentaHandler],
  updateCuenta: [...validateCuentaUpdate, updateCuentaHandler],
  listContactos,
  createContacto: [...validateContacto, createContactoHandler],
  updateContacto: [...validateContactoUpdate, updateContactoHandler],
  getFichaCliente,
  listMensajesCliente,
  listProyectos,
  createProyecto: [...validateProyecto, createProyectoHandler],
  updateProyecto: [...validateProyectoUpdate, updateProyectoHandler],
  detalleProyecto,
  createTarea: [...validateTarea, createTareaHandler],
  updateTarea: [...validateTareaUpdate, updateTareaHandler],
};
