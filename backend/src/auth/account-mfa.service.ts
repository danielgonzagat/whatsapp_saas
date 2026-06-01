import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { toDataURL as qrToDataURL } from 'qrcode';
import { decryptAdminSecret, encryptAdminSecret } from '../admin/common/admin-crypto';
import { StructuredLogger } from '../logging/structured-logger';

const MFA_CODE_RE = /^[0-9]{6}$/;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const MFA_PERIOD_SECONDS = 30;
const MFA_WINDOW_STEPS = 2;
const TEST_ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000';

export interface AccountMfaSetupResult {
  encryptedSecret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

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
      throw new UnauthorizedException('Codigo 2FA invalido.');
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
    if (!verifyTotp(secret, code)) {
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
