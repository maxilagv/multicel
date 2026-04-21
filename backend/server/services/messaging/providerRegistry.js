const disabledProvider = require('./providers/disabledProvider');
const whatsappWebProvider = require('./providers/whatsappWebProvider');
const twilioWhatsappProvider = require('./providers/twilioWhatsappProvider');

function resolveProviderName() {
  const enabled = String(process.env.WHATSAPP_ENABLED || 'true').trim().toLowerCase();
  if (enabled === 'false' || enabled === '0' || enabled === 'off') return 'off';

  const raw = String(process.env.WHATSAPP_PROVIDER || 'web').trim().toLowerCase();
  if (raw === 'off' || raw === 'disabled' || raw === 'none') return 'off';
  if (raw === 'twilio' || raw === 'official' || raw === 'api') return 'twilio';
  return 'web';
}

function getProviderByName(name) {
  if (name === 'web') return whatsappWebProvider;
  if (name === 'twilio') return twilioWhatsappProvider;
  return disabledProvider;
}

function getActiveProvider() {
  return getProviderByName(resolveProviderName());
}

async function getActiveProviderStatus() {
  return getActiveProvider().getStatus();
}

async function bootActiveProvider() {
  return getActiveProvider().boot();
}

module.exports = {
  resolveProviderName,
  getProviderByName,
  getActiveProvider,
  getActiveProviderStatus,
  bootActiveProvider,
};
