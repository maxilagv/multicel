const rules = require('../db/repositories/approvalRuleRepository');
const approvals = require('../db/repositories/approvalsRepository');
const { pool } = require('../db/pg');

function toNumber(x) { const n = Number(x); return Number.isFinite(n) ? n : NaN; }
const missingApprovalInfraWarnings = new Set();

function isMissingApprovalInfraError(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const message = String(err.sqlMessage || err.message || '').toLowerCase();
  if (code !== 'ER_NO_SUCH_TABLE' && !message.includes("doesn't exist")) return false;
  return message.includes('reglas_aprobacion') || message.includes('aprobaciones');
}

function warnMissingApprovalInfra(err) {
  const msg = String(err?.sqlMessage || err?.message || 'Infra de aprobaciones no disponible');
  if (missingApprovalInfraWarnings.has(msg)) return;
  missingApprovalInfraWarnings.add(msg);
  console.warn(`[approvalMiddleware] Aprobaciones desactivadas temporalmente: ${msg}`);
}

// Factory: requireApproval('rule_key', async (req, regla) => ({ requires, entity, entityId, motivo, payload }))
function requireApproval(ruleKey, evaluator) {
  return async function(req, res, next) {
    try {
      let rule = null;
      try {
        rule = await rules.findActiveByKey(ruleKey);
      } catch (e) {
        if (isMissingApprovalInfraError(e)) {
          warnMissingApprovalInfra(e);
          return next();
        }
        throw e;
      }
      if (!rule) return next();

      const evalRes = await evaluator(req, rule);
      if (!evalRes || evalRes.requires !== true) return next();

      const userId = req.user?.sub ? Number(req.user.sub) : null;
      const { entity, entityId, motivo, payload } = evalRes;
      // Intentar consumir una aprobación aprobada que coincida con este cambio
      try {
        const consumed = await approvals.consumeApprovedMatch({
          regla_id: rule.id,
          entidad: entity,
          entidad_id: entityId,
          payload: payload || null,
        });
        if (consumed) return next();
      } catch (_) {}
      try {
        const r = await approvals.createPending({
          regla_id: rule.id,
          solicitado_por_usuario_id: userId,
          entidad: entity,
          entidad_id: entityId,
          motivo,
          payload,
        });
        return res.status(403).json({ error: 'Pendiente de aprobación', aprobacion_id: r.id, regla: rule.clave });
      } catch (e) {
        if (isMissingApprovalInfraError(e)) {
          warnMissingApprovalInfra(e);
          return next();
        }
        throw e;
      }
    } catch (e) {
      next(e);
    }
  };
}

// Ejemplo de evaluador: cambios de precio en productos con umbral porcentual
async function productPriceChangeEvaluator(req, rule) {
  if (req.authUser?.rol === 'admin') return { requires: false };
  const id = Number(req.params?.id);
  const newPrice = toNumber(req.body?.price);
  if (!id || !Number.isFinite(newPrice)) return { requires: false };
  const { rows } = await pool.query('SELECT precio_venta::float AS price FROM productos WHERE id = $1', [id]);
  if (!rows.length) return { requires: false };
  const current = toNumber(rows[0].price);
  if (!Number.isFinite(current)) return { requires: false };
  if (current === 0 && newPrice > 0) {
    return { requires: true, entity: 'producto', entityId: id, motivo: 'Nuevo precio desde 0', payload: { old: current, new: newPrice } };
  }
  if (current === 0 && newPrice === 0) return { requires: false };
  const diff = newPrice - current;
  const pct = Math.abs(diff) / (current || 1) * 100;
  const threshold = Number(rule.condicion?.percent_threshold || 10);
  if (pct >= threshold) {
    return { requires: true, entity: 'producto', entityId: id, motivo: `Cambio de precio ${pct.toFixed(1)}% (umbral ${threshold}%)`, payload: { old: current, new: newPrice } };
  }
  return { requires: false };
}

module.exports = { requireApproval, productPriceChangeEvaluator };
