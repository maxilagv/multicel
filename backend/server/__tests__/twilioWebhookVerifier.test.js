const { __test__ } = require('../services/messaging/twilioWebhookVerifier');

describe('twilio webhook verifier helpers', () => {
  test('builds deterministic signature from url and params', () => {
    const signature = __test__.buildExpectedSignature(
      'test_auth_token',
      'https://example.com/api/webhooks/twilio/whatsapp',
      {
        Body: 'Hola',
        From: 'whatsapp:+5491112345678',
        MessageSid: 'SM123',
      }
    );

    expect(signature).toBe('ANAO9dacydWHL1qBxdEqeK6hsIo=');
  });
});
