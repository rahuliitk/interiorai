import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('API_KEY_ENCRYPTION_SECRET must be set and at least 32 characters');
  }
  // Use the first 32 bytes of the secret as the key
  return Buffer.from(secret.slice(0, 32), 'utf-8');
}

export function encryptApiKey(plainKey: string) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainKey, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // Store prefix for display (e.g. "sk-ab..." → "sk-ab...")
  const keyPrefix = plainKey.slice(0, 6) + '...';

  return {
    encryptedKey: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    keyPrefix,
  };
}

export function decryptApiKey(encryptedKey: string, iv: string, authTag: string): string {
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encryptedKey, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
}
