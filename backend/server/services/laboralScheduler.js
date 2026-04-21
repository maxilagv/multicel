const laboralRepo = require('../db/repositories/laboralRepository');
const emailService = require('./emailService');
const logger = require('../lib/logger');
const { query } = require('../db/pg');

const TICK_MS = 6 * 60 * 60 * 1000;
let timer = null;

async function yaEnviadoHoy(carpetaId) {
  const { rows } = await query(
    `SELECT id
       FROM email_log
      WHERE template_code = 'laboral_recordatorio_ausentismo'
        AND entity_type = 'carpeta_laboral'
        AND entity_id = $1
        AND DATE(created_at) = CURDATE()
      LIMIT 1`,
    [Number(carpetaId)]
  );
  return Boolean(rows[0]);
}

async function tick() {
  try {
    const rows = await laboralRepo.listAusentismoPendiente({ dias: 7 });
    for (const row of rows) {
      if (!row.cliente_pagador_email) continue;
      if (await yaEnviadoHoy(row.id)) continue;

      await emailService.sendTemplateEmail({
        templateCode: 'laboral_recordatorio_ausentismo',
        to: row.cliente_pagador_email,
        toName: row.cliente_pagador_nombre,
        variables: {
          empleado_nombre: row.empleado_nombre,
          destinatario_nombre: row.cliente_pagador_nombre,
          proximo_control_fecha: row.proximo_control_fecha,
          empresa_nombre: row.cliente_pagador_nombre,
        },
        entityType: 'carpeta_laboral',
        entityId: row.id,
      });
    }
  } catch (error) {
    logger.error({ err: error }, '[laboralScheduler] tick');
  }
}

function startLaboralScheduler() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
  setImmediate(tick);
  logger.info('[laboralScheduler] Iniciado.');
}

function stopLaboralScheduler() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = {
  startLaboralScheduler,
  stopLaboralScheduler,
};
