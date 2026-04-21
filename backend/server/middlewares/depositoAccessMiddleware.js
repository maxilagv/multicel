const { query } = require('../db/pg');
const {
  assertDepositoIdsAllowed,
  buildDepositoForbiddenError,
  buildDepositoScopeError,
  buildDepositoVisibility,
} = require('../lib/depositoScope');
const { buildSaleVisibility } = require('../lib/saleVisibility');

function getUsuarioIdFromReq(req) {
  if (req.authUser && req.authUser.id) {
    const n = Number(req.authUser.id);
    if (Number.isInteger(n) && n > 0) return n;
  }
  if (req.user && req.user.sub) {
    const n = Number(req.user.sub);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

function extractIdsFromBody(req, keys) {
  const ids = [];
  for (const key of keys) {
    const raw = req.body && req.body[key];
    if (raw == null) continue;
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) ids.push(n);
  }
  return Array.from(new Set(ids));
}

function requireDepositoAccessFromBody(keys) {
  return async function depositoAccessGuard(req, res, next) {
    try {
      const usuarioId = getUsuarioIdFromReq(req);
      if (!usuarioId) {
        return res.status(401).json({ error: 'No autenticado' });
      }
      const ids = extractIdsFromBody(req, keys);
      if (!ids.length) return next();

      await assertDepositoIdsAllowed(req, ids);
      next();
    } catch (e) {
      if (e?.status) {
        return res.status(e.status).json({ error: e.message, code: e.code || null });
      }
      next(e);
    }
  };
}

async function requireDepositoAccessForVenta(req, res, next) {
  try {
    const usuarioId = getUsuarioIdFromReq(req);
    if (!usuarioId) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    const ventaId = Number(req.params.id);
    if (!Number.isInteger(ventaId) || ventaId <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const { rows } = await query(
      `SELECT v.deposito_id,
              v.usuario_id,
              v.vendedor_perfil_id,
              vp.usuario_id AS vendedor_usuario_id
         FROM ventas v
    LEFT JOIN vendedor_perfiles vp ON vp.id = v.vendedor_perfil_id
        WHERE v.id = $1`,
      [ventaId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    const venta = rows[0];
    const saleVisibility = await buildSaleVisibility(req);

    if (saleVisibility.mode === 'owner') {
      if (Number(venta.usuario_id || 0) !== Number(saleVisibility.userId || 0)) {
        if (Number(venta.vendedor_usuario_id || 0) !== Number(saleVisibility.userId || 0)) {
          return res.status(403).json({
            error: 'No tienes permisos para operar sobre esta venta',
            code: 'SALE_FORBIDDEN',
          });
        }
      }
      return next();
    }

    const depositoId = venta.deposito_id;
    if (!depositoId) return next();

    if (saleVisibility.mode === 'deposit') {
      if (!saleVisibility.depositIds.length) {
        const error = buildDepositoScopeError();
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      if (!saleVisibility.depositIds.includes(Number(depositoId))) {
        const error = buildDepositoForbiddenError();
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      return next();
    }

    const visibility = await buildDepositoVisibility(req);
    if (visibility.mode === 'restricted') {
      if (!visibility.ids.length) {
        const error = buildDepositoScopeError();
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      if (!visibility.ids.includes(Number(depositoId))) {
        const error = buildDepositoForbiddenError();
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
    }
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = {
  requireDepositoAccessFromBody,
  requireDepositoAccessForVenta,
};
