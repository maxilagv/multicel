const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const users = require('../db/repositories/userRepository');
const userDeps = require('../db/repositories/usuarioDepositoRepository');

const ROLE_NAMES = ['admin', 'gerente', 'vendedor', 'fletero'];

const validateCreate = [
  body('nombre').trim().notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('rol_id').optional().isInt({ gt: 0 }),
  body('rol').optional().isIn(ROLE_NAMES),
  body('activo').optional().isBoolean(),
  body('caja_tipo_default').optional().isIn(['home_office', 'sucursal']),
];

const validateUpdate = [
  body('nombre').optional().isString(),
  body('email').optional().isEmail(),
  body('rol_id').optional().isInt({ gt: 0 }),
  body('rol').optional().isIn(ROLE_NAMES),
  body('activo').optional().isBoolean(),
  body('password').optional().isLength({ min: 6 }),
  body('caja_tipo_default').optional().isIn(['home_office', 'sucursal']),
];

async function resolveRoleId({ rol_id, rol }) {
  if (rol_id != null && rol_id !== '') {
    const n = Number(rol_id);
    if (Number.isInteger(n) && n > 0) return n;
  }
  const byName = await users.getRoleByName(rol);
  if (byName?.id) return Number(byName.id);
  return null;
}

async function list(req, res) {
  try {
    const rows = await users.list({
      q: req.query.q,
      activo: req.query.activo,
      role: req.query.role,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener usuarios' });
  }
}

async function listVendedores(req, res) {
  try {
    const rows = await users.list({
      q: req.query.q,
      activo: req.query.activo,
      role: 'vendedor',
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener vendedores' });
  }
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const roleId = await resolveRoleId(req.body || {});
    if (!roleId) {
      return res.status(400).json({ error: 'Debe indicar un rol valido (rol o rol_id)' });
    }

    const activo = req.body.activo !== false;
    const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
    const hash = await bcrypt.hash(req.body.password, rounds);
    const r = await users.create({
      nombre: req.body.nombre,
      email: req.body.email,
      password_hash: hash,
      rol_id: roleId,
      activo,
      caja_tipo_default: req.body.caja_tipo_default,
    });
    res.status(201).json({ id: r.id });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo crear el usuario' });
  }
}

async function update(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }

  try {
    const fields = { ...req.body };
    delete fields.password;

    if (Object.prototype.hasOwnProperty.call(fields, 'rol') || Object.prototype.hasOwnProperty.call(fields, 'rol_id')) {
      const roleId = await resolveRoleId(fields);
      if (!roleId) {
        return res.status(400).json({ error: 'Rol invalido' });
      }
      fields.rol_id = roleId;
      delete fields.rol;
    }

    const r = await users.update(id, fields);
    if (!r) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (req.body.password) {
      const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
      const hash = await bcrypt.hash(req.body.password, rounds);
      await users.setPasswordHash(id, hash);
    }

    res.json({ message: 'Usuario actualizado' });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo actualizar el usuario' });
  }
}

async function roles(req, res) {
  try {
    const rows = await users.listRoles();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener roles' });
  }
}

async function sellerPerformance(req, res) {
  try {
    const desde = req.query?.desde ? String(req.query.desde) : null;
    const hasta = req.query?.hasta ? String(req.query.hasta) : null;
    const rows = await users.sellerPerformance({ desde, hasta });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener el rendimiento' });
  }
}

async function getUserDepositos(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  try {
    const rows = await userDeps.getUserDepositos(id);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener los depositos del usuario' });
  }
}

async function setUserDepositos(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  const items = Array.isArray(req.body?.depositos) ? req.body.depositos : [];
  try {
    await userDeps.setUserDepositos(id, items);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron actualizar los depositos del usuario' });
  }
}

module.exports = {
  list,
  listVendedores,
  create: [...validateCreate, create],
  update: [...validateUpdate, update],
  roles,
  sellerPerformance,
  getUserDepositos,
  setUserDepositos,
};
