import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getTraceHeaders } from '../common/trace-headers';
import { GoogleVerifiedProfile } from './google-auth.service';

type FacebookDebugResponse = {
  data?: {
    app_id?: string;
    type?: string;
    application?: string;
    expires_at?: number;
    is_valid?: boolean;
    user_id?: string;
    scopes?: string[];
    error?: {
      message?: string;
    };
  };
};

type FacebookMeResponse = {
  id?: string;
  name?: string;
  email?: string;
  picture?: {
    data?: {
      url?: string;
    };
  };
  error?: {
    message?: string;
  };
};

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'unknown_error';
}

/** Facebook auth service. */
@Injectable()
export class FacebookAuthService {
  private readonly logger = new Logger(FacebookAuthService.name);
  private readonly graphApiVersion: string;

  constructor(private readonly config: ConfigService) {
    this.graphApiVersion = this.config.get<string>('META_GRAPH_API_VERSION') || 'v21.0';
  }

  /** Verify access token. */
  async verifyAccessToken(
    accessToken: string,
    expectedUserId?: string,
  ): Promise<GoogleVerifiedProfile> {
    const token = accessToken?.trim();
    if (!token) {
      throw new UnauthorizedException('Token Facebook ausente.');
    }

    const appId =
      this.config.get<string>('META_AUTH_APP_ID')?.trim() ||
      this.config.get<string>('META_APP_ID')?.trim() ||
      '';
    const appSecret =
      this.config.get<string>('META_AUTH_APP_SECRET')?.trim() ||
      this.config.get<string>('META_APP_SECRET')?.trim() ||
      '';
    if (!appId || !appSecret) {
      this.logger.error(
        'facebook_auth_not_configured: META_AUTH_APP_ID/META_AUTH_APP_SECRET ou META_APP_ID/META_APP_SECRET ausentes',
      );
      throw new ServiceUnavailableException('Login com Facebook não configurado no servidor.');
    }

    const debugData = await this.debugToken(token, `${appId}|${appSecret}`);
    if (!debugData?.is_valid) {
      throw new UnauthorizedException('Token Facebook inválido ou expirado.');
    }

    if (String(debugData.app_id || '').trim() !== appId) {
      throw new UnauthorizedException('Token Facebook emitido para outro aplicativo.');
    }

    const normalizedExpectedUserId = String(expectedUserId || '').trim();
    const normalizedDebugUserId = String(debugData.user_id || '').trim();
    if (
      normalizedExpectedUserId &&
      normalizedDebugUserId &&
      normalizedExpectedUserId !== normalizedDebugUserId
    ) {
      throw new UnauthorizedException('Usuário Facebook divergente da sessão autenticada.');
    }

    const profile = await this.fetchProfile(token);
    const providerId = String(profile.id || '').trim();
    const email = String(profile.email || '')
      .trim()
      .toLowerCase();
    if (!providerId || !email) {
      throw new UnauthorizedException(
        'O Facebook não retornou email. Autorize a permissão de email para continuar.',
      );
    }

    const pictureUrl = profile.picture?.data?.url?.trim() || null;
    const expiresAt =
      typeof debugData.expires_at === 'number' && Number.isFinite(debugData.expires_at)
        ? new Date(debugData.expires_at * 1000)
        : null;

    return {
      provider: 'facebook',
      providerId,
      email,
      name: profile.name?.trim() || email.split('@')[0] || 'Facebook User',
      image: pictureUrl,
      emailVerified: true,
      accessToken: token,
      tokenExpiresAt: expiresAt,
      profileData: {
        debug: debugData,
        me: profile,
      },
    };
  }

  private async debugToken(token: string, appAccessToken: string) {
    const url = new URL(`https://graph.facebook.com/${this.graphApiVersion}/debug_token`);
    url.searchParams.set('input_token', token);
    url.searchParams.set('access_token', appAccessToken);

    const response = await fetch(url, {
      method: 'GET',
      headers: getTraceHeaders(),
      signal: AbortSignal.timeout(15000),
    }).catch((error: unknown) => {
      throw new ServiceUnavailableException(
        `Falha ao validar token Facebook: ${sanitizeErrorMessage(error)}`,
      );
    });

    const payload = (await response.json().catch(() => ({}))) as FacebookDebugResponse;
    if (!response.ok || payload.data?.error?.message) {
      throw new UnauthorizedException(
        payload.data?.error?.message || 'Token Facebook inválido ou expirado.',
      );
    }

    return payload.data || null;
  }

  private async fetchProfile(token: string) {
    const url = new URL(`https://graph.facebook.com/${this.graphApiVersion}/me`);
    url.searchParams.set('fields', 'id,name,email,picture.type(large)');
    url.searchParams.set('access_token', token);

    const response = await fetch(url, {
      method: 'GET',
      headers: getTraceHeaders(),
      signal: AbortSignal.timeout(15000),
    }).catch((error: unknown) => {
      throw new ServiceUnavailableException(
        `Falha ao consultar perfil Facebook: ${sanitizeErrorMessage(error)}`,
      );
    });

    const payload = (await response.json().catch(() => ({}))) as FacebookMeResponse;
    if (!response.ok || payload.error?.message) {
      throw new UnauthorizedException(
        payload.error?.message || 'Não foi possível validar o login.',
      );
    }

    return payload;
  }
}
