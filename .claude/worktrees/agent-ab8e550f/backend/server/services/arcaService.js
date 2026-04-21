const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');
const { XMLParser } = require('fast-xml-parser');
const repo = require('../db/repositories/arcaRepository');
const configRepo = require('../db/repositories/configRepository');
const { query } = require('../db/pg');

const TOKEN_CACHE = new Map();
const PV_LOCKS = new Map();

const WSAA_URLS = {
  homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  produccion: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
};

const WSFE_URLS = {
  homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  produccion: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
};

const PADRON_URLS = {
  homologacion: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13',
  produccion: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13',
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: true,
  trimValues: true,
});

function onlyDigits(value) {
  if (value == null) return '';
  return String(value).replace(/\D/g, '');
}

function normalizeCuit(value) {
  if (!value) return null;
  const digits = onlyDigits(value);
  return digits.length >= 8 ? digits : null;
}

async function getMasterKey() {
  if (process.env.ARCA_MASTER_KEY) return process.env.ARCA_MASTER_KEY;
  let key = await configRepo.getTextParam('arca_master_key');
  if (!key) {
    key = crypto.randomBytes(32).toString('hex');
    await configRepo.setTextParam('arca_master_key', key, null);
  }
  return key;
}

async function encryptString(value) {
  if (!value) return null;
  const master = await getMasterKey();
  const key = crypto.createHash('sha256').update(String(master)).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

async function decryptString(value) {
  if (!value) return null;
  const raw = String(value);
  if (!raw.startsWith('enc:v1:')) return raw;
  const payload = raw.slice('enc:v1:'.length);
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) return null;
  const master = await getMasterKey();
  const key = crypto.createHash('sha256').update(String(master)).digest();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

function decodeXmlEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function findFirst(obj, key) {
  if (!obj || typeof obj !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  for (const val of Object.values(obj)) {
    const found = findFirst(val, key);
    if (found != null) return found;
  }
  return null;
}

function formatDateYYYYMMDD(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function round2(value) {
  const num = Number(value) || 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function formatAmount(value) {
  return round2(value).toFixed(2);
}

function isValidDate(value) {
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function normalizeCondicionIva(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('responsable')) return 'responsable_inscripto';
  if (raw.includes('mono')) return 'monotributo';
  if (raw.includes('exento')) return 'exento';
  if (raw.includes('consumidor')) return 'consumidor_final';
  if (raw.includes('no categorizado')) return 'no_categorizado';
  return raw;
}

function buildLoginTicket(service) {
  const now = new Date();
  const generationTime = new Date(now.getTime() - 5 * 60 * 1000);
  const expirationTime = new Date(now.getTime() + 60 * 60 * 1000);
  const uniqueId = Math.floor(now.getTime() / 1000);
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<loginTicketRequest version="1.0">` +
    `<header>` +
    `<uniqueId>${uniqueId}</uniqueId>` +
    `<generationTime>${generationTime.toISOString()}</generationTime>` +
    `<expirationTime>${expirationTime.toISOString()}</expirationTime>` +
    `</header>` +
    `<service>${service}</service>` +
    `</loginTicketRequest>`;
}

function ensureOpenSSL() {
  const res = spawnSync('openssl', ['version'], { encoding: 'utf8' });
  if (res.error || res.status !== 0) {
    const msg = res.error?.message || res.stderr || 'OpenSSL no disponible';
    const err = new Error(
      `OpenSSL requerido para firmar. Instala OpenSSL y agrega al PATH. Detalle: ${msg}`
    );
    err.code = 'OPENSSL_REQUIRED';
    throw err;
  }
}

function signWithOpenSSL({ xml, certPem, keyPem, passphrase }) {
  ensureOpenSSL();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arca-'));
  const xmlPath = path.join(dir, 'ticket.xml');
  const certPath = path.join(dir, 'cert.pem');
  const keyPath = path.join(dir, 'key.pem');
  const outPath = path.join(dir, 'ticket.cms');
  fs.writeFileSync(xmlPath, xml, 'utf8');
  fs.writeFileSync(certPath, certPem, 'utf8');
  fs.writeFileSync(keyPath, keyPem, 'utf8');

  const args = [
    'smime',
    '-sign',
    '-signer', certPath,
    '-inkey', keyPath,
    '-outform', 'DER',
    '-nodetach',
    '-binary',
    '-in', xmlPath,
    '-out', outPath,
  ];
  if (passphrase) {
    args.push('-passin', `pass:${passphrase}`);
  }

  const res = spawnSync('openssl', args, { encoding: 'utf8' });
  if (res.status !== 0) {
    const err = new Error(res.stderr || res.error?.message || 'Error firmando LoginTicket');
    err.code = 'OPENSSL_SIGN_FAILED';
    throw err;
  }

  const cms = fs.readFileSync(outPath);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
  return cms.toString('base64');
}

function validateKeyPair(certPem, keyPem, passphrase) {
  const certKey = crypto.createPublicKey(certPem);
  const privKey = crypto.createPrivateKey({ key: keyPem, passphrase: passphrase || undefined });
  const pubFromKey = crypto.createPublicKey(privKey);
  const certDer = certKey.export({ type: 'spki', format: 'der' });
  const keyDer = pubFromKey.export({ type: 'spki', format: 'der' });
  return Buffer.compare(certDer, keyDer) === 0;
}

function soapRequest(url, xml, soapAction) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = Buffer.from(xml, 'utf8');
    const req = https.request(
      {
        method: 'POST',
        hostname: target.hostname,
        path: target.pathname + (target.search || ''),
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Length': body.length,
          ...(soapAction ? { SOAPAction: soapAction } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function loginWsaa({ ambiente, certPem, keyPem, passphrase, service }) {
  const loginTicket = buildLoginTicket(service);
  const cms = signWithOpenSSL({ xml: loginTicket, certPem, keyPem, passphrase });
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <loginCms xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov">
          <in0>${cms}</in0>
        </loginCms>
      </soap:Body>
    </soap:Envelope>`;

  const wsaaUrl = WSAA_URLS[ambiente] || WSAA_URLS.homologacion;
  const response = await soapRequest(wsaaUrl, envelope, 'loginCms');
  if (response.status !== 200) {
    throw new Error(`WSAA error HTTP ${response.status}`);
  }
  const parsed = parser.parse(response.body);
  const loginReturn = findFirst(parsed, 'loginCmsReturn');
  const innerXml = decodeXmlEntities(loginReturn);
  const inner = parser.parse(innerXml);
  const token = findFirst(inner, 'token');
  const sign = findFirst(inner, 'sign');
  const expirationTime = findFirst(inner, 'expirationTime');
  if (!token || !sign) {
    throw new Error('No se pudo obtener token/sign de WSAA');
  }
  return {
    token,
    sign,
    expira_en: expirationTime || new Date(Date.now() + 55 * 60 * 1000).toISOString(),
  };
}

async function getToken(config, service) {
  const cacheKey = `${config.id}:${service}`;
  const cached = TOKEN_CACHE.get(cacheKey);
  if (cached && cached.expira_en && new Date(cached.expira_en).getTime() > Date.now() + 60 * 1000) {
    return cached;
  }
  const dbToken = await repo.getToken(config.id, service);
  if (dbToken && dbToken.expira_en && new Date(dbToken.expira_en).getTime() > Date.now() + 60 * 1000) {
    TOKEN_CACHE.set(cacheKey, dbToken);
    return dbToken;
  }

  const certPem = await decryptString(config.certificado_pem);
  const keyPem = await decryptString(config.clave_privada_pem);
  const passphrase = await decryptString(config.passphrase_enc);
  if (!certPem || !keyPem) throw new Error('Certificado/clave privada no configurados');

  const { token, sign, expira_en } = await loginWsaa({
    ambiente: config.ambiente,
    certPem,
    keyPem,
    passphrase,
    service,
  });

  const stored = await repo.saveToken({
    arca_config_id: config.id,
    servicio: service,
    token,
    sign,
    expira_en,
  });
  TOKEN_CACHE.set(cacheKey, stored);
  return stored;
}

function resolveComprobanteTipo({ emisorCondicion, receptorCondicion }) {
  const emisor = normalizeCondicionIva(emisorCondicion);
  const receptor = normalizeCondicionIva(receptorCondicion);
  if (emisor === 'monotributo' || emisor === 'exento') return 'C';
  if (emisor === 'responsable_inscripto' && receptor === 'responsable_inscripto') return 'A';
  return 'B';
}

function comprobanteTipoToCodigo(tipo) {
  const t = String(tipo || '').toUpperCase();
  if (t === 'A') return 1;
  if (t === 'B') return 6;
  return 11; // C
}

function resolveDocTipo(cliente) {
  const tipoDoc = String(cliente.tipo_doc || '').toUpperCase().trim();
  const map = {
    CUIT: 80,
    CUIL: 86,
    CDI: 87,
    DNI: 96,
    PASAPORTE: 94,
    CONSUMIDOR_FINAL: 99,
  };
  const numeroRaw = onlyDigits(cliente.nro_doc || cliente.cuit_cuil || '');
  if (tipoDoc && map[tipoDoc]) return { tipo: map[tipoDoc], numero: numeroRaw || '0' };
  if (numeroRaw) return { tipo: 80, numero: numeroRaw };
  return { tipo: 99, numero: '0' };
}

function mapAlicuotaToId(rate) {
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return null;
  const key = round2(r);
  if (key === 2.5) return 9;
  if (key === 5) return 8;
  if (key === 10.5) return 4;
  if (key === 21) return 5;
  if (key === 27) return 6;
  return null;
}

function buildIvaDetalleXml(ivaItems) {
  if (!ivaItems.length) return '';
  const rows = ivaItems
    .map((it) => {
      return `<AlicIva><Id>${it.id}</Id><BaseImp>${formatAmount(it.base)}</BaseImp><Importe>${formatAmount(it.importe)}</Importe></AlicIva>`;
    })
    .join('');
  return `<Iva>${rows}</Iva>`;
}

function calcFiscalFromItems({ items, descuentoTotal, preciosIncluyenIva }) {
  const cleanItems = (items || []).map((it) => {
    const qty = Number(it.cantidad || 0);
    const subtotal = Number(it.subtotal != null ? it.subtotal : qty * Number(it.precio_unitario || 0)) || 0;
    const ivaRate = Number(it.iva_alicuota != null ? it.iva_alicuota : 21);
    return {
      producto_id: it.producto_id,
      descripcion: it.producto_nombre || it.descripcion || '',
      cantidad: qty,
      precio_unitario: Number(it.precio_unitario || 0),
      subtotal,
      iva_alicuota: ivaRate,
    };
  }).filter((it) => it.cantidad > 0 && it.subtotal >= 0);

  if (!cleanItems.length) {
    throw new Error('La venta no tiene items para facturar');
  }

  // Pre-calc base/iva per item
  const lines = cleanItems.map((it) => {
    const rate = Number(it.iva_alicuota) || 0;
    let base = 0;
    let iva = 0;
    let gross = 0;
    if (preciosIncluyenIva) {
      gross = Number(it.subtotal) || 0;
      if (rate > 0) {
        base = gross / (1 + rate / 100);
        iva = gross - base;
      } else {
        base = gross;
        iva = 0;
      }
    } else {
      base = Number(it.subtotal) || 0;
      iva = rate > 0 ? base * (rate / 100) : 0;
      gross = base + iva;
    }
    return {
      ...it,
      gross: round2(gross),
      base: round2(base),
      iva: round2(iva),
    };
  });

  const totalGross = round2(lines.reduce((acc, it) => acc + (Number(it.gross) || 0), 0));
  const totalBase = round2(lines.reduce((acc, it) => acc + (Number(it.base) || 0), 0));
  const discount = Math.max(0, round2(descuentoTotal || 0));
  if ((preciosIncluyenIva ? totalGross : totalBase) <= 0) {
    throw new Error('El total de la venta es invalido para facturar');
  }
  const maxDiscount = Math.min(discount, preciosIncluyenIva ? totalGross : totalBase);
  const totalRef = preciosIncluyenIva ? totalGross : totalBase;

  // Distribute discount proportionally to gross
  let remainingDiscount = maxDiscount;
  const discounted = lines.map((line, idx) => {
    const isLast = idx === lines.length - 1;
    const refValue = preciosIncluyenIva ? line.gross : line.base;
    const share = totalRef > 0 ? refValue / totalRef : 0;
    const lineDiscount = isLast
      ? remainingDiscount
      : round2(maxDiscount * share);
    remainingDiscount = round2(remainingDiscount - lineDiscount);
    const ratio = refValue > 0 ? Math.max(0, (refValue - lineDiscount) / refValue) : 0;
    const baseAdj = round2(line.base * ratio);
    const ivaAdj = round2(line.iva * ratio);
    const grossAdj = round2(baseAdj + ivaAdj);
    return {
      ...line,
      descuento: lineDiscount,
      base: baseAdj,
      iva: ivaAdj,
      gross: grossAdj,
    };
  });

  const ivaMap = new Map();
  let impNeto = 0;
  let impIva = 0;
  let impOpEx = 0;

  for (const line of discounted) {
    const rate = Number(line.iva_alicuota) || 0;
    if (rate > 0) {
      impNeto += line.base;
      impIva += line.iva;
      const id = mapAlicuotaToId(rate);
      if (!id) {
        throw new Error(`Alicuota IVA no soportada (${rate}%)`);
      }
      const entry = ivaMap.get(id) || { id, base: 0, importe: 0, rate };
      entry.base = round2(entry.base + line.base);
      entry.importe = round2(entry.importe + line.iva);
      ivaMap.set(id, entry);
    } else {
      impOpEx += line.base;
    }
  }

  const ivaItems = Array.from(ivaMap.values());
  const totales = {
    impNeto: round2(impNeto),
    impIva: round2(impIva),
    impOpEx: round2(impOpEx),
    impTotConc: 0,
  };
  return {
    items: discounted,
    ivaItems,
    totalGross,
    discount: maxDiscount,
    totales,
  };
}

function buildQrData({
  fecha,
  cuit,
  puntoVenta,
  tipoComprobante,
  numero,
  impTotal,
  moneda = 'PES',
  cotiz = 1,
  docTipo,
  docNro,
  cae,
}) {
  const fechaIso = new Date(fecha || new Date());
  const payload = {
    ver: 1,
    fecha: fechaIso.toISOString().slice(0, 10),
    cuit: Number(onlyDigits(cuit)),
    ptoVta: Number(puntoVenta),
    tipoCmp: Number(comprobanteTipoToCodigo(tipoComprobante)),
    nroCmp: Number(numero),
    importe: Number(formatAmount(impTotal)),
    moneda: moneda || 'PES',
    ctz: Number(cotiz || 1),
    tipoDocRec: Number(docTipo || 99),
    nroDocRec: Number(onlyDigits(docNro || 0) || 0),
    tipoCodAut: 'E',
    codAut: String(cae || ''),
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const url = `https://www.afip.gob.ar/fe/qr/?p=${b64}`;
  return { payload, url };
}

async function callWsfe(config, action, bodyInnerXml) {
  const wsfeUrl = WSFE_URLS[config.ambiente] || WSFE_URLS.homologacion;
  const auth = await getToken(config, 'wsfe');
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <${action} xmlns="http://ar.gov.afip.dif.FEV1/">
          <Auth>
            <Token>${auth.token}</Token>
            <Sign>${auth.sign}</Sign>
            <Cuit>${config.cuit}</Cuit>
          </Auth>
          ${bodyInnerXml}
        </${action}>
      </soap:Body>
    </soap:Envelope>`;
  const response = await soapRequest(wsfeUrl, envelope, action);
  if (response.status !== 200) {
    throw new Error(`WSFE error HTTP ${response.status}`);
  }
  return parser.parse(response.body);
}

async function wsfeDummy(config) {
  const wsfeUrl = WSFE_URLS[config.ambiente] || WSFE_URLS.homologacion;
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <FEDummy xmlns="http://ar.gov.afip.dif.FEV1/" />
      </soap:Body>
    </soap:Envelope>`;
  const response = await soapRequest(wsfeUrl, envelope, 'FEDummy');
  if (response.status !== 200) {
    throw new Error(`WSFE dummy HTTP ${response.status}`);
  }
  const parsed = parser.parse(response.body);
  const result = findFirst(parsed, 'FEDummyResult') || {};
  return {
    appServer: result.AppServer || result.appServer || 'unknown',
    dbServer: result.DbServer || result.dbServer || 'unknown',
    authServer: result.AuthServer || result.authServer || 'unknown',
  };
}

async function testConnection() {
  const config = await repo.getConfig();
  if (!config) throw new Error('Config ARCA no encontrada');
  const certPem = await decryptString(config.certificado_pem);
  const keyPem = await decryptString(config.clave_privada_pem);
  const passphrase = await decryptString(config.passphrase_enc);
  if (!certPem || !keyPem) {
    throw new Error('Certificado o clave privada no cargados');
  }

  let match = false;
  try {
    match = validateKeyPair(certPem, keyPem, passphrase);
  } catch (e) {
    throw new Error(`Clave privada invalida: ${e.message}`);
  }
  if (!match) {
    throw new Error('El certificado no coincide con la clave privada');
  }

  const token = await getToken({ ...config, certificado_pem: config.certificado_pem, clave_privada_pem: config.clave_privada_pem, passphrase_enc: config.passphrase_enc }, 'wsfe');
  const dummy = await wsfeDummy(config);
  return { token_expires: token.expira_en, dummy };
}

async function loadVentaCompleta(ventaId) {
  const { rows: ventaRows } = await query(
    `SELECT v.*, c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
            c.cuit_cuil, c.tipo_doc, c.nro_doc, c.condicion_iva,
            c.domicilio_fiscal, c.provincia, c.localidad, c.codigo_postal
       FROM ventas v
       JOIN clientes c ON c.id = v.cliente_id
      WHERE v.id = $1
      LIMIT 1`,
    [ventaId]
  );
  const venta = ventaRows[0];
  if (!venta) return null;
  let referido_descuento = 0;
  try {
    const { rows: refRows } = await query(
      `SELECT COALESCE(SUM(descuento_aplicado), 0) AS descuento
         FROM uso_referidos
        WHERE venta_id = $1`,
      [ventaId]
    );
    referido_descuento = Number(refRows[0]?.descuento || 0);
  } catch {}
  const { rows: items } = await query(
    `SELECT d.*, p.nombre AS producto_nombre, p.iva_alicuota
       FROM ventas_detalle d
       JOIN productos p ON p.id = d.producto_id
      WHERE d.venta_id = $1`,
    [ventaId]
  );
  return { venta: { ...venta, referido_descuento }, items };
}

async function withPvLock(puntoVenta, fn) {
  const key = String(puntoVenta);
  const prev = PV_LOCKS.get(key) || Promise.resolve();
  let release;
  const next = new Promise((resolve) => { release = resolve; });
  PV_LOCKS.set(key, prev.then(() => next));
  try {
    await prev;
    return await fn();
  } finally {
    release();
  }
}

async function emitirFacturaDesdeVenta({
  ventaId,
  puntoVentaId,
  tipoOverride,
  usuarioId,
  concepto,
  fecha_serv_desde,
  fecha_serv_hasta,
  fecha_vto_pago,
}) {
  const config = await repo.getConfig();
  if (!config) throw new Error('Config ARCA no encontrada');
  if (!config.activo) throw new Error('ARCA desactivado');

  const data = await loadVentaCompleta(ventaId);
  if (!data) throw new Error('Venta no encontrada');
  const { venta, items } = data;

  if (venta.estado_pago === 'cancelado') {
    throw new Error('No se puede facturar una venta cancelada');
  }
  if (!config.permitir_sin_entrega && venta.estado_entrega !== 'entregado') {
    throw new Error('La venta debe estar entregada para facturar');
  }
  if (!config.permitir_sin_pago && venta.estado_pago !== 'pagada') {
    throw new Error('La venta debe estar pagada para facturar');
  }

  const facturaExistente = await repo.getFacturaByVentaId(ventaId);
  if (facturaExistente && facturaExistente.estado === 'emitida') {
    return { factura: facturaExistente, already: true };
  }

  const pv = puntoVentaId
    ? await query(
        `SELECT pv.* FROM arca_puntos_venta pv WHERE pv.id = $1 LIMIT 1`,
        [puntoVentaId]
      )
    : await repo.getPuntoVentaByDeposito(venta.deposito_id);

  const puntoVenta = pv?.rows ? (pv.rows[0] || null) : pv;
  if (!puntoVenta) {
    throw new Error('No hay punto de venta asignado');
  }
  if (puntoVenta.activo === 0 || puntoVenta.activo === false) {
    throw new Error('El punto de venta esta inactivo');
  }

  const tipoAuto = resolveComprobanteTipo({
    emisorCondicion: config.condicion_iva,
    receptorCondicion: venta.condicion_iva,
  });
  const tipoComprobante = tipoOverride || tipoAuto;

  const conceptoFinal = [1, 2, 3].includes(Number(concepto)) ? Number(concepto) : 1;
  if (conceptoFinal !== 1) {
    if (!fecha_serv_desde || !fecha_serv_hasta || !fecha_vto_pago) {
      throw new Error('Fechas de servicio requeridas para concepto 2 o 3');
    }
    if (!isValidDate(fecha_serv_desde) || !isValidDate(fecha_serv_hasta) || !isValidDate(fecha_vto_pago)) {
      throw new Error('Fechas de servicio invalidas');
    }
  }

  const docInfo = resolveDocTipo(venta);
  const docNumeroDigits = onlyDigits(docInfo.numero || '');
  if (tipoComprobante === 'A') {
    if (docInfo.tipo !== 80) {
      throw new Error('Factura A requiere CUIT del receptor');
    }
    if (!docNumeroDigits || docNumeroDigits.length < 11) {
      throw new Error('CUIT del receptor invalido');
    }
  }

  const descuentoTotal = round2(Number(venta.descuento || 0) + Number(venta.referido_descuento || 0));
  const preciosIncluyenIva = config.precios_incluyen_iva == null ? true : Boolean(config.precios_incluyen_iva);
  const fiscal = calcFiscalFromItems({
    items,
    descuentoTotal,
    preciosIncluyenIva,
  });
  let { items: fiscalItems, ivaItems, totales } = fiscal;
  if (String(tipoComprobante).toUpperCase() === 'C') {
    const totalBruto = round2(fiscalItems.reduce((acc, it) => acc + Number(it.gross || 0), 0));
    totales = {
      impNeto: totalBruto,
      impIva: 0,
      impOpEx: 0,
      impTotConc: 0,
    };
    ivaItems = [];
  }

  const impuestosExtras = Number(venta.impuestos || 0);
  if (impuestosExtras > 0) {
    throw new Error('Impuestos adicionales no soportados en facturacion (ImpTrib). Deja impuestos en 0.');
  }

  const impTrib = 0;
  const impTotal = round2(
    totales.impNeto + totales.impIva + totales.impOpEx + totales.impTotConc + impTrib
  );

  const expectedTotal = Number(venta.neto || venta.total || 0);
  if (expectedTotal > 0 && Math.abs(impTotal - expectedTotal) > 0.1) {
    throw new Error(
      `Diferencia de totales. Venta=${formatAmount(expectedTotal)} Factura=${formatAmount(impTotal)}`
    );
  }

  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      ventaId,
      tipoComprobante,
      puntoVenta: puntoVenta.punto_venta,
      concepto: conceptoFinal,
      fecha_serv_desde: conceptoFinal !== 1 ? fecha_serv_desde : null,
      fecha_serv_hasta: conceptoFinal !== 1 ? fecha_serv_hasta : null,
      fecha_vto_pago: conceptoFinal !== 1 ? fecha_vto_pago : null,
      preciosIncluyenIva,
      descuentoTotal,
      items: fiscalItems.map((it) => ({
        producto_id: it.producto_id,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        subtotal: it.subtotal,
        iva_alicuota: it.iva_alicuota,
      })),
    }))
    .digest('hex');

  if (facturaExistente && facturaExistente.request_hash && facturaExistente.request_hash !== hash) {
    throw new Error('La venta ya tiene una emision previa diferente');
  }

  return await withPvLock(puntoVenta.punto_venta, async () => {
    const lastResp = await callWsfe(
      config,
      'FECompUltimoAutorizado',
      `<PtoVta>${puntoVenta.punto_venta}</PtoVta><CbteTipo>${comprobanteTipoToCodigo(tipoComprobante)}</CbteTipo>`
    );
    const lastNumber = Number(findFirst(lastResp, 'CbteNro') || 0);
    const nextNumber = lastNumber + 1;

    const ivaXml = buildIvaDetalleXml(ivaItems);

    const detalleXml = `
      <FeCAEReq>
        <FeCabReq>
          <CantReg>1</CantReg>
          <PtoVta>${puntoVenta.punto_venta}</PtoVta>
          <CbteTipo>${comprobanteTipoToCodigo(tipoComprobante)}</CbteTipo>
        </FeCabReq>
        <FeDetReq>
          <FECAEDetRequest>
            <Concepto>${conceptoFinal}</Concepto>
            <DocTipo>${docInfo.tipo}</DocTipo>
            <DocNro>${docNumeroDigits || 0}</DocNro>
            <CbteDesde>${nextNumber}</CbteDesde>
            <CbteHasta>${nextNumber}</CbteHasta>
            <CbteFch>${formatDateYYYYMMDD(isValidDate(venta.fecha) ? venta.fecha : new Date())}</CbteFch>
            ${conceptoFinal !== 1 ? `<FchServDesde>${formatDateYYYYMMDD(fecha_serv_desde)}</FchServDesde>` : ''}
            ${conceptoFinal !== 1 ? `<FchServHasta>${formatDateYYYYMMDD(fecha_serv_hasta)}</FchServHasta>` : ''}
            ${conceptoFinal !== 1 ? `<FchVtoPago>${formatDateYYYYMMDD(fecha_vto_pago)}</FchVtoPago>` : ''}
            <ImpTotal>${formatAmount(impTotal)}</ImpTotal>
            <ImpTotConc>${formatAmount(totales.impTotConc || 0)}</ImpTotConc>
            <ImpNeto>${formatAmount(totales.impNeto || 0)}</ImpNeto>
            <ImpOpEx>${formatAmount(totales.impOpEx || 0)}</ImpOpEx>
            <ImpIVA>${formatAmount(totales.impIva || 0)}</ImpIVA>
            <ImpTrib>${formatAmount(impTrib)}</ImpTrib>
            <MonId>PES</MonId>
            <MonCotiz>1</MonCotiz>
            ${ivaXml}
          </FECAEDetRequest>
        </FeDetReq>
      </FeCAEReq>
    `;

    let estado = 'pendiente';
    let error = null;
    let cae = null;
    let caeVto = null;
    let responseJson = null;

    const nowIso = new Date().toISOString();
    let intentos = facturaExistente ? Number(facturaExistente.intentos || 0) + 1 : 1;

    try {
      const resp = await callWsfe(config, 'FECAESolicitar', detalleXml);
      responseJson = resp;
      const result = findFirst(resp, 'Resultado') || findFirst(resp, 'resultado');
      if (String(result).toUpperCase() === 'A') {
        estado = 'emitida';
        cae = findFirst(resp, 'CAE') || null;
        caeVto = findFirst(resp, 'CAEFchVto') || null;
      } else {
        estado = 'error';
        error = findFirst(resp, 'Msg') || 'Respuesta no aprobada';
      }
    } catch (e) {
      estado = 'error';
      error = e.message || String(e);
    }

    const numeroFactura = `${String(puntoVenta.punto_venta).padStart(4, '0')}-${String(nextNumber).padStart(8, '0')}`;

    let qrData = null;
    let qrPayload = null;
    if (estado === 'emitida' && cae) {
      const qr = buildQrData({
        fecha: venta.fecha || new Date(),
        cuit: config.cuit,
        puntoVenta: puntoVenta.punto_venta,
        tipoComprobante,
        numero: nextNumber,
        impTotal,
        moneda: 'PES',
        cotiz: 1,
        docTipo: docInfo.tipo,
        docNro: docNumeroDigits || '0',
        cae,
      });
      qrData = qr.url;
      qrPayload = qr.payload;
    }

    const snapshot = {
      emisor: {
        cuit: config.cuit,
        razon_social: config.razon_social,
        condicion_iva: config.condicion_iva,
        domicilio_fiscal: config.domicilio_fiscal,
        provincia: config.provincia,
        localidad: config.localidad,
        codigo_postal: config.codigo_postal,
      },
      receptor: {
        nombre: venta.cliente_nombre,
        apellido: venta.cliente_apellido,
        condicion_iva: venta.condicion_iva,
        doc_tipo: docInfo.tipo,
        doc_nro: docNumeroDigits || '0',
        domicilio_fiscal: venta.domicilio_fiscal,
        provincia: venta.provincia,
        localidad: venta.localidad,
        codigo_postal: venta.codigo_postal,
      },
      comprobante: {
        tipo: tipoComprobante,
        tipo_codigo: comprobanteTipoToCodigo(tipoComprobante),
        punto_venta: puntoVenta.punto_venta,
        numero: numeroFactura,
        fecha: venta.fecha,
        concepto: conceptoFinal,
        moneda: 'PES',
        cotizacion: 1,
      },
      servicios: conceptoFinal !== 1 ? {
        desde: fecha_serv_desde,
        hasta: fecha_serv_hasta,
        vto_pago: fecha_vto_pago,
      } : null,
      totales: {
        imp_total: impTotal,
        imp_neto: totales.impNeto || 0,
        imp_iva: totales.impIva || 0,
        imp_op_ex: totales.impOpEx || 0,
        imp_trib: impTrib,
        imp_tot_conc: totales.impTotConc || 0,
        descuento: descuentoTotal,
      },
      cae: estado === 'emitida' ? { codigo: cae, vencimiento: caeVto } : null,
      qr: qrData ? { url: qrData, payload: qrPayload } : null,
      items: fiscalItems.map((it) => ({
        producto_id: it.producto_id,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        subtotal: it.subtotal,
        iva_alicuota: it.iva_alicuota,
        base: it.base,
        iva: it.iva,
      })),
    };

    const factura = await repo.upsertFacturaForVenta({
      venta_id: ventaId,
      numero_factura: numeroFactura,
      fecha_emision: new Date(),
      tipo_comprobante: tipoComprobante,
      punto_venta: puntoVenta.punto_venta,
      cae,
      cae_vto: caeVto,
      estado,
      error,
      total: impTotal,
      moneda: 'PES',
      qr_data: qrData,
      response_json: responseJson,
      request_hash: hash,
      intentos,
      ultimo_intento: nowIso,
      usuario_id: usuarioId || null,
      concepto: conceptoFinal,
      doc_tipo: docInfo.tipo,
      doc_nro: docNumeroDigits || '0',
      imp_neto: totales.impNeto || 0,
      imp_iva: totales.impIva || 0,
      imp_op_ex: totales.impOpEx || 0,
      imp_trib: impTrib,
      imp_tot_conc: totales.impTotConc || 0,
      mon_id: 'PES',
      mon_cotiz: 1,
      fecha_serv_desde: conceptoFinal !== 1 ? fecha_serv_desde : null,
      fecha_serv_hasta: conceptoFinal !== 1 ? fecha_serv_hasta : null,
      fecha_vto_pago: conceptoFinal !== 1 ? fecha_vto_pago : null,
      snapshot_json: snapshot,
    });

    return { factura, already: false };
  });
}

async function buildSnapshotFromVenta({ ventaId, factura }) {
  const config = await repo.getConfig();
  if (!config) throw new Error('Config ARCA no encontrada');
  const data = await loadVentaCompleta(ventaId);
  if (!data) throw new Error('Venta no encontrada');
  const { venta, items } = data;

  const tipoComprobante = factura?.tipo_comprobante || resolveComprobanteTipo({
    emisorCondicion: config.condicion_iva,
    receptorCondicion: venta.condicion_iva,
  });
  const puntoVenta = factura?.punto_venta
    ? { punto_venta: factura.punto_venta }
    : await repo.getPuntoVentaByDeposito(venta.deposito_id);
  const conceptoFinal = Number(factura?.concepto || 1);
  const docInfo = resolveDocTipo(venta);
  const docNumeroDigits = onlyDigits(docInfo.numero || '');
  const descuentoTotal = round2(Number(venta.descuento || 0) + Number(venta.referido_descuento || 0));
  const preciosIncluyenIva = config.precios_incluyen_iva == null ? true : Boolean(config.precios_incluyen_iva);

  const fiscal = calcFiscalFromItems({
    items,
    descuentoTotal,
    preciosIncluyenIva,
  });
  let totales = fiscal.totales;
  let ivaItems = fiscal.ivaItems;
  if (String(tipoComprobante).toUpperCase() === 'C') {
    const totalBruto = round2(fiscal.items.reduce((acc, it) => acc + Number(it.gross || 0), 0));
    totales = {
      impNeto: totalBruto,
      impIva: 0,
      impOpEx: 0,
      impTotConc: 0,
    };
    ivaItems = [];
  }
  const impTrib = 0;
  const impTotal = round2(
    totales.impNeto + totales.impIva + totales.impOpEx + totales.impTotConc + impTrib
  );

  let qrData = null;
  let qrPayload = null;
  let numeroCmp = null;
  if (factura?.numero_factura) {
    const parts = String(factura.numero_factura).split('-');
    if (parts.length > 1) {
      numeroCmp = Number(parts[1]);
    } else {
      numeroCmp = Number(parts[0]);
    }
  }
  if (factura?.cae) {
    const qr = buildQrData({
      fecha: venta.fecha || new Date(),
      cuit: config.cuit,
      puntoVenta: puntoVenta?.punto_venta || factura?.punto_venta || 0,
      tipoComprobante,
      numero: numeroCmp || 0,
      impTotal,
      moneda: 'PES',
      cotiz: 1,
      docTipo: docInfo.tipo,
      docNro: docNumeroDigits || '0',
      cae: factura.cae,
    });
    qrData = qr.url;
    qrPayload = qr.payload;
  }

  const numeroFactura = factura?.numero_factura || null;

  return {
    emisor: {
      cuit: config.cuit,
      razon_social: config.razon_social,
      condicion_iva: config.condicion_iva,
      domicilio_fiscal: config.domicilio_fiscal,
      provincia: config.provincia,
      localidad: config.localidad,
      codigo_postal: config.codigo_postal,
    },
    receptor: {
      nombre: venta.cliente_nombre,
      apellido: venta.cliente_apellido,
      condicion_iva: venta.condicion_iva,
      doc_tipo: docInfo.tipo,
      doc_nro: docNumeroDigits || '0',
      domicilio_fiscal: venta.domicilio_fiscal,
      provincia: venta.provincia,
      localidad: venta.localidad,
      codigo_postal: venta.codigo_postal,
    },
    comprobante: {
      tipo: tipoComprobante,
      tipo_codigo: comprobanteTipoToCodigo(tipoComprobante),
      punto_venta: puntoVenta?.punto_venta || factura?.punto_venta || null,
      numero: numeroFactura,
      fecha: factura?.fecha_emision || venta.fecha,
      concepto: conceptoFinal,
      moneda: factura?.mon_id || 'PES',
      cotizacion: factura?.mon_cotiz || 1,
    },
    servicios: conceptoFinal !== 1 ? {
      desde: factura?.fecha_serv_desde || null,
      hasta: factura?.fecha_serv_hasta || null,
      vto_pago: factura?.fecha_vto_pago || null,
    } : null,
    totales: {
      imp_total: impTotal,
      imp_neto: totales.impNeto || 0,
      imp_iva: totales.impIva || 0,
      imp_op_ex: totales.impOpEx || 0,
      imp_trib: impTrib,
      imp_tot_conc: totales.impTotConc || 0,
      descuento: descuentoTotal,
    },
    cae: factura?.cae ? { codigo: factura.cae, vencimiento: factura.cae_vto } : null,
    qr: qrData ? { url: qrData, payload: qrPayload } : null,
    items: fiscal.items.map((it) => ({
      producto_id: it.producto_id,
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
      subtotal: it.subtotal,
      iva_alicuota: it.iva_alicuota,
      base: it.base,
      iva: it.iva,
    })),
  };
}

async function getPadronPersona(cuit) {
  const config = await repo.getConfig();
  if (!config) throw new Error('Config ARCA no encontrada');
  const cuitNorm = normalizeCuit(cuit);
  if (!cuitNorm) throw new Error('CUIT invalido');

  const cached = await repo.getPadronCache(cuitNorm);
  if (cached) {
    try {
      return JSON.parse(cached.data_json);
    } catch {}
  }

  const auth = await getToken(config, 'ws_sr_padron_a13');
  const padronUrl = PADRON_URLS[config.ambiente] || PADRON_URLS.homologacion;
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sr="http://ar.gov.afip.dif.sr.padron">
      <soapenv:Header />
      <soapenv:Body>
        <sr:getPersona>
          <sr:token>${auth.token}</sr:token>
          <sr:sign>${auth.sign}</sr:sign>
          <sr:cuitRepresentada>${config.cuit}</sr:cuitRepresentada>
          <sr:idPersona>${cuitNorm}</sr:idPersona>
        </sr:getPersona>
      </soapenv:Body>
    </soapenv:Envelope>`;

  const response = await soapRequest(padronUrl, envelope, 'getPersona');
  if (response.status !== 200) {
    throw new Error(`Padron HTTP ${response.status}`);
  }
  const parsed = parser.parse(response.body);
  const persona = findFirst(parsed, 'persona') || {};
  const domicilio = findFirst(persona, 'domicilioFiscal') || {};
  const datosMonotributo = findFirst(persona, 'datosMonotributo') || null;
  const datosRegimen = findFirst(persona, 'datosRegimenGeneral') || null;

  let condicionIva = 'consumidor_final';
  if (datosMonotributo) condicionIva = 'monotributo';
  else if (datosRegimen) condicionIva = 'responsable_inscripto';

  const result = {
    cuit: cuitNorm,
    razon_social: persona.razonSocial || persona.nombre || null,
    nombre: persona.nombre || null,
    apellido: persona.apellido || null,
    condicion_iva: condicionIva,
    tipo_persona: persona.tipoPersona || null,
    domicilio_fiscal: domicilio.direccion || domicilio.direccionCompleta || null,
    provincia: domicilio.provincia || domicilio.descripcionProvincia || null,
    localidad: domicilio.localidad || domicilio.descripcionLocalidad || null,
    codigo_postal: domicilio.codPostal || domicilio.codigoPostal || null,
    raw: persona,
  };

  await repo.savePadronCache(cuitNorm, result);
  return result;
}

async function saveConfig(data) {
  const existing = await repo.getConfig();
  const cuit = normalizeCuit(data.cuit || data.cuit_cuil || existing?.cuit);
  if (!cuit) throw new Error('CUIT invalido');
  const encrypted = {
    certificado_pem: data.certificado_pem ? await encryptString(data.certificado_pem) : undefined,
    clave_privada_pem: data.clave_privada_pem ? await encryptString(data.clave_privada_pem) : undefined,
    passphrase_enc: data.passphrase ? await encryptString(data.passphrase) : undefined,
  };
  const payload = {
    cuit,
    razon_social: data.razon_social,
    condicion_iva: data.condicion_iva,
    domicilio_fiscal: data.domicilio_fiscal,
    provincia: data.provincia,
    localidad: data.localidad,
    codigo_postal: data.codigo_postal,
    ambiente: data.ambiente,
    permitir_sin_entrega: data.permitir_sin_entrega,
    permitir_sin_pago: data.permitir_sin_pago,
    precios_incluyen_iva: data.precios_incluyen_iva,
    activo: data.activo,
    ...encrypted,
  };
  return repo.upsertConfig(payload);
}

function sanitizeConfig(config) {
  if (!config) return null;
  return {
    id: config.id,
    cuit: config.cuit,
    razon_social: config.razon_social,
    condicion_iva: config.condicion_iva,
    domicilio_fiscal: config.domicilio_fiscal,
    provincia: config.provincia,
    localidad: config.localidad,
    codigo_postal: config.codigo_postal,
    ambiente: config.ambiente,
    permitir_sin_entrega: Boolean(config.permitir_sin_entrega),
    permitir_sin_pago: Boolean(config.permitir_sin_pago),
    precios_incluyen_iva: config.precios_incluyen_iva == null ? true : Boolean(config.precios_incluyen_iva),
    activo: Boolean(config.activo),
    has_certificado: Boolean(config.certificado_pem),
    has_clave_privada: Boolean(config.clave_privada_pem),
    certificado_vto: config.certificado_vto || null,
  };
}

module.exports = {
  saveConfig,
  sanitizeConfig,
  testConnection,
  emitirFacturaDesdeVenta,
  buildSnapshotFromVenta,
  getPadronPersona,
  resolveComprobanteTipo,
  comprobanteTipoToCodigo,
};

