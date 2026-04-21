function onlyDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function isValidE164Digits(digits) {
  return /^[1-9]\d{7,14}$/.test(String(digits || ''));
}

function normalizePhoneToE164(raw, { defaultCountryCode } = {}) {
  const input = String(raw || '').trim();
  if (!input) return null;

  const cfgCountry =
    onlyDigits(defaultCountryCode || process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '54') || '54';

  let candidate = input;
  if (candidate.startsWith('00')) {
    candidate = `+${candidate.slice(2)}`;
  }

  if (candidate.startsWith('+')) {
    const digits = onlyDigits(candidate);
    return isValidE164Digits(digits) ? `+${digits}` : null;
  }

  let national = onlyDigits(candidate);
  if (!national) return null;
  national = national.replace(/^0+/, '');
  if (!national) return null;

  // Argentina heuristic: default to mobile (+549...) when format is local.
  if (cfgCountry === '54') {
    if (national.startsWith('54')) {
      const afterCc = national.slice(2);
      if (isValidE164Digits(national)) return `+${national}`;
      if (afterCc.length >= 10 && afterCc.length <= 11) {
        const mobile = `549${afterCc}`;
        return isValidE164Digits(mobile) ? `+${mobile}` : null;
      }
    }
    if (national.length >= 10 && national.length <= 11 && !national.startsWith('9')) {
      const mobile = `549${national}`;
      return isValidE164Digits(mobile) ? `+${mobile}` : null;
    }
  }

  if (national.startsWith(cfgCountry) && isValidE164Digits(national)) {
    return `+${national}`;
  }

  const prefixed = `${cfgCountry}${national}`;
  return isValidE164Digits(prefixed) ? `+${prefixed}` : null;
}

function deriveWhatsappStatus({ telefonoRaw, telefonoE164 }) {
  if (telefonoE164) return 'pending_validation';
  if (String(telefonoRaw || '').trim()) return 'invalid_format';
  return 'unknown';
}

module.exports = {
  normalizePhoneToE164,
  deriveWhatsappStatus,
};
