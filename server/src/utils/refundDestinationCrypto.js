const crypto = require('node:crypto');

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

function getKey() {
  const configured = String(process.env.REFUND_DESTINATION_ENCRYPTION_KEY || '').trim();
  if (configured) {
    const key = /^[0-9a-f]{64}$/i.test(configured)
      ? Buffer.from(configured, 'hex')
      : Buffer.from(configured, 'base64');
    if (key.length === 32) return key;
    throw new Error('REFUND_DESTINATION_ENCRYPTION_KEY must decode to 32 bytes');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('REFUND_DESTINATION_ENCRYPTION_KEY is required in production');
  }

  // A development/test fallback keeps unit tests deterministic while the
  // production configuration remains explicit and is documented in .env.example.
  return crypto.createHash('sha256')
    .update(String(process.env.JWT_SECRET || 'greenhome-local-refund-destination-key'))
    .digest();
}

function encrypt(value) {
  const plaintext = String(value ?? '');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
}

function decrypt(value) {
  const parts = String(value || '').split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Invalid encrypted refund destination');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(parts[1], 'base64url'));
  decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8');
}

function mask(value, visible = 4) {
  const normalized = String(value || '');
  if (!normalized) return '';
  if (normalized.length <= visible) return '*'.repeat(normalized.length);
  return `${'*'.repeat(Math.max(4, normalized.length - visible))}${normalized.slice(-visible)}`;
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function fingerprint(value) {
  return crypto.createHmac('sha256', getKey()).update(String(value || '')).digest('hex');
}

module.exports = { encrypt, decrypt, mask, hash, fingerprint };
