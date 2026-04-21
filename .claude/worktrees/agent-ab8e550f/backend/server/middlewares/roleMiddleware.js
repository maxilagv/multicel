const users = require('../db/repositories/userRepository');

function requireRole(roles) {
  const required = Array.isArray(roles) ? roles : [roles];
  return async function roleGuard(req, res, next) {
    try {
      const user = req.user;
      if (!user || (!user.sub && !user.email)) {
        return res.status(401).json({ error: 'No autenticado' });
      }
      // Prefer sub (user id) from token
      let dbUser = null;
      if (user.sub) dbUser = await users.findById(user.sub);
      if (!dbUser && user.email) dbUser = await users.findByEmail(user.email);
      if (!dbUser || dbUser.activo === false) return res.status(403).json({ error: 'Usuario inactivo o no encontrado' });
      if (!dbUser.rol || !required.includes(dbUser.rol)) return res.status(403).json({ error: 'Permisos insuficientes' });
      req.authUser = dbUser; // attach hydrated user
      next();
    } catch (e) {
      next(e);
    }
  };
}

module.exports = { requireRole };

