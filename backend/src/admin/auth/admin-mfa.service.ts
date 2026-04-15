import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
// `qrcode` is a CJS package; the Node resolver picks up its default export.

import * as QRCode from 'qrcode';
import { decryptAdminSecret, encryptAdminSecret } from '../common/admin-crypto';
import { adminErrors } from '../common/admin-api-errors';

// otplib defaults to a 30s step and 1 window of tolerance which is what we
// want — ±30s clock skew is standard for TOTP consumers (Google Authenticator,
// 1Password, Authy). We make the step explicit so test clocks can be
// controlled deterministically.
authenticator.options = { step: 30, window: 1 };

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
    const key = config.get<string>('ADMIN_MFA_ENCRYPTION_KEY');
    if (!key) {
      throw new Error('ADMIN_MFA_ENCRYPTION_KEY must be set before AdminMfaService is used');
    }
    this.encryptionKey = key;
    this.issuer = config.get<string>('ADMIN_MFA_ISSUER') ?? 'Kloel Admin';
  }

  async createSetup(accountLabel: string): Promise<MfaSetupResult> {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(accountLabel, this.issuer, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      width: 240,
      margin: 1,
    });
    const encryptedSecret = encryptAdminSecret(secret, this.encryptionKey);
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
