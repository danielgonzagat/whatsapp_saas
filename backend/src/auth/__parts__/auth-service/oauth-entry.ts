import { BadRequestException } from '@nestjs/common';
import type { AuthPartsDeps } from './register-login';
import { completeTrustedOAuthLogin } from './oauth-complete';
import type { TokenIssuanceResult } from './tokens';

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
      ip: data.ip,
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
    user?: { name?: { firstName?: string; lastName?: string }; email?: string };
    ip?: string;
  },
): Promise<TokenIssuanceResult> {
  await deps.rateLimitService.checkRateLimit(`oauth:apple:${data.ip || 'ip-unknown'}`);

  const jwt = await import('jsonwebtoken');
  const decoded = jwt.decode(data.identityToken);
  const decodedPayload =
    decoded && typeof decoded === 'object'
      ? (decoded as { sub?: string; email?: string; email_verified?: boolean })
      : {};
  if (!decodedPayload.sub) {
    throw new BadRequestException({
      error: 'invalid_apple_token',
      message: 'Apple identity token invalido ou expirado.',
    });
  }

  const email =
    decodedPayload.email || data.user?.email || `${decodedPayload.sub}@privaterelay.appleid.com`;
  const name = data.user?.name
    ? `${data.user.name.firstName || ''} ${data.user.name.lastName || ''}`.trim()
    : email.split('@')[0];

  const profile = {
    provider: 'apple' as const,
    providerId: decodedPayload.sub,
    email,
    name: name || 'Apple User',
    image: null as string | null,
    emailVerified: !!decodedPayload.email_verified,
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
    openId: data.openId,
    refreshToken: data.refreshToken,
    expiresInSeconds: data.expiresInSeconds,
  });
  return completeTrustedOAuthLogin(deps, profile);
}
