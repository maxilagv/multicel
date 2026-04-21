const { query } = require('../db/pg');
const userDeps = require('../db/repositories/usuarioDepositoRepository');

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

      const allowedIds = await userDeps.getUserDepositoIds(usuarioId);
      // Si el usuario no tiene restricciones configuradas, permitir todos los depósitos
      if (!allowedIds.length) return next();
      const allowedSet = new Set(allowedIds);
      for (const depId of ids) {
        if (!allowedSet.has(depId)) {
          return res
            .status(403)
            .json({ error: 'No tienes permisos para operar sobre este depósito' });
        }
      }
      next();
    } catch (e) {
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
      'SELECT deposito_id FROM ventas WHERE id = $1',
      [ventaId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    const depositoId = rows[0].deposito_id;
    // Ventas antiguas podrían no tener deposito_id; en ese caso no aplicamos restricción
    if (!depositoId) return next();

    const allowedIds = await userDeps.getUserDepositoIds(usuarioId);
    if (!allowedIds.length) return next();
    if (!allowedIds.includes(Number(depositoId))) {
      return res
        .status(403)
        .json({ error: 'No tienes permisos para operar sobre este depósito' });
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

