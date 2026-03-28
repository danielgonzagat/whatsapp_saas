import { Logger } from '@nestjs/common';

const logger = new Logger('JwtConfig');
const DEV_JWT_SECRET = 'dev-secret-insecure';

let warnedAboutDevSecret = false;

export function getJwtSecret(): string {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET é obrigatório em produção.');
  }

  if (!warnedAboutDevSecret) {
    warnedAboutDevSecret = true;
    logger.warn(
      'JWT_SECRET not set, using weak dev-secret (dev only). Configure JWT_SECRET.',
    );
  }

  return DEV_JWT_SECRET;
}

/**
 * Returns JWT expiration value from env or default '30m'.
 * The return type uses `any` to satisfy jsonwebtoken's branded
 * StringValue type — env vars are plain strings, not branded.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getJwtExpiresIn(): any {
  return process.env.JWT_EXPIRES_IN || '30m';
}
