import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

export interface GoogleVerifiedProfile {
  provider: 'google';
  providerId: string;
  email: string;
  name: string;
  image?: string;
  emailVerified: boolean;
}

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(private readonly config: ConfigService) {}

  async verifyCredential(credential: string): Promise<GoogleVerifiedProfile> {
    const idToken = credential?.trim();
    if (!idToken) {
      throw new UnauthorizedException('Credencial Google ausente.');
    }

    const allowedClientIds = this.getAllowedClientIds();
    if (!allowedClientIds.length) {
      this.logger.error(
        'google_auth_not_configured: GOOGLE_CLIENT_ID/NEXT_PUBLIC_GOOGLE_CLIENT_ID ausente',
      );
      throw new ServiceUnavailableException(
        'Login com Google não configurado no servidor.',
      );
    }

    const client = new OAuth2Client();
    let ticket;

    try {
      ticket = await client.verifyIdToken({
        idToken,
        audience: allowedClientIds,
      });
    } catch (error: any) {
      const message = error?.message || 'unknown_error';
      this.logger.warn(
        `google_token_rejected: ${JSON.stringify({
          message,
        })}`,
      );

      if (
        typeof message === 'string' &&
        /audience|issuer|token used too late|wrong number of segments|invalid token|No pem found|Token used too early|Wrong recipient/i.test(
          message,
        )
      ) {
        throw new UnauthorizedException('Credencial Google inválida.');
      }

      throw new ServiceUnavailableException(
        `Falha ao validar credencial Google: ${message}`,
      );
    }

    const payload = ticket.getPayload();
    if (!payload) {
      throw new UnauthorizedException('Credencial Google inválida.');
    }

    this.assertPayload(payload);

    const providerId = payload.sub?.trim();
    const email = payload.email?.trim().toLowerCase();
    const emailVerified = payload.email_verified === true;

    if (!providerId || !email || !emailVerified) {
      throw new UnauthorizedException(
        'Perfil Google inválido ou email não verificado.',
      );
    }

    const derivedName = this.deriveName(email);

    return {
      provider: 'google',
      providerId,
      email,
      name: payload.name?.trim() || derivedName,
      image: payload.picture?.trim() || undefined,
      emailVerified,
    };
  }

  private assertPayload(payload: TokenPayload) {
    const issuer = payload.iss?.trim();
    if (
      issuer !== 'accounts.google.com' &&
      issuer !== 'https://accounts.google.com'
    ) {
      throw new UnauthorizedException('Issuer Google inválido.');
    }

    const expiresAt = Number(payload.exp);
    if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) {
      throw new UnauthorizedException('Credencial Google expirada.');
    }
  }

  private getAllowedClientIds(): string[] {
    const csv = this.config.get<string>('GOOGLE_ALLOWED_CLIENT_IDS');
    const raw = [
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('NEXT_PUBLIC_GOOGLE_CLIENT_ID'),
      csv,
    ]
      .filter((value): value is string => typeof value === 'string')
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean);

    return [...new Set(raw)];
  }

  private deriveName(email: string) {
    const local = email.split('@')[0] || 'User';
    const cleaned = local.replace(/[\W_]+/g, ' ').trim();
    const candidate = cleaned || 'User';
    return candidate.charAt(0).toUpperCase() + candidate.slice(1);
  }
}
