import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Shared TOTP / base32 primitives for MFA.
 *
 * Hoisted verbatim from AccountMfaService and AdminMfaService, which carried
 * byte-identical copies of these pure functions. The only per-service concern
 * is the exception type thrown when a stored secret contains a non-base32
 * character (UnauthorizedException vs adminErrors.mfaInvalidCode()). That is
 * preserved by letting each caller pass an `onInvalidSecret` error factory;
 * the default throws a generic Error so the behavior is unchanged.
 */

export const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const MFA_PERIOD_SECONDS = 30;
export const MFA_WINDOW_STEPS = 2;

/** Factory that produces the error thrown when a base32 secret is malformed. */
export type InvalidSecretErrorFactory = () => Error;

function defaultInvalidSecretError(): Error {
  return new Error('Invalid base32 character in MFA secret');
}

export function generateMfaSecret(): string {
  return base32Encode(randomBytes(20));
}

export function base32Encode(bytes: Buffer): string {
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

export function base32Decode(
  secret: string,
  onInvalidSecret: InvalidSecretErrorFactory = defaultInvalidSecretError,
): Buffer {
  let value = 0;
  let bits = 0;
  const bytes: number[] = [];

  for (const char of secret.replace(/=+$/u, '').toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw onInvalidSecret();
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

export function generateTotp(
  secret: string,
  timeStep: number,
  onInvalidSecret: InvalidSecretErrorFactory = defaultInvalidSecretError,
): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timeStep));
  const digest = createHmac('sha1', base32Decode(secret, onInvalidSecret)).update(counter).digest();
  const lastByte = digest[digest.length - 1];
  const offset = (lastByte ?? 0) & 15;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;

  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotp(
  secret: string,
  code: string,
  epochSeconds = Math.floor(Date.now() / 1000),
  onInvalidSecret: InvalidSecretErrorFactory = defaultInvalidSecretError,
): boolean {
  const currentStep = Math.floor(epochSeconds / MFA_PERIOD_SECONDS);
  const provided = Buffer.from(code);

  for (let offset = -MFA_WINDOW_STEPS; offset <= MFA_WINDOW_STEPS; offset += 1) {
    const expected = Buffer.from(generateTotp(secret, currentStep + offset, onInvalidSecret));
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      return true;
    }
  }

  return false;
}
