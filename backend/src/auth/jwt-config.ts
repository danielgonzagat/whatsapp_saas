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
    console.warn(
      '⚠️ JWT_SECRET not set, using weak dev-secret (dev only). Configure JWT_SECRET.',
    );
  }

  return DEV_JWT_SECRET;
}

export function getJwtExpiresIn() {
  return (process.env.JWT_EXPIRES_IN as any) || '30m';
}
