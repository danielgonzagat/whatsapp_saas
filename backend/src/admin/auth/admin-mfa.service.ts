import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
// `qrcode` is a CJS package; the Node resolver picks up its default export.

import { toDataURL as qrToDataURL } from 'qrcode';
import { decryptAdminSecret, encryptAdminSecret } from '../common/admin-crypto';
import { adminErrors } from '../common/admin-api-errors';

const RX_0_9__6_RE = /^[0-9]{6}$/;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const MFA_PERIOD_SECONDS = 30;
const MFA_WINDOW_STEPS = 2;

function generateMfaSecret(): string {
  return base32Encode(randomBytes(20));
}

function base32Encode(bytes: Buffer): string {
  let output = '';
  let value = 0;
  let bits = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(secret: string): Buffer {
  let value = 0;
  let bits = 0;
  const bytes: number[] = [];

  for (const char of secret.replace(/=+$/u, '').toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw adminErrors.mfaInvalidCode();
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

function generateTotp(secret: string, timeStep: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timeStep));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const lastByte = digest[digest.length - 1];
  const offset = (lastByte ?? 0) & 15;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;

  return String(binary % 1_000_000).padStart(6, '0');
}

function verifyTotp(
  secret: string,
  code: string,
  epochSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const currentStep = Math.floor(epochSeconds / MFA_PERIOD_SECONDS);
  const provided = Buffer.from(code);

  for (let offset = -MFA_WINDOW_STEPS; offset <= MFA_WINDOW_STEPS; offset += 1) {
    const expected = Buffer.from(generateTotp(secret, currentStep + offset));
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      return true;
    }
  }

  return false;
}

/** Mfa setup result shape. */
export interface MfaSetupResult {
  /** Encrypted secret property. */
  encryptedSecret: string; // persisted in admin_users.mfa_secret
  /** Otpauth url property. */
  otpauthUrl: string; // encoded in the QR
  /** Qr data url property. */
  qrDataUrl: string; // data:image/png;base64,... for the /mfa/setup screen
}

/** Admin mfa service. */
@Injectable()
export class AdminMfaService {
  private readonly logger = new Logger(AdminMfaService.name);
  private readonly encryptionKey: string;
  private readonly issuer: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    let key = config.get<string>('ADMIN_MFA_ENCRYPTION_KEY');
    if (!key) {
      if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
        // Deterministic 32-byte hex key for CI/e2e boot smoke only.
        // Never matches a real production key. Production/staging/
        // preview require the real env var.
        key = '0000000000000000000000000000000000000000000000000000000000000000';
      } else {
        throw new Error('ADMIN_MFA_ENCRYPTION_KEY must be set before AdminMfaService is used');
      }
    }
    this.encryptionKey = key;
    this.issuer = config.get<string>('ADMIN_MFA_ISSUER') ?? 'Kloel Admin';
  }

  /** Create setup. */
  async createSetup(accountLabel: string): Promise<MfaSetupResult> {
    const secret = generateMfaSecret();
    return this.buildSetup(accountLabel, secret);
  }

  /**
   * Re-render the setup payload (QR + otpauth URL) for a previously
   * generated secret. Called when the frontend re-mounts the MFA
   * setup page (React Strict Mode, page refresh, network retry) —
   * without this helper, setupMfa would generate a fresh secret,
   * overwrite the pending one, and invalidate the QR the user just
   * scanned.
   */
  async resumeSetup(accountLabel: string, encryptedSecret: string): Promise<MfaSetupResult> {
    let secret: string;
    try {
      secret = decryptAdminSecret(encryptedSecret, this.encryptionKey);
    } catch (err) {
      this.logger.error(
        'Failed to decrypt MFA secret during resume',
        err instanceof Error ? err.message : String(err),
        {
          context: 'AdminMfaService.resumeSetup',
        },
      );
      throw adminErrors.cryptoFailure();
    }
    return this.buildSetup(accountLabel, secret, encryptedSecret);
  }

  private async buildSetup(
    accountLabel: string,
    secret: string,
    preEncrypted?: string,
  ): Promise<MfaSetupResult> {
    const label = `${encodeURIComponent(this.issuer)}:${encodeURIComponent(accountLabel)}`;
    const issuer = encodeURIComponent(this.issuer);
    const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&period=${MFA_PERIOD_SECONDS}&digits=6&algorithm=SHA1`;
    const qrDataUrl = await qrToDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      width: 240,
      margin: 1,
    });
    const encryptedSecret = preEncrypted ?? encryptAdminSecret(secret, this.encryptionKey);
    return { encryptedSecret, otpauthUrl, qrDataUrl };
  }

  /** Verify code. */
  verifyCode(encryptedSecret: string | null | undefined, code: string): void {
    if (!encryptedSecret) {
      throw adminErrors.mfaInvalidCode();
    }
    if (!RX_0_9__6_RE.test(code)) {
      throw adminErrors.mfaInvalidCode();
    }
    let secret: string;
    try {
      secret = decryptAdminSecret(encryptedSecret, this.encryptionKey);
    } catch (err) {
      this.logger.error(
        'Failed to decrypt MFA secret during verify',
        err instanceof Error ? err.message : String(err),
        {
          context: 'AdminMfaService.verifyCode',
        },
      );
      throw adminErrors.cryptoFailure();
    }
    const ok = verifyTotp(secret, code);
    if (!ok) {
      throw adminErrors.mfaInvalidCode();
    }
  }
}
