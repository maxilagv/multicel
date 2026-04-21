/**
 * Tests del sistema de licencias
 * Cobertura alta justificada: es la capa de seguridad comercial del producto.
 */

const { generateLicense, validateLicense, getLicenseInfo, isModuleEnabled } =
  require('../../services/licenseService');

const MASTER_KEY = 'test-license-master-key-32-chars';
const FUTURE_DATE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // +1 año
const PAST_DATE = new Date(Date.now() - 24 * 60 * 60 * 1000); // ayer

// ── generateLicense ──────────────────────────────────────────
describe('generateLicense()', () => {
  it('genera una clave que empieza con KAISEN-', () => {
    const key = generateLicense({
      clientId: 'test-001',
      companyName: 'Test SA',
      modules: ['basico'],
      expiresAt: FUTURE_DATE,
    });
    expect(key).toMatch(/^KAISEN-/);
  });

  it('genera claves distintas para distintos clientes', () => {
    const k1 = generateLicense({ clientId: 'c1', companyName: 'A', modules: ['basico'], expiresAt: FUTURE_DATE });
    const k2 = generateLicense({ clientId: 'c2', companyName: 'B', modules: ['basico'], expiresAt: FUTURE_DATE });
    expect(k1).not.toBe(k2);
  });

  it('lanza error si no hay LICENSE_MASTER_KEY', () => {
    const orig = process.env.LICENSE_MASTER_KEY;
    delete process.env.LICENSE_MASTER_KEY;
    expect(() => generateLicense({ clientId: 'x', companyName: 'X', expiresAt: FUTURE_DATE }))
      .toThrow('LICENSE_MASTER_KEY');
    process.env.LICENSE_MASTER_KEY = orig;
  });

  it('lanza error para fecha inválida', () => {
    expect(() => generateLicense({ clientId: 'x', companyName: 'X', expiresAt: 'no-es-fecha' }))
      .toThrow('fecha válida');
  });

  it('normaliza módulos inválidos a [basico]', () => {
    const key = generateLicense({
      clientId: 'x', companyName: 'X',
      modules: ['modulo_inventado', 'otro_falso'],
      expiresAt: FUTURE_DATE,
    });
    const result = validateLicense(key);
    expect(result.modules).toEqual(['basico']);
  });
});

// ── validateLicense ──────────────────────────────────────────
describe('validateLicense()', () => {
  let validKey;

  beforeEach(() => {
    validKey = generateLicense({
      clientId: 'cliente-001',
      companyName: 'Almacén García',
      modules: ['basico', 'whatsapp', 'ia'],
      expiresAt: FUTURE_DATE,
    });
  });

  it('valida una licencia correcta', () => {
    const result = validateLicense(validKey);
    expect(result.valid).toBe(true);
    expect(result.clientId).toBe('cliente-001');
    expect(result.companyName).toBe('Almacén García');
    expect(result.modules).toEqual(['basico', 'whatsapp', 'ia']);
  });

  it('rechaza licencia vacía', () => {
    expect(validateLicense('')).toMatchObject({ valid: false });
    expect(validateLicense(null)).toMatchObject({ valid: false });
    expect(validateLicense(undefined)).toMatchObject({ valid: false });
  });

  it('rechaza licencia con firma alterada', () => {
    const tampered = validKey.slice(0, -10) + 'AAAAAAAAAA';
    const result = validateLicense(tampered);
    expect(result.valid).toBe(false);
  });

  it('rechaza licencia vencida', () => {
    const expiredKey = generateLicense({
      clientId: 'x', companyName: 'X',
      modules: ['basico'],
      expiresAt: PAST_DATE,
    });
    const result = validateLicense(expiredKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/vencida/i);
  });

  it('rechaza string random que no es una licencia', () => {
    expect(validateLicense('esto-no-es-una-licencia')).toMatchObject({ valid: false });
    expect(validateLicense('KAISEN-invalid_base64!!!')).toMatchObject({ valid: false });
  });

  it('acepta licencia con o sin prefijo KAISEN-', () => {
    const withoutPrefix = validKey.replace('KAISEN-', '');
    const result = validateLicense(withoutPrefix);
    expect(result.valid).toBe(true);
  });

  it('reporta daysLeft correcto (≈365 para licencia de 1 año)', () => {
    const result = validateLicense(validKey);
    expect(result.daysLeft).toBeGreaterThan(360);
    expect(result.daysLeft).toBeLessThanOrEqual(366);
  });

  it('reporta expiringSoon para licencia que vence en < 30 días', () => {
    const soonExpiring = generateLicense({
      clientId: 'x', companyName: 'X',
      modules: ['basico'],
      expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 días
    });
    const result = validateLicense(soonExpiring);
    expect(result.valid).toBe(true);
    expect(result.expiringSoon).toBe(true);
  });
});

// ── isModuleEnabled ──────────────────────────────────────────
describe('isModuleEnabled()', () => {
  it('en modo dev (sin LICENSE_KEY) todos los módulos están habilitados', () => {
    const orig = process.env.LICENSE_KEY;
    delete process.env.LICENSE_KEY;
    expect(isModuleEnabled('ia')).toBe(true);
    expect(isModuleEnabled('marketplace')).toBe(true);
    process.env.LICENSE_KEY = orig;
  });

  it('con licencia válida devuelve true solo para módulos incluidos', () => {
    const key = generateLicense({
      clientId: 'x', companyName: 'X',
      modules: ['basico', 'whatsapp'],
      expiresAt: FUTURE_DATE,
    });
    process.env.LICENSE_KEY = key;

    expect(isModuleEnabled('basico')).toBe(true);
    expect(isModuleEnabled('whatsapp')).toBe(true);
    expect(isModuleEnabled('ia')).toBe(false);
    expect(isModuleEnabled('marketplace')).toBe(false);

    delete process.env.LICENSE_KEY;
  });
});
