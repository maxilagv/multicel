const { body, check, validationResult } = require('express-validator');
const repo = require('../db/repositories/marketplaceRepository');
const service = require('../services/marketplaceService');
const syncService = require('../services/marketplaceSyncService');

async function listPymes(req, res) {
  try {
    const { q, limit, offset, inactivos } = req.query || {};
    const rows = await repo.listPymes({
      q,
      limit,
      offset,
      incluirInactivos: String(inactivos || '') === '1',
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener las pymes' });
  }
}

const validatePymeCreate = [
  check('nombre').trim().notEmpty().isLength({ min: 2, max: 200 }),
  check('rubro').optional().isString().isLength({ max: 120 }),
  check('contacto').optional().isString().isLength({ max: 120 }),
  check('telefono').optional().isString().isLength({ max: 50 }),
  check('email').optional().isEmail().isLength({ max: 255 }),
  check('direccion').optional().isString().isLength({ max: 500 }),
  check('localidad').optional().isString().isLength({ max: 120 }),
  check('provincia').optional().isString().isLength({ max: 120 }),
  check('notas').optional().isString().isLength({ max: 2000 }),
  check('activo').optional().isBoolean(),
  check('external_id').optional().isString().isLength({ max: 120 }),
];

async function createPyme(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const row = await repo.createPyme(req.body || {});
    res.status(201).json(row);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo crear la pyme' });
  }
}

const validatePymeUpdate = [
  check('nombre').optional().trim().isLength({ min: 2, max: 200 }),
  check('rubro').optional().isString().isLength({ max: 120 }),
  check('contacto').optional().isString().isLength({ max: 120 }),
  check('telefono').optional().isString().isLength({ max: 50 }),
  check('email').optional().isEmail().isLength({ max: 255 }),
  check('direccion').optional().isString().isLength({ max: 500 }),
  check('localidad').optional().isString().isLength({ max: 120 }),
  check('provincia').optional().isString().isLength({ max: 120 }),
  check('notas').optional().isString().isLength({ max: 2000 }),
  check('activo').optional().isBoolean(),
  check('external_id').optional().isString().isLength({ max: 120 }),
];

async function updatePyme(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  try {
    const updated = await repo.updatePyme(idNum, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Pyme no encontrada' });
    res.json({ message: 'Pyme actualizada' });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo actualizar la pyme' });
  }
}

async function listAlianzas(req, res) {
  try {
    const { q, estado, pyme_id, limit, offset, inactivas } = req.query || {};
    const rows = await repo.listAlianzas({
      q,
      estado,
      pyme_id,
      limit,
      offset,
      incluirInactivas: String(inactivas || '') === '1',
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener las alianzas' });
  }
}

const validateAlianzaCreate = [
  check('pyme_id').isInt({ gt: 0 }),
  check('nombre').optional().isString().isLength({ max: 200 }),
  check('estado').optional().isIn(['activa', 'pausada', 'vencida']),
  check('vigencia_desde').optional().isString().isLength({ max: 40 }),
  check('vigencia_hasta').optional().isString().isLength({ max: 40 }),
  check('comision_tipo').optional().isIn(['porcentaje', 'monto']),
  check('comision_valor').optional().isFloat({ min: 0 }),
  check('beneficio_tipo').optional().isIn(['porcentaje', 'monto']),
  check('beneficio_valor').optional().isFloat({ min: 0 }),
  check('limite_usos').optional().isInt({ min: 0 }),
  check('notas').optional().isString().isLength({ max: 2000 }),
  check('activo').optional().isBoolean(),
  check('external_id').optional().isString().isLength({ max: 120 }),
];

async function createAlianza(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const pymeId = Number(req.body?.pyme_id);
  try {
    const pyme = await repo.getPymeById(pymeId);
    if (!pyme) return res.status(400).json({ error: 'Pyme no encontrada' });
    const row = await repo.createAlianza(req.body || {});
    res.status(201).json(row);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo crear la alianza' });
  }
}

const validateAlianzaUpdate = [
  check('pyme_id').optional().isInt({ gt: 0 }),
  check('nombre').optional().isString().isLength({ max: 200 }),
  check('estado').optional().isIn(['activa', 'pausada', 'vencida']),
  check('vigencia_desde').optional().isString().isLength({ max: 40 }),
  check('vigencia_hasta').optional().isString().isLength({ max: 40 }),
  check('comision_tipo').optional().isIn(['porcentaje', 'monto']),
  check('comision_valor').optional().isFloat({ min: 0 }),
  check('beneficio_tipo').optional().isIn(['porcentaje', 'monto']),
  check('beneficio_valor').optional().isFloat({ min: 0 }),
  check('limite_usos').optional().isInt({ min: 0 }),
  check('notas').optional().isString().isLength({ max: 2000 }),
  check('activo').optional().isBoolean(),
  check('external_id').optional().isString().isLength({ max: 120 }),
];

async function updateAlianza(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  try {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'pyme_id')) {
      const pyme = await repo.getPymeById(Number(req.body.pyme_id));
      if (!pyme) return res.status(400).json({ error: 'Pyme no encontrada' });
    }
    const updated = await repo.updateAlianza(idNum, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Alianza no encontrada' });
    res.json({ message: 'Alianza actualizada' });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo actualizar la alianza' });
  }
}

async function listOfertasByAlianza(req, res) {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  try {
    const rows = await repo.listOfertas(idNum, {
      incluirInactivas: String(req.query?.inactivas || '') === '1',
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener las ofertas' });
  }
}

const validateOfertaCreate = [
  body('nombre').trim().notEmpty().isLength({ max: 200 }),
  body('descripcion').optional().isString().isLength({ max: 2000 }),
  body('precio_fijo').optional().isFloat({ min: 0 }),
  body('activo').optional().isBoolean(),
  body('external_id').optional().isString().isLength({ max: 120 }),
];

async function createOferta(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const alianzaId = Number(req.params.id);
  if (!Number.isInteger(alianzaId) || alianzaId <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  try {
    const alianza = await repo.getAlianzaById(alianzaId);
    if (!alianza) return res.status(400).json({ error: 'Alianza no encontrada' });
    const row = await repo.createOferta(alianzaId, req.body || {});
    res.status(201).json(row);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo crear la oferta' });
  }
}

const validateOfertaUpdate = [
  body('nombre').optional().isString().isLength({ max: 200 }),
  body('descripcion').optional().isString().isLength({ max: 2000 }),
  body('precio_fijo').optional().isFloat({ min: 0 }),
  body('activo').optional().isBoolean(),
  body('external_id').optional().isString().isLength({ max: 120 }),
];

async function updateOferta(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  try {
    const updated = await repo.updateOferta(idNum, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Oferta no encontrada' });
    res.json({ message: 'Oferta actualizada' });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo actualizar la oferta' });
  }
}

async function listReferidos(req, res) {
  try {
    const { q, estado, alianza_id, limit, offset } = req.query || {};
    const rows = await repo.listReferidos({ q, estado, alianza_id, limit, offset });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener los referidos' });
  }
}

const validateReferidoCreate = [
  check('alianza_id').isInt({ gt: 0 }),
  check('codigo').optional().isString().isLength({ min: 4, max: 40 }),
  check('estado').optional().isIn(['activo', 'inactivo', 'agotado', 'vencido']),
  check('max_usos').optional().isInt({ min: 0 }),
  check('vigencia_desde').optional().isString().isLength({ max: 40 }),
  check('vigencia_hasta').optional().isString().isLength({ max: 40 }),
  check('beneficio_tipo').optional().isIn(['porcentaje', 'monto']),
  check('beneficio_valor').optional().isFloat({ min: 0 }),
  check('notas').optional().isString().isLength({ max: 2000 }),
  check('external_id').optional().isString().isLength({ max: 120 }),
];

async function createReferido(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const alianzaId = Number(req.body?.alianza_id);
  try {
    const alianza = await repo.getAlianzaById(alianzaId);
    if (!alianza) return res.status(400).json({ error: 'Alianza no encontrada' });
    const payload = { ...(req.body || {}) };
    if (payload.codigo) payload.codigo = repo.normalizeCodigo(payload.codigo);
    const row = await repo.createReferido(payload);
    res.status(201).json(row);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo crear el referido' });
  }
}

const validateReferidoUpdate = [
  check('codigo').optional().isString().isLength({ min: 4, max: 40 }),
  check('estado').optional().isIn(['activo', 'inactivo', 'agotado', 'vencido']),
  check('max_usos').optional().isInt({ min: 0 }),
  check('usos_actuales').optional().isInt({ min: 0 }),
  check('vigencia_desde').optional().isString().isLength({ max: 40 }),
  check('vigencia_hasta').optional().isString().isLength({ max: 40 }),
  check('beneficio_tipo').optional().isIn(['porcentaje', 'monto']),
  check('beneficio_valor').optional().isFloat({ min: 0 }),
  check('notas').optional().isString().isLength({ max: 2000 }),
  check('external_id').optional().isString().isLength({ max: 120 }),
];

async function updateReferido(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  try {
    const payload = { ...(req.body || {}) };
    if (payload.codigo) {
      payload.codigo = repo.normalizeCodigo(payload.codigo);
      if (!payload.codigo) {
        return res.status(400).json({ error: 'Codigo invalido' });
      }
    }
    const updated = await repo.updateReferido(idNum, payload);
    if (!updated) return res.status(404).json({ error: 'Referido no encontrado' });
    res.json({ message: 'Referido actualizado' });
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo actualizar el referido' });
  }
}

const validateReferidoCheck = [
  body('codigo').trim().notEmpty().isLength({ min: 4, max: 40 }),
  body('total').optional().isFloat({ min: 0 }),
];

async function validateReferido(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const data = await service.resolveReferido({
      codigo: req.body?.codigo,
      total: req.body?.total,
    });
    res.json(data);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo validar el referido' });
  }
}

async function reportAlianzas(req, res) {
  try {
    const { desde, hasta, alianza_id, pyme_id } = req.query || {};
    const rows = await repo.reportAlianzas({ desde, hasta, alianza_id, pyme_id });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener los reportes' });
  }
}

async function exportSync(req, res) {
  try {
    const usuarioId = req.user?.sub ? Number(req.user.sub) : null;
    const payload = await syncService.exportSnapshot(usuarioId);
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo exportar el marketplace' });
  }
}

async function importSync(req, res) {
  try {
    const usuarioId = req.user?.sub ? Number(req.user.sub) : null;
    const result = await syncService.importSnapshot(req.body || {}, usuarioId);
    res.json(result);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo importar el marketplace' });
  }
}

module.exports = {
  listPymes,
  createPyme: [...validatePymeCreate, createPyme],
  updatePyme: [...validatePymeUpdate, updatePyme],
  listAlianzas,
  createAlianza: [...validateAlianzaCreate, createAlianza],
  updateAlianza: [...validateAlianzaUpdate, updateAlianza],
  listOfertasByAlianza,
  createOferta: [...validateOfertaCreate, createOferta],
  updateOferta: [...validateOfertaUpdate, updateOferta],
  listReferidos,
  createReferido: [...validateReferidoCreate, createReferido],
  updateReferido: [...validateReferidoUpdate, updateReferido],
  validateReferido: [...validateReferidoCheck, validateReferido],
  reportAlianzas,
  exportSync,
  importSync,
};
