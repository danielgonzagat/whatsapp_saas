import type { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  DisconnectResult,
  OAuthConnectResult,
  RefreshTokenResult,
} from './ad-provider.interface';
import {
  buildGoogleAdsAuthUrl,
  buildGoogleAdsRefreshBody,
  buildGoogleAdsTokenExchangeBody,
  computeGoogleAdsExpiresAt,
  createGoogleAdsApiClient,
  decryptGoogleAdsTokenOrPlain,
  discoverGoogleAdsLoginCustomerId,
  encryptGoogleAdsTokenOrPlain,
  fetchGoogleAdsToken,
  generateGoogleAdsCodeChallenge,
  generateGoogleAdsCodeVerifier,
  googleAdsCredentialWhere,
  GOOGLE_ADS_CURRENT_KEY_VERSION,
  GOOGLE_ADS_PLATFORM,
  GOOGLE_ADS_REVOKE_URL,
  maskGoogleAdsToken,
  resolveGoogleAdsEnv,
  type GoogleTokenResponse,
} from './google-ads.helpers';

type GoogleAdsOAuthContext = {
  prisma: PrismaService;
  logger: Logger;
};

export async function connectGoogleAdsOAuth(
  ctx: GoogleAdsOAuthContext,
  workspaceId: string,
  redirectUri: string,
): Promise<OAuthConnectResult> {
  const clientId = resolveGoogleAdsEnv('GOOGLE_ADS_CLIENT_ID');
  if (!clientId) {
    return { connected: false, status: 'google_ads_client_id_not_configured' };
  }

  const codeVerifier = generateGoogleAdsCodeVerifier();
  const codeChallenge = generateGoogleAdsCodeChallenge(codeVerifier);
  const verifierToken = encryptGoogleAdsTokenOrPlain(codeVerifier) || codeVerifier;

  await ctx.prisma.integrationCredential.upsert({
    where: googleAdsCredentialWhere(workspaceId),
    create: {
      workspaceId,
      platform: GOOGLE_ADS_PLATFORM,
      accessToken: verifierToken,
      keyVersion: GOOGLE_ADS_CURRENT_KEY_VERSION,
      status: 'pending_oauth',
    },
    update: {
      accessToken: verifierToken,
      keyVersion: GOOGLE_ADS_CURRENT_KEY_VERSION,
      status: 'pending_oauth',
      updatedAt: new Date(),
    },
  });

  return {
    connected: false,
    status: 'pending_oauth',
    authUrl: buildGoogleAdsAuthUrl({ clientId, redirectUri, workspaceId, codeChallenge }),
  };
}

export async function completeGoogleAdsOAuth(
  ctx: GoogleAdsOAuthContext,
  workspaceId: string,
  code: string,
  redirectUri: string,
): Promise<OAuthConnectResult> {
  const clientId = resolveGoogleAdsEnv('GOOGLE_ADS_CLIENT_ID');
  const clientSecret = resolveGoogleAdsEnv('GOOGLE_ADS_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return { connected: false, status: 'google_ads_credentials_not_configured' };
  }

  const pending = await ctx.prisma.integrationCredential.findUnique({
    where: googleAdsCredentialWhere(workspaceId),
    select: { accessToken: true },
  });
  const codeVerifier = decryptGoogleAdsTokenOrPlain(pending?.accessToken || '');

  try {
    const res = await fetchGoogleAdsToken(
      buildGoogleAdsTokenExchangeBody({ clientId, clientSecret, code, redirectUri, codeVerifier }),
    );
    if (!res.ok) {
      ctx.logger.error(
        `Google Ads OAuth token exchange failed: status=${res.status} workspace=${workspaceId}`,
      );
      return { connected: false, status: 'token_exchange_failed' };
    }

    const tokenData = (await res.json()) as GoogleTokenResponse;
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    if (!accessToken) {
      return { connected: false, status: 'token_exchange_failed' };
    }

    ctx.logger.log(
      `Google Ads OAuth token obtained: access=${maskGoogleAdsToken(accessToken)} refresh=${maskGoogleAdsToken(refreshToken || 'none')} workspace=${workspaceId}`,
    );

    const loginCustomerId = await discoverLoginCustomerIdSafely(
      ctx,
      clientId,
      clientSecret,
      refreshToken,
    );

    await ctx.prisma.integrationCredential.upsert({
      where: googleAdsCredentialWhere(workspaceId),
      create: {
        workspaceId,
        platform: GOOGLE_ADS_PLATFORM,
        accessToken: encryptGoogleAdsTokenOrPlain(accessToken) || accessToken,
        refreshToken: encryptGoogleAdsTokenOrPlain(refreshToken) || null,
        expiresAt: computeGoogleAdsExpiresAt(tokenData.expires_in),
        keyVersion: GOOGLE_ADS_CURRENT_KEY_VERSION,
        loginCustomerId,
        status: 'connected',
      },
      update: {
        accessToken: encryptGoogleAdsTokenOrPlain(accessToken) || accessToken,
        refreshToken: encryptGoogleAdsTokenOrPlain(refreshToken) || null,
        expiresAt: computeGoogleAdsExpiresAt(tokenData.expires_in),
        keyVersion: GOOGLE_ADS_CURRENT_KEY_VERSION,
        loginCustomerId,
        status: 'connected',
        updatedAt: new Date(),
      },
    });

    return { connected: true, status: 'connected' };
  } catch (err) {
    ctx.logger.error('Google Ads OAuth completion failed', err);
    return { connected: false, status: 'oauth_error', providerMessage: String(err) };
  }
}

