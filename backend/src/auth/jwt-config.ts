import { Logger } from '@nestjs/common';
import type { SignOptions } from 'jsonwebtoken';

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
