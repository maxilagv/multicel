function requireFeature(feature) {
  return async function featureGuard(req, res, next) {
    return next();
  };
}

module.exports = { requireFeature };
