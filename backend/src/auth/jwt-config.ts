import { StructuredLogger } from '../logging/structured-logger';
import { randomBytes } from 'node:crypto';

import type { SignOptions } from 'jsonwebtoken';

const logger = StructuredLogger.from('JwtConfig');

let devFallbackCache: string | null = null;

function generateDevSecret(): string {
  if (!devFallbackCache) {
    devFallbackCache = `dev-${randomBytes(32).toString('hex')}`;
  }
  return devFallbackCache;
}

let warnedAboutDevSecret = false;

/** Get jwt secret. */
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
    logger.warn('JWT_SECRET not set, using weak dev-secret (dev only). Configure JWT_SECRET.');
  }

  return generateDevSecret();
}

/** Get jwt expires in. */
export function getJwtExpiresIn(): SignOptions['expiresIn'] {
  return (process.env.JWT_EXPIRES_IN || '30m') as SignOptions['expiresIn'];
}

const MS_DURATION_MAP: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Get jwt cookie max age in milliseconds for httpOnly cookie alignment. */
export function getJwtCookieMaxAgeMs(): number {
  const raw = getJwtExpiresIn();
  if (typeof raw === 'number') {
    return raw * 1000;
  }
  const match = /^(\d+)([smhd])$/.exec(String(raw ?? ''));
  if (match) {
    const value = parseInt(match[1]!, 10);
    const unit = match[2]!;
    return value * (MS_DURATION_MAP[unit] ?? 60 * 1000);
  }
  return 30 * 60 * 1000; // fallback 30 min
}
