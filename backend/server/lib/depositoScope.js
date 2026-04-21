const userDeps = require('../db/repositories/usuarioDepositoRepository');

function parsePositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function getRequestRole(req) {
  const raw = req?.authUser?.rol || req?.user?.role || null;
  if (!raw) return null;
  return String(raw).trim().toLowerCase();
}

function getRequestUserId(req) {
  return parsePositiveInt(req?.authUser?.id || req?.user?.sub || null);
}

function getTokenDepositoId(req) {
  return parsePositiveInt(req?.user?.deposito_id || null);
}

function isGlobalRole(role) {
  return role === 'admin' || role === 'gerente';
}

function isSucursalScopedRole(role) {
  return role === 'gerente_sucursal';
}

function canViewSensitiveProductData(role) {
  return role === 'admin' || role === 'gerente';
}

function buildDepositoScopeError(message = 'No tienes una sucursal asignada') {
  const error = new Error(message);
  error.status = 403;
  error.code = 'DEPOSITO_SCOPE_REQUIRED';
  return error;
}

function buildDepositoForbiddenError(message = 'No tienes permisos para operar sobre este deposito') {
  const error = new Error(message);
  error.status = 403;
  error.code = 'DEPOSITO_FORBIDDEN';
  return error;
}

async function buildDepositoVisibility(req) {
  const role = getRequestRole(req);
  if (isGlobalRole(role)) {
    return { role, mode: 'all', ids: [] };
  }

  if (isSucursalScopedRole(role)) {
    const tokenDepositoId = getTokenDepositoId(req);
    if (tokenDepositoId) {
      return { role, mode: 'restricted', ids: [tokenDepositoId] };
    }
    const userId = getRequestUserId(req);
    const assignedIds = userId ? await userDeps.getUserDepositoIds(userId) : [];
    return { role, mode: 'restricted', ids: assignedIds };
  }

  const userId = getRequestUserId(req);
  if (!userId) {
    return { role, mode: 'all', ids: [] };
  }
  const assignedIds = await userDeps.getUserDepositoIds(userId);
  if (!assignedIds.length) {
    return { role, mode: 'all', ids: [] };
  }
  return { role, mode: 'restricted', ids: assignedIds };
}

async function resolveScopedDepositoId(req, rawDepositoId, options = {}) {
  const visibility = await buildDepositoVisibility(req);
  const requestedId = parsePositiveInt(rawDepositoId);

  if (visibility.mode !== 'restricted') {
    return requestedId;
  }

  if (!visibility.ids.length) {
    throw buildDepositoScopeError();
  }

  if (requestedId && !visibility.ids.includes(requestedId)) {
    throw buildDepositoForbiddenError();
  }

  if (requestedId) return requestedId;
  return visibility.ids[0] || null;
}

async function assertDepositoIdsAllowed(req, rawIds) {
  const visibility = await buildDepositoVisibility(req);
  if (visibility.mode !== 'restricted') return;
  if (!visibility.ids.length) throw buildDepositoScopeError();

  const requestedIds = Array.from(
    new Set((rawIds || []).map((value) => parsePositiveInt(value)).filter(Boolean))
  );
  if (!requestedIds.length) return;

  const allowedSet = new Set(visibility.ids);
  for (const depositoId of requestedIds) {
    if (!allowedSet.has(depositoId)) {
      throw buildDepositoForbiddenError();
    }
  }
}

module.exports = {
  parsePositiveInt,
  getRequestRole,
  getRequestUserId,
  getTokenDepositoId,
  isGlobalRole,
  isSucursalScopedRole,
  canViewSensitiveProductData,
  buildDepositoScopeError,
  buildDepositoForbiddenError,
  buildDepositoVisibility,
  resolveScopedDepositoId,
  assertDepositoIdsAllowed,
};
