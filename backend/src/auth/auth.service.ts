import { randomInt, randomUUID } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Agent, Prisma, Workspace } from '@prisma/client';
import { compare as bcryptCompare, hash as bcryptHash } from 'bcrypt';
import type { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service';
import { BCRYPT_ROUNDS } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { extractAppleIdentityProfile } from './apple-identity';
import { EmailService } from './email.service';
import { FacebookAuthService } from './facebook-auth.service';
import { GoogleAuthService } from './google-auth.service';
import { hashAuthToken } from './auth-token-hash';
import { getJwtExpiresIn } from './jwt-config';
import {
  buildSessionSummary,
  normalizeSessionContext,
  type AuthSessionContext,
} from './session-metadata';

const PATTERN_RE = /-/g;
const D_RE = /\D/g;

type TrustedOAuthProfile = {
  provider: 'google' | 'facebook' | 'apple';
  providerId: string;
  email: string;
  name?: string | null;
  image?: string | null;
  emailVerified?: boolean | null;
};

type AuthAgentRecord = {
  id: string;
  email: string;
  workspaceId: string;
  name?: string | null;
  role?: string | null;
  provider?: string | null;
  providerId?: string | null;
  avatarUrl?: string | null;
  emailVerified?: boolean | null;
  password?: string | null;
};

type AuthWorkspaceMeta = {
  id: string;
  name: string;
} | null;

type GoogleExtendedProfile = {
  provider: 'google';
  email: string | null;
  phone: string | null;
  birthday: string | null;
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    countryCode: string | null;
    formattedValue: string | null;
  } | null;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly facebookAuthService: FacebookAuthService,
    @Optional() @InjectRedis() private readonly redis?: Redis,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  private throwFriendlyDbInitError(error: unknown): never {
    const message = error instanceof Error ? error.message : '';

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2021' || error.code === 'P2022')
    ) {
      // P2021: table does not exist | P2022: column does not exist
      // Ambos indicam schema/migrations fora de sincronia.
      throw new ServiceUnavailableException(
        'Serviço indisponível. Banco de dados ainda não inicializado (migrations não aplicadas).',
      );
    }

    // Casos comuns quando o schema ainda não existe / migrations não aplicadas.
    if (message.toLowerCase().includes('database not initialized')) {
      throw new ServiceUnavailableException(
        'Serviço indisponível. Banco de dados ainda não inicializado (migrations não aplicadas).',
      );
    }

    // Erros de conectividade (ex.: banco fora do ar)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P1001' || error.code === 'P1002')
    ) {
      throw new ServiceUnavailableException(
        'Serviço indisponível. Não foi possível conectar ao banco de dados.',
      );
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      throw new ServiceUnavailableException(
        'Serviço indisponível. Não foi possível conectar ao banco de dados.',
      );
    }

    throw error;
  }

  private async checkRateLimit(key: string, limit = 5, windowMs = 5 * 60 * 1000) {
    const throwTooMany = () => {
      throw new HttpException(
        'Muitas tentativas, aguarde alguns minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    };

    // Fail-closed (invariant: auth rate limit must enforce across instances).
    //
    // The old implementation fell back to an in-memory Map when Redis was
    // unavailable. In a multi-instance deployment this is worse than useless:
    // each instance enforced its own 5/minute limit, so an attacker could
    // spread attempts across N instances and get 5×N attempts per window.
    //
    // The only way to keep rate limiting meaningful under multi-instance
    // deployment is to require Redis. If Redis is unavailable, reject the
    // request with 503. In development/test, set RATE_LIMIT_DISABLED=true to
    // bypass entirely.
    if (process.env.RATE_LIMIT_DISABLED === 'true') {
      return;
    }

    if (!this.redis) {
      this.logger.error(
        'Rate limiting unavailable: Redis not configured. Rejecting login attempt.',
      );
      throw new ServiceUnavailableException(
        'Serviço temporariamente indisponível. Tente novamente em instantes.',
      );
    }

    try {
      const ttlSeconds = Math.ceil(windowMs / 1000);
      const total = await this.redis.incr(key);
      if (total === 1) {
        await this.redis.expire(key, ttlSeconds);
      }
      if (total > limit) throwTooMany();
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      // Distinguish "rate limit exceeded" (rethrow) from Redis errors (fail closed).
      if (err instanceof HttpException) throw err;
      this.logger.error(
        `Rate limiting Redis failure: ${errInstanceofError?.message || 'unknown'}. Rejecting login attempt.`,
      );
      throw new ServiceUnavailableException(
        'Serviço temporariamente indisponível. Tente novamente em instantes.',
      );
    }
  }

  private async readCachedGoogleExtendedProfile(
    cacheKey: string,
  ): Promise<GoogleExtendedProfile | null> {
    if (!this.redis) {
      return null;
    }

    try {
      const raw = await this.redis.get(cacheKey);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as Partial<GoogleExtendedProfile> | null;
      if (!parsed || parsed.provider !== 'google') {
        return null;
      }

      return {
        provider: 'google',
        email: typeof parsed.email === 'string' ? parsed.email : null,
        phone: typeof parsed.phone === 'string' ? parsed.phone : null,
        birthday: typeof parsed.birthday === 'string' ? parsed.birthday : null,
        address:
          parsed.address && typeof parsed.address === 'object'
            ? {
                street:
                  typeof parsed.address.street === 'string' ? parsed.address.street : null,
                city: typeof parsed.address.city === 'string' ? parsed.address.city : null,
                state: typeof parsed.address.state === 'string' ? parsed.address.state : null,
                postalCode:
                  typeof parsed.address.postalCode === 'string'
                    ? parsed.address.postalCode
                    : null,
                countryCode:
                  typeof parsed.address.countryCode === 'string'
                    ? parsed.address.countryCode
                    : null,
                formattedValue:
                  typeof parsed.address.formattedValue === 'string'
                    ? parsed.address.formattedValue
                    : null,
              }
            : null,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(`google_extended_profile_cache_read_failed: ${message}`);
      return null;
    }
  }

  private async issueTokens(
    agent: {
      id: string;
      email: string;
      workspaceId: string;
      name?: string | null;
      role?: string | null;
    },
    extra?: { isNewUser?: boolean },
    sessionContext?: AuthSessionContext,
  ) {
    try {
      const workspaceMeta = await this.resolveWorkspaceMeta(agent);
      const sessionId = randomUUID();
      const refreshToken = randomUUID() + randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30d
      const normalizedSessionContext = normalizeSessionContext(sessionContext);
      const access_token = await this.signToken(
        agent.id,
        agent.email,
        agent.workspaceId,
        agent.role,
        agent.name,
        sessionId,
      );

      await this.prisma.refreshToken.create({
        data: {
          id: sessionId,
          token: hashAuthToken(refreshToken),
          agentId: agent.id,
          expiresAt,
          lastUsedAt: new Date(),
          userAgent: normalizedSessionContext.userAgent,
          ipAddress: normalizedSessionContext.ipAddress,
        },
      });

      return this.buildAuthPayload(agent, workspaceMeta, access_token, refreshToken, extra);
    } catch (error) {
      this.throwFriendlyDbInitError(error);
    }
  }

  async issueTokensForAgentId(agentId: string, sessionContext?: AuthSessionContext) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        email: true,
        workspaceId: true,
        name: true,
        role: true,
      },
    });

    if (!agent) {
      throw new UnauthorizedException('Usuário não encontrado para emissão de sessão.');
    }

    return this.issueTokens(agent, undefined, sessionContext);
  }

  private async resolveWorkspaceMeta(agent: {
    id: string;
    email: string;
    workspaceId: string;
  }): Promise<AuthWorkspaceMeta> {
    if (!agent?.workspaceId) {
      const errorId = randomUUID();
      this.logger.error(
        `agent_invalid_workspaceId: ${JSON.stringify({
          errorId,
          agentId: agent?.id,
          email: agent?.email,
        })}`,
      );
      throw new ServiceUnavailableException(
        'Serviço indisponível. Workspace inválido para este usuário.',
      );
    }

    try {
      const ws = await this.prisma.workspace.findUnique({
        where: { id: agent.workspaceId },
        select: { id: true, name: true },
      });

      if (!ws) {
        const errorId = randomUUID();
        this.logger.error(
          `workspace_not_found_on_login: ${JSON.stringify({
            errorId,
            agentId: agent.id,
            workspaceId: agent.workspaceId,
            email: agent?.email,
          })}`,
        );
        throw new ServiceUnavailableException(
          `Conta com inconsistência detectada (ref: ${errorId}). Contate o suporte para reativar seu acesso.`,
        );
      }

      return ws;
    } catch (error: unknown) {
      this.throwFriendlyDbInitError(error);
    }
  }

  private buildAuthPayload(
    agent: {
      id: string;
      email: string;
      workspaceId: string;
      name?: string | null;
      role?: string | null;
    },
    workspaceMeta: AuthWorkspaceMeta,
    accessToken: string,
    refreshToken: string,
    extra?: { isNewUser?: boolean },
  ) {
    return {
      access_token: accessToken,
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
  }

  private getFrontendOrigin() {
    return (
      this.config.get<string>('FRONTEND_URL') ||
      process.env.FRONTEND_URL ||
      'http://localhost:3000'
    );
  }

  private buildMagicLinkUrl(token: string, extras?: Record<string, string>) {
    const url = new URL('/magic-link', this.getFrontendOrigin());
    url.searchParams.set('token', token);

    for (const [key, value] of Object.entries(extras || {})) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }

  private getOAuthProviderLabel(provider: string) {
    switch (provider) {
      case 'google':
        return 'Google';
      case 'facebook':
        return 'Facebook';
      case 'apple':
        return 'Apple';
      default:
        return provider;
    }
  }

  private async persistSocialAccount(agentId: string, profile: TrustedOAuthProfile) {
    const provider = profile.provider.trim().toLowerCase();
    const providerUserId = profile.providerId.trim();
    const email = profile.email.trim().toLowerCase();
    const avatarUrl = typeof profile.image === 'string' && profile.image.trim() ? profile.image : null;
    const lastUsedAt = new Date();

    const existing = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId,
        },
      },
    });

    if (existing && existing.agentId !== agentId) {
      throw new ConflictException({
        error: 'oauth_identity_already_linked',
        message: 'Esta identidade social já está vinculada a outra conta.',
      });
    }

    if (existing) {
      await this.prisma.socialAccount.update({
        where: { id: existing.id },
        data: {
          email,
          avatarUrl,
          lastUsedAt,
        },
      });
      return;
    }

    await this.prisma.socialAccount.create({
      data: {
        provider,
        providerUserId,
        agentId,
        email,
        avatarUrl,
        lastUsedAt,
      },
    });
  }

  private async scheduleOAuthLinkConfirmation(agent: AuthAgentRecord, profile: TrustedOAuthProfile) {
    const providerLabel = this.getOAuthProviderLabel(profile.provider);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const magicToken = randomUUID();
    const linkToken = randomUUID();

    await this.prisma.magicLinkToken.updateMany({
      where: { agentId: agent.id, used: false },
      data: { used: true },
    });

    await this.prisma.oAuthLinkIntent.updateMany({
      where: {
        agentId: agent.id,
        provider: profile.provider,
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    });

    await this.prisma.magicLinkToken.create({
      data: {
        token: hashAuthToken(magicToken),
        agentId: agent.id,
        expiresAt,
      },
    });

    await this.prisma.oAuthLinkIntent.create({
      data: {
        token: hashAuthToken(linkToken),
        provider: profile.provider,
        providerUserId: profile.providerId.trim(),
        email: profile.email.trim().toLowerCase(),
        displayName: profile.name?.trim() || null,
        avatarUrl: typeof profile.image === 'string' && profile.image.trim() ? profile.image : null,
        emailVerified: !!profile.emailVerified,
        expiresAt,
        agentId: agent.id,
      },
    });

    const magicLinkUrl = this.buildMagicLinkUrl(magicToken, { link: linkToken });
    const sent = await this.emailService.sendAccountLinkConfirmationEmail(
      agent.email,
      magicLinkUrl,
      providerLabel,
      agent.name?.trim() || undefined,
    );

    if (!sent) {
      throw new ServiceUnavailableException(
        'Não foi possível enviar o email de confirmação para vincular sua conta.',
      );
    }

    throw new ConflictException({
      error: 'oauth_link_confirmation_required',
      message: `Já existe uma conta KLOEL com este email. Enviamos um link para confirmar a vinculação com ${providerLabel}.`,
    });
  }

  async checkEmail(email: string): Promise<{ exists: boolean }> {
    try {
      const agent = await this.prisma.agent.findFirst({
        where: { email },
      });
      return { exists: !!agent };
    } catch (error: unknown) {
      this.throwFriendlyDbInitError(error);
    }
  }

  async createAnonymous(ip?: string, userAgent?: string) {
    await this.checkRateLimit(`anonymous:${ip || 'ip-unknown'}`, 3, 60_000);

    const uid = randomUUID().replace(PATTERN_RE, '').slice(0, 12);
    const email = `visitor_${uid}@visitor.kloel.local`;
    const name = 'Visitante';

    let workspace: Workspace;
    try {
      workspace = await this.prisma.workspace.create({
        data: {
          name: 'Workspace Temporario',
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
      this.throwFriendlyDbInitError(error);
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
      this.throwFriendlyDbInitError(error);
    }

    return this.issueTokens(agent, undefined, { ipAddress: ip, userAgent });
  }

  async register(data: {
    name?: string;
    email: string;
    password: string;
    workspaceName?: string;
    ip?: string;
    userAgent?: string;
  }) {
    const { name, email, password, workspaceName, ip, userAgent } = data;
    await this.checkRateLimit(`register:${ip || 'ip-unknown'}`);

    const deriveName = (addr: string) => {
      const local = addr.split('@')[0] || 'User';
      const cleaned = local.replace(/[\W_]+/g, ' ').trim();
      const candidate = cleaned || 'User';
      return candidate.charAt(0).toUpperCase() + candidate.slice(1);
    };
    const finalName = name?.trim() || deriveName(email);
    const finalWorkspaceName = workspaceName?.trim() || `${finalName}'s Workspace`;

    // 1. Verificar se já existe agent com este email em qualquer workspace
    let existing: Agent | null;
    try {
      existing = await this.prisma.agent.findFirst({
        where: { email },
      });
    } catch (error: unknown) {
      this.throwFriendlyDbInitError(error);
    }

    if (existing) {
      throw new ConflictException('Email já em uso');
    }

    // 2. Criar Workspace
    let workspace: Workspace;
    try {
      workspace = await this.prisma.workspace.create({
        data: {
          name: finalWorkspaceName,
        },
      });
    } catch (error: unknown) {
      this.throwFriendlyDbInitError(error);
    }

    // 3. Hash da senha
    const hashed = await bcryptHash(password, BCRYPT_ROUNDS);

    // 4. Criar Agent (ADMIN) vinculado ao workspace
    let agent: Agent;
    try {
      agent = await this.prisma.agent.create({
        data: {
          name: finalName,
          email,
          password: hashed,
          role: 'ADMIN',
          workspaceId: workspace.id,
        },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email já em uso');
      }
      this.throwFriendlyDbInitError(error);
    }

    return this.issueTokens(agent, undefined, { ipAddress: ip, userAgent });
  }

  async login(data: { email: string; password: string; ip?: string; userAgent?: string }) {
    const { email, password, ip, userAgent } = data;
    // Proteção global por IP (força bruta)
    await this.checkRateLimit(`login:${ip || 'ip-unknown'}`);
    // Proteção adicional por IP+email (reduz enumeração)
    await this.checkRateLimit(`login:${ip || 'ip-unknown'}:${email}`);

    let agent: Agent | null;
    try {
      agent = await this.prisma.agent.findFirst({
        where: { email },
      });
    } catch (error: unknown) {
      this.throwFriendlyDbInitError(error);
    }

    if (!agent) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!agent.password) {
      if (agent.provider === 'google') {
        throw new UnauthorizedException('Esta conta usa Google. Entre com o Google.');
      }

      if (agent.provider === 'facebook') {
        throw new UnauthorizedException('Esta conta usa Facebook. Entre com o Facebook.');
      }

      if (agent.provider === 'apple') {
        throw new UnauthorizedException('Esta conta usa Apple. Entre com a Apple.');
      }

      throw new UnauthorizedException('Esta conta não possui senha cadastrada.');
    }

    const valid = await bcryptCompare(password, agent.password);
    if (!valid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return this.issueTokens(agent, undefined, { ipAddress: ip, userAgent });
  }

  private async signToken(
    agentId: string,
    email: string,
    workspaceId: string,
    role: string,
    name?: string,
    sessionId?: string,
  ) {
    const payload: Record<string, unknown> = {
      sub: agentId,
      email,
      workspaceId,
      role,
    };
    if (name) {
      payload.name = name;
    }
    if (sessionId) {
      payload.sessionId = sessionId;
    }
    return this.jwt.signAsync(payload, {
      expiresIn: getJwtExpiresIn(),
    });
  }

  async refresh(refreshToken: string, sessionContext?: AuthSessionContext) {
    let stored: Prisma.RefreshTokenGetPayload<{ include: { agent: true } }> | null;
    try {
      stored = await this.prisma.refreshToken.findUnique({
        where: { token: hashAuthToken(refreshToken) },
        include: { agent: true },
      });
      if (!stored) {
        stored = await this.prisma.refreshToken.findUnique({
          where: { token: refreshToken },
          include: { agent: true },
        });
      }
    } catch (error) {
      this.throwFriendlyDbInitError(error);
    }

    if (!stored || stored.revoked || !stored.agent || stored.expiresAt.getTime() < Date.now()) {
      // If the token exists but was already revoked, this may indicate token
      // theft (replay). Revoke ALL tokens for the agent as a precaution.
      if (stored?.revoked && stored.agent) {
        await this.prisma.refreshToken.updateMany({
          where: { agentId: stored.agent.id, revoked: false },
          data: { revoked: true, revokedAt: new Date() },
        });
        this.logger.warn(`Revoked refresh token replay detected for agent ${stored.agent.id}`);
      }
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    const workspaceMeta = await this.resolveWorkspaceMeta(stored.agent);
    const normalizedSessionContext = normalizeSessionContext(sessionContext);
    const nextRefreshToken = randomUUID() + randomUUID();
    const nextExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const accessToken = await this.signToken(
      stored.agent.id,
      stored.agent.email,
      stored.agent.workspaceId,
      stored.agent.role,
      stored.agent.name,
      stored.id,
    );

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: {
        token: hashAuthToken(nextRefreshToken),
        expiresAt: nextExpiresAt,
        revoked: false,
        revokedAt: null,
        lastUsedAt: new Date(),
        userAgent: normalizedSessionContext.userAgent || stored.userAgent,
        ipAddress: normalizedSessionContext.ipAddress || stored.ipAddress,
      },
    });

    return this.buildAuthPayload(
      stored.agent,
      workspaceMeta,
      accessToken,
      nextRefreshToken,
    );
  }

  async listSessions(agentId: string, currentSessionId?: string) {
    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        agentId,
        revoked: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      sessions: sessions.map((session) => buildSessionSummary(session, currentSessionId)),
    };
  }

  async revokeSession(agentId: string, sessionId: string) {
    const session = await this.prisma.refreshToken.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        agentId: true,
        revoked: true,
      },
    });

    if (!session || session.agentId !== agentId || session.revoked) {
      return { success: true, revokedSessionId: null };
    }

    await this.prisma.refreshToken.update({
      where: { id: sessionId },
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    });

    return { success: true, revokedSessionId: sessionId };
  }

  async revokeCurrentSession(agentId: string, currentSessionId?: string) {
    if (!currentSessionId) {
      return { success: true, revokedSessionId: null };
    }

    return this.revokeSession(agentId, currentSessionId);
  }

  async revokeOtherSessions(agentId: string, currentSessionId?: string) {
    const where: Prisma.RefreshTokenWhereInput = {
      agentId,
      revoked: false,
      expiresAt: {
        gt: new Date(),
      },
      ...(currentSessionId
        ? {
            id: {
              not: currentSessionId,
            },
          }
        : {}),
    };

    const result = await this.prisma.refreshToken.updateMany({
      where,
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    });

    return { success: true, revokedCount: result.count };
  }

  async changePassword(agentId: string, currentPassword: string, newPassword: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        email: true,
        password: true,
        provider: true,
      },
    });

    if (!agent) {
      throw new UnauthorizedException('Usuário não autenticado');
    }

    if (!agent.password) {
      throw new BadRequestException(
        'Esta conta não possui senha local ativa. Use o link de redefinição para criar uma senha.',
      );
    }

    const valid = await bcryptCompare(currentPassword, agent.password);
    if (!valid) {
      throw new UnauthorizedException('Senha atual inválida');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException('A nova senha deve ser diferente da senha atual.');
    }

    const hashedPassword = await bcryptHash(newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.agent.update({
        where: { id: agent.id },
        data: { password: hashedPassword },
      }),
      this.prisma.refreshToken.updateMany({
        where: { agentId: agent.id, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  async getGoogleExtendedProfile(
    agentId: string,
    accessToken: string,
  ): Promise<GoogleExtendedProfile> {
    if (String(this.config.get<string>('KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL') || '').trim() !== 'true') {
      throw new ForbiddenException('Prefill sensível do Google está desabilitado no momento.');
    }

    const token = accessToken?.trim();
    if (!token) {
      throw new UnauthorizedException('Access token Google ausente.');
    }

    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        email: true,
        provider: true,
        providerId: true,
        socialAccounts: {
          where: { provider: 'google' },
          select: {
            provider: true,
            providerUserId: true,
            email: true,
          },
          take: 5,
        },
      },
    });

    if (!agent) {
      throw new UnauthorizedException('Usuário não autenticado');
    }

    const hasGoogleIdentity =
      agent.provider === 'google' ||
      (Array.isArray(agent.socialAccounts) && agent.socialAccounts.length > 0);
    if (!hasGoogleIdentity) {
      throw new BadRequestException('Conta autenticada não possui Google vinculado.');
    }

    const cacheKey = `auth:google-extended-profile:${agentId}`;
    const cachedProfile = await this.readCachedGoogleExtendedProfile(cacheKey);
    if (cachedProfile) {
      return cachedProfile;
    }

    const peopleProfile = await this.googleAuthService.fetchPeopleProfile(token);
    const normalizedPeopleEmail =
      typeof peopleProfile.email === 'string' ? peopleProfile.email.trim().toLowerCase() : '';
    const allowedEmails = [
      agent.provider === 'google' ? agent.email : null,
      ...agent.socialAccounts.map((account) => account.email || null),
    ]
      .map((email) => (typeof email === 'string' ? email.trim().toLowerCase() : ''))
      .filter(Boolean);

    if (
      normalizedPeopleEmail &&
      allowedEmails.length > 0 &&
      !allowedEmails.includes(normalizedPeopleEmail)
    ) {
      throw new UnauthorizedException('Conta Google divergente da sessão autenticada.');
    }

    const profile: GoogleExtendedProfile = {
      provider: 'google',
      email: peopleProfile.email,
      phone: peopleProfile.phone,
      birthday: peopleProfile.birthday,
      address: peopleProfile.address,
    };

    if (this.redis) {
      try {
        await this.redis.setex(cacheKey, 24 * 60 * 60, JSON.stringify(profile));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(`google_extended_profile_cache_write_failed: ${message}`);
      }
    }

    return profile;
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
    userAgent?: string;
  }) {
    if (data?.provider === 'google' && data?.credential) {
      return this.loginWithGoogleCredential({
        credential: data.credential,
        ip: data.ip,
        userAgent: data.userAgent,
      });
    }

    throw new BadRequestException({
      error: 'legacy_oauth_payload_disabled',
      message: 'Use o endpoint seguro /auth/oauth/google com a credential emitida pelo Google.',
    });
  }

  async loginWithGoogleCredential(data: { credential: string; ip?: string; userAgent?: string }) {
    await this.checkRateLimit(`oauth:google:${data.ip || 'ip-unknown'}`);
    const profile = await this.googleAuthService.verifyCredential(data.credential);
    return this.completeTrustedOAuthLogin(profile, data);
  }

  async loginWithFacebookAccessToken(data: {
    accessToken: string;
    ip?: string;
    userAgent?: string;
  }) {
    await this.checkRateLimit(`oauth:facebook:${data.ip || 'ip-unknown'}`);
    const profile = await this.facebookAuthService.verifyAccessToken(data.accessToken);
    return this.completeTrustedOAuthLogin(profile, data);
  }

  async loginWithAppleCredential(data: {
    identityToken: string;
    user?: { name?: { firstName?: string; lastName?: string }; email?: string };
    ip?: string;
    userAgent?: string;
  }) {
    await this.checkRateLimit(`oauth:apple:${data.ip || 'ip-unknown'}`);
    const profile = extractAppleIdentityProfile(data.identityToken, data.user);

    return this.completeTrustedOAuthLogin(profile, data);
  }

  private async completeTrustedOAuthLogin(
    profile: TrustedOAuthProfile,
    sessionContext?: AuthSessionContext,
  ) {
    const { provider, providerId, email, name, image, emailVerified } = profile;

    const deriveName = (addr: string) => {
      const local = addr.split('@')[0] || 'User';
      const cleaned = local.replace(/[\W_]+/g, ' ').trim();
      const candidate = cleaned || 'User';
      return candidate.charAt(0).toUpperCase() + candidate.slice(1);
    };

    const normalizedProvider = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
    if (!['google', 'apple', 'facebook'].includes(normalizedProvider)) {
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

    const finalName = (typeof name === 'string' && name.trim()) || deriveName(normalizedEmail);

    try {
      let agent: AuthAgentRecord | null = null;
      let matchedBySocialAccount = false;
      let matchedLegacyProvider = false;

      try {
        const linkedSocialAccount = await this.prisma.socialAccount.findUnique({
          where: {
            provider_providerUserId: {
              provider: normalizedProvider,
              providerUserId: normalizedProviderId,
            },
          },
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                email: true,
                password: true,
                role: true,
                provider: true,
                providerId: true,
                avatarUrl: true,
                emailVerified: true,
                workspaceId: true,
                createdAt: true,
                isOnline: true,
                phone: true,
              },
            },
          },
        });

        if (linkedSocialAccount?.agent) {
          agent = linkedSocialAccount.agent;
          matchedBySocialAccount = true;
        }

        if (!agent) {
          const candidates = await this.prisma.agent.findMany({
            where: { email: normalizedEmail },
            orderBy: { createdAt: 'asc' },
            take: 10,
            select: {
              id: true,
              name: true,
              email: true,
              password: true,
              role: true,
              provider: true,
              providerId: true,
              avatarUrl: true,
              emailVerified: true,
              workspaceId: true,
              createdAt: true,
              isOnline: true,
              phone: true,
            },
          });

          if (candidates.length === 1) {
            agent = candidates[0];
          } else if (candidates.length > 1) {
            agent =
              candidates.find(
                (a) => a.provider === normalizedProvider && a.providerId === normalizedProviderId,
              ) ||
              candidates.find(
                (a) =>
                  a.provider === normalizedProvider &&
                  (!a.providerId || a.providerId === normalizedProviderId),
              ) ||
              candidates.find((a) => !a.provider) ||
              null;

            if (!agent) {
              throw new ConflictException(
                'Email já cadastrado em múltiplos workspaces. Contate o suporte.',
              );
            }
          }

          if (agent) {
            matchedLegacyProvider =
              agent.provider === normalizedProvider &&
              (!agent.providerId || agent.providerId === normalizedProviderId);
          }
        }
      } catch (error: unknown) {
        this.throwFriendlyDbInitError(error);
      }

      if (agent) {
        // Se o workspace do agent estiver inconsistente (ex.: apagado manualmente), repara.
        try {
          const ws = await this.prisma.workspace.findUnique({
            where: { id: agent.workspaceId },
            select: { id: true },
          });
          if (!ws) {
            const repairId = randomUUID();
            const newWsName = `${finalName}'s Workspace`;
            const repaired = await this.prisma.$transaction(async (tx) => {
              const createdWs = await tx.workspace.create({
                data: { name: newWsName },
                select: { id: true },
              });
              const updatedAgent = await tx.agent.update({
                where: { id: agent.id },
                data: { workspaceId: createdWs.id },
              });
              return updatedAgent;
            });
            this.logger.warn(
              `oauth_workspace_repaired: ${JSON.stringify({
                repairId,
                agentId: agent.id,
                oldWorkspaceId: agent.workspaceId,
                newWorkspaceName: newWsName,
                newWorkspaceId: repaired.workspaceId,
                provider: normalizedProvider,
                email: normalizedEmail,
              })}`,
            );
            agent = repaired;
          }
        } catch (error: unknown) {
          this.throwFriendlyDbInitError(error);
        }

        if (!matchedBySocialAccount && !matchedLegacyProvider) {
          await this.scheduleOAuthLinkConfirmation(agent, {
            provider: normalizedProvider as TrustedOAuthProfile['provider'],
            providerId: normalizedProviderId,
            email: normalizedEmail,
            name: finalName,
            image: image || null,
            emailVerified: !!emailVerified,
          });
        }

        const nextAgentData: Record<string, unknown> = {};
        if (!agent.provider) {
          nextAgentData.provider = normalizedProvider;
        }
        if ((!agent.provider || agent.provider === normalizedProvider) && agent.providerId !== normalizedProviderId) {
          nextAgentData.providerId = normalizedProviderId;
        }
        if (image && agent.avatarUrl !== image) {
          nextAgentData.avatarUrl = image;
        }
        if (emailVerified && !agent.emailVerified) {
          nextAgentData.emailVerified = true;
        }
        if (agent.email !== normalizedEmail) {
          nextAgentData.email = normalizedEmail;
        }
        if (!agent.name || agent.name.trim() === '') {
          nextAgentData.name = finalName;
        }

        if (Object.keys(nextAgentData).length > 0) {
          try {
            agent = await this.prisma.agent.update({
              where: { id: agent.id },
              data: nextAgentData,
            });
          } catch (error) {
            this.throwFriendlyDbInitError(error);
          }
        }

        await this.persistSocialAccount(agent.id, {
          provider: normalizedProvider as TrustedOAuthProfile['provider'],
          providerId: normalizedProviderId,
          email: normalizedEmail,
          name: finalName,
          image: image || null,
          emailVerified: !!emailVerified,
        });

        return this.issueTokens(agent, { isNewUser: false }, sessionContext);
      }

      let newAgent: Agent;
      try {
        const wsName = `${finalName}'s Workspace`;
        const created = await this.prisma.$transaction(async (tx) => {
          const workspace = await tx.workspace.create({
            data: { name: wsName },
            select: { id: true },
          });

          const agent = await tx.agent.create({
            data: {
              name: finalName,
              email: normalizedEmail,
              password: '',
              role: 'ADMIN',
              workspaceId: workspace.id,
              provider: normalizedProvider,
              providerId: normalizedProviderId,
              avatarUrl: image,
              emailVerified: !!emailVerified,
            },
          });

          await tx.socialAccount.create({
            data: {
              provider: normalizedProvider,
              providerUserId: normalizedProviderId,
              agentId: agent.id,
              email: normalizedEmail,
              avatarUrl: image,
              lastUsedAt: new Date(),
            },
          });

          return agent;
        });
        newAgent = created;
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Email já em uso');
        }
        this.throwFriendlyDbInitError(error);
      }

      return this.issueTokens(newAgent, { isNewUser: true }, sessionContext);
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
            `oauthLogin_http_exception: ${JSON.stringify({
              status,
              provider: normalizedProvider,
              email: normalizedEmail,
              response: safeResponse,
            })}`,
          );
        } catch {
          // PULSE:OK — Error log stringify failure; original error is re-thrown below
        }
        throw error;
      }

      // Mapeia falhas de DB/migrations para 503
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      const isDbInitOrConnError =
        error instanceof Prisma.PrismaClientInitializationError ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2021' ||
            error.code === 'P2022' ||
            error.code === 'P1001' ||
            error.code === 'P1002')) ||
        message.includes('database not initialized');

      if (isDbInitOrConnError) {
        this.throwFriendlyDbInitError(error);
      }

      // Payload inválido (ex.: name/email undefined vindo do provedor)
      if (error instanceof Prisma.PrismaClientValidationError) {
        throw new BadRequestException({
          error: 'invalid_oauth_payload',
          message: 'Dados OAuth inválidos. Verifique permissões do provedor.',
        });
      }

      // Erro inesperado: retornar explícito e rastreável (não genérico)
      const errorId = randomUUID();
      const details = {
        errorId,
        provider: normalizedProvider,
        email: normalizedEmail,
        message:
          error instanceof Error
            ? error.message
            : typeof error === 'string' && error.trim()
              ? error
              : 'unknown_error',
      };
      if (!process.env.JEST_WORKER_ID && process.env.NODE_ENV !== 'test') {
        this.logger.error(
          `oauthLogin_failed: ${JSON.stringify(details)}`,
          error instanceof Error ? error.stack : undefined,
        );
      }

      throw new InternalServerErrorException({
        error: 'oauth_internal_error',
        errorId,
        message: 'Falha ao concluir login OAuth no backend.',
      });
    }
  }

  /**
   * Envia código de verificação via WhatsApp
   */
  async sendWhatsAppCode(phone: string, ip?: string) {
    await this.checkRateLimit(`whatsapp-code:${ip || 'ip-unknown'}`, 3, 60 * 1000);

    // Gera código de 6 dígitos (crypto-secure)
    const code = String(randomInt(100000, 999999));

    // Armazena no Redis se disponível
    if (this.redis) {
      await this.redis.setex(`whatsapp-verify:${phone}`, 300, code);
    } else {
      // Fallback: armazena em memória (não ideal para produção)
      this.logger.warn('Redis não disponível, código WhatsApp não persistido');
    }

    // Enviar via canal externo de verificação, se configurado
    const metaToken = this.config.get<string>('META_ACCESS_TOKEN');
    const metaPhoneId = this.config.get<string>('META_PHONE_NUMBER_ID');

    if (metaToken && metaPhoneId) {
      try {
        const message = `Seu código de verificação KLOEL é: *${code}*\n\nEsse código expira em 5 minutos. Não compartilhe com ninguém.`;

        // Not SSRF: hardcoded Meta Graph API endpoint; metaPhoneId from server env var
        const response = await fetch(`https://graph.facebook.com/v19.0/${metaPhoneId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${metaToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone.replace(D_RE, ''), // Remove não-dígitos
            type: 'text',
            text: { body: message },
          }),
          signal: AbortSignal.timeout(30000),
        });

        const result = await response.json();

        if (result.error) {
          this.logger.error(`WhatsApp API: erro ao enviar código: ${result.error.message}`);
          // Não falha, apenas loga - código será mostrado em dev
        } else {
          this.logger.log(`WhatsApp API: código enviado para ${phone}`);
          return {
            success: true,
            message: 'Código enviado via WhatsApp',
          };
        }
      } catch (error: unknown) {
        const errorInstanceofError =
          error instanceof Error
            ? error
            : new Error(typeof error === 'string' ? error : 'unknown error');
        this.logger.error(
          `WhatsApp API: erro ao enviar código: ${errorInstanceofError.message}`,
          typeof errorInstanceofError?.stack === 'string' ? errorInstanceofError.stack : undefined,
        );
      }
    }

    // Fallback: loga o código para desenvolvimento
    this.logger.debug(`WhatsApp Code (dev): ${phone}: ${code}`);

    return {
      success: true,
      message: 'Código enviado via WhatsApp',
      // Em dev, retorna o código para facilitar testes
      ...(process.env.NODE_ENV !== 'production' && { code }),
    };
  }

  /**
   * Verifica código WhatsApp e faz login
   */
  async verifyWhatsAppCode(phone: string, code: string, ip?: string, userAgent?: string) {
    await this.checkRateLimit(`whatsapp-verify:${ip || 'ip-unknown'}`, 5, 60 * 1000);

    let storedCode: string | null = null;

    if (this.redis) {
      storedCode = await this.redis.get(`whatsapp-verify:${phone}`);
    }

    if (!storedCode || storedCode !== code) {
      throw new UnauthorizedException('Código inválido ou expirado');
    }

    // Remove código usado
    if (this.redis) {
      await this.redis.del(`whatsapp-verify:${phone}`);
    }

    // Busca ou cria agent por telefone
    let agent = await this.prisma.agent.findFirst({
      where: { phone },
    });

    if (!agent) {
      // Cria novo workspace + agent
      const workspace = await this.prisma.workspace.create({
        data: { name: `WhatsApp User` },
      });

      agent = await this.prisma.agent.create({
        data: {
          name: `User ${phone.slice(-4)}`,
          email: `${phone}@whatsapp.kloel.com`, // Email temporário
          password: '',
          role: 'ADMIN',
          workspaceId: workspace.id,
          phone,
          provider: 'whatsapp',
          providerId: phone,
        },
      });
    }

    return this.issueTokens(agent, undefined, { ipAddress: ip, userAgent });
  }

  // =========================================
  // PASSWORD RECOVERY
  // =========================================

  /**
   * Envia email com link de recuperação de senha
   */
  async forgotPassword(email: string, ip?: string) {
    await this.checkRateLimit(`forgot-password:${ip || 'ip-unknown'}`, 3, 60 * 1000);

    const agent = await this.prisma.agent.findFirst({
      where: { email },
    });

    // Não revelamos se o email existe ou não (segurança)
    if (!agent) {
      return {
        success: true,
        message: 'Se o email existir, você receberá instruções de recuperação.',
      };
    }

    // Gera token único
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    // Invalida tokens anteriores
    await this.prisma.passwordResetToken.updateMany({
      where: { agentId: agent.id, used: false },
      data: { used: true },
    });

    // Cria novo token
    await this.prisma.passwordResetToken.create({
      data: {
        token: hashAuthToken(token),
        agentId: agent.id,
        expiresAt,
      },
    });

    // Envia email de recuperação
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    await this.emailService.sendPasswordResetEmail(email, resetUrl);

    return {
      success: true,
      message: 'Se o email existir, você receberá instruções de recuperação.',
      // Em dev, retorna o token para facilitar testes
      ...(process.env.NODE_ENV !== 'production' && { token, resetUrl }),
    };
  }

  /**
   * Envia magic link de login
   */
  async requestMagicLink(email: string, ip?: string) {
    await this.checkRateLimit(`magic-link-request:${ip || 'ip-unknown'}`, 5, 60 * 1000);

    const agent = await this.prisma.agent.findFirst({
      where: { email },
      select: {
        id: true,
        email: true,
      },
    });

    if (!agent) {
      return {
        success: true,
        message: 'Se o email existir, você receberá um link de acesso.',
      };
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await this.prisma.magicLinkToken.updateMany({
      where: { agentId: agent.id, used: false },
      data: { used: true },
    });

    await this.prisma.magicLinkToken.create({
      data: {
        token: hashAuthToken(token),
        agentId: agent.id,
        expiresAt,
      },
    });

    const magicLinkUrl = this.buildMagicLinkUrl(token);
    await this.emailService.sendMagicLinkEmail(agent.email, magicLinkUrl);

    return {
      success: true,
      message: 'Se o email existir, você receberá um link de acesso.',
      ...(process.env.NODE_ENV !== 'production' && { token, magicLinkUrl }),
    };
  }

  /**
   * Consome magic link e cria uma sessão autenticada
   */
  async consumeMagicLink(token: string, ip?: string, linkToken?: string, userAgent?: string) {
    await this.checkRateLimit(`magic-link-consume:${ip || 'ip-unknown'}`, 10, 60 * 1000);

    const stored =
      (await this.prisma.magicLinkToken.findUnique({
        where: { token: hashAuthToken(token) },
        include: {
          agent: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              workspaceId: true,
              emailVerified: true,
            },
          },
        },
      })) ||
      (await this.prisma.magicLinkToken.findUnique({
        where: { token },
        include: {
          agent: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              workspaceId: true,
              emailVerified: true,
            },
          },
        },
      }));

    if (!stored || stored.used || stored.expiresAt < new Date() || !stored.agent) {
      throw new UnauthorizedException('Token de acesso inválido ou expirado.');
    }

    await this.prisma.magicLinkToken.update({
      where: { id: stored.id },
      data: { used: true },
    });

    if (linkToken) {
      const linkIntent =
        (await this.prisma.oAuthLinkIntent.findUnique({
          where: { token: hashAuthToken(linkToken) },
        })) ||
        (await this.prisma.oAuthLinkIntent.findUnique({
          where: { token: linkToken },
        }));

      if (
        !linkIntent ||
        linkIntent.agentId !== stored.agent.id ||
        linkIntent.consumedAt ||
        linkIntent.expiresAt < new Date()
      ) {
        throw new UnauthorizedException('Solicitação de vinculação inválida ou expirada.');
      }

      await this.persistSocialAccount(stored.agent.id, {
        provider: linkIntent.provider as TrustedOAuthProfile['provider'],
        providerId: linkIntent.providerUserId,
        email: linkIntent.email,
        name: linkIntent.displayName || stored.agent.name || stored.agent.email,
        image: linkIntent.avatarUrl,
        emailVerified: linkIntent.emailVerified,
      });

      await this.prisma.oAuthLinkIntent.update({
        where: { id: linkIntent.id },
        data: { consumedAt: new Date() },
      });
    }

    if (!stored.agent.emailVerified) {
      await this.prisma.agent.update({
        where: { id: stored.agent.id },
        data: {
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpiry: null,
        },
      });
    }

    return this.issueTokens(stored.agent, undefined, { ipAddress: ip, userAgent });
  }

  /**
   * Redefine a senha usando o token
   */
  async resetPassword(token: string, newPassword: string, ip?: string) {
    await this.checkRateLimit(`reset-password:${ip || 'ip-unknown'}`, 5, 60 * 1000);

    const resetToken =
      (await this.prisma.passwordResetToken.findUnique({
        where: { token: hashAuthToken(token) },
        include: { agent: true },
      })) ||
      (await this.prisma.passwordResetToken.findUnique({
        where: { token },
        include: { agent: true },
      }));

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    // Validação de senha
    if (newPassword.length < 8) {
      throw new HttpException('A senha deve ter pelo menos 8 caracteres', HttpStatus.BAD_REQUEST);
    }

    const hashedPassword = await bcryptHash(newPassword, BCRYPT_ROUNDS);

    // Atualiza senha e marca token como usado
    await this.prisma.$transaction([
      this.prisma.agent.update({
        where: { id: resetToken.agentId },
        data: { password: hashedPassword },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
      // Revoga todos os refresh tokens (força re-login)
      this.prisma.refreshToken.updateMany({
        where: { agentId: resetToken.agentId },
        data: { revoked: true, revokedAt: new Date() },
      }),
    ]);

    return {
      success: true,
      message: 'Senha redefinida com sucesso. Faça login novamente.',
    };
  }

  // =========================================
  // EMAIL VERIFICATION
  // =========================================

  /**
   * Envia email de verificação
   */
  async sendVerificationEmail(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    if (agent.emailVerified) {
      return {
        success: true,
        message: 'Email já verificado.',
        alreadyVerified: true,
      };
    }

    // Gera token de verificação
    const token = randomUUID();
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    await this.prisma.agent.update({
      where: { id: agentId },
      data: {
        emailVerificationToken: hashAuthToken(token),
        emailVerificationExpiry: expiry,
      },
    });

    // Envia email de verificação
    const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
    await this.emailService.sendVerificationEmail(agent.email, verifyUrl);

    return {
      success: true,
      message: 'Email de verificação enviado.',
      // Em dev, retorna o token para facilitar testes
      ...(process.env.NODE_ENV !== 'production' && { token, verifyUrl }),
    };
  }

  /**
   * Verifica email com token
   */
  async verifyEmail(token: string, ip?: string) {
    await this.checkRateLimit(`verify-email:${ip || 'ip-unknown'}`, 10, 60 * 1000);

    try {
      const agent = await this.prisma.agent.findFirst({
        where: {
          OR: [{ emailVerificationToken: hashAuthToken(token) }, { emailVerificationToken: token }],
        },
      });

      if (!agent) {
        throw new UnauthorizedException('Token de verificação inválido');
      }

      if (agent.emailVerificationExpiry && agent.emailVerificationExpiry < new Date()) {
        throw new UnauthorizedException('Token de verificação expirado. Solicite um novo.');
      }

      await this.prisma.agent.update({
        where: { id: agent.id },
        data: {
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpiry: null,
        },
      });

      return {
        success: true,
        message: 'Email verificado com sucesso!',
      };
    } catch (error: unknown) {
      this.throwFriendlyDbInitError(error);
    }
  }

  /**
   * Reenvia email de verificação
   */
  async resendVerificationEmail(email: string, ip?: string) {
    await this.checkRateLimit(`resend-verification:${ip || 'ip-unknown'}`, 3, 60 * 1000);

    const agent = await this.prisma.agent.findFirst({
      where: { email },
    });

    if (!agent) {
      // Não revelamos se o email existe
      return {
        success: true,
        message: 'Se o email existir, você receberá um link de verificação.',
      };
    }

    if (agent.emailVerified) {
      return {
        success: true,
        message: 'Email já está verificado.',
        alreadyVerified: true,
      };
    }

    return this.sendVerificationEmail(agent.id);
  }
}
