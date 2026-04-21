const {
  buildDepositoScopeError,
  buildDepositoVisibility,
  getRequestRole,
  getRequestUserId,
  isGlobalRole,
} = require('./depositoScope');

function isOwnerScopedSaleRole(role) {
  return role === 'vendedor';
}

async function buildSaleVisibility(req) {
  const role = getRequestRole(req);
  const userId = getRequestUserId(req);

  if (isGlobalRole(role)) {
    return { role, mode: 'all', userId, depositIds: [] };
  }

  if (isOwnerScopedSaleRole(role)) {
    if (!userId) {
      throw buildDepositoScopeError('No se pudo determinar el vendedor actual');
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

function buildSaleVisibilityClause(params, visibility, saleAlias = 'v') {
  if (!visibility || visibility.mode === 'all') return null;

  if (visibility.mode === 'owner') {
    params.push(Number(visibility.userId));
    return `(
      ${saleAlias}.usuario_id = $${params.length}
      OR EXISTS (
        SELECT 1
          FROM vendedor_perfiles svp
         WHERE svp.id = ${saleAlias}.vendedor_perfil_id
           AND svp.usuario_id = $${params.length}
      )
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
  return `${saleAlias}.deposito_id IN (${marks})`;
}

module.exports = {
  isOwnerScopedSaleRole,
  buildSaleVisibility,
  buildSaleVisibilityClause,
};
