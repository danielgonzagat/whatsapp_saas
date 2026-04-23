import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleVerifiedProfile } from './google-auth.service';

const TIKTOK_AUTHORIZE_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_USER_INFO_URL =
  'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,avatar_url';
const NON_ALPHA_NUMERIC_RE = /[^a-z0-9._-]+/gi;

type TikTokTokenResponse = {
  access_token?: string;
  expires_in?: number;
  open_id?: string;
  refresh_token?: string;
  refresh_expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type TikTokUserInfoResponse = {
  data?: {
    user?: {
      open_id?: string;
      union_id?: string;
      display_name?: string;
      avatar_url?: string;
    };
  };
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
};

type TikTokUserInfo = {
  openId: string | null;
  unionId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  raw: TikTokUserInfoResponse;
};

type TikTokAccessTokenInput = {
  accessToken: string;
  openId?: string;
  refreshToken?: string | null;
  expiresInSeconds?: number | null;
  scope?: string | null;
  tokenType?: string | null;
  refreshExpiresInSeconds?: number | null;
};

function sanitizeTikTokError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'unknown_error';
}

function buildSyntheticTikTokEmail(providerId: string): string {
  const normalizedProviderId = providerId.trim().toLowerCase().replace(NON_ALPHA_NUMERIC_RE, '-');
  const safeProviderId = normalizedProviderId.replace(/^-+|-+$/g, '') || 'user';
  return `tiktok-${safeProviderId}@oauth.kloel.local`;
}

/** TikTok auth service. */
@Injectable()
export class TikTokAuthService {
  private readonly logger = new Logger(TikTokAuthService.name);

  constructor(private readonly config: ConfigService) {}

  /** Verify authorization code. */
  async verifyAuthorizationCode(
    authorizationCode: string,
    redirectUri: string,
  ): Promise<GoogleVerifiedProfile> {
    const code = authorizationCode?.trim();
    const normalizedRedirectUri = redirectUri?.trim();
    if (!code) {
      throw new UnauthorizedException('Código TikTok ausente.');
    }
    if (!normalizedRedirectUri) {
      throw new UnauthorizedException('Redirect URI TikTok ausente.');
    }

    const { clientKey, clientSecret } = this.requireClientConfig();
    const tokenPayload = await this.exchangeCode({
      clientKey,
      clientSecret,
      code,
      redirectUri: normalizedRedirectUri,
    });

    const accessToken = tokenPayload.access_token?.trim();
    const openId = tokenPayload.open_id?.trim();
    if (!accessToken || !openId) {
      throw new UnauthorizedException('Resposta do TikTok inválida para login.');
    }

    return this.buildVerifiedProfile(
      {
        accessToken,
        openId,
        refreshToken: tokenPayload.refresh_token?.trim() || null,
        expiresInSeconds:
          typeof tokenPayload.expires_in === 'number' && Number.isFinite(tokenPayload.expires_in)
            ? tokenPayload.expires_in
            : null,
        scope: tokenPayload.scope || null,
        tokenType: tokenPayload.token_type || null,
        refreshExpiresInSeconds:
          typeof tokenPayload.refresh_expires_in === 'number' &&
          Number.isFinite(tokenPayload.refresh_expires_in)
            ? tokenPayload.refresh_expires_in
            : null,
      },
      { requireUserInfo: false },
    );
  }

  /** Verify access token. */
  async verifyAccessToken(input: {
    accessToken: string;
    openId?: string;
    refreshToken?: string | null;
    expiresInSeconds?: number | null;
  }): Promise<GoogleVerifiedProfile> {
    return this.buildVerifiedProfile(
      {
        accessToken: input.accessToken,
        openId: input.openId,
        refreshToken: input.refreshToken,
        expiresInSeconds: input.expiresInSeconds,
      },
      { requireUserInfo: true },
    );
  }

  private requireClientConfig(): { clientKey: string; clientSecret: string } {
    const clientKey =
      this.config.get<string>('TIKTOK_CLIENT_KEY')?.trim() ||
      this.config.get<string>('NEXT_PUBLIC_TIKTOK_CLIENT_KEY')?.trim() ||
      '';
    const clientSecret = this.config.get<string>('TIKTOK_CLIENT_SECRET')?.trim() || '';

    if (!clientKey || !clientSecret) {
      this.logger.error(
        'tiktok_auth_not_configured: TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET ausentes',
      );
      throw new ServiceUnavailableException('Login com TikTok não configurado no servidor.');
    }

    return { clientKey, clientSecret };
  }

