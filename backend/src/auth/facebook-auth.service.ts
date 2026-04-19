import { createHmac } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateExternalUrl } from '../common/utils/url-validator';

const W_RE = /[\W_]+/g;

export interface FacebookVerifiedProfile {
  provider: 'facebook';
  providerId: string;
  email: string;
  name: string;
  image?: string | null;
  emailVerified: boolean;
}

@Injectable()
export class FacebookAuthService {
  private readonly logger = new Logger(FacebookAuthService.name);

  constructor(private readonly config: ConfigService) {}

  async verifyAccessToken(accessToken: string): Promise<FacebookVerifiedProfile> {
    const token = accessToken?.trim();
    if (!token) {
      throw new UnauthorizedException('Access token Facebook ausente.');
    }

    const appId =
      this.config.get<string>('META_APP_ID')?.trim() ||
      this.config.get<string>('NEXT_PUBLIC_META_APP_ID')?.trim() ||
      '';
    const appSecret = this.config.get<string>('META_APP_SECRET')?.trim() || '';
    const graphVersion = this.config.get<string>('META_GRAPH_API_VERSION')?.trim() || 'v21.0';

    if (!appId || !appSecret) {
      this.logger.error('facebook_auth_not_configured: META_APP_ID/META_APP_SECRET ausentes');
      throw new ServiceUnavailableException('Login com Facebook não configurado no servidor.');
    }

    const appAccessToken = `${appId}|${appSecret}`;
    const debugData = await this.fetchGraph<{ data?: FacebookDebugTokenPayload; error?: MetaError }>(
      graphVersion,
      'debug_token',
      {
        input_token: token,
        access_token: appAccessToken,
      },
      'debug_token',
    );

    const debugPayload = readObject(debugData.data);
    const tokenAppId = readString(debugPayload?.app_id);
    const providerId = readString(debugPayload?.user_id);
    const isValid = debugPayload?.is_valid === true;

    if (!isValid || !providerId || tokenAppId !== appId) {
      throw new UnauthorizedException('Access token Facebook inválido.');
    }

    const appSecretProof = createHmac('sha256', appSecret).update(token).digest('hex');
    const meData = await this.fetchGraph<{ error?: MetaError } & FacebookMePayload>(
      graphVersion,
      'me',
      {
        fields: 'id,name,email,picture.type(large)',
        access_token: token,
        appsecret_proof: appSecretProof,
      },
      'me',
    );

    const email = readString(meData.email).toLowerCase();
    if (!email) {
      throw new BadRequestException(
        'Sua conta do Facebook não compartilha um email com a Kloel. Use outro método de login.',
      );
    }

    const returnedProviderId = readString(meData.id) || providerId;
    const name = readString(meData.name) || deriveName(email);
    const picture = readObject(meData.picture);
    const pictureData = readObject(picture?.data);
    const image = readString(pictureData?.url) || null;

    return {
      provider: 'facebook',
      providerId: returnedProviderId,
      email,
      name,
      image,
      emailVerified: true,
    };
  }

  private async fetchGraph<T extends { error?: MetaError }>(
    graphVersion: string,
    path: string,
    params: Record<string, string>,
    operation: string,
  ): Promise<T> {
    const url = new URL(`https://graph.facebook.com/${graphVersion}/${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    validateExternalUrl(url.toString(), new Set(['graph.facebook.com']));

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(15000),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      throw new ServiceUnavailableException(
        `Falha ao validar login com Facebook (${operation}): ${message}`,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as T;
    if (payload?.error) {
      const message = payload.error.message || 'unknown_error';
      if (response.status >= 400 && response.status < 500) {
        this.logger.warn(`facebook_graph_${operation}_rejected: ${message}`);
        throw new UnauthorizedException('Access token Facebook inválido.');
      }

      throw new ServiceUnavailableException(
        `Falha ao validar login com Facebook (${operation}): ${message}`,
      );
    }

    if (!response.ok) {
      if (response.status >= 400 && response.status < 500) {
        throw new UnauthorizedException('Access token Facebook inválido.');
      }

      throw new ServiceUnavailableException(
        `Falha ao validar login com Facebook (${operation}): status ${response.status}`,
      );
    }

    return payload;
  }
}

interface MetaError {
  message?: string;
}

interface FacebookDebugTokenPayload {
  app_id?: string;
  user_id?: string;
  is_valid?: boolean;
}

interface FacebookMePayload {
  id?: string;
  name?: string;
  email?: string;
  picture?: {
    data?: {
      url?: string;
    };
  };
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function deriveName(email: string) {
  const local = email.split('@')[0] || 'User';
  const cleaned = local.replace(W_RE, ' ').trim();
  const candidate = cleaned || 'User';
  return candidate.charAt(0).toUpperCase() + candidate.slice(1);
}
