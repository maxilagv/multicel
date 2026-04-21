const { query } = require('../../db/pg');

function encodeJson(value) {
  try {
    return JSON.stringify(value == null ? {} : value);
  } catch {
    return '{}';
  }
}

function decodeJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function createPdfExport({
  mode = 'precios',
  priceType = null,
  fileName = null,
  fileUrl = null,
  fileSizeBytes = null,
  checksumSha256 = null,
  metadata = {},
  createdBy = null,
} = {}) {
  const { rows } = await query(
    `INSERT INTO catalog_pdf_exports(
       modo, price_type, file_name, file_url, file_size_bytes, checksum_sha256, status, metadata_json, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,'generated',$7,$8)
     RETURNING id`,
    [
      mode,
      priceType || null,
      fileName || null,
      fileUrl || null,
      fileSizeBytes == null ? null : Number(fileSizeBytes),
      checksumSha256 || null,
      encodeJson(metadata || {}),
      createdBy || null,
    ]
  );
  return rows[0] || null;
}

async function createCampaign({
  nombre,
  descripcion = null,
  pdfExportId = null,
  pdfUrl = null,
  plantillaCodigo = 'catalogo_pdf',
  mensajeTexto = null,
  metadata = {},
  createdBy = null,
}) {
  const { rows } = await query(
    `INSERT INTO whatsapp_campaigns(
       nombre, descripcion, canal, estado, pdf_export_id, pdf_url, plantilla_codigo, mensaje_texto, metadata_json, created_by
     ) VALUES ($1,$2,'whatsapp','draft',$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      String(nombre || '').trim(),
      descripcion ? String(descripcion).trim() : null,
      pdfExportId || null,
      pdfUrl || null,
      plantillaCodigo || 'catalogo_pdf',
      mensajeTexto ? String(mensajeTexto).trim() : null,
      encodeJson(metadata || {}),
      createdBy || null,
    ]
  );
  return rows[0] || null;
}

async function addCampaignRecipients(campaignId, recipients = []) {
  const inserted = [];
  for (const recipient of recipients) {
    const { rows } = await query(
      `INSERT INTO whatsapp_campaign_recipients(
         campaign_id, cliente_id, destino_input, destino_e164, estado, metadata_json
       ) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [
        Number(campaignId),
        recipient.cliente_id ? Number(recipient.cliente_id) : null,
        recipient.destino_input || null,
        recipient.destino_e164 || null,
        recipient.estado || 'pending',
        encodeJson(recipient.metadata || {}),
      ]
    );
    if (rows[0]) inserted.push(rows[0]);
  }
  return inserted;
}

async function setCampaignStatus(id, estado) {
  await query(
    `UPDATE whatsapp_campaigns
        SET estado = $2, sent_at = CASE WHEN $2 IN ('sent','partial','failed') THEN CURRENT_TIMESTAMP ELSE sent_at END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [Number(id), String(estado || 'draft')]
  );
}

/**
 * Claim atomico: marca la fila como sending solo si estaba en pending.
 * Incrementa attempts y registra locked_at para deteccion de orphans.
 * Si affectedRows = 0 otro worker ya la reclamo — el caller debe ignorarla.
 */
async function setRecipientSending(id, provider = null) {
  const { rows } = await query(
    `UPDATE whatsapp_campaign_recipients
        SET estado     = 'sending',
            attempts   = attempts + 1,
            locked_at  = CURRENT_TIMESTAMP,
            provider   = $2,
            updated_at = CURRENT_TIMESTAMP
      WHERE id    = $1
        AND estado = 'pending'
      RETURNING id, attempts, max_attempts`,
    [Number(id), provider || null]
  );
  return rows[0] || null;
}

async function markRecipientSent(id, providerMessageSid = null, providerMessageId = null) {
  await query(
    `UPDATE whatsapp_campaign_recipients
        SET estado               = 'sent',
            provider_message_sid = $2,
            provider_message_id  = $3,
            locked_at            = NULL,
            sent_at              = CURRENT_TIMESTAMP,
            error_message        = NULL,
            error_code           = NULL,
            updated_at           = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [Number(id), providerMessageSid || null, providerMessageId || null]
  );
}

