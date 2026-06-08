import { createHmac } from 'node:crypto';
import {
  BASE32_ALPHABET,
  MFA_PERIOD_SECONDS,
  MFA_WINDOW_STEPS,
  base32Decode,
  base32Encode,
  generateMfaSecret,
  generateTotp,
  verifyTotp,
} from './totp';

/**
 * Independent reference re-implementation of the TOTP derivation, kept
 * deliberately separate from the production code so the test cannot pass
 * by sharing a bug with it. This mirrors the byte-identical logic that
 * AccountMfaService and AdminMfaService each used to carry inline before
 * P1 #15 hoisted it into common/totp.ts.
 */
function referenceTotp(secret: string, timeStep: number): string {
  const decoded = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timeStep));
  const digest = createHmac('sha1', decoded).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 15;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

describe('common/totp', () => {
  it('exports the canonical constants verbatim', () => {
    expect(BASE32_ALPHABET).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567');
    expect(MFA_PERIOD_SECONDS).toBe(30);
    expect(MFA_WINDOW_STEPS).toBe(2);
  });

  it('base32 encode/decode round-trips arbitrary bytes', () => {
    const bytes = Buffer.from([0x00, 0x7f, 0x80, 0xff, 0x10, 0x32, 0x54, 0x76, 0x98]);
    const encoded = base32Encode(bytes);
    expect(encoded).toMatch(/^[A-Z2-7]+$/u);
    // base32Decode tolerates trailing padding bits, so compare the common prefix.
    const decoded = base32Decode(encoded);
    expect(decoded.subarray(0, bytes.length)).toEqual(bytes);
  });

  it('generateMfaSecret produces a valid base32 secret of expected length', () => {
    const secret = generateMfaSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/u);
    // 20 random bytes => 160 bits => 32 base32 chars.
    expect(secret.length).toBe(32);
  });

  it('generateTotp matches an independent reference derivation', () => {
    const secret = generateMfaSecret();
    for (const step of [0, 1, 12345, 9_999_999]) {
      expect(generateTotp(secret, step)).toBe(referenceTotp(secret, step));
    }
  });

  it('verifyTotp accepts the current code and codes inside the window', () => {
    const secret = generateMfaSecret();
    const epoch = 1_700_000_000;
    const step = Math.floor(epoch / MFA_PERIOD_SECONDS);

    expect(verifyTotp(secret, generateTotp(secret, step), epoch)).toBe(true);
    expect(verifyTotp(secret, generateTotp(secret, step - MFA_WINDOW_STEPS), epoch)).toBe(true);
    expect(verifyTotp(secret, generateTotp(secret, step + MFA_WINDOW_STEPS), epoch)).toBe(true);
  });

  it('verifyTotp rejects codes outside the window and malformed codes', () => {
    const secret = generateMfaSecret();
    const epoch = 1_700_000_000;
    const step = Math.floor(epoch / MFA_PERIOD_SECONDS);

    expect(verifyTotp(secret, generateTotp(secret, step + MFA_WINDOW_STEPS + 1), epoch)).toBe(
      false,
    );
    expect(verifyTotp(secret, generateTotp(secret, step - MFA_WINDOW_STEPS - 1), epoch)).toBe(
      false,
    );
    expect(verifyTotp(secret, '000000', epoch)).toBe(false);
    expect(verifyTotp(secret, 'not-a-code', epoch)).toBe(false);
  });

  it('base32Decode throws a generic Error by default on an invalid character', () => {
    expect(() => base32Decode('NOT_VALID_0189')).toThrow(Error);
  });

  it('base32Decode invokes the provided error factory on an invalid character', () => {
    class CustomMfaError extends Error {}
    const factory = jest.fn(() => new CustomMfaError('mapped'));
    expect(() => base32Decode('0189', factory)).toThrow(CustomMfaError);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('verifyTotp threads the error factory through to base32Decode for malformed secrets', () => {
    class CustomMfaError extends Error {}
    const factory = jest.fn(() => new CustomMfaError('mapped'));
    // '0' and '1' are not in the base32 alphabet => invalid secret.
    expect(() => verifyTotp('0189', '000000', 1_700_000_000, factory)).toThrow(CustomMfaError);
    expect(factory).toHaveBeenCalled();
  });
});
