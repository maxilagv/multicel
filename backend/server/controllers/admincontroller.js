const auditService = require('../services/auditService');

async function listAuditLog(req, res) {
  try {
    const rows = await auditService.listDetailed({
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo obtener el audit log' });
  }
}

module.exports = {
  listAuditLog,
};