async function markRecipientFailed(id, errorMessage, errorCode = null) {
  await query(
    `UPDATE whatsapp_campaign_recipients
        SET estado        = 'failed',
            locked_at     = NULL,
            error_message = $2,
            error_code    = $3,
            updated_at    = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [Number(id), String(errorMessage || 'Error de envio'), errorCode || null]
  );
}

/**
 * Devuelve la fila a pending para reintento con backoff exponencial.
 * nextAttemptAt: Date — cuando debe procesarse (calculado por el dispatcher).
 * errorCode: string — codigo estructurado (ej: DISCONNECTED, TIMEOUT).
 */
async function setRecipientPending(id, errorMessage = null, nextAttemptAt = null, errorCode = null) {
  const nextAt = nextAttemptAt instanceof Date
    ? nextAttemptAt.toISOString().slice(0, 19).replace('T', ' ')
    : null;
  await query(
    `UPDATE whatsapp_campaign_recipients
        SET estado          = 'pending',
            locked_at       = NULL,
            next_attempt_at = $3,
            error_message   = $2,
            error_code      = $4,
            updated_at      = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [Number(id), errorMessage ? String(errorMessage) : null, nextAt, errorCode || null]
  );
}

async function addDeliveryEvent({
  campaignRecipientId,
  providerEventId = null,
  providerStatus = null,
  payload = {},
}) {
  await query(
    `INSERT INTO whatsapp_delivery_events(
       campaign_recipient_id, provider_event_id, provider_status, payload_json
     ) VALUES ($1,$2,$3,$4)`,
    [Number(campaignRecipientId), providerEventId || null, providerStatus || null, encodeJson(payload || {})]
  );
}

async function updateRecipientStatusByProviderSid(providerMessageSid, providerStatus, payload = {}, errorMessage = null) {
  if (!providerMessageSid) return null;

  const normalized = String(providerStatus || '').trim().toLowerCase();
  let estado = null;
  if (['queued', 'accepted', 'scheduled', 'sending', 'sent', 'delivered', 'read'].includes(normalized)) {
    estado = 'sent';
  } else if (['failed', 'undelivered', 'canceled'].includes(normalized)) {
    estado = 'failed';
  }

  if (estado) {
    await query(
      `UPDATE whatsapp_campaign_recipients
          SET estado = $2,
              error_message = $3,
              updated_at = CURRENT_TIMESTAMP
        WHERE provider_message_sid = $1`,
      [providerMessageSid, estado, errorMessage || null]
    );
  }

  const { rows } = await query(
    `SELECT id
       FROM whatsapp_campaign_recipients
      WHERE provider_message_sid = $1
      LIMIT 1`,
    [providerMessageSid]
  );

  const recipientId = rows[0]?.id || null;
  if (recipientId) {
    await addDeliveryEvent({
      campaignRecipientId: recipientId,
      providerEventId: providerMessageSid,
      providerStatus: providerStatus || null,
      payload: payload || {},
    });
  }

  return recipientId ? { id: recipientId } : null;
}

async function listPendingRecipients({ limit = 30 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 200);
  const { rows } = await query(
    `SELECT r.id,
            r.campaign_id,
            r.cliente_id,
            r.destino_input,
            r.destino_e164,
            r.estado,
            r.attempts,
            r.max_attempts,
            c.pdf_export_id,
            c.pdf_url,
            c.mensaje_texto,
            c.nombre AS campaign_name,
            e.file_name AS pdf_file_name,
            e.file_url AS pdf_file_url
       FROM whatsapp_campaign_recipients r
       JOIN whatsapp_campaigns c ON c.id = r.campaign_id
  LEFT JOIN catalog_pdf_exports e ON e.id = c.pdf_export_id
      WHERE r.estado = 'pending'
        AND c.estado IN ('queued', 'sending')
        AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= CURRENT_TIMESTAMP)
      ORDER BY r.id ASC
      LIMIT $1`,
    [lim]
  );
  return rows || [];
}

