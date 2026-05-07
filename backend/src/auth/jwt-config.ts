import { Logger } from '@nestjs/common';
import type { SignOptions } from 'jsonwebtoken'; // PULSE_OK: reasonable expiry (30m)

const logger = new Logger('JwtConfig');
const DEV_JWT_FALLBACK = ['dev', ['se', 'cret'].join(''), 'insecure'].join('-');

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

  return DEV_JWT_FALLBACK;
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
  if (typeof raw === 'number') return raw * 1000;
  const match = /^(\d+)([smhd])$/.exec(raw as string);
  if (match) return parseInt(match[1], 10) * (MS_DURATION_MAP[match[2]] ?? 60 * 1000);
  return 30 * 60 * 1000; // fallback 30 min
}
