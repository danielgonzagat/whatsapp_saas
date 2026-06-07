import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { toDataURL as qrToDataURL } from 'qrcode';
import { decryptAdminSecret, encryptAdminSecret } from '../admin/common/admin-crypto';
import { StructuredLogger } from '../logging/structured-logger';
import {
  MFA_PERIOD_SECONDS,
  generateMfaSecret,
  verifyTotp,
} from '../common/totp';

const MFA_CODE_RE = /^[0-9]{6}$/;
const TEST_ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000';

export interface AccountMfaSetupResult {
  encryptedSecret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

@Injectable()
export class AccountMfaService {
  private readonly logger = StructuredLogger.from(AccountMfaService.name);
  private readonly encryptionKey: string;
  private readonly issuer: string;

  constructor(config: ConfigService) {
    const configuredKey =
      config.get<string>('ACCOUNT_MFA_ENCRYPTION_KEY') ??
      config.get<string>('ADMIN_MFA_ENCRYPTION_KEY');
    if (!configuredKey) {
      if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
        this.encryptionKey = TEST_ENCRYPTION_KEY;
      } else {
        throw new Error(
          'ACCOUNT_MFA_ENCRYPTION_KEY or ADMIN_MFA_ENCRYPTION_KEY must be set before AccountMfaService is used',
        );
      }
    } else {
      this.encryptionKey = configuredKey;
    }
    this.issuer = config.get<string>('ACCOUNT_MFA_ISSUER') ?? 'Kloel';
  }

  async createSetup(accountLabel: string): Promise<AccountMfaSetupResult> {
    return this.buildSetup(accountLabel, generateMfaSecret());
  }

  async resumeSetup(accountLabel: string, encryptedSecret: string): Promise<AccountMfaSetupResult> {
    const secret = this.decryptSecret(encryptedSecret, 'resumeSetup');
    return this.buildSetup(accountLabel, secret, encryptedSecret);
  }

  verifyCode(encryptedSecret: string | null | undefined, code: string): void {
    if (!encryptedSecret || !MFA_CODE_RE.test(code)) {
      throw new UnauthorizedException('Codigo 2FA invalido.');
    }
    const secret = this.decryptSecret(encryptedSecret, 'verifyCode');
    if (
      !verifyTotp(
        secret,
        code,
        undefined,
        () => new UnauthorizedException('Codigo 2FA invalido.'),
      )
    ) {
      throw new UnauthorizedException('Codigo 2FA invalido.');
    }
  }

  private async buildSetup(
    accountLabel: string,
    secret: string,
    preEncrypted?: string,
  ): Promise<AccountMfaSetupResult> {
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

  private decryptSecret(encryptedSecret: string, context: string): string {
    try {
      return decryptAdminSecret(encryptedSecret, this.encryptionKey);
    } catch (error) {
      this.logger.error(
        'Failed to decrypt account MFA secret',
        error instanceof Error ? error.message : String(error),
        { context: `AccountMfaService.${context}` },
      );
      throw new BadRequestException('Nao foi possivel validar o segredo 2FA desta conta.');
    }
  }
}
