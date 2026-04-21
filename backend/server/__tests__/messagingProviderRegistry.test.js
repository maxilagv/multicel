describe('messaging provider registry', () => {
  const originalProvider = process.env.WHATSAPP_PROVIDER;
  const originalEnabled = process.env.WHATSAPP_ENABLED;

  afterEach(() => {
    if (originalProvider === undefined) delete process.env.WHATSAPP_PROVIDER;
    else process.env.WHATSAPP_PROVIDER = originalProvider;

    if (originalEnabled === undefined) delete process.env.WHATSAPP_ENABLED;
    else process.env.WHATSAPP_ENABLED = originalEnabled;

    jest.resetModules();
  });

  beforeEach(() => {
    jest.resetModules();
  });

  test('uses web by default in active flow', () => {
    delete process.env.WHATSAPP_PROVIDER;
    process.env.WHATSAPP_ENABLED = 'true';

    const registry = require('../services/messaging/providerRegistry');
    expect(registry.resolveProviderName()).toBe('web');
  });

  test('uses web provider when configured', () => {
    process.env.WHATSAPP_PROVIDER = 'web';
    process.env.WHATSAPP_ENABLED = 'true';

    const registry = require('../services/messaging/providerRegistry');
    expect(registry.resolveProviderName()).toBe('web');
  });

  test('uses off provider when disabled', () => {
    process.env.WHATSAPP_PROVIDER = 'web';
    process.env.WHATSAPP_ENABLED = 'false';

    const registry = require('../services/messaging/providerRegistry');
    expect(registry.resolveProviderName()).toBe('off');
  });

  test('uses twilio provider when configured', () => {
    process.env.WHATSAPP_PROVIDER = 'twilio';
    process.env.WHATSAPP_ENABLED = 'true';

    const registry = require('../services/messaging/providerRegistry');
    expect(registry.resolveProviderName()).toBe('twilio');
  });
});

describe('whatsapp web provider helpers', () => {
  test('normalizes destination jid', () => {
    const provider = require('../services/messaging/providers/whatsappWebProvider');
    expect(provider.__test__.toJid('+54 9 11 1234-5678')).toBe(
      '5491112345678@s.whatsapp.net'
    );
  });

  test('normalizes phone from jid', () => {
    const provider = require('../services/messaging/providers/whatsappWebProvider');
    expect(provider.__test__.jidToPhone('5491112345678:15@s.whatsapp.net')).toBe(
      '+5491112345678'
    );
  });
});
