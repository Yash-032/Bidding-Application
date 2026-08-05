import crypto from 'node:crypto';

function key() {
  const secret = process.env.PIXA_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error('Missing PIXA_TOKEN_ENCRYPTION_KEY');
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split('.');
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Invalid stored Pixa token');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
}