import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createPublicKey, createVerify, type KeyObject } from 'node:crypto';
import type { AuthPartsDeps } from './auth-service.register-login';
import { completeTrustedOAuthLogin } from './auth-service.oauth-complete';
import type { TokenIssuanceResult } from './auth-service.tokens';

const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

interface AppleJwk {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

interface AppleJwtHeader {
  kid?: string;
  alg?: string;
}

interface AppleJwtPayload {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  email?: string;
  email_verified?: boolean | string;
}

let appleKeysMap: Map<string, KeyObject> | null = null;
let appleKeysExpiresAt = 0;

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function decodeAppleToken(token: string): {
  header: AppleJwtHeader;
  payload: AppleJwtPayload;
  signingInput: string;
  signature: Buffer;
} | null {
  const [headerPart, payloadPart, signaturePart] = token.split('.');
  if (!headerPart || !payloadPart || !signaturePart) {
    return null;
  }
  const header = decodeBase64UrlJson<AppleJwtHeader>(headerPart);
  const payload = decodeBase64UrlJson<AppleJwtPayload>(payloadPart);
  if (!header || !payload) {
    return null;
  }
  return {
    header,
    payload,
    signingInput: `${headerPart}.${payloadPart}`,
    signature: Buffer.from(signaturePart, 'base64url'),
  };
}

function verifyAppleRs256Signature(
  signingInput: string,
  signature: Buffer,
  key: KeyObject,
): boolean {
  const verifier = createVerify('RSA-SHA256');
  verifier.update(signingInput);
  verifier.end();
  return verifier.verify(key, signature);
}

export async function oauthLogin(
  deps: AuthPartsDeps,
  data: {
    provider?: 'google' | 'apple';
    providerId?: string;
    email?: string;
    name?: string;
    image?: string;
    credential?: string;
    ip?: string;
  },
): Promise<TokenIssuanceResult> {
  if (data?.provider === 'google' && data?.credential) {
    return loginWithGoogleCredential(deps, {
      credential: data.credential,
      ...(data.ip !== undefined ? { ip: data.ip } : {}),
    });
  }

  throw new BadRequestException({
    error: 'legacy_oauth_payload_disabled',
    message: 'Use o endpoint seguro /auth/oauth/google com a credential emitida pelo Google.',
  });
}

export async function loginWithGoogleCredential(
  deps: AuthPartsDeps,
  data: { credential: string; ip?: string },
): Promise<TokenIssuanceResult> {
  await deps.rateLimitService.checkRateLimit(`oauth:google:${data.ip || 'ip-unknown'}`);
  const profile = await deps.googleAuthService.verifyCredential(data.credential);
  return completeTrustedOAuthLogin(deps, profile);
}

export async function loginWithFacebookAccessToken(
  deps: AuthPartsDeps,
  data: { accessToken: string; userId?: string; ip?: string },
): Promise<TokenIssuanceResult> {
  await deps.rateLimitService.checkRateLimit(`oauth:facebook:${data.ip || 'ip-unknown'}`);
  const profile = await deps.facebookAuthService.verifyAccessToken(data.accessToken, data.userId);
  return completeTrustedOAuthLogin(deps, profile);
}

function resolveAppleClientIds(config: { get: (key: string) => unknown }): string[] {
  const configuredClientId = config.get('APPLE_CLIENT_ID');
  const primary = typeof configuredClientId === 'string' ? configuredClientId.trim() : '';
  const fallback = 'com.kloel.web';
  const ids = [primary, fallback].filter(Boolean);
  return [...new Set(ids)];
}

async function fetchAppleJwks(): Promise<Map<string, KeyObject>> {
  const response = await fetch(APPLE_JWKS_URL, {
    method: 'GET',
    signal: AbortSignal.timeout(10000),
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'unknown_error';
    throw new ServiceUnavailableException(`Apple JWKS fetch failed: ${message}`);
  });

  if (!response.ok) {
    throw new ServiceUnavailableException(`Apple JWKS returned HTTP ${response.status}`);
  }

  const body = (await response.json().catch(() => ({}))) as { keys?: AppleJwk[] };
  const keys = new Map<string, KeyObject>();

  for (const jwk of body.keys || []) {
    const kid = String(jwk.kid || '').trim();
    if (!kid || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) continue;
    keys.set(kid, createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' }));
  }

  if (keys.size === 0) {
    throw new ServiceUnavailableException('Apple JWKS returned no usable keys.');
  }

  return keys;
}

async function resolveAppleKey(kid: string): Promise<KeyObject> {
  const now = Date.now();
  if (!appleKeysMap || appleKeysExpiresAt <= now) {
    appleKeysMap = await fetchAppleJwks();
    appleKeysExpiresAt = now + JWKS_CACHE_TTL_MS;
  }

  const key = appleKeysMap.get(kid);
  if (!key) {
    throw new UnauthorizedException('Apple token signed with unknown key.');
  }

  return key;
}

function verifyAppleTokenPayload(payload: AppleJwtPayload, audience: string[]): AppleJwtPayload {
  if (!payload.sub) {
    throw new UnauthorizedException('Apple identity token missing sub claim.');
  }

  if (payload.iss !== APPLE_ISSUER) {
    throw new UnauthorizedException('Apple identity token has invalid issuer.');
  }

  if (!payload.aud) {
    throw new UnauthorizedException('Apple identity token missing audience.');
  }

  const tokenAud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const audienceMatch = audience.some((aud) => tokenAud.includes(aud));
  if (!audienceMatch) {
    throw new UnauthorizedException('Apple identity token audience mismatch.');
  }

  return payload;
}

export async function loginWithAppleCredential(
  deps: AuthPartsDeps,
  data: {
    identityToken: string;
    user?: { name?: { firstName?: string; lastName?: string }; email?: string };
    ip?: string;
  },
): Promise<TokenIssuanceResult> {
  await deps.rateLimitService.checkRateLimit(`oauth:apple:${data.ip || 'ip-unknown'}`);

  const token = (data.identityToken || '').trim();
  if (!token) {
    throw new BadRequestException({
      error: 'invalid_apple_token',
      message: 'Apple identity token ausente.',
    });
  }

  const decoded = decodeAppleToken(token);
  if (!decoded) {
    throw new BadRequestException({
      error: 'invalid_apple_token',
      message: 'Apple identity token malformado.',
    });
  }

  const kid = typeof decoded.header.kid === 'string' ? decoded.header.kid.trim() : '';
  if (!kid) {
    throw new BadRequestException({
      error: 'invalid_apple_token',
      message: 'Apple identity token missing key id.',
    });
  }

  const appleKey = await resolveAppleKey(kid);
  const clientIds = resolveAppleClientIds(deps.config);

  if (decoded.header.alg !== 'RS256') {
    throw new UnauthorizedException('Apple identity token algorithm invalido.');
  }
  if (!verifyAppleRs256Signature(decoded.signingInput, decoded.signature, appleKey)) {
    deps.logger.warn('apple_token_verification_rejected: invalid_signature');
    throw new UnauthorizedException('Apple identity token assinatura invalida.');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof decoded.payload.exp !== 'number' || decoded.payload.exp <= nowSeconds) {
    throw new UnauthorizedException('Apple identity token expirado.');
  }
  if (typeof decoded.payload.iat === 'number' && decoded.payload.iat > nowSeconds + 300) {
    throw new UnauthorizedException('Apple identity token iat invalido.');
  }

  const verifiedPayload = verifyAppleTokenPayload(decoded.payload, clientIds);

  const sub = String(verifiedPayload.sub).trim();
  const tokenEmail =
    typeof verifiedPayload.email === 'string' ? verifiedPayload.email.trim().toLowerCase() : '';
  const userEmail =
    typeof data.user?.email === 'string' ? data.user.email.trim().toLowerCase() : '';

  const email = tokenEmail || userEmail || `${sub}@privaterelay.appleid.com`;
  const isPrivateRelayEmail = email.endsWith('@privaterelay.appleid.com');

  const name = data.user?.name
    ? `${data.user.name.firstName || ''} ${data.user.name.lastName || ''}`.trim()
    : typeof verifiedPayload.email === 'string'
      ? verifiedPayload.email.split('@')[0]
      : 'Apple User';

  const profile = {
    provider: 'apple' as const,
    providerId: sub,
    email,
    name: name || 'Apple User',
    image: null as string | null,
    emailVerified:
      verifiedPayload.email_verified === true || verifiedPayload.email_verified === 'true',
    syntheticEmail: isPrivateRelayEmail,
  };

  return completeTrustedOAuthLogin(deps, profile);
}

export async function loginWithTikTokAuthorizationCode(
  deps: AuthPartsDeps,
  data: {
    code: string;
    redirectUri?: string;
    ip?: string;
  },
): Promise<TokenIssuanceResult> {
  await deps.rateLimitService.checkRateLimit(`oauth:tiktok:${data.ip || 'ip-unknown'}`);
  const profile = await deps.tikTokAuthService.verifyAuthorizationCode(
    data.code,
    String(data.redirectUri || '').trim(),
  );
  return completeTrustedOAuthLogin(deps, profile);
}

export async function loginWithTikTokAccessToken(
  deps: AuthPartsDeps,
  data: {
    accessToken: string;
    openId?: string;
    refreshToken?: string;
    expiresInSeconds?: number;
    ip?: string;
  },
): Promise<TokenIssuanceResult> {
  await deps.rateLimitService.checkRateLimit(`oauth:tiktok:${data.ip || 'ip-unknown'}`);
  const profile = await deps.tikTokAuthService.verifyAccessToken({
    accessToken: data.accessToken,
    ...(data.openId !== undefined ? { openId: data.openId } : {}),
    ...(data.refreshToken !== undefined ? { refreshToken: data.refreshToken } : {}),
    ...(data.expiresInSeconds !== undefined
      ? { expiresInSeconds: data.expiresInSeconds }
      : {}),
  });
  return completeTrustedOAuthLogin(deps, profile);
}
