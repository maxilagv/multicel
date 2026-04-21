const { z } = require('zod');
const repo = require('../db/repositories/ordenesServicioRepository');
const logger = require('../lib/logger');

// ─── Esquemas de validación ───────────────────────────────────────────────────

const CreateOSSchema = z.object({
  cliente_id:              z.coerce.number().int().positive('El cliente es obligatorio'),
  tipo_trabajo_id:         z.coerce.number().int().positive().optional().nullable(),
  descripcion_problema:    z.string().trim().min(3, 'La descripción del problema es obligatoria').max(2000),
  observaciones_internas:  z.string().trim().max(2000).optional().nullable(),
  observaciones_cliente:   z.string().trim().max(2000).optional().nullable(),
  tecnico_id:              z.coerce.number().int().positive().optional().nullable(),
  fecha_estimada_entrega:  z.string().trim().optional().nullable(),
});

const UpdateOSSchema = z.object({
  tipo_trabajo_id:         z.coerce.number().int().positive().optional().nullable(),
  descripcion_problema:    z.string().trim().min(3).max(2000).optional(),
  observaciones_internas:  z.string().trim().max(2000).optional().nullable(),
  observaciones_cliente:   z.string().trim().max(2000).optional().nullable(),
  tecnico_id:              z.coerce.number().int().positive().optional().nullable(),
  fecha_estimada_entrega:  z.string().trim().optional().nullable(),
  total_mano_obra:         z.coerce.number().min(0).optional(),
});

const CambiarEstadoSchema = z.object({
  estado: z.enum(['recibido','presupuestado','aceptado','en_proceso','terminado','entregado','facturado','cancelado']),
  observacion:  z.string().trim().max(500).optional().nullable(),
  deposito_id:  z.coerce.number().int().positive().optional().nullable(),
});

const AddInsumoSchema = z.object({
  producto_id:     z.coerce.number().int().positive('El producto es obligatorio'),
  cantidad:        z.coerce.number().positive('La cantidad debe ser mayor a 0').max(99999),
  precio_unitario: z.coerce.number().min(0, 'El precio no puede ser negativo'),
  notas:           z.string().trim().max(255).optional().nullable(),
});

const AddDocumentoSchema = z.object({
  nombre_archivo: z.string().trim().min(1, 'El nombre del archivo es obligatorio').max(255),
  url_archivo:    z.string().trim().url('La URL del archivo no es válida'),
  tipo_mime:      z.string().trim().max(100).optional().nullable(),
  descripcion:    z.string().trim().max(255).optional().nullable(),
  acceso_roles:   z.array(z.string()).optional().nullable(),
});

const PresupuestoItemSchema = z.object({
  descripcion:     z.string().trim().min(1, 'La descripción del ítem es obligatoria').max(500),
  cantidad:        z.coerce.number().positive().max(99999).default(1),
  precio_unitario: z.coerce.number().min(0),
});

const SetPresupuestoSchema = z.object({
  items: z.array(PresupuestoItemSchema).max(100, 'Máximo 100 ítems por presupuesto'),
});

// ─── Helper: extraer usuario del JWT ─────────────────────────────────────────

function getUser(req) {
  return {
    id:     req.user?.sub ? Number(req.user.sub) : null,
    nombre: req.user?.nombre || req.user?.email || 'Sistema',
    role:   req.user?.role  || 'vendedor',
  };
}

function parseErr(err) {
  if (err instanceof z.ZodError) {
    return {
      status: 400,
      body: {
        error: 'Datos inválidos',
        code: 'VALIDATION_ERROR',
        errors: err.issues.map((i) => ({ campo: i.path.join('.') || 'body', msg: i.message })),
      },
    };
  }
  return {
    status: err.status || 500,
    body: { error: err.message || 'Error interno del servidor' },
  };
}

// ─── Tipos de trabajo ─────────────────────────────────────────────────────────

async function listTiposTrabajo(req, res) {
  try {
    const soloActivos = req.query.todos !== '1';
    const rows = await repo.listTiposTrabajo({ soloActivos });
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'os:listTiposTrabajo');
    const { status, body } = parseErr(err);
    res.status(status).json(body);
  }
}