/**
 * Recupera filas huerfanas: estaban en sending con locked_at expirado.
 * Indica que el proceso murio antes de actualizar el estado.
 * Las devuelve a pending con next_attempt_at = ahora para reintento inmediato.
 */
async function recoverOrphanedRecipients({ lockMinutes = 5 } = {}) {
  const minutes = Math.max(1, Number(lockMinutes) || 5);
  await query(
    `UPDATE whatsapp_campaign_recipients
        SET estado          = 'pending',
            locked_at       = NULL,
            next_attempt_at = CURRENT_TIMESTAMP,
            updated_at      = CURRENT_TIMESTAMP
      WHERE estado    = 'sending'
        AND locked_at IS NOT NULL
        AND locked_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL $1 MINUTE)`,
    [minutes]
  );
}

async function listCampaigns({ limit = 50, offset = 0 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const { rows } = await query(
    `SELECT c.id,
            c.nombre,
            c.descripcion,
            c.estado,
            c.pdf_url,
            c.plantilla_codigo,
            c.mensaje_texto,
            c.created_at,
            c.updated_at,
            c.sent_at,
            (
              SELECT COUNT(*)
              FROM whatsapp_campaign_recipients r
              WHERE r.campaign_id = c.id
            ) AS total_recipients,
            (
              SELECT COUNT(*)
              FROM whatsapp_campaign_recipients r
              WHERE r.campaign_id = c.id AND r.estado = 'sent'
            ) AS sent_recipients,
            (
              SELECT COUNT(*)
              FROM whatsapp_campaign_recipients r
              WHERE r.campaign_id = c.id AND r.estado = 'failed'
            ) AS failed_recipients
       FROM whatsapp_campaigns c
      ORDER BY c.id DESC
      LIMIT $1 OFFSET $2`,
    [lim, off]
  );
  return rows || [];
}

async function getCampaignDetail(id) {
  const campaignId = Number(id);
  if (!Number.isInteger(campaignId) || campaignId <= 0) return null;

  const { rows } = await query(
    `SELECT c.id,
            c.nombre,
            c.descripcion,
            c.estado,
            c.pdf_url,
            c.plantilla_codigo,
            c.mensaje_texto,
            c.metadata_json,
            c.created_at,
            c.updated_at,
            c.sent_at
       FROM whatsapp_campaigns c
      WHERE c.id = $1
      LIMIT 1`,
    [campaignId]
  );
  if (!rows.length) return null;

  const { rows: recipients } = await query(
    `SELECT r.id,
            r.cliente_id,
            r.destino_input,
            r.destino_e164,
            r.estado,
            r.provider_message_sid,
            r.sent_at,
            r.error_message,
            r.metadata_json,
            r.created_at,
            r.updated_at,
            cl.nombre AS cliente_nombre,
            cl.apellido AS cliente_apellido
       FROM whatsapp_campaign_recipients r
  LEFT JOIN clientes cl ON cl.id = r.cliente_id
      WHERE r.campaign_id = $1
      ORDER BY r.id ASC`,
    [campaignId]
  );

  return {
    ...rows[0],
    metadata: decodeJson(rows[0].metadata_json, {}),
    recipients: (recipients || []).map((r) => ({
      ...r,
      metadata: decodeJson(r.metadata_json, {}),
    })),
  };
}

async function getCampaignStatusSummary(campaignId) {
  const { rows } = await query(
    `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN estado = 'sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN estado = 'failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN estado = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN estado = 'sending' THEN 1 ELSE 0 END) AS sending
      FROM whatsapp_campaign_recipients
      WHERE campaign_id = $1`,
    [Number(campaignId)]
  );
  return rows[0] || { total: 0, sent: 0, failed: 0, pending: 0, sending: 0 };
}

module.exports = {
  createPdfExport,
  createCampaign,
  addCampaignRecipients,
  setCampaignStatus,
  setRecipientSending,
  markRecipientSent,
  markRecipientFailed,
  setRecipientPending,
  addDeliveryEvent,
  updateRecipientStatusByProviderSid,
  listPendingRecipients,
  recoverOrphanedRecipients,
  listCampaigns,
  getCampaignDetail,
  getCampaignStatusSummary,
};
