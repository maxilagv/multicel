function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function getByPath(source, path) {
  const segments = String(path || '')
    .split('.')
    .map((segment) => normalizeKey(segment))
    .filter(Boolean);

  let current = source;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') return undefined;

    const entry = Object.entries(current).find(
      ([key]) => normalizeKey(key) === segment
    );
    if (!entry) return undefined;
    current = entry[1];
  }
  return current;
}

function hasInternalPermission(internalAuth, permissionKey) {
  const permisos = internalAuth?.permisos || {};
  if (permisos.all === true) return true;

  const candidates = [
    permissionKey,
    String(permissionKey || '').replace(/_/g, '.'),
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    if (getByPath(permisos, candidate) === true) return true;
    if (getByPath(permisos, `${candidate}.read`) === true) return true;
    if (getByPath(permisos, `${candidate}.access`) === true) return true;
  }

  return false;
}

function requireInternalPermission(permissionKey) {
  return function internalPermissionGuard(req, res, next) {
    if (hasInternalPermission(req.internalAuth, permissionKey)) {
      return next();
    }
    return res.status(403).json({
      error: 'La credencial interna no tiene permiso para este recurso',
    });
  };
}

module.exports = {
  hasInternalPermission,
  requireInternalPermission,
};
