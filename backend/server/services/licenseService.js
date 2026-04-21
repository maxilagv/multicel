/**
 * Sistema de Licencias por Instalación
 *
 * Cada cliente recibe una clave única que:
 *   - Identifica la instalación
 *   - Define qué módulos tiene habilitados
 *   - Tiene fecha de vencimiento
 *
 * La LICENSE_MASTER_KEY es secreta y permanece solo con el desarrollador.
 * La LICENSE_KEY (por cliente) se entrega al cliente y se configura en .env.
 *
 * Generar una licencia nueva:
 *   node scripts/generate-license.js --client "almacen-garcia" --company "Almacén García" --modules basico,whatsapp --expires 2027-01-01
 */

const crypto = require('crypto');

// Leer en runtime (no cachear en el módulo) para permitir tests y rotación sin reiniciar
function getMasterKey() { return process.env.LICENSE_MASTER_KEY; }
function getLicenseKey() { return process.env.LICENSE_KEY; }

const VALID_MODULES = ['basico', 'whatsapp', 'ia', 'marketplace', 'arca', 'crm', 'multi_deposito', 'integraciones'];

/**
 * Genera una clave de licencia firmada para un cliente.
 * Solo el desarrollador debe usar esta función.
 *
 * @param {object} opts
 * @param {string} opts.clientId   - Identificador único del cliente (slug, ej: "almacen-garcia")
 * @param {string} opts.companyName - Nombre de la empresa
 * @param {string[]} opts.modules   - Módulos habilitados
 * @param {Date|string} opts.expiresAt - Fecha de vencimiento
 * @returns {string} Clave de licencia (comienza con KAISEN-)
 */
function generateLicense({ clientId, companyName, modules = ['basico'], expiresAt }) {
  const MASTER_KEY = getMasterKey();
  if (!MASTER_KEY) throw new Error('LICENSE_MASTER_KEY no está configurada');
  if (!clientId) throw new Error('clientId es requerido');
  if (!companyName) throw new Error('companyName es requerido');

  const expDate = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (isNaN(expDate.getTime())) throw new Error('expiresAt no es una fecha válida');

  const validModules = (Array.isArray(modules) ? modules : [modules]).filter((m) =>
    VALID_MODULES.includes(m)
  );
  if (validModules.length === 0) validModules.push('basico');

  const payload = {
    v: 1,
    cid: String(clientId).trim(),
    cn: String(companyName).trim(),
    mod: validModules,
    exp: expDate.toISOString(),
    iat: new Date().toISOString(),
  };

  const payloadStr = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', MASTER_KEY).update(payloadStr).digest('hex');

  const encoded = Buffer.from(JSON.stringify({ ...payload, sig })).toString('base64url');
  return `KAISEN-${encoded}`;
}

/**
 * Valida una clave de licencia.
 * @param {string} licenseKey
 * @returns {{ valid: boolean, reason?: string, clientId?: string, companyName?: string, modules?: string[], expiresAt?: string }}
 */
function validateLicense(licenseKey) {
  const MASTER_KEY = getMasterKey();
  if (!licenseKey) return { valid: false, reason: 'Sin clave de licencia' };

  if (!MASTER_KEY) {
    // Sin clave maestra configurada: en desarrollo se omite la validación
    if (process.env.NODE_ENV !== 'production') {
      return { valid: true, dev: true, modules: VALID_MODULES };
    }
    return { valid: false, reason: 'LICENSE_MASTER_KEY no configurada en servidor' };
  }

  try {
    const raw = licenseKey.startsWith('KAISEN-') ? licenseKey.slice(7) : licenseKey;
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString());
    const { sig, ...payload } = parsed;

    if (!sig || typeof sig !== 'string') {
      return { valid: false, reason: 'Licencia sin firma' };
    }

    const expectedSig = crypto
      .createHmac('sha256', MASTER_KEY)
      .update(JSON.stringify(payload))
      .digest('hex');

    // Comparación a tiempo constante para prevenir timing attacks
    const sigBuf = Buffer.from(sig.padEnd(64, '0'), 'hex');
    const expBuf = Buffer.from(expectedSig.padEnd(64, '0'), 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, reason: 'Firma de licencia inválida' };
    }

    const expDate = new Date(payload.exp);
    if (isNaN(expDate.getTime())) return { valid: false, reason: 'Fecha de vencimiento inválida' };
    if (expDate < new Date()) {
      return {
        valid: false,
        reason: `Licencia vencida el ${expDate.toLocaleDateString('es-AR')}`,
      };
    }

    // Advertencia si vence en menos de 30 días
    const daysLeft = Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24));
    return {
      valid: true,
      clientId: payload.cid,
      companyName: payload.cn,
      modules: Array.isArray(payload.mod) ? payload.mod : ['basico'],
      expiresAt: payload.exp,
      issuedAt: payload.iat,
      daysLeft,
      expiringSoon: daysLeft <= 30,
    };
  } catch {
    return { valid: false, reason: 'Formato de licencia inválido' };
  }
}

/**
 * Obtiene y valida la licencia configurada en .env (LICENSE_KEY).
 * @returns {{ valid: boolean, ... }}
 */
function getLicenseInfo() {
  const key = getLicenseKey();
  if (!key) {
    if (process.env.NODE_ENV !== 'production') {
      return { valid: true, dev: true, mode: 'development', modules: VALID_MODULES };
    }
    return { valid: false, reason: 'LICENSE_KEY no configurada' };
  }
  return validateLicense(key);
}

/**
 * Verifica si un módulo específico está habilitado en la licencia actual.
 * @param {string} moduleName
 * @returns {boolean}
 */
function isModuleEnabled(moduleName) {
  const info = getLicenseInfo();
  if (!info.valid) return false;
  if (info.dev) return true; // En desarrollo todo habilitado
  return Array.isArray(info.modules) && info.modules.includes(moduleName);
}

module.exports = {
  generateLicense,
  validateLicense,
  getLicenseInfo,
  isModuleEnabled,
  VALID_MODULES,
};
