const { ZodError } = require('zod');

function toExpressErrors(error) {
  if (!(error instanceof ZodError)) return [];
  return error.issues.map((issue) => ({
    param: issue.path.join('.') || 'body',
    msg: issue.message,
  }));
}

function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body || {});
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Datos invalidos',
          code: 'VALIDATION_ERROR',
          errors: toExpressErrors(error),
        });
      }
      return next(error);
    }
  };
}

module.exports = {
  validateBody,
};
