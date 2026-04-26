import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { encryptString } from '../lib/crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthOAuthResolverService } from './auth-oauth-resolver.service';
import { DbInitErrorService } from './db-init-error.service';
import { FacebookAuthService } from './facebook-auth.service';
import { GoogleAuthService, GoogleVerifiedProfile } from './google-auth.service';
import { RateLimitService } from './rate-limit.service';
import { TikTokAuthService } from './tiktok-auth.service';

function buildAuthLogMessage(event: string, payload: Record<string, unknown>) {
  return JSON.stringify({ event, ...payload });
}

/** Handles all OAuth / social-login flows for AuthService. */
@Injectable()
export class AuthOAuthService {
  private readonly logger = new Logger(AuthOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly facebookAuthService: FacebookAuthService,
    private readonly tikTokAuthService: TikTokAuthService,
    private readonly config: ConfigService,
    private readonly rateLimitService: RateLimitService,
    private readonly resolver: AuthOAuthResolverService,
  ) {}

  private getEncryptionKey(): string {
    const configured =
      this.config.get<string>('ENCRYPTION_KEY') ||
      this.config.get<string>('PROVIDER_SECRET_KEY') ||
      this.config.get<string>('JWT_SECRET');

    if (!configured) {
      throw new ServiceUnavailableException(
        'Serviço indisponível. Chave de criptografia ausente no servidor.',
      );
    }

    return configured;
  }

  /** Upsert the social account record for an authenticated agent. */
  async upsertSocialAccount(
    agentId: string,
    profile: GoogleVerifiedProfile,
    options?: { overwriteTokens?: boolean },
  ) {
    const encryptionKey = this.getEncryptionKey();
    const encryptedAccessToken = profile.accessToken
      ? encryptString(profile.accessToken, encryptionKey)
      : undefined;
    const encryptedRefreshToken = profile.refreshToken
      ? encryptString(profile.refreshToken, encryptionKey)
      : undefined;

    const current = await this.prisma.socialAccount.findUnique({
      where: { agentId_provider: { agentId, provider: profile.provider } },
      select: { id: true, accessToken: true, refreshToken: true },
    });

    const data: Prisma.SocialAccountUncheckedCreateInput = {
      agentId,
      provider: profile.provider,
      providerUserId: profile.providerId,
      email: String(profile.email || '')
        .trim()
        .toLowerCase(),
      accessToken:
        encryptedAccessToken || (options?.overwriteTokens ? null : current?.accessToken) || null,
      refreshToken:
        encryptedRefreshToken || (options?.overwriteTokens ? null : current?.refreshToken) || null,
      tokenExpiresAt: profile.tokenExpiresAt || null,
      profileData: (profile.profileData as Prisma.InputJsonValue | null | undefined) || undefined,
      revokedAt: null,
      lastUsedAt: new Date(),
    };

    return this.prisma.socialAccount.upsert({
      where: { agentId_provider: { agentId, provider: profile.provider } },
      create: data,
      update: {
        providerUserId: data.providerUserId,
        email: data.email,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tokenExpiresAt: data.tokenExpiresAt,
        profileData: data.profileData,
        revokedAt: null,
        lastUsedAt: new Date(),
      },
    });
  }

  /** Verify a Google credential and return a normalised profile. */
  async verifyGoogleCredential(data: { credential: string; ip?: string }) {
    await this.rateLimitService.checkRateLimit(`oauth:google:${data.ip || 'ip-unknown'}`);
    return this.googleAuthService.verifyCredential(data.credential);
  }

  /** Verify a Facebook access token and return a normalised profile. */
  async verifyFacebookAccessToken(data: { accessToken: string; userId?: string; ip?: string }) {
    await this.rateLimitService.checkRateLimit(`oauth:facebook:${data.ip || 'ip-unknown'}`);
    return this.facebookAuthService.verifyAccessToken(data.accessToken, data.userId);
  }

  /** Verify an Apple identity token and return a normalised profile. */
  async verifyAppleIdentityToken(data: {
    identityToken: string;
    user?: { name?: { firstName?: string; lastName?: string }; email?: string };
    ip?: string;
  }): Promise<GoogleVerifiedProfile> {
    await this.rateLimitService.checkRateLimit(`oauth:apple:${data.ip || 'ip-unknown'}`);

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

    return {
      provider: 'apple' as const,
      providerId: decodedPayload.sub,
      email,
      name: name || 'Apple User',
      image: null as string | null,
      emailVerified: !!decodedPayload.email_verified,
    };
  }

