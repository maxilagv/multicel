const { query } = require('../db/pg');
const {
  buildDepositoForbiddenError,
  buildDepositoScopeError,
} = require('../lib/depositoScope');
const {
  buildClientVisibility,
  buildClientVisibilityClause,
  resolveClientVisibilityCapabilities,
} = require('../lib/clientVisibility');

async function hasVisibleClientAccess(req, clienteId) {
  const visibility = await buildClientVisibility(req);
  if (!visibility || visibility.mode === 'all') {
    return true;
  }

  const params = [clienteId];
  const capabilities = await resolveClientVisibilityCapabilities();
  const visibilityClause = buildClientVisibilityClause(params, visibility, 'c', capabilities);
  const { rows } = await query(
    `SELECT 1
       FROM clientes c
      WHERE c.id = $1
        AND c.deleted_at IS NULL
        AND ${visibilityClause}
      LIMIT 1`,
    params
  );
  return rows.length > 0;
}

function parseOptionalClientId(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return null;
  }
  const clienteId = Number(rawValue);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return NaN;
  }
  return clienteId;
}

function buildInvalidIdResponse(res, required, fieldName) {
  const label = fieldName || 'cliente_id';
  const message = required ? `${label} es requerido` : `${label} invalido`;
  return res.status(400).json({ error: message });
}

function createClienteAccessGuard(resolveRawClientId, { fieldName = 'cliente_id', required = true } = {}) {
  return async function clienteAccessGuard(req, res, next) {
    try {
      const rawValue = await resolveRawClientId(req);
      const clienteId = parseOptionalClientId(rawValue);
      if (clienteId === null) {
        if (!required) return next();
        return buildInvalidIdResponse(res, true, fieldName);
      }
      if (!Number.isInteger(clienteId) || clienteId <= 0) {
        return buildInvalidIdResponse(res, false, fieldName);
      }

      const allowed = await hasVisibleClientAccess(req, clienteId);
      if (!allowed) {
        const error = buildDepositoForbiddenError('No tienes permisos para operar sobre este cliente');
        return res.status(error.status).json({ error: error.message, code: error.code });
      }

      next();
    } catch (e) {
      if (e?.code === 'DEPOSITO_SCOPE_REQUIRED') {
        const error = buildDepositoScopeError(e.message);
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      next(e);
    }
  };
}

function requireClienteAccessParam(paramName = 'id') {
  return createClienteAccessGuard((req) => req.params?.[paramName], {
    fieldName: paramName,
    required: true,
  });
}

function requireClienteAccessQuery(fieldName = 'cliente_id', options = {}) {
  return createClienteAccessGuard((req) => req.query?.[fieldName], {
    fieldName,
    required: Boolean(options.required),
  });
}

function requireClienteAccessBody(fieldName = 'cliente_id', options = {}) {
  return createClienteAccessGuard((req) => req.body?.[fieldName], {
    fieldName,
    required: Boolean(options.required),
  });
}

module.exports = {
  requireClienteAccessParam,
  requireClienteAccessQuery,
  requireClienteAccessBody,
};
