const { normalizePhoneToE164, deriveWhatsappStatus } = require('../utils/whatsappPhone');

describe('whatsappPhone utils', () => {
  test('normaliza numero ya internacional', () => {
    expect(normalizePhoneToE164('+5491122334455')).toBe('+5491122334455');
  });

  test('normaliza numero local AR a prefijo movil', () => {
    expect(normalizePhoneToE164('11 2233-4455')).toBe('+5491122334455');
  });

  test('rechaza numeros invalidos', () => {
    expect(normalizePhoneToE164('abc')).toBeNull();
  });

  test('deriva estado whatsapp', () => {
    expect(deriveWhatsappStatus({ telefonoRaw: '11 2233 4455', telefonoE164: '+5491122334455' })).toBe(
      'pending_validation'
    );
    expect(deriveWhatsappStatus({ telefonoRaw: 'sin telefono', telefonoE164: null })).toBe('invalid_format');
    expect(deriveWhatsappStatus({ telefonoRaw: '', telefonoE164: null })).toBe('unknown');
  });
});