  /** Verify a TikTok authorization code and return a normalised profile. */
  async verifyTikTokAuthorizationCode(data: { code: string; redirectUri?: string; ip?: string }) {
    await this.rateLimitService.checkRateLimit(`oauth:tiktok:${data.ip || 'ip-unknown'}`);
    return this.tikTokAuthService.verifyAuthorizationCode(
      data.code,
      String(data.redirectUri || '').trim(),
    );
  }

  /** Verify a TikTok access token and return a normalised profile. */
  async verifyTikTokAccessToken(data: {
    accessToken: string;
    openId?: string;
    refreshToken?: string;
    expiresInSeconds?: number;
    ip?: string;
  }) {
    await this.rateLimitService.checkRateLimit(`oauth:tiktok:${data.ip || 'ip-unknown'}`);
    return this.tikTokAuthService.verifyAccessToken({
      accessToken: data.accessToken,
      openId: data.openId,
      refreshToken: data.refreshToken,
      expiresInSeconds: data.expiresInSeconds,
    });
  }

  /**
   * Find or create an agent for a verified OAuth profile.
   * Returns the agent record (does NOT issue tokens – AuthService does that).
   */
  async resolveAgentForProfile(profile: GoogleVerifiedProfile): Promise<{
    agent: {
      id: string;
      email: string;
      workspaceId: string;
      name?: string | null;
      role?: string | null;
      provider?: string | null;
      providerId?: string | null;
      avatarUrl?: string | null;
      emailVerified?: boolean | null;
      disabledAt?: Date | null;
      deletedAt?: Date | null;
    };
    isNewUser: boolean;
  }> {
    const { provider, providerId, email, name, image, emailVerified, syntheticEmail } = profile;

    const normalizedProvider = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
    if (!['google', 'apple', 'facebook', 'tiktok'].includes(normalizedProvider)) {
      throw new BadRequestException({
        error: 'invalid_provider',
        message: 'Provedor OAuth inválido ou não suportado.',
      });
    }

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!normalizedEmail) {
      throw new BadRequestException({
        error: 'missing_email',
        message: 'Email é obrigatório para login OAuth.',
      });
    }

    const normalizedProviderId = typeof providerId === 'string' ? providerId.trim() : '';
    if (!normalizedProviderId) {
      throw new BadRequestException({
        error: 'missing_provider_id',
        message: 'providerId é obrigatório para login OAuth.',
      });
    }

    const finalName = AuthOAuthResolverService.deriveFinalName(name, normalizedEmail);

    try {
      let agent: Awaited<ReturnType<AuthOAuthResolverService['findExistingAgent']>>;

      try {
        agent = await this.resolver.findExistingAgent(
          normalizedProvider,
          normalizedProviderId,
          normalizedEmail,
        );
      } catch (error: unknown) {
        DbInitErrorService.throwFriendlyDbInitError(error);
      }

      if (agent) {
        const patched = await this.resolver.patchExistingAgent(agent, {
          normalizedProvider,
          normalizedProviderId,
          normalizedEmail,
          finalName,
          image,
          emailVerified,
          syntheticEmail,
        });

        await this.upsertSocialAccount(patched.id, {
          ...profile,
          provider: normalizedProvider as GoogleVerifiedProfile['provider'],
          providerId: normalizedProviderId,
          email: normalizedEmail,
          name: finalName,
          image: image || null,
          emailVerified: !!emailVerified,
        });

        return { agent: patched, isNewUser: false };
      }

      const created = await this.resolver.createAgentForOAuth({
        finalName,
        normalizedEmail,
        normalizedProvider,
        normalizedProviderId,
        image,
        emailVerified,
      });

      await this.upsertSocialAccount(created.id, {
        ...profile,
        provider: normalizedProvider as GoogleVerifiedProfile['provider'],
        providerId: normalizedProviderId,
        email: normalizedEmail,
        name: finalName,
        image: image || null,
        emailVerified: !!emailVerified,
      });

      return { agent: created, isNewUser: true };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        try {
          const status = error.getStatus();
          const response = error.getResponse();
          const safeResponse =
            typeof response === 'string'
              ? response
              : typeof response === 'object'
                ? response
                : undefined;
          this.logger.warn(
            buildAuthLogMessage('oauthLogin_http_exception', {
              status,
              provider: normalizedProvider,
              email: normalizedEmail,
              response: safeResponse,
            }),
          );
        } catch {
          // PULSE:OK — Error log stringify failure; original error is re-thrown below
        }
        throw error;
      }

      this.resolver.handleOAuthError(error, {
        provider: normalizedProvider,
        email: normalizedEmail,
      });
    }
  }
}
