const { query } = require('../db/pg');
const { columnExists, tableExists } = require('../db/schemaSupport');
const {
  buildDepositoScopeError,
  buildDepositoVisibility,
  getRequestRole,
  getRequestUserId,
  isGlobalRole,
} = require('./depositoScope');

function isOwnerScopedRole(role) {
  return role === 'vendedor';
}

async function resolveClientVisibilityCapabilities(client = null) {
  const runner = client?.query ? client : null;
  const [hasDepositoPrincipal, hasResponsableUsuario, hasClientesDepositos] = await Promise.all([
    columnExists('clientes', 'deposito_principal_id', runner),
    columnExists('clientes', 'responsable_usuario_id', runner),
    tableExists('clientes_depositos', runner),
  ]);

  return {
    hasDepositoPrincipal,
    hasResponsableUsuario,
    hasClientesDepositos,
  };
}

async function buildClientVisibility(req) {
  const role = getRequestRole(req);
  const userId = getRequestUserId(req);

  if (isGlobalRole(role)) {
    return { role, mode: 'all', userId, depositIds: [] };
  }

  if (isOwnerScopedRole(role)) {
    if (!userId) {
      throw buildDepositoScopeError('No se pudo determinar el responsable actual');
    }
    return { role, mode: 'owner', userId, depositIds: [] };
  }

  const depositoVisibility = await buildDepositoVisibility(req);
  if (depositoVisibility.mode !== 'restricted') {
    return { role, mode: 'all', userId, depositIds: [] };
  }
  if (!depositoVisibility.ids.length) {
    throw buildDepositoScopeError();
  }
  return {
    role,
    mode: 'deposit',
    userId,
    depositIds: depositoVisibility.ids,
  };
}

function buildClientVisibilityClause(
  params,
  visibility,
  clientAlias = 'c',
  capabilities = {}
) {
  if (!visibility || visibility.mode === 'all') {
    return null;
  }

  const hasDepositoPrincipal = capabilities.hasDepositoPrincipal !== false;
  const hasResponsableUsuario = capabilities.hasResponsableUsuario !== false;
  const hasClientesDepositos = capabilities.hasClientesDepositos !== false;

  if (visibility.mode === 'owner') {
    params.push(Number(visibility.userId));
    if (hasResponsableUsuario) {
      return `${clientAlias}.responsable_usuario_id = $${params.length}`;
    }
    return `EXISTS (
      SELECT 1
        FROM ventas cv
       WHERE cv.cliente_id = ${clientAlias}.id
         AND cv.usuario_id = $${params.length}
    )`;
  }

  const ids = Array.isArray(visibility.depositIds)
    ? visibility.depositIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    : [];

  if (!ids.length) {
    throw buildDepositoScopeError();
  }

  const start = params.length + 1;
  params.push(...ids);
  const marks = ids.map((_, index) => `$${start + index}`).join(', ');
  const clauses = [];

  if (hasDepositoPrincipal) {
    clauses.push(`${clientAlias}.deposito_principal_id IN (${marks})`);
  }
  if (hasClientesDepositos) {
    clauses.push(`EXISTS (
      SELECT 1
        FROM clientes_depositos cd
       WHERE cd.cliente_id = ${clientAlias}.id
         AND cd.deposito_id IN (${marks})
    )`);
  }
  clauses.push(`EXISTS (
      SELECT 1
        FROM ventas cv
       WHERE cv.cliente_id = ${clientAlias}.id
         AND cv.deposito_id IN (${marks})
    )`);

  return `(${clauses.join('\n    OR ')})`;
}

async function filterVisibleClientIds(req, rawClientIds) {
  const clientIds = Array.from(
    new Set(
      (rawClientIds || [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );

  if (!clientIds.length) return [];

  const visibility = await buildClientVisibility(req);
  if (visibility.mode === 'all') return clientIds;

  const params = [...clientIds];
  const marks = clientIds.map((_, index) => `$${index + 1}`).join(', ');
  const capabilities = await resolveClientVisibilityCapabilities();
  const visibilityClause = buildClientVisibilityClause(params, visibility, 'c', capabilities);
  const { rows } = await query(
    `SELECT c.id
       FROM clientes c
      WHERE c.id IN (${marks})
        AND ${visibilityClause}`,
    params
  );

  return (rows || [])
    .map((row) => Number(row.id))
    .filter((value) => Number.isInteger(value) && value > 0);
}

module.exports = {
  isOwnerScopedRole,
  buildClientVisibility,
  buildClientVisibilityClause,
  filterVisibleClientIds,
  resolveClientVisibilityCapabilities,
};
