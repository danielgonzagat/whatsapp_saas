import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import { AdminMfaService } from './admin-mfa.service';
import { decryptAdminSecret } from '../common/admin-crypto';

function makeConfig(values: Record<string, string>): ConfigService {
  return {
    get: <T = string>(key: string) => (values[key] as unknown as T) ?? undefined,
  } as unknown as ConfigService;
}

describe('AdminMfaService', () => {
  const keyHex = randomBytes(32).toString('hex');

  it('throws on boot if ADMIN_MFA_ENCRYPTION_KEY is missing', () => {
    expect(() => new AdminMfaService(makeConfig({}))).toThrow(/ADMIN_MFA_ENCRYPTION_KEY/);
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
    const currentCode = authenticator.generate(plainSecret);

    expect(() => svc.verifyCode(setup.encryptedSecret, currentCode)).not.toThrow();
    expect(() => svc.verifyCode(setup.encryptedSecret, '000000')).toThrow();
    expect(() => svc.verifyCode(setup.encryptedSecret, 'abcdef')).toThrow();
    expect(() => svc.verifyCode(null, currentCode)).toThrow();
  });
});
