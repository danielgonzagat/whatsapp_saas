import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'node:crypto';
import { AdminMfaService } from './admin-mfa.service';
import { decryptAdminSecret } from '../common/admin-crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(secret: string): Buffer {
  let value = 0;
  let bits = 0;
  const bytes: number[] = [];

  for (const char of secret.toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error(`Invalid base32 character in MFA secret: ${char}`);
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function generateTotp(secret: string): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;

  return String(binary % 1_000_000).padStart(6, '0');
}

/**
 * Build a real ConfigService pre-seeded with the given values. Using the
 * real class (instead of a mock + double cast) keeps the test aligned with
 * production behavior and avoids the unsafe-casts guardrail.
 */
function makeConfig(values: Record<string, string>): ConfigService {
  return new ConfigService(values);
}

describe('AdminMfaService', () => {
  const keyHex = randomBytes(32).toString('hex');

  it('throws on boot outside test/CI if ADMIN_MFA_ENCRYPTION_KEY is missing', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousCi = process.env.CI;

    process.env.NODE_ENV = 'production';
    delete process.env.CI;

    try {
      expect(() => new AdminMfaService(makeConfig({}))).toThrow(/ADMIN_MFA_ENCRYPTION_KEY/);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (typeof previousCi === 'string') {
        process.env.CI = previousCi;
      } else {
        delete process.env.CI;
      }
    }
  });

  it('createSetup returns an encrypted secret, an otpauth URL, and a QR data URL', async () => {
    const svc = new AdminMfaService(
      makeConfig({ ADMIN_MFA_ENCRYPTION_KEY: keyHex, ADMIN_MFA_ISSUER: 'Kloel Admin' }),
    );
    const setup = await svc.createSetup('admin@example.com');
    expect(setup.otpauthUrl).toContain('otpauth://totp/');
    expect(setup.otpauthUrl).toContain('Kloel%20Admin');
    expect(setup.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);

    const decoded = decryptAdminSecret(setup.encryptedSecret, keyHex);
    expect(decoded.length).toBeGreaterThanOrEqual(16);
  });

  it('verifyCode accepts a current TOTP and rejects garbage / wrong code', async () => {
    const svc = new AdminMfaService(makeConfig({ ADMIN_MFA_ENCRYPTION_KEY: keyHex }));
    const setup = await svc.createSetup('admin@example.com');
    const plainSecret = decryptAdminSecret(setup.encryptedSecret, keyHex);
    const currentCode = generateTotp(plainSecret);

    expect(() => svc.verifyCode(setup.encryptedSecret, currentCode)).not.toThrow();
    expect(() => svc.verifyCode(setup.encryptedSecret, '000000')).toThrow();
    expect(() => svc.verifyCode(setup.encryptedSecret, 'abcdef')).toThrow();
    expect(() => svc.verifyCode(null, currentCode)).toThrow();
  });
});