export async function disconnectGoogleAdsOAuth(
  ctx: GoogleAdsOAuthContext,
  workspaceId: string,
): Promise<DisconnectResult> {
  const cred = await ctx.prisma.integrationCredential.findUnique({
    where: googleAdsCredentialWhere(workspaceId),
    select: { accessToken: true },
  });

  if (!cred) {
    return { status: 'already_disconnected' };
  }

  const resolvedToken = decryptGoogleAdsTokenOrPlain(cred.accessToken);
  if (resolvedToken && resolvedToken !== cred.accessToken) {
    try {
      await fetch(GOOGLE_ADS_REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: resolvedToken }),
        signal: AbortSignal.timeout(15000),
      });
      ctx.logger.log(`Google Ads token revoked for workspace ${workspaceId}`);
    } catch {
      ctx.logger.warn(
        `Failed to revoke Google Ads token for workspace ${workspaceId} (non-blocking)`,
      );
    }
  }

  await ctx.prisma.integrationCredential.delete({ where: googleAdsCredentialWhere(workspaceId) });
  ctx.logger.log(`Google Ads disconnected for workspace ${workspaceId}`);
  return { status: 'disconnected' };
}

export async function refreshGoogleAdsOAuthToken(
  ctx: GoogleAdsOAuthContext,
  workspaceId: string,
): Promise<RefreshTokenResult | null> {
  try {
    const cred = await ctx.prisma.integrationCredential.findUnique({
      where: googleAdsCredentialWhere(workspaceId),
      select: { refreshToken: true },
    });
    if (!cred?.refreshToken) {
      return null;
    }

    const refreshToken = decryptGoogleAdsTokenOrPlain(cred.refreshToken);
    const clientId = resolveGoogleAdsEnv('GOOGLE_ADS_CLIENT_ID');
    const clientSecret = resolveGoogleAdsEnv('GOOGLE_ADS_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      ctx.logger.warn(
        `Google Ads token refresh skipped — credentials not configured workspace=${workspaceId}`,
      );
      return null;
    }

    const res = await fetchGoogleAdsToken(
      buildGoogleAdsRefreshBody({ clientId, clientSecret, refreshToken }),
    );
    if (!res.ok) {
      ctx.logger.error(
        `Google Ads token refresh failed: status=${res.status} workspace=${workspaceId}`,
      );
      return null;
    }

    const tokenData = (await res.json()) as GoogleTokenResponse;
    const newAccessToken = tokenData.access_token;
    if (!newAccessToken) {
      return null;
    }

    await ctx.prisma.integrationCredential.update({
      where: googleAdsCredentialWhere(workspaceId),
      data: {
        accessToken: encryptGoogleAdsTokenOrPlain(newAccessToken) || newAccessToken,
        expiresAt: computeGoogleAdsExpiresAt(tokenData.expires_in),
        keyVersion: GOOGLE_ADS_CURRENT_KEY_VERSION,
        updatedAt: new Date(),
      },
    });

    ctx.logger.log(
      `Google Ads token refreshed for workspace ${workspaceId} expiresIn=${tokenData.expires_in ?? '1h'}`,
    );
    const result: RefreshTokenResult = { accessToken: newAccessToken };
    if (tokenData.expires_in !== undefined) {
      result.expiresIn = tokenData.expires_in;
    }
    return result;
  } catch (err) {
    ctx.logger.error(`Google Ads token refresh failed for workspace ${workspaceId}`, err);
    return null;
  }
}

async function discoverLoginCustomerIdSafely(
  ctx: GoogleAdsOAuthContext,
  clientId: string,
  clientSecret: string,
  refreshToken: string | undefined,
): Promise<string | null> {
  const developerToken = resolveGoogleAdsEnv('GOOGLE_ADS_DEVELOPER_TOKEN');
  if (!refreshToken || !developerToken) {
    return null;
  }
  try {
    const client = createGoogleAdsApiClient({ clientId, clientSecret, developerToken });
    return await discoverGoogleAdsLoginCustomerId(client, refreshToken);
  } catch {
    ctx.logger.warn(
      'Could not resolve login customer id during OAuth — will discover on first sync',
    );
    return null;
  }
}
