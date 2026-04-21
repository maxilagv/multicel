let sgMail = null;
let SENDGRID_AVAILABLE = false;
try {
  // Optional require: avoids crashing if @sendgrid/mail is not installed
  // in local development.
  // eslint-disable-next-line global-require
  sgMail = require('@sendgrid/mail');
  SENDGRID_AVAILABLE = true;
} catch (_) {
  SENDGRID_AVAILABLE = false;
}

const API_KEY = process.env.SENDGRID_API_KEY;
if (SENDGRID_AVAILABLE && API_KEY) {
  sgMail.setApiKey(API_KEY);
}

function resolveFrom() {
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME || process.env.SMTP_FROM_NAME || 'Seguridad Tecnocel';
  if (!fromEmail) return null;
  return `${fromName} <${fromEmail}>`;
}

async function sendVerificationEmail(to, code) {
  const from = resolveFrom();
  if (SENDGRID_AVAILABLE && API_KEY && from) {
    const msg = {
      to,
      from,
      subject: 'Codigo de verificacion',
      text: `Tu codigo es: ${code}`,
      html: `<p>Tu codigo es: <b>${code}</b></p>`,
    };
    return sgMail.send(msg);
  }
  // Fallback in local/dev: simulate sending
  console.warn('[Mailer] SendGrid not configured/installed. Simulating OTP email:', { to, code });
  return { simulated: true };
}

module.exports = { sendVerificationEmail };