async function createTipoTrabajo(req, res) {
  try {
    const { nombre, descripcion, color } = req.body || {};
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const r = await repo.createTipoTrabajo({ nombre, descripcion, color });
    res.status(201).json(r);
  } catch (err) {
    logger.error({ err }, 'os:createTipoTrabajo');
    const { status, body } = parseErr(err);
    res.status(status).json(body);
  }
}

async function updateTipoTrabajo(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const r = await repo.updateTipoTrabajo(id, req.body || {});
    if (!r) return res.status(404).json({ error: 'Tipo de trabajo no encontrado' });
    res.json(r);
  } catch (err) {
    logger.error({ err }, 'os:updateTipoTrabajo');
    const { status, body } = parseErr(err);
    res.status(status).json(body);
  }
}

// ─── Órdenes de servicio ──────────────────────────────────────────────────────

async function list(req, res) {
  try {
    const {
      q, estado, tecnico_id, cliente_id, desde, hasta,
      limit = '50', offset = '0',
    } = req.query;
    const result = await repo.list({
      q: q || undefined,
      estado: estado || undefined,
      tecnico_id: tecnico_id ? Number(tecnico_id) : undefined,
      cliente_id: cliente_id ? Number(cliente_id) : undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      limit:  Number(limit),
      offset: Number(offset),
    });
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'os:list');
    const { status, body } = parseErr(err);
    res.status(status).json(body);
  }
}

async function tablero(req, res) {
  try {
    const rows = await repo.tablero();
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'os:tablero');
    res.status(500).json({ error: 'Error al obtener el tablero' });
  }
}

async function detalle(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const os = await repo.findById(id);
    if (!os) return res.status(404).json({ error: 'Orden de servicio no encontrada' });

    // Cargar datos relacionados en paralelo
    const user = getUser(req);
    const [historial, insumos, documentos, presupuesto] = await Promise.all([
      repo.getHistorial(id),
      repo.getInsumos(id),
      repo.getDocumentos(id, user.role),
      repo.getPresupuesto(id),
    ]);

    res.json({ ...os, historial, insumos, documentos, presupuesto });
  } catch (err) {
    logger.error({ err }, 'os:detalle');
    const { status, body } = parseErr(err);
    res.status(status).json(body);
  }
}

async function create(req, res) {
  try {
    const parsed = CreateOSSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        code: 'VALIDATION_ERROR',
        errors: parsed.error.issues.map((i) => ({ campo: i.path.join('.'), msg: i.message })),
      });
    }
    const user = getUser(req);
    const r = await repo.create({ ...parsed.data, created_by: user.id });
    res.status(201).json(r);
  } catch (err) {
    logger.error({ err }, 'os:create');
    const { status, body } = parseErr(err);
    res.status(status).json(body);
  }
}

async function update(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const parsed = UpdateOSSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        errors: parsed.error.issues.map((i) => ({ campo: i.path.join('.'), msg: i.message })),
      });
    }
    const r = await repo.update(id, parsed.data);
    if (!r) return res.status(404).json({ error: 'Orden de servicio no encontrada' });
    res.json(r);
  } catch (err) {
    logger.error({ err }, 'os:update');
    const { status, body } = parseErr(err);
    res.status(status).json(body);
  }
}

async function cambiarEstado(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const parsed = CambiarEstadoSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        errors: parsed.error.issues.map((i) => ({ campo: i.path.join('.'), msg: i.message })),
      });
    }

    const user = getUser(req);
    const r = await repo.cambiarEstado(
      id,
      parsed.data.estado,
      user.id,
      user.nombre,
      parsed.data.observacion || null,
      parsed.data.deposito_id || null,
    );
    res.json(r);
  } catch (err) {
    logger.error({ err }, 'os:cambiarEstado');
    const { status, body } = parseErr(err);
    res.status(status).json(body);
  }
}

// ─── Historial ────────────────────────────────────────────────────────────────

async function getHistorial(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await repo.getHistorial(id);
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'os:getHistorial');
    res.status(500).json({ error: 'Error al obtener el historial' });
  }
}

// ─── Insumos ──────────────────────────────────────────────────────────────────

async function getInsumos(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await repo.getInsumos(id);
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'os:getInsumos');
    res.status(500).json({ error: 'Error al obtener los insumos' });
  }
}

