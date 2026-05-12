import { BadRequestException } from '@nestjs/common';
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
    ...(data.authorizationCode !== undefined ? { authorizationCode: data.authorizationCode } : {}),
    ...(data.redirectUri !== undefined ? { redirectUri: data.redirectUri } : {}),
    ...(data.user !== undefined ? { user: data.user } : {}),
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
