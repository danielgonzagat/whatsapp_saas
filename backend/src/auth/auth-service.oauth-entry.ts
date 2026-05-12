import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createPublicKey, createVerify, type KeyObject } from 'node:crypto';
import type { AuthPartsDeps } from './auth-service.register-login';
import { completeTrustedOAuthLogin } from './auth-service.oauth-complete';
import type { TokenIssuanceResult } from './auth-service.tokens';

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
    if (!kid || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) {
      continue;
    }
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
    authorizationCode?: string;
    redirectUri?: string;
    user?: { name?: { firstName?: string; lastName?: string }; email?: string };
    ip?: string;
  },
): Promise<TokenIssuanceResult> {
  await deps.rateLimitService.checkRateLimit(`oauth:apple:${data.ip || 'ip-unknown'}`);
  if (!data.identityToken?.trim() && !data.authorizationCode?.trim()) {
    throw new BadRequestException({
      error: 'invalid_apple_token',
      message: 'Login Apple ausente.',
    });
  }

  const profile = await deps.appleAuthService.verifyCredential({
    identityToken: data.identityToken,
    authorizationCode: data.authorizationCode,
    redirectUri: data.redirectUri,
    user: data.user,
  });
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
    ...(data.expiresInSeconds !== undefined ? { expiresInSeconds: data.expiresInSeconds } : {}),
  });
  return completeTrustedOAuthLogin(deps, profile);
}
