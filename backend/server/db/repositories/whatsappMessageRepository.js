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

async function createMessage({
  clienteId = null,
  telefonoE164,
  direccion,
  tipo = 'texto',
  contenido = null,
  plantillaCodigo = null,
  plantillaVariables = null,
  mediaUrl = null,
  provider = 'twilio',
  providerMessageSid = null,
  providerStatus = null,
  providerErrorCode = null,
  campaignId = null,
  automatizado = false,
  automatizacionNombre = null,
  payload = null,
}) {
  const { rows } = await query(
    `INSERT INTO whatsapp_mensajes(
       cliente_id,
       telefono_e164,
       direccion,
       tipo,
       contenido,
       plantilla_codigo,
       plantilla_variables,
       media_url,
       provider,
       provider_message_sid,
       provider_status,
       provider_error_code,
       campaign_id,
       automatizado,
       automatizacion_nombre,
       payload_json
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON DUPLICATE KEY UPDATE
       cliente_id = VALUES(cliente_id),
       contenido = VALUES(contenido),
       plantilla_codigo = VALUES(plantilla_codigo),
       plantilla_variables = VALUES(plantilla_variables),
       media_url = VALUES(media_url),
       provider_status = VALUES(provider_status),
       provider_error_code = VALUES(provider_error_code),
       campaign_id = VALUES(campaign_id),
       automatizado = VALUES(automatizado),
       automatizacion_nombre = VALUES(automatizacion_nombre),
       payload_json = VALUES(payload_json),
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [
      clienteId == null ? null : Number(clienteId),
      String(telefonoE164 || '').trim(),
      String(direccion || 'enviado').trim(),
      String(tipo || 'texto').trim(),
      contenido == null ? null : String(contenido),
      plantillaCodigo || null,
      plantillaVariables == null ? null : encodeJson(plantillaVariables),
      mediaUrl || null,
      provider || 'twilio',
      providerMessageSid || null,
      providerStatus || null,
      providerErrorCode || null,
      campaignId == null ? null : Number(campaignId),
      automatizado ? 1 : 0,
      automatizacionNombre || null,
      payload == null ? null : encodeJson(payload),
    ]
  );
  return rows[0] || null;
}

async function updateStatusByProviderSid(provider, providerMessageSid, status, errorCode = null, payload = null) {
  if (!providerMessageSid) return null;
  const { rows } = await query(
    `UPDATE whatsapp_mensajes
        SET provider_status = $3,
            provider_error_code = $4,
            payload_json = COALESCE($5, payload_json),
            updated_at = CURRENT_TIMESTAMP
      WHERE provider = $1
        AND provider_message_sid = $2
      RETURNING id`,
    [
      provider || 'twilio',
      providerMessageSid,
      status || null,
      errorCode || null,
      payload == null ? null : encodeJson(payload),
    ]
  );
  return rows[0] || null;
}

async function listByCliente(clienteId, { limit = 30, offset = 0 } = {}) {
  const boundedLimit = Math.min(Math.max(Number(limit) || 30, 1), 200);
  const boundedOffset = Math.max(Number(offset) || 0, 0);
  const id = Number(clienteId);

  const { rows } = await query(
    `SELECT wm.id,
            wm.cliente_id,
            wm.telefono_e164,
            wm.direccion,
            wm.tipo,
            wm.contenido,
            wm.plantilla_codigo,
            wm.plantilla_variables,
            wm.media_url,
            wm.provider,
            wm.provider_message_sid,
            wm.provider_status,
            wm.provider_error_code,
            wm.campaign_id,
            wm.automatizado,
            wm.automatizacion_nombre,
            wm.payload_json,
            wm.created_at,
            wm.updated_at
       FROM whatsapp_mensajes wm
       LEFT JOIN clientes c ON c.id = $1
      WHERE wm.cliente_id = $1
         OR (c.telefono_e164 IS NOT NULL AND wm.telefono_e164 = c.telefono_e164)
      ORDER BY wm.created_at DESC, wm.id DESC
      LIMIT $2
      OFFSET $3`,
    [id, boundedLimit, boundedOffset]
  );

  return (rows || []).map((row) => ({
    ...row,
    cliente_id: row.cliente_id != null ? Number(row.cliente_id) : null,
    campaign_id: row.campaign_id != null ? Number(row.campaign_id) : null,
    automatizado: Boolean(row.automatizado),
    plantilla_variables: decodeJson(row.plantilla_variables, null),
    payload_json: decodeJson(row.payload_json, null),
  }));
}

module.exports = {
  createMessage,
  listByCliente,
  updateStatusByProviderSid,
};
