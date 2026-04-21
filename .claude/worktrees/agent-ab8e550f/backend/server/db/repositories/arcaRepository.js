const { query } = require('../pg');

async function getConfig() {
  const { rows } = await query('SELECT * FROM arca_config ORDER BY id DESC LIMIT 1');
  return rows[0] || null;
}

async function upsertConfig(data) {
  const existing = await getConfig();
  if (!existing) {
    const { rows } = await query(
      `INSERT INTO arca_config(
        cuit, razon_social, condicion_iva, domicilio_fiscal, provincia, localidad, codigo_postal,
        ambiente, certificado_pem, clave_privada_pem, passphrase_enc, certificado_vto,
        permitir_sin_entrega, permitir_sin_pago, precios_incluyen_iva, activo
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [
        data.cuit,
        data.razon_social || null,
        data.condicion_iva || null,
        data.domicilio_fiscal || null,
        data.provincia || null,
        data.localidad || null,
        data.codigo_postal || null,
        data.ambiente || 'homologacion',
        data.certificado_pem || null,
        data.clave_privada_pem || null,
        data.passphrase_enc || null,
        data.certificado_vto || null,
        data.permitir_sin_entrega ? 1 : 0,
        data.permitir_sin_pago ? 1 : 0,
        data.precios_incluyen_iva != null ? (data.precios_incluyen_iva ? 1 : 0) : 1,
        data.activo != null ? (data.activo ? 1 : 0) : 1,
      ]
    );
    return rows[0];
  }

  const sets = [];
  const params = [];
  let p = 1;
  for (const [key, col] of Object.entries({
    cuit: 'cuit',
    razon_social: 'razon_social',
    condicion_iva: 'condicion_iva',
    domicilio_fiscal: 'domicilio_fiscal',
    provincia: 'provincia',
    localidad: 'localidad',
    codigo_postal: 'codigo_postal',
    ambiente: 'ambiente',
    certificado_pem: 'certificado_pem',
    clave_privada_pem: 'clave_privada_pem',
    passphrase_enc: 'passphrase_enc',
    certificado_vto: 'certificado_vto',
    permitir_sin_entrega: 'permitir_sin_entrega',
    permitir_sin_pago: 'permitir_sin_pago',
    precios_incluyen_iva: 'precios_incluyen_iva',
    activo: 'activo',
  })) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      sets.push(`${col} = $${p++}`);
      const val = data[key];
      if (key === 'permitir_sin_entrega' || key === 'permitir_sin_pago' || key === 'precios_incluyen_iva' || key === 'activo') {
        params.push(val ? 1 : 0);
      } else {
        params.push(val ?? null);
      }
    }
  }
  if (!sets.length) return existing;
  sets.push(`actualizado_en = CURRENT_TIMESTAMP`);
  params.push(existing.id);
  const { rows } = await query(`UPDATE arca_config SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`, params);
  return rows[0] || existing;
}

async function listPuntosVenta() {
  const { rows } = await query(
    `SELECT pv.id, pv.arca_config_id, pv.punto_venta, pv.nombre, pv.activo
       FROM arca_puntos_venta pv
   ORDER BY pv.punto_venta ASC`
  );
  return rows;
}

async function createPuntoVenta({ arca_config_id, punto_venta, nombre, activo = true }) {
  const { rows } = await query(
    `INSERT INTO arca_puntos_venta(arca_config_id, punto_venta, nombre, activo)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [arca_config_id || null, punto_venta, nombre || null, activo ? 1 : 0]
  );
  return rows[0];
}

async function updatePuntoVenta(id, fields) {
  const sets = [];
  const params = [];
  let p = 1;
  for (const [key, col] of Object.entries({
    punto_venta: 'punto_venta',
    nombre: 'nombre',
    activo: 'activo',
  })) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${col} = $${p++}`);
      const val = fields[key];
      if (key === 'activo') params.push(val ? 1 : 0);
      else params.push(val ?? null);
    }
  }
  if (!sets.length) return null;
  sets.push(`actualizado_en = CURRENT_TIMESTAMP`);
  params.push(id);
  const { rows } = await query(`UPDATE arca_puntos_venta SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`, params);
  return rows[0] || null;
}

async function deletePuntoVenta(id) {
  const { rows } = await query('DELETE FROM arca_puntos_venta WHERE id = $1 RETURNING id', [id]);
  return rows[0] || null;
}

async function assignDepositoToPuntoVenta(depositoId, puntoVentaId) {
  const { rows } = await query(
    `INSERT INTO arca_puntos_venta_depositos(punto_venta_id, deposito_id)
     VALUES ($1,$2)
     ON CONFLICT (deposito_id) DO UPDATE SET punto_venta_id = EXCLUDED.punto_venta_id
     RETURNING *`,
    [puntoVentaId, depositoId]
  );
  return rows[0] || null;
}

async function listDepositosConPuntoVenta() {
  const { rows } = await query(
    `SELECT d.id, d.nombre, d.codigo,
            m.punto_venta_id,
            pv.punto_venta,
            pv.nombre AS punto_venta_nombre
       FROM depositos d
  LEFT JOIN arca_puntos_venta_depositos m ON m.deposito_id = d.id
  LEFT JOIN arca_puntos_venta pv ON pv.id = m.punto_venta_id
   ORDER BY d.nombre`
  );
  return rows;
}

async function getPuntoVentaByDeposito(depositoId) {
  const { rows } = await query(
    `SELECT pv.*
       FROM arca_puntos_venta pv
       JOIN arca_puntos_venta_depositos m ON m.punto_venta_id = pv.id
      WHERE m.deposito_id = $1
      LIMIT 1`,
    [depositoId]
  );
  return rows[0] || null;
}

async function saveToken({ arca_config_id, servicio, token, sign, expira_en }) {
  const { rows } = await query(
    `INSERT INTO arca_tokens(arca_config_id, servicio, token, sign, expira_en)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (arca_config_id, servicio) DO UPDATE
       SET token = EXCLUDED.token,
           sign = EXCLUDED.sign,
           expira_en = EXCLUDED.expira_en,
           actualizado_en = CURRENT_TIMESTAMP
     RETURNING *`,
    [arca_config_id, servicio, token, sign, expira_en]
  );
  return rows[0] || null;
}

async function getToken(arca_config_id, servicio) {
  const { rows } = await query(
    `SELECT token, sign, expira_en
       FROM arca_tokens
      WHERE arca_config_id = $1 AND servicio = $2
      LIMIT 1`,
    [arca_config_id, servicio]
  );
  return rows[0] || null;
}

async function getPadronCache(cuit) {
  const { rows } = await query(
    `SELECT data_json, actualizado_en
       FROM arca_padron_cache
      WHERE cuit = $1
      LIMIT 1`,
    [cuit]
  );
  return rows[0] || null;
}

async function savePadronCache(cuit, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  const { rows } = await query(
    `INSERT INTO arca_padron_cache(cuit, data_json)
     VALUES ($1,$2)
     ON CONFLICT (cuit) DO UPDATE
       SET data_json = EXCLUDED.data_json,
           actualizado_en = CURRENT_TIMESTAMP
     RETURNING *`,
    [cuit, payload]
  );
  return rows[0] || null;
}

async function getFacturaByVentaId(ventaId) {
  const { rows } = await query(
    `SELECT * FROM facturas WHERE venta_id = $1 LIMIT 1`,
    [ventaId]
  );
  return rows[0] || null;
}

async function upsertFacturaForVenta({ venta_id, numero_factura, fecha_emision, ...fields }) {
  const existing = await getFacturaByVentaId(venta_id);
  if (!existing) {
    const { rows } = await query(
      `INSERT INTO facturas(
        venta_id, numero_factura, fecha_emision, comprobante_pdf_url,
        tipo_comprobante, punto_venta, cae, cae_vto, estado, error,
        total, moneda, qr_data, response_json, concepto, doc_tipo, doc_nro,
        imp_neto, imp_iva, imp_op_ex, imp_trib, imp_tot_conc,
        mon_id, mon_cotiz, fecha_serv_desde, fecha_serv_hasta, fecha_vto_pago,
        snapshot_json, request_hash, intentos, ultimo_intento, usuario_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
      RETURNING *`,
      [
        venta_id,
        numero_factura,
        fecha_emision || new Date(),
        fields.comprobante_pdf_url || null,
        fields.tipo_comprobante || null,
        fields.punto_venta || null,
        fields.cae || null,
        fields.cae_vto || null,
        fields.estado || 'pendiente',
        fields.error || null,
        fields.total != null ? Number(fields.total) : null,
        fields.moneda || 'PES',
        fields.qr_data || null,
        fields.response_json ? JSON.stringify(fields.response_json) : null,
        fields.concepto != null ? Number(fields.concepto) : null,
        fields.doc_tipo != null ? Number(fields.doc_tipo) : null,
        fields.doc_nro != null ? String(fields.doc_nro) : null,
        fields.imp_neto != null ? Number(fields.imp_neto) : null,
        fields.imp_iva != null ? Number(fields.imp_iva) : null,
        fields.imp_op_ex != null ? Number(fields.imp_op_ex) : null,
        fields.imp_trib != null ? Number(fields.imp_trib) : null,
        fields.imp_tot_conc != null ? Number(fields.imp_tot_conc) : null,
        fields.mon_id || null,
        fields.mon_cotiz != null ? Number(fields.mon_cotiz) : null,
        fields.fecha_serv_desde || null,
        fields.fecha_serv_hasta || null,
        fields.fecha_vto_pago || null,
        fields.snapshot_json ? JSON.stringify(fields.snapshot_json) : null,
        fields.request_hash || null,
        fields.intentos != null ? Number(fields.intentos) : 0,
        fields.ultimo_intento || null,
        fields.usuario_id || null,
      ]
    );
    return rows[0];
  }

  const sets = [];
  const params = [];
  let p = 1;
  const updateFields = {
    numero_factura,
    fecha_emision,
    comprobante_pdf_url: fields.comprobante_pdf_url,
    tipo_comprobante: fields.tipo_comprobante,
    punto_venta: fields.punto_venta,
    cae: fields.cae,
    cae_vto: fields.cae_vto,
    estado: fields.estado,
    error: fields.error,
    total: fields.total,
    moneda: fields.moneda,
    qr_data: fields.qr_data,
    response_json: fields.response_json ? JSON.stringify(fields.response_json) : undefined,
    concepto: fields.concepto,
    doc_tipo: fields.doc_tipo,
    doc_nro: fields.doc_nro,
    imp_neto: fields.imp_neto,
    imp_iva: fields.imp_iva,
    imp_op_ex: fields.imp_op_ex,
    imp_trib: fields.imp_trib,
    imp_tot_conc: fields.imp_tot_conc,
    mon_id: fields.mon_id,
    mon_cotiz: fields.mon_cotiz,
    fecha_serv_desde: fields.fecha_serv_desde,
    fecha_serv_hasta: fields.fecha_serv_hasta,
    fecha_vto_pago: fields.fecha_vto_pago,
    snapshot_json: fields.snapshot_json ? JSON.stringify(fields.snapshot_json) : undefined,
    request_hash: fields.request_hash,
    intentos: fields.intentos,
    ultimo_intento: fields.ultimo_intento,
    usuario_id: fields.usuario_id,
  };

  for (const [key, col] of Object.entries({
    numero_factura: 'numero_factura',
    fecha_emision: 'fecha_emision',
    comprobante_pdf_url: 'comprobante_pdf_url',
    tipo_comprobante: 'tipo_comprobante',
    punto_venta: 'punto_venta',
    cae: 'cae',
    cae_vto: 'cae_vto',
    estado: 'estado',
    error: 'error',
    total: 'total',
    moneda: 'moneda',
    qr_data: 'qr_data',
    response_json: 'response_json',
    concepto: 'concepto',
    doc_tipo: 'doc_tipo',
    doc_nro: 'doc_nro',
    imp_neto: 'imp_neto',
    imp_iva: 'imp_iva',
    imp_op_ex: 'imp_op_ex',
    imp_trib: 'imp_trib',
    imp_tot_conc: 'imp_tot_conc',
    mon_id: 'mon_id',
    mon_cotiz: 'mon_cotiz',
    fecha_serv_desde: 'fecha_serv_desde',
    fecha_serv_hasta: 'fecha_serv_hasta',
    fecha_vto_pago: 'fecha_vto_pago',
    snapshot_json: 'snapshot_json',
    request_hash: 'request_hash',
    intentos: 'intentos',
    ultimo_intento: 'ultimo_intento',
    usuario_id: 'usuario_id',
  })) {
    if (Object.prototype.hasOwnProperty.call(updateFields, key) && updateFields[key] !== undefined) {
      sets.push(`${col} = $${p++}`);
      params.push(updateFields[key]);
    }
  }

  if (!sets.length) return existing;
  params.push(existing.id);
  const { rows } = await query(
    `UPDATE facturas SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
    params
  );
  return rows[0] || existing;
}

module.exports = {
  getConfig,
  upsertConfig,
  listPuntosVenta,
  createPuntoVenta,
  updatePuntoVenta,
  deletePuntoVenta,
  assignDepositoToPuntoVenta,
  listDepositosConPuntoVenta,
  getPuntoVentaByDeposito,
  saveToken,
  getToken,
  getPadronCache,
  savePadronCache,
  getFacturaByVentaId,
  upsertFacturaForVenta,
};

