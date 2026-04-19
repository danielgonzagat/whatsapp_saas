export interface JwtRequestLike {
  headers: { authorization?: string };
  cookies?: Record<string, string | undefined>;
  user?: unknown;
}

export function isAuthOptionalInNonProd(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.AUTH_OPTIONAL === 'true';
}

export function extractBearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;
  const [scheme, headerToken] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !headerToken) return undefined;
  return headerToken;
}

export function extractCookieToken(
  cookies: Record<string, string | undefined> | undefined,
): string | undefined {
  if (!cookies) return undefined;
  return cookies.kloel_access_token || cookies.kloel_token;
}

export function extractJwtToken(request: JwtRequestLike): string | undefined {
  return extractBearerToken(request.headers.authorization) || extractCookieToken(request.cookies);
}

export function describeJwtVerifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'unknown verification error';
}
