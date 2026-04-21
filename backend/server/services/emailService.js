let sgMail = null;
let sendGridReady = false;
try {
  // eslint-disable-next-line global-require
  sgMail = require('@sendgrid/mail');
  if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    sendGridReady = true;
  }
} catch {
  sendGridReady = false;
}

const { query } = require('../db/pg');
const logger = require('../lib/logger');

function interpolate(template, variables = {}) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = variables[key];
    return value == null ? '' : String(value);
  });
}

function resolveFrom() {
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME || process.env.SMTP_FROM_NAME || 'Multicell';
  if (!fromEmail) return null;
  return `${fromName} <${fromEmail}>`;
}

async function getTemplate(code) {
  const { rows } = await query(
    `SELECT code, nombre, subject_template, body_template
       FROM email_templates
      WHERE code = $1
        AND activo = TRUE
      LIMIT 1`,
    [code]
  );
  return rows[0] || null;
}

async function logEmail({
  template_code,
  entity_type,
  entity_id,
  destinatario_email,
  destinatario_nombre,
  asunto,
  cuerpo_preview,
  provider,
  status,
  error_message,
  payload_json,
  sent_at,
  created_by,
}) {
  const { rows } = await query(
    `INSERT INTO email_log(
       template_code,
       entity_type,
       entity_id,
       destinatario_email,
       destinatario_nombre,
       asunto,
       cuerpo_preview,
       provider,
       status,
       error_message,
       payload_json,
       sent_at,
       created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      template_code || null,
      entity_type || null,
      entity_id || null,
      destinatario_email,
      destinatario_nombre || null,
      asunto,
      cuerpo_preview || null,
      provider || null,
      status || 'queued',
      error_message || null,
      payload_json || null,
      sent_at || null,
      created_by || null,
    ]
  );
  return rows[0]?.id || null;
}

async function sendTemplateEmail({
  templateCode,
  to,
  toName,
  variables = {},
  entityType,
  entityId,
  createdBy,
}) {
  const template = await getTemplate(templateCode);
  if (!template) {
    const error = new Error(`Plantilla de email no encontrada: ${templateCode}`);
    error.status = 404;
    throw error;
  }

  const subject = interpolate(template.subject_template, variables);
  const body = interpolate(template.body_template, variables);
  const from = resolveFrom();
  const provider = sendGridReady && from ? 'sendgrid' : 'simulado';

  const logId = await logEmail({
    template_code: templateCode,
    entity_type: entityType,
    entity_id: entityId,
    destinatario_email: to,
    destinatario_nombre: toName || null,
    asunto: subject,
    cuerpo_preview: body.slice(0, 1000),
    provider,
    status: 'queued',
    payload_json: variables,
    created_by: createdBy || null,
  });

  try {
    if (sendGridReady && from) {
      await sgMail.send({
        to: toName ? `${toName} <${to}>` : to,
        from,
        subject,
        text: body,
        html: body
          .split('\n')
          .map((line) => `<p>${line}</p>`)
          .join(''),
      });
    } else {
      logger.warn(
        { to, subject, templateCode },
        '[emailService] SendGrid no configurado, se simula el envio.'
      );
    }

    await query(
      `UPDATE email_log
          SET status = 'sent',
              sent_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [logId]
    );

    return { ok: true, simulated: !(sendGridReady && from), logId };
  } catch (error) {
    await query(
      `UPDATE email_log
          SET status = 'failed',
              error_message = $2
        WHERE id = $1`,
      [logId, error?.message || 'Error de envio']
    );
    throw error;
  }
}

module.exports = {
  getTemplate,
  sendTemplateEmail,
};