async function addInsumo(req, res) {
  try {
    const os_id = parseInt(req.params.id, 10);
    if (!os_id) return res.status(400).json({ error: 'ID de OS inválido' });

    const parsed = AddInsumoSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        errors: parsed.error.issues.map((i) => ({ campo: i.path.join('.'), msg: i.message })),
      });
    }
    const user = getUser(req);
    const r = await repo.addInsumo(os_id, { ...parsed.data, created_by: user.id });
    res.status(201).json(r);
  } catch (err) {
    logger.error({ err }, 'os:addInsumo');
    const { status, body } = parseErr(err);
    res.status(status).json(body);
  }
}

async function updateInsumo(req, res) {
  try {
    const os_id    = parseInt(req.params.id, 10);
    const insumo_id = parseInt(req.params.insumoId, 10);
    if (!os_id || !insumo_id) return res.status(400).json({ error: 'ID inválido' });
    const { cantidad, precio_unitario, notas } = req.body || {};
    const r = await repo.updateInsumo(os_id, insumo_id, { cantidad, precio_unitario, notas });
    res.json(r);
  } catch (err) {
    logger.error({ err }, 'os:updateInsumo');
    const { status, body } = parseErr(err);
    res.status(status).json(body);
  }
}

async function removeInsumo(req, res) {
  try {
    const os_id    = parseInt(req.params.id, 10);
    const insumo_id = parseInt(req.params.insumoId, 10);
    if (!os_id || !insumo_id) return res.status(400).json({ error: 'ID inválido' });
    await repo.removeInsumo(os_id, insumo_id);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'os:removeInsumo');
    const { status, body } = parseErr(err);
    res.status(status).json(body);
  }
}

// ─── Documentos ───────────────────────────────────────────────────────────────

async function getDocumentos(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const user = getUser(req);
    const rows = await repo.getDocumentos(id, user.role);
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'os:getDocumentos');
    res.status(500).json({ error: 'Error al obtener los documentos' });
  }
}

async function addDocumento(req, res) {
  try {
    const os_id = parseInt(req.params.id, 10);
    if (!os_id) return res.status(400).json({ error: 'ID de OS inválido' });

    const parsed = AddDocumentoSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        errors: parsed.error.issues.map((i) => ({ campo: i.path.join('.'), msg: i.message })),
      });
    }
    const user = getUser(req);
    const r = await repo.addDocumento(os_id, { ...parsed.data, uploaded_by: user.id });
    res.status(201).json(r);
  } catch (err) {
    logger.error({ err }, 'os:addDocumento');
    const { status, body } = parseErr(err);
    res.status(status).json(body);
  }
}

async function removeDocumento(req, res) {
  try {
    const os_id  = parseInt(req.params.id, 10);
    const doc_id = parseInt(req.params.docId, 10);
    if (!os_id || !doc_id) return res.status(400).json({ error: 'ID inválido' });
    await repo.removeDocumento(os_id, doc_id);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'os:removeDocumento');
    const { status, body } = parseErr(err);
    res.status(status).json(body);
  }
}

// ─── Presupuesto ──────────────────────────────────────────────────────────────

async function getPresupuesto(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await repo.getPresupuesto(id);
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'os:getPresupuesto');
    res.status(500).json({ error: 'Error al obtener el presupuesto' });
  }
}

async function setPresupuesto(req, res) {
  try {
    const os_id = parseInt(req.params.id, 10);
    if (!os_id) return res.status(400).json({ error: 'ID de OS inválido' });

    const parsed = SetPresupuestoSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        errors: parsed.error.issues.map((i) => ({ campo: i.path.join('.'), msg: i.message })),
      });
    }
    const r = await repo.setPresupuesto(os_id, parsed.data.items);
    res.json(r);
  } catch (err) {
    logger.error({ err }, 'os:setPresupuesto');
    const { status, body } = parseErr(err);
    res.status(status).json(body);
  }
}

module.exports = {
  // Tipos de trabajo
  listTiposTrabajo,
  createTipoTrabajo,
  updateTipoTrabajo,
  // OS CRUD
  list,
  tablero,
  detalle,
  create,
  update,
  cambiarEstado,
  // Historial
  getHistorial,
  // Insumos
  getInsumos,
  addInsumo,
  updateInsumo,
  removeInsumo,
  // Documentos
  getDocumentos,
  addDocumento,
  removeDocumento,
  // Presupuesto
  getPresupuesto,
  setPresupuesto,
};
