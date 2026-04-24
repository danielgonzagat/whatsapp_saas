import { randomUUID } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Agent, Prisma, Workspace } from '@prisma/client';
import { compare as bcryptCompare, hash as bcryptHash } from 'bcrypt';
import type { Redis } from 'ioredis';
import { BCRYPT_ROUNDS } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { AuthOAuthService } from './auth-oauth.service';
import { AuthPartnerService } from './auth-partner.service';
import { AuthVerificationService } from './auth-verification.service';
import { DbInitErrorService } from './db-init-error.service';
import { GoogleVerifiedProfile } from './google-auth.service';
import { getJwtExpiresIn } from './jwt-config';
import { RateLimitService } from './rate-limit.service';
import { UserNameDerivationService } from './user-name-derivation.service';

const PATTERN_RE = /-/g;

function buildAuthLogMessage(event: string, payload: Record<string, unknown>) {
  return JSON.stringify({ event, ...payload });
}

/** Auth service — orchestrates registration, login, token issuance and delegates
 *  verification / OAuth / partner-invite flows to dedicated sub-services. */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly rateLimitService: RateLimitService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly authOAuthService: AuthOAuthService,
    private readonly authPartnerService: AuthPartnerService,
    private readonly authVerificationService: AuthVerificationService,
    @Optional() @InjectRedis() private readonly redis?: Redis,
  ) {
    this.rateLimitService = new RateLimitService(this.redis || null);
  }

  private normalizeEmail(email: string) {
    return String(email || '')
      .trim()
      .toLowerCase();
  }

  private assertAgentCanAuthenticate(agent: { disabledAt?: Date | null; deletedAt?: Date | null }) {
    if (agent.deletedAt) {
      throw new UnauthorizedException('Esta conta foi excluída.');
    }
    if (agent.disabledAt) {
      throw new UnauthorizedException('Esta conta está temporariamente desativada.');
    }
  }

  private async signToken(
    agentId: string,
    email: string,
    workspaceId: string,
    role: string,
    name?: string,
  ) {
    const payload: Record<string, unknown> = { sub: agentId, email, workspaceId, role };
    if (name) {
      payload.name = name;
    }
    return this.jwt.signAsync(payload, { expiresIn: getJwtExpiresIn() });
  }

  private async issueTokens(
    agent: {
      id: string;
      email: string;
      workspaceId: string;
      name?: string | null;
      role?: string | null;
      disabledAt?: Date | null;
      deletedAt?: Date | null;
    },
    extra?: { isNewUser?: boolean },
  ) {
    try {
      this.assertAgentCanAuthenticate(agent);

      if (!agent?.workspaceId) {
        const errorId = randomUUID();
        this.logger.error(
          buildAuthLogMessage('agent_invalid_workspaceId', {
            errorId,
            agentId: agent?.id,
            email: agent?.email,
          }),
        );
        throw new ServiceUnavailableException(
          'Serviço indisponível. Workspace inválido para este usuário.',
        );
      }

      let workspaceMeta: { id: string; name: string } | null = null;

      try {
        const ws = await this.prisma.workspace.findUnique({
          where: { id: agent.workspaceId },
          select: { id: true, name: true },
        });

        if (!ws) {
          const errorId = randomUUID();
          this.logger.error(
            buildAuthLogMessage('workspace_not_found_on_login', {
              errorId,
              agentId: agent.id,
              workspaceId: agent.workspaceId,
              email: agent?.email,
            }),
          );
          throw new ServiceUnavailableException(
            `Conta com inconsistência detectada (ref: ${errorId}). Contate o suporte para reativar seu acesso.`,
          );
        }
        workspaceMeta = ws;
      } catch (error: unknown) {
        DbInitErrorService.throwFriendlyDbInitError(error);
      }

      const access_token = await this.signToken(
        agent.id,
        agent.email,
        agent.workspaceId,
        agent.role,
        agent.name,
      );

      await this.prisma.refreshToken.updateMany({
        where: { agentId: agent.id, revoked: false },
        data: { revoked: true },
      });

      const refreshToken = randomUUID() + randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await this.prisma.refreshToken.create({
        data: { token: refreshToken, agentId: agent.id, expiresAt },
      });

      return {
        access_token,
        refresh_token: refreshToken,
        user: {
          id: agent.id,
          name: agent.name,
          email: agent.email,
          workspaceId: agent.workspaceId,
          role: agent.role,
        },
        workspace: workspaceMeta,
        workspaces: workspaceMeta ? [workspaceMeta] : [],
        isNewUser: extra?.isNewUser === true,
      };
    } catch (error) {
      DbInitErrorService.throwFriendlyDbInitError(error);
    }
  }

  /** Issue tokens for agent id. */
  async issueTokensForAgentId(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        email: true,
        workspaceId: true,
        name: true,
        role: true,
        disabledAt: true,
        deletedAt: true,
      },
    });

    if (!agent) {
      throw new UnauthorizedException('Usuário não encontrado para emissão de sessão.');
    }

    return this.issueTokens(agent);
  }

  /** Check email. */
  async checkEmail(email: string): Promise<{ exists: boolean }> {
    try {
      const agent = await this.prisma.agent.findFirst({ where: { email } });
      return { exists: !!agent };
    } catch (error: unknown) {
      DbInitErrorService.throwFriendlyDbInitError(error);
    }
  }

  /** Create anonymous. */
  async createAnonymous(ip?: string) {
    await this.rateLimitService.checkRateLimit(`anonymous:${ip || 'ip-unknown'}`, 3, 60_000);

    const uid = randomUUID().replace(PATTERN_RE, '').slice(0, 12);
    const email = `guest_${uid}@guest.kloel.local`;
    const name = 'Guest';

    let workspace: Workspace;
    try {
      workspace = await this.prisma.workspace.create({
        data: {
          name: 'Guest Workspace',
          providerSettings: {
            guestMode: true,
            authMode: 'anonymous',
            autopilot: { enabled: false },
            whatsappLifecycle: {
              watchdogEnabled: false,
              catchupEnabled: false,
              autoReconnect: false,
            },
          },
        },
      });
    } catch (error: unknown) {
      DbInitErrorService.throwFriendlyDbInitError(error);
    }

    let agent: Agent;
    try {
      agent = await this.prisma.agent.create({
        data: {
          name,
          email,
          password: await bcryptHash(randomUUID(), BCRYPT_ROUNDS),
          role: 'ADMIN',
          workspaceId: workspace.id,
        },
      });
    } catch (error: unknown) {
      DbInitErrorService.throwFriendlyDbInitError(error);
    }

    return this.issueTokens(agent);
  }

  /** Register. */
  async register(data: {
    name?: string;
    email: string;
    password: string;
    workspaceName?: string;
    affiliateInviteToken?: string;
    ip?: string;
  }) {
    const { name, email, password, workspaceName, affiliateInviteToken, ip } = data;
    await this.rateLimitService.checkRateLimit(`register:${ip || 'ip-unknown'}`);
    const normalizedEmail = this.normalizeEmail(email);
    const affiliateInvite = await this.authPartnerService.resolvePartnerInvite(
      affiliateInviteToken,
      normalizedEmail,
    );

    const finalName =
      name?.trim() || UserNameDerivationService.deriveNameFromEmail(normalizedEmail);
    const finalWorkspaceName = workspaceName?.trim() || `${finalName}'s Workspace`;

    let existing: Agent | null;
    try {
      existing = await this.prisma.agent.findFirst({ where: { email: normalizedEmail } });
    } catch (error: unknown) {
      DbInitErrorService.throwFriendlyDbInitError(error);
    }

    if (existing) {
      throw new ConflictException('Email já em uso');
    }

    let workspace: Workspace;
    try {
      workspace = await this.prisma.workspace.create({ data: { name: finalWorkspaceName } });
    } catch (error: unknown) {
      DbInitErrorService.throwFriendlyDbInitError(error);
    }

    const hashed = await bcryptHash(password, BCRYPT_ROUNDS);

    let agent: Agent;
    try {
      agent = await this.prisma.agent.create({
        data: {
          name: finalName,
          email: normalizedEmail,
          password: hashed,
          role: 'ADMIN',
          workspaceId: workspace.id,
        },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email já em uso');
      }
      DbInitErrorService.throwFriendlyDbInitError(error);
    }

    if (affiliateInvite) {
      await this.authPartnerService.finalizePartnerInviteRegistration({
        invite: affiliateInvite,
        workspace,
        agent,
        email: normalizedEmail,
      });
    }

    return this.issueTokens(agent);
  }

  /** Login. */
  async login(data: { email: string; password: string; ip?: string }) {
    const { email, password, ip } = data;
    await this.rateLimitService.checkRateLimit(`login:${ip || 'ip-unknown'}`);
    await this.rateLimitService.checkRateLimit(`login:${ip || 'ip-unknown'}:${email}`);

    let agent: Agent | null;
    try {
      agent = await this.prisma.agent.findFirst({ where: { email } });
    } catch (error: unknown) {
      DbInitErrorService.throwFriendlyDbInitError(error);
    }

    if (!agent) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    this.assertAgentCanAuthenticate(agent);

    if (!agent.password) {
      if (agent.provider === 'google') {
        throw new UnauthorizedException('Esta conta usa Google. Entre com o Google.');
      }
      if (agent.provider === 'facebook') {
        throw new UnauthorizedException('Esta conta usa Facebook. Entre com o Facebook.');
      }
      throw new UnauthorizedException('Esta conta não possui senha cadastrada.');
    }

    const valid = await bcryptCompare(password, agent.password);
    if (!valid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return this.issueTokens(agent);
  }

  /** Refresh. */
  async refresh(refreshToken: string) {
    let stored: Prisma.RefreshTokenGetPayload<{ include: { agent: true } }> | null;
    try {
      stored = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { agent: true },
      });
    } catch (error) {
      DbInitErrorService.throwFriendlyDbInitError(error);
    }

    if (!stored || stored.revoked || !stored.agent || stored.expiresAt.getTime() < Date.now()) {
      if (stored?.revoked && stored.agent) {
        await this.prisma.refreshToken.updateMany({
          where: { agentId: stored.agent.id, revoked: false },
          data: { revoked: true },
        });
        this.logger.warn(`Revoked refresh token replay detected for agent ${stored.agent.id}`);
      }
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    this.assertAgentCanAuthenticate(stored.agent);
    return this.issueTokens(stored.agent);
  }

  /**
   * Endpoint legado. Bloqueia payload OAuth "cru" vindo do cliente.
   */
  async oauthLogin(data: {
    provider?: 'google' | 'apple';
    providerId?: string;
    email?: string;
    name?: string;
    image?: string;
    credential?: string;
    ip?: string;
  }) {
    if (data?.provider === 'google' && data?.credential) {
      return this.loginWithGoogleCredential({ credential: data.credential, ip: data.ip });
    }
    throw new BadRequestException({
      error: 'legacy_oauth_payload_disabled',
      message: 'Use o endpoint seguro /auth/oauth/google com a credential emitida pelo Google.',
    });
  }

  /** Login with google credential. */
  async loginWithGoogleCredential(data: { credential: string; ip?: string }) {
    const profile = await this.authOAuthService.verifyGoogleCredential(data);
    return this.completeTrustedOAuthLogin(profile);
  }

  /** Login with facebook access token. */
  async loginWithFacebookAccessToken(data: { accessToken: string; userId?: string; ip?: string }) {
    const profile = await this.authOAuthService.verifyFacebookAccessToken(data);
    return this.completeTrustedOAuthLogin(profile);
  }

  /** Login with apple credential. */
  async loginWithAppleCredential(data: {
    identityToken: string;
    user?: { name?: { firstName?: string; lastName?: string }; email?: string };
    ip?: string;
  }) {
    const profile = await this.authOAuthService.verifyAppleIdentityToken(data);
    return this.completeTrustedOAuthLogin(profile);
  }

  /** Login with TikTok authorization code. */
  async loginWithTikTokAuthorizationCode(data: {
    code: string;
    redirectUri?: string;
    ip?: string;
  }) {
    const profile = await this.authOAuthService.verifyTikTokAuthorizationCode(data);
    return this.completeTrustedOAuthLogin(profile);
  }

  /** Login with TikTok access token. */
  async loginWithTikTokAccessToken(data: {
    accessToken: string;
    openId?: string;
    refreshToken?: string;
    expiresInSeconds?: number;
    ip?: string;
  }) {
    const profile = await this.authOAuthService.verifyTikTokAccessToken(data);
    return this.completeTrustedOAuthLogin(profile);
  }

  private async completeTrustedOAuthLogin(profile: GoogleVerifiedProfile) {
    const { agent, isNewUser } = await this.authOAuthService.resolveAgentForProfile(profile);
    this.assertAgentCanAuthenticate(agent);
    return this.issueTokens(agent, { isNewUser });
  }

  // =========================================
  // MAGIC LINK — delegated to AuthVerificationService
  // =========================================

  /** Request magic link. */
  async requestMagicLink(data: { email: string; redirectTo?: string; ip?: string }) {
    return this.authVerificationService.requestMagicLink(data);
  }

  /** Verify magic link. */
  async verifyMagicLink(token: string, ip?: string) {
    const { agent, isNewUser, redirectTo } = await this.authVerificationService.verifyMagicLink(
      token,
      ip,
    );
    this.assertAgentCanAuthenticate(agent);
    return {
      ...(await this.issueTokens(agent, { isNewUser })),
      redirectTo,
    };
  }

  // =========================================
  // WHATSAPP OTP — delegated to AuthVerificationService
  // =========================================

  /** Send WhatsApp OTP. */
  async sendWhatsAppCode(phone: string, ip?: string) {
    return this.authVerificationService.sendWhatsAppCode(phone, ip);
  }

  /** Verify WhatsApp OTP and issue tokens. */
  async verifyWhatsAppCode(phone: string, code: string, ip?: string) {
    const agent = await this.authVerificationService.verifyWhatsAppCode(phone, code, ip);
    return this.issueTokens(agent);
  }

  // =========================================
  // PASSWORD RECOVERY — delegated to AuthVerificationService
  // =========================================

  /** Forgot password. */
  async forgotPassword(email: string, ip?: string) {
    return this.authVerificationService.forgotPassword(email, ip);
  }

  /** Reset password. */
  async resetPassword(token: string, newPassword: string, ip?: string) {
    return this.authVerificationService.resetPassword(token, newPassword, ip);
  }

  // =========================================
  // EMAIL VERIFICATION — delegated to AuthVerificationService
  // =========================================

  /** Send verification email. */
  async sendVerificationEmail(agentId: string) {
    return this.authVerificationService.sendVerificationEmail(agentId);
  }

  /** Verify email. */
  async verifyEmail(token: string, ip?: string) {
    return this.authVerificationService.verifyEmail(token, ip);
  }

  /** Resend verification email. */
  async resendVerificationEmail(email: string, ip?: string) {
    return this.authVerificationService.resendVerificationEmail(email, ip);
  }
}