  private async exchangeCode(input: {
    clientKey: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
  }): Promise<TikTokTokenResponse> {
    const body = new URLSearchParams({
      client_key: input.clientKey,
      client_secret: input.clientSecret,
      code: input.code,
      grant_type: 'authorization_code',
      redirect_uri: input.redirectUri,
    });

    const response = await fetch(TIKTOK_AUTHORIZE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(15000),
    }).catch((error: unknown) => {
      throw new ServiceUnavailableException(
        `Falha ao validar login TikTok: ${sanitizeTikTokError(error)}`,
      );
    });

    const payload = (await response.json().catch(() => ({}))) as TikTokTokenResponse;
    if (!response.ok || payload.error) {
      const message = payload.error_description?.trim() || payload.error?.trim() || '';
      if (response.status >= 400 && response.status < 500) {
        throw new UnauthorizedException(message || 'Código TikTok inválido ou expirado.');
      }

      throw new ServiceUnavailableException(
        `Falha ao validar login TikTok: ${message || `status ${response.status}`}`,
      );
    }

    return payload;
  }

  private async fetchUserInfoSafely(accessToken: string): Promise<TikTokUserInfo | null> {
    try {
      return await this.fetchUserInfo(accessToken);
    } catch (error: unknown) {
      const message = sanitizeTikTokError(error);
      this.logger.warn('tiktok_user_info_unavailable: ' + JSON.stringify({ message }));
      return null;
    }
  }

  private async fetchUserInfo(accessToken: string): Promise<TikTokUserInfo> {
    const response = await fetch(TIKTOK_USER_INFO_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(15000),
    }).catch((error: unknown) => {
      throw new ServiceUnavailableException(
        `Falha ao consultar perfil TikTok: ${sanitizeTikTokError(error)}`,
      );
    });

    const payload = (await response.json().catch(() => ({}))) as TikTokUserInfoResponse;
    if (!response.ok || payload.error?.message) {
      if (response.status === 401 || response.status === 403) {
        throw new UnauthorizedException(
          payload.error?.message || 'TikTok negou acesso ao perfil do usuário.',
        );
      }

      throw new ServiceUnavailableException(
        `Falha ao consultar perfil TikTok: ${payload.error?.message || `status ${response.status}`}`,
      );
    }

    const user = payload.data?.user;
    return {
      openId: user?.open_id?.trim() || null,
      unionId: user?.union_id?.trim() || null,
      displayName: user?.display_name?.trim() || null,
      avatarUrl: user?.avatar_url?.trim() || null,
      raw: payload,
    };
  }

  private async buildVerifiedProfile(
    input: TikTokAccessTokenInput,
    options: { requireUserInfo: boolean },
  ): Promise<GoogleVerifiedProfile> {
    const accessToken = input.accessToken?.trim();
    if (!accessToken) {
      throw new UnauthorizedException('Access token TikTok ausente.');
    }

    const userInfo = options.requireUserInfo
      ? await this.fetchUserInfo(accessToken)
      : await this.fetchUserInfoSafely(accessToken);
    const providerId = (userInfo?.openId || input.openId || '').trim();
    if (!providerId) {
      throw new UnauthorizedException('TikTok não retornou o identificador do usuário.');
    }

    const providedOpenId = input.openId?.trim();
    if (providedOpenId && userInfo?.openId && providedOpenId !== userInfo.openId) {
      throw new UnauthorizedException('Open ID TikTok divergente da sessão autenticada.');
    }

    const syntheticEmail = buildSyntheticTikTokEmail(providerId);
    const expiresInSeconds =
      typeof input.expiresInSeconds === 'number' && Number.isFinite(input.expiresInSeconds)
        ? input.expiresInSeconds
        : null;
    const tokenExpiresAt =
      expiresInSeconds && expiresInSeconds > 0
        ? new Date(Date.now() + expiresInSeconds * 1000)
        : null;

    return {
      provider: 'tiktok',
      providerId,
      email: syntheticEmail,
      name: userInfo?.displayName || 'TikTok User',
      image: userInfo?.avatarUrl || null,
      emailVerified: false,
      accessToken,
      refreshToken: input.refreshToken?.trim() || null,
      tokenExpiresAt,
      syntheticEmail: true,
      profileData: {
        syntheticEmail: true,
        token: {
          openId: providedOpenId || userInfo?.openId || providerId,
          scope: input.scope || null,
          tokenType: input.tokenType || null,
          expiresIn: expiresInSeconds,
          refreshExpiresIn: input.refreshExpiresInSeconds ?? null,
        },
        userInfo: userInfo?.raw || null,
      },
    };
  }
}
