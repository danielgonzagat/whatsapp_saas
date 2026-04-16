import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
// `qrcode` is a CJS package; the Node resolver picks up its default export.

import * as QRCode from 'qrcode';
import { decryptAdminSecret, encryptAdminSecret } from '../common/admin-crypto';
import { adminErrors } from '../common/admin-api-errors';

// otplib: 30s step, window=2 (±60s tolerance). The wider window
// absorbs typical VM clock drift on Railway/Vercel Edge without
// making the OTP meaningfully weaker — an attacker still only has
// five 30s windows of attack surface instead of three, but the
// operator never gets a mysterious "invalid code" from a 10s
// server-client clock delta.
authenticator.options = { step: 30, window: 2 };

export interface MfaSetupResult {
  encryptedSecret: string; // persisted in admin_users.mfa_secret
  otpauthUrl: string; // encoded in the QR
  qrDataUrl: string; // data:image/png;base64,... for the /mfa/setup screen
}

@Injectable()
export class AdminMfaService {
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

  async createSetup(accountLabel: string): Promise<MfaSetupResult> {
    const secret = authenticator.generateSecret();
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
    } catch {
      throw adminErrors.cryptoFailure();
    }
    return this.buildSetup(accountLabel, secret, encryptedSecret);
  }

  private async buildSetup(
    accountLabel: string,
    secret: string,
    preEncrypted?: string,
  ): Promise<MfaSetupResult> {
    const otpauthUrl = authenticator.keyuri(accountLabel, this.issuer, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      width: 240,
      margin: 1,
    });
    const encryptedSecret = preEncrypted ?? encryptAdminSecret(secret, this.encryptionKey);
    return { encryptedSecret, otpauthUrl, qrDataUrl };
  }

  verifyCode(encryptedSecret: string | null | undefined, code: string): void {
    if (!encryptedSecret) throw adminErrors.mfaInvalidCode();
    if (!/^[0-9]{6}$/.test(code)) throw adminErrors.mfaInvalidCode();
    let secret: string;
    try {
      secret = decryptAdminSecret(encryptedSecret, this.encryptionKey);
    } catch {
      throw adminErrors.cryptoFailure();
    }
    const ok = authenticator.check(code, secret);
    if (!ok) throw adminErrors.mfaInvalidCode();
  }
}
