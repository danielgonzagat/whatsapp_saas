import * as crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const CURRENT_KEY_VERSION = 1;

function handleMissingTokenCryptoKey(envVar: string): null {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`[TOKEN_CRYPTO] ${envVar} is required in production`);
  }
  return null;
}

function resolveKeyForVersion(version: number): Buffer | null {
  const envMap: Record<number, string> = {
    1: 'TIKTOK_TOKEN_ENCRYPTION_KEY',
  };

  const envVar = envMap[version];
  if (!envVar) {
    return null;
  }

  const keyRaw = String(process.env[envVar] || '').trim();
  if (!keyRaw) {
    return handleMissingTokenCryptoKey(envVar);
  }

  if (keyRaw.length === 64 && /^[a-f0-9]{64}$/i.test(keyRaw)) {
    return Buffer.from(keyRaw, 'hex');
  }

  try {
    const decoded = Buffer.from(keyRaw, 'base64');
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    void 0;
  }

  return crypto.createHash('sha256').update(keyRaw).digest();
}

export function encryptTikTokToken(token: string | null | undefined): string | null | undefined {
  if (!token) {
    return token;
  }

  const key = resolveKeyForVersion(CURRENT_KEY_VERSION);
  if (!key) {
    return token;
  }

  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, encrypted, authTag]);
  const versioned = `v${CURRENT_KEY_VERSION}.${combined.toString('base64')}`;

  return versioned;
}

export function decryptTikTokToken(token: string | null | undefined): string | null {
  if (!token) {
    return null;
  }

  const versionedMatch = String(token).match(/^v(\d+)\.(.+)$/);
  if (!versionedMatch || !versionedMatch[1] || !versionedMatch[2]) {
    return token;
  }

  const version = parseInt(versionedMatch[1], 10);
  const encodedData = versionedMatch[2];

  const key = resolveKeyForVersion(version);
  if (!key) {
    return token;
  }

  let combined: Buffer;
  try {
    combined = Buffer.from(encodedData, 'base64');
  } catch {
    return token;
  }

  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    return token;
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return token;
  }
}
