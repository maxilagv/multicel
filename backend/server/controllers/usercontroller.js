const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const users = require('../db/repositories/userRepository');
const userDeps = require('../db/repositories/usuarioDepositoRepository');
const {
  assertDepositoIdsAllowed,
  buildDepositoForbiddenError,
  buildDepositoScopeError,
  buildDepositoVisibility,
  getRequestRole,
} = require('../lib/depositoScope');

const ROLE_NAMES = ['admin', 'gerente', 'gerente_sucursal', 'vendedor', 'fletero'];
const MANAGEABLE_ROLE_NAMES = ['vendedor', 'fletero'];

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

function normalizeRoleName(value) {
  return String(value || '').trim().toLowerCase();
}

function isManageableRoleName(value) {
  return MANAGEABLE_ROLE_NAMES.includes(normalizeRoleName(value));
}

function roleRequiresPrimaryDeposito(value) {
  return normalizeRoleName(value) === 'gerente_sucursal';
}

function defaultDepositoRoleForUserRole(value) {
  return roleRequiresPrimaryDeposito(value) ? 'admin' : 'operador';
}

function normalizePrimaryDepositoId(value) {
  const normalized = Number(value || 0);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

async function getScopedUserManagementContext(req) {
  const role = normalizeRoleName(getRequestRole(req));
  if (role !== 'gerente_sucursal') {
    return { role, mode: 'all', depositIds: [] };
  }
  const visibility = await buildDepositoVisibility(req);
  const depositIds = Array.isArray(visibility?.ids)
    ? visibility.ids
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    : [];
  if (!depositIds.length) {
    throw buildDepositoScopeError('No tienes una sucursal asignada para gestionar usuarios');
  }
  return { role, mode: 'restricted', depositIds };
}

async function resolveRoleRecord(payload) {
  const roleId = await resolveRoleId(payload || {});
  if (!roleId) return null;
  const roleRecord = await users.getRoleById(roleId);
  if (!roleRecord?.id) return null;
  return roleRecord;
}

async function syncUserPrimaryDeposito(userId, depositoPrincipalId, roleName) {
  const primaryId = normalizePrimaryDepositoId(depositoPrincipalId);
  if (!primaryId) return;

  const existingDepositos = await userDeps.getUserDepositos(userId);
  const normalizedItems = Array.isArray(existingDepositos)
    ? existingDepositos
        .map((item) => {
          const depositoId = Number(item?.deposito_id ?? item?.id);
          if (!Number.isInteger(depositoId) || depositoId <= 0) return null;
          return {
            deposito_id: depositoId,
            rol_deposito: String(item?.rol_deposito || '').trim().toLowerCase() || null,
          };
        })
        .filter(Boolean)
    : [];

  const nextItems = normalizedItems.length ? [...normalizedItems] : [];
  const existingIndex = nextItems.findIndex((item) => Number(item.deposito_id) === primaryId);
  const nextRolDeposito = defaultDepositoRoleForUserRole(roleName);

  if (existingIndex >= 0) {
    nextItems[existingIndex] = {
      ...nextItems[existingIndex],
      rol_deposito:
        roleRequiresPrimaryDeposito(roleName)
          ? nextRolDeposito
          : nextItems[existingIndex].rol_deposito || nextRolDeposito,
    };
  } else {
    nextItems.push({
      deposito_id: primaryId,
      rol_deposito: nextRolDeposito,
    });
  }

  await userDeps.setUserDepositos(userId, nextItems, {
    deposito_principal_id: primaryId,
  });
}

async function assertUserManagementAllowed(req, userId, { includeDeleted = false } = {}) {
  const scope = await getScopedUserManagementContext(req);
  const target = includeDeleted ? await users.findByIdForSecurity(userId) : await users.findById(userId);
  if (!target) {
    return { scope, target: null };
  }
  if (scope.mode !== 'restricted') {
    return { scope, target };
  }

  if (!isManageableRoleName(target.rol)) {
    throw buildDepositoForbiddenError(
      'Solo puedes gestionar vendedores o fleteros de tu sucursal'
    );
  }

  const assignedIds = await userDeps.getUserDepositoIds(userId);
  const primaryId = Number(target.deposito_principal_id || 0);
  const targetDepositoIds = Array.from(
    new Set([
      ...assignedIds,
      ...(Number.isInteger(primaryId) && primaryId > 0 ? [primaryId] : []),
    ])
  );

  if (!targetDepositoIds.length) {
    throw buildDepositoForbiddenError('El usuario no tiene una sucursal visible asignada');
  }

  const allowedSet = new Set(scope.depositIds);
  const hasVisibleDeposito = targetDepositoIds.some((depositoId) => allowedSet.has(depositoId));
  const hasForeignDeposito = targetDepositoIds.some((depositoId) => !allowedSet.has(depositoId));
  if (!hasVisibleDeposito || hasForeignDeposito) {
    throw buildDepositoForbiddenError(
      'No puedes gestionar usuarios asignados a otras sucursales'
    );
  }

  return { scope, target };
}

async function list(req, res) {
  try {
    const scope = await getScopedUserManagementContext(req);
    const requestedRole = normalizeRoleName(req.query.role);
    if (scope.mode === 'restricted' && requestedRole && !isManageableRoleName(requestedRole)) {
      return res.json([]);
    }
    const rows = await users.list({
      q: req.query.q,
      activo: req.query.activo,
      role: req.query.role,
      roleNames:
        scope.mode === 'restricted' && !requestedRole ? MANAGEABLE_ROLE_NAMES : undefined,
      limit: req.query.limit,
      offset: req.query.offset,
      includeDeleted: String(req.query.include_deleted || '') === '1',
      visibleDepositoIds: scope.mode === 'restricted' ? scope.depositIds : undefined,
      enforceVisibleDepositoSubset: scope.mode === 'restricted',
    });
    res.json(rows);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudieron obtener usuarios' });
  }
}

async function listVendedores(req, res) {
  try {
    const scope = await getScopedUserManagementContext(req);
    const rows = await users.list({
      q: req.query.q,
      activo: req.query.activo,
      role: 'vendedor',
      limit: req.query.limit,
      offset: req.query.offset,
      visibleDepositoIds: scope.mode === 'restricted' ? scope.depositIds : undefined,
      enforceVisibleDepositoSubset: scope.mode === 'restricted',
    });
    res.json(rows);
  } catch (e) {
    res
      .status(e.status || 500)
      .json({ error: e.message || 'No se pudieron obtener vendedores' });
  }
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const scope = await getScopedUserManagementContext(req);
    const roleRecord = await resolveRoleRecord(req.body || {});
    if (!roleRecord?.id) {
      return res.status(400).json({ error: 'Debe indicar un rol valido (rol o rol_id)' });
    }
    const roleName = normalizeRoleName(roleRecord.nombre);
    if (scope.mode === 'restricted' && !isManageableRoleName(roleRecord.nombre)) {
      return res.status(403).json({
        error: 'Solo puedes crear vendedores o fleteros dentro de tu sucursal',
      });
    }

    const activo = req.body.activo !== false;
    const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
    const hash = await bcrypt.hash(req.body.password, rounds);
    const requestedPrimaryId = normalizePrimaryDepositoId(req.body?.deposito_principal_id);
    const depositoPrincipalId =
      scope.mode === 'restricted'
        ? scope.depositIds[0]
        : requestedPrimaryId;
    if (roleRequiresPrimaryDeposito(roleName) && !depositoPrincipalId) {
      return res.status(400).json({
        error: 'El administrador de sucursal debe tener una sucursal base asignada',
      });
    }
    if (scope.mode === 'restricted') {
      await assertDepositoIdsAllowed(req, [depositoPrincipalId]);
    }
    const r = await users.create({
      nombre: req.body.nombre,
      email: req.body.email,
      password_hash: hash,
      rol_id: roleRecord.id,
      activo,
      caja_tipo_default: req.body.caja_tipo_default,
      deposito_principal_id: depositoPrincipalId,
    });
    if (r?.id && depositoPrincipalId) {
      await userDeps.setUserDepositos(
        r.id,
        [{
          deposito_id: depositoPrincipalId,
          rol_deposito: defaultDepositoRoleForUserRole(roleName),
        }],
        { deposito_principal_id: depositoPrincipalId }
      );
    }
    res.status(201).json({ id: r.id });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo crear el usuario' });
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
    const { scope, target } = await assertUserManagementAllowed(req, id);
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    const fields = { ...req.body };
    const requestedPrimaryId = Object.prototype.hasOwnProperty.call(fields, 'deposito_principal_id')
      ? normalizePrimaryDepositoId(fields.deposito_principal_id)
      : undefined;
    delete fields.password;

    let nextRoleName = normalizeRoleName(target.rol);
    if (
      Object.prototype.hasOwnProperty.call(fields, 'rol') ||
      Object.prototype.hasOwnProperty.call(fields, 'rol_id')
    ) {
      const roleRecord = await resolveRoleRecord(fields);
      if (!roleRecord?.id) {
        return res.status(400).json({ error: 'Rol invalido' });
      }
      if (scope.mode === 'restricted' && !isManageableRoleName(roleRecord.nombre)) {
        return res.status(403).json({
          error: 'No puedes asignar roles fuera del alcance de tu sucursal',
        });
      }
      nextRoleName = normalizeRoleName(roleRecord.nombre);
      fields.rol_id = roleRecord.id;
      delete fields.rol;
    }
    if (scope.mode === 'restricted' && Object.prototype.hasOwnProperty.call(fields, 'deposito_principal_id')) {
      await assertDepositoIdsAllowed(req, [fields.deposito_principal_id]);
    }
    const effectivePrimaryId =
      requestedPrimaryId !== undefined
        ? requestedPrimaryId
        : normalizePrimaryDepositoId(target.deposito_principal_id);
    const shouldSyncPrimaryDeposito =
      requestedPrimaryId !== undefined || roleRequiresPrimaryDeposito(nextRoleName);
    if (roleRequiresPrimaryDeposito(nextRoleName) && !effectivePrimaryId) {
      return res.status(400).json({
        error: 'El administrador de sucursal debe tener una sucursal base asignada',
      });
    }
    if (requestedPrimaryId !== undefined) {
      fields.deposito_principal_id = requestedPrimaryId;
    }

    const r = await users.update(id, fields);
    if (!r) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (req.body.password) {
      const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
      const hash = await bcrypt.hash(req.body.password, rounds);
      await users.setPasswordHash(id, hash);
    }
    if (shouldSyncPrimaryDeposito && effectivePrimaryId) {
      await syncUserPrimaryDeposito(id, effectivePrimaryId, nextRoleName);
    }

    res.json({ message: 'Usuario actualizado' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo actualizar el usuario' });
  }
}

async function roles(req, res) {
  try {
    const rows = await users.listRoles();
    const scope = await getScopedUserManagementContext(req);
    res.json(
      scope.mode === 'restricted'
        ? rows.filter((row) => isManageableRoleName(row.nombre))
        : rows
    );
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudieron obtener roles' });
  }
}

async function sellerPerformance(req, res) {
  try {
    const scope = await getScopedUserManagementContext(req);
    const desde = req.query?.desde ? String(req.query.desde) : null;
    const hasta = req.query?.hasta ? String(req.query.hasta) : null;
    const rows = await users.sellerPerformance({
      desde,
      hasta,
      visibleDepositoIds: scope.mode === 'restricted' ? scope.depositIds : undefined,
    });
    res.json(rows);
  } catch (e) {
    res
      .status(e.status || 500)
      .json({ error: e.message || 'No se pudo obtener el rendimiento' });
  }
}

async function getUserDepositos(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  try {
    const { target } = await assertUserManagementAllowed(req, id);
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    const rows = await userDeps.getUserDepositos(id);
    res.json(rows);
  } catch (e) {
    res
      .status(e.status || 500)
      .json({ error: e.message || 'No se pudieron obtener los depositos del usuario' });
  }
}

async function setUserDepositos(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  const items = Array.isArray(req.body?.depositos) ? req.body.depositos : [];
  const depositoPrincipalId =
    req.body?.deposito_principal_id === undefined ||
    req.body?.deposito_principal_id === null ||
    req.body?.deposito_principal_id === ''
      ? null
      : Number(req.body.deposito_principal_id);
  try {
    const { target } = await assertUserManagementAllowed(req, id);
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    const requestedDepositoIds = items
      .map((item) => Number(item?.deposito_id ?? item?.id))
      .filter((value) => Number.isInteger(value) && value > 0);
    await assertDepositoIdsAllowed(req, [
      ...requestedDepositoIds,
      Number.isInteger(depositoPrincipalId) && depositoPrincipalId > 0
        ? depositoPrincipalId
        : null,
    ]);
    await userDeps.setUserDepositos(id, items, {
      deposito_principal_id:
        Number.isInteger(depositoPrincipalId) && depositoPrincipalId > 0
          ? depositoPrincipalId
          : null,
    });
    res.json({ ok: true });
  } catch (e) {
    res
      .status(e.status || 500)
      .json({ error: e.message || 'No se pudieron actualizar los depositos del usuario' });
  }
}

async function listDeleted(req, res) {
  try {
    const scope = await getScopedUserManagementContext(req);
    const requestedRole = normalizeRoleName(req.query.role);
    if (scope.mode === 'restricted' && requestedRole && !isManageableRoleName(requestedRole)) {
      return res.json([]);
    }
    const rows = await users.list({
      q: req.query.q,
      role: req.query.role,
      roleNames:
        scope.mode === 'restricted' && !requestedRole ? MANAGEABLE_ROLE_NAMES : undefined,
      limit: req.query.limit,
      offset: req.query.offset,
      onlyDeleted: true,
      visibleDepositoIds: scope.mode === 'restricted' ? scope.depositIds : undefined,
      enforceVisibleDepositoSubset: scope.mode === 'restricted',
    });
    res.json(rows);
  } catch (e) {
    res
      .status(e.status || 500)
      .json({ error: e.message || 'No se pudo obtener la papelera de usuarios' });
  }
}

async function remove(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }

  if (Number(req.user?.sub || 0) === id) {
    return res.status(400).json({
      error: 'No puedes enviarte a papelera a ti mismo desde esta sesion',
      code: 'SELF_DELETE_FORBIDDEN',
    });
  }

  try {
    const { target } = await assertUserManagementAllowed(req, id);
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    const deleted = await users.softDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ message: 'Usuario enviado a papelera' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo eliminar el usuario' });
  }
}

async function restore(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  try {
    const { target } = await assertUserManagementAllowed(req, id, { includeDeleted: true });
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado en papelera' });
    const restored = await users.restore(id);
    if (!restored) return res.status(404).json({ error: 'Usuario no encontrado en papelera' });
    res.json({ message: 'Usuario restaurado' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo restaurar el usuario' });
  }
}

module.exports = {
  list,
  listVendedores,
  create: [...validateCreate, create],
  update: [...validateUpdate, update],
  listDeleted,
  remove,
  restore,
  roles,
  sellerPerformance,
  getUserDepositos,
  setUserDepositos,
};
