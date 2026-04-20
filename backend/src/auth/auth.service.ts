import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  BadRequestException,
  ConflictException,
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
import { encryptString } from '../lib/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { FacebookAuthService } from './facebook-auth.service';
import { GoogleAuthService, GoogleVerifiedProfile } from './google-auth.service';
import { getJwtExpiresIn } from './jwt-config';

const PATTERN_RE = /-/g;
const W_RE = /[\W_]+/g;
const D_RE = /\D/g;

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
      if (total > limit) {
        throwTooMany();
      }
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      // Distinguish "rate limit exceeded" (rethrow) from Redis errors (fail closed).
      if (err instanceof HttpException) {
        throw err;
      }
      this.logger.error(
        `Rate limiting Redis failure: ${errInstanceofError?.message || 'unknown'}. Rejecting login attempt.`,
      );
      throw new ServiceUnavailableException(
        'Serviço temporariamente indisponível. Tente novamente em instantes.',
      );
    }
  }

  private normalizeEmail(email: string) {
    return String(email || '')
      .trim()
      .toLowerCase();
  }

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

  private hashOpaqueToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateOpaqueToken(size = 32) {
    return randomBytes(size).toString('base64url');
  }

  private assertAgentCanAuthenticate(agent: { disabledAt?: Date | null; deletedAt?: Date | null }) {
    if (agent.deletedAt) {
      throw new UnauthorizedException('Esta conta foi excluída.');
    }

    if (agent.disabledAt) {
      throw new UnauthorizedException('Esta conta está temporariamente desativada.');
    }
  }

  private buildDeletedEmail(agentId: string) {
    return `deleted-${agentId}@removed.local`;
  }

  private async upsertSocialAccount(
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
      where: {
        agentId_provider: {
          agentId,
          provider: profile.provider,
        },
      },
      select: {
        id: true,
        accessToken: true,
        refreshToken: true,
      },
    });

    const data: Prisma.SocialAccountUncheckedCreateInput = {
      agentId,
      provider: profile.provider,
      providerUserId: profile.providerId,
      email: this.normalizeEmail(profile.email),
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
      where: {
        agentId_provider: {
          agentId,
          provider: profile.provider,
        },
      },
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

      // Hardening multi-tenant: não emitir tokens com workspace inválido.
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

      let workspaceMeta: {
        id: string;
        name: string;
      } | null = null;

      try {
        const ws = await this.prisma.workspace.findUnique({
          where: { id: agent.workspaceId },
          select: { id: true, name: true },
        });

        if (!ws) {
          // Invariant: tenant integrity must not be silently "repaired".
          //
          // The old code created a brand-new workspace on the fly when the
          // agent's workspaceId pointed to a missing row, then reassigned
          // the agent to it. That masks data corruption, creates orphaned
          // workspaces, and could be exploited to create unlimited
          // workspaces by deliberately breaking references. Fail fast with
          // a unique error id so operators can investigate.
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
        workspaceMeta = ws;
      } catch (error: unknown) {
        this.throwFriendlyDbInitError(error);
      }

      const access_token = await this.signToken(
        agent.id,
        agent.email,
        agent.workspaceId,
        agent.role,
        agent.name,
      );

      // revoga anteriores e cria novo refresh
      await this.prisma.refreshToken.updateMany({
        where: { agentId: agent.id, revoked: false },
        data: { revoked: true },
      });

      const refreshToken = randomUUID() + randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30d
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
      this.throwFriendlyDbInitError(error);
    }
  }

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

  async createAnonymous(ip?: string) {
    await this.checkRateLimit(`anonymous:${ip || 'ip-unknown'}`, 3, 60_000);

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

    return this.issueTokens(agent);
  }

  async register(data: {
    name?: string;
    email: string;
    password: string;
    workspaceName?: string;
    ip?: string;
  }) {
    const { name, email, password, workspaceName, ip } = data;
    await this.checkRateLimit(`register:${ip || 'ip-unknown'}`);

    const deriveName = (addr: string) => {
      const local = addr.split('@')[0] || 'User';
      const cleaned = local.replace(W_RE, ' ').trim();
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

    return this.issueTokens(agent);
  }

  async login(data: { email: string; password: string; ip?: string }) {
    const { email, password, ip } = data;
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

  private async signToken(
    agentId: string,
    email: string,
    workspaceId: string,
    role: string,
    name?: string,
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
    return this.jwt.signAsync(payload, {
      expiresIn: getJwtExpiresIn(),
    });
  }

  async refresh(refreshToken: string) {
    let stored: Prisma.RefreshTokenGetPayload<{ include: { agent: true } }> | null;
    try {
      stored = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { agent: true },
      });
    } catch (error) {
      this.throwFriendlyDbInitError(error);
    }

    if (!stored || stored.revoked || !stored.agent || stored.expiresAt.getTime() < Date.now()) {
      // If the token exists but was already revoked, this may indicate token
      // theft (replay). Revoke ALL tokens for the agent as a precaution.
      if (stored?.revoked && stored.agent) {
        await this.prisma.refreshToken.updateMany({
          where: { agentId: stored.agent.id, revoked: false },
          data: { revoked: true },
        });
        this.logger.warn(`Revoked refresh token replay detected for agent ${stored.agent.id}`);
      }
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    // Rotation: explicitly revoke the consumed token before issuing new pair.
    // issueTokens() also does a blanket revoke, but this makes the consumed
    // token invalid immediately, closing any race-condition window.
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
      return this.loginWithGoogleCredential({
        credential: data.credential,
        ip: data.ip,
      });
    }

    throw new BadRequestException({
      error: 'legacy_oauth_payload_disabled',
      message: 'Use o endpoint seguro /auth/oauth/google com a credential emitida pelo Google.',
    });
  }

  async loginWithGoogleCredential(data: { credential: string; ip?: string }) {
    await this.checkRateLimit(`oauth:google:${data.ip || 'ip-unknown'}`);
    const profile = await this.googleAuthService.verifyCredential(data.credential);
    return this.completeTrustedOAuthLogin(profile);
  }

  async loginWithFacebookAccessToken(data: { accessToken: string; userId?: string; ip?: string }) {
    await this.checkRateLimit(`oauth:facebook:${data.ip || 'ip-unknown'}`);
    const profile = await this.facebookAuthService.verifyAccessToken(data.accessToken, data.userId);
    return this.completeTrustedOAuthLogin(profile);
  }

  async loginWithAppleCredential(data: {
    identityToken: string;
    user?: { name?: { firstName?: string; lastName?: string }; email?: string };
    ip?: string;
  }) {
    await this.checkRateLimit(`oauth:apple:${data.ip || 'ip-unknown'}`);

    // Decode Apple identity token (JWT) to extract user info
    // Apple's identityToken is a signed JWT with sub (unique user id) and email
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

    // Apple only sends user info on FIRST sign-in, so we use decoded JWT + optional user data
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

    return this.completeTrustedOAuthLogin(profile);
  }

  private async completeTrustedOAuthLogin(profile: GoogleVerifiedProfile) {
    const { provider, providerId, email, name, image, emailVerified } = profile;

    const deriveName = (addr: string) => {
      const local = addr.split('@')[0] || 'User';
      const cleaned = local.replace(W_RE, ' ').trim();
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
      let agent: {
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
      } | null = null;

      try {
        const socialAccount = await this.prisma.socialAccount.findUnique({
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
                email: true,
                workspaceId: true,
                name: true,
                role: true,
                provider: true,
                providerId: true,
                avatarUrl: true,
                emailVerified: true,
                disabledAt: true,
                deletedAt: true,
              },
            },
          },
        });

        if (socialAccount?.agent) {
          agent = socialAccount.agent;
        } else {
          agent = await this.prisma.agent.findFirst({
            where: {
              provider: normalizedProvider,
              providerId: normalizedProviderId,
            },
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              email: true,
              workspaceId: true,
              name: true,
              role: true,
              provider: true,
              providerId: true,
              avatarUrl: true,
              emailVerified: true,
              disabledAt: true,
              deletedAt: true,
            },
          });
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
              role: true,
              provider: true,
              providerId: true,
              avatarUrl: true,
              emailVerified: true,
              workspaceId: true,
              disabledAt: true,
              deletedAt: true,
            },
          });

          if (candidates.length === 1) {
            agent = candidates[0];
          } else if (candidates.length > 1) {
            agent =
              candidates.find(
                (candidate) =>
                  candidate.provider === normalizedProvider &&
                  candidate.providerId === normalizedProviderId,
              ) ||
              candidates.find((candidate) => !candidate.provider) ||
              null;

            if (!agent) {
              throw new ConflictException(
                'Email já cadastrado em múltiplos workspaces. Contate o suporte.',
              );
            }
          }
        }
      } catch (error: unknown) {
        this.throwFriendlyDbInitError(error);
      }

      if (agent) {
        this.assertAgentCanAuthenticate(agent);

        const nextAgentData: Prisma.AgentUpdateInput = {};
        if (!agent.provider) {
          nextAgentData.provider = normalizedProvider;
        }
        if (!agent.providerId && agent.provider === normalizedProvider) {
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
          agent = await this.prisma.agent.update({
            where: { id: agent.id },
            data: nextAgentData,
            select: {
              id: true,
              email: true,
              workspaceId: true,
              name: true,
              role: true,
              provider: true,
              providerId: true,
              avatarUrl: true,
              emailVerified: true,
              disabledAt: true,
              deletedAt: true,
            },
          });
        }

        await this.upsertSocialAccount(agent.id, {
          ...profile,
          provider: normalizedProvider as GoogleVerifiedProfile['provider'],
          providerId: normalizedProviderId,
          email: normalizedEmail,
          name: finalName,
          image: image || null,
          emailVerified: !!emailVerified,
        });

        return this.issueTokens(agent, { isNewUser: false });
      }

      const wsName = `${finalName}'s Workspace`;
      const created = await this.prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: { name: wsName },
          select: { id: true },
        });

        const createdAgent = await tx.agent.create({
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
          select: {
            id: true,
            email: true,
            workspaceId: true,
            name: true,
            role: true,
            provider: true,
            providerId: true,
            avatarUrl: true,
            emailVerified: true,
            disabledAt: true,
            deletedAt: true,
          },
        });

        return createdAgent;
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

      return this.issueTokens(created, { isNewUser: true });
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

  async requestMagicLink(data: { email: string; redirectTo?: string; ip?: string }) {
    await this.checkRateLimit(`magic-link:${data.ip || 'ip-unknown'}`, 5, 60_000);

    const normalizedEmail = this.normalizeEmail(data.email);
    if (!normalizedEmail) {
      throw new BadRequestException('Email é obrigatório.');
    }

    const token = this.generateOpaqueToken();
    const tokenHash = this.hashOpaqueToken(token);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const redirectTo = String(data.redirectTo || '').trim() || '/dashboard';

    const existingAgent = await this.prisma.agent.findFirst({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    await this.prisma.magicLinkToken.create({
      data: {
        email: normalizedEmail,
        tokenHash,
        redirectTo,
        expiresAt,
        agentId: existingAgent?.id || null,
      },
    });

    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const magicLinkUrl = new URL('/magic-link', frontendUrl);
    magicLinkUrl.searchParams.set('token', token);
    if (redirectTo) {
      magicLinkUrl.searchParams.set('redirectTo', redirectTo);
    }

    await this.emailService.sendMagicLinkEmail(normalizedEmail, magicLinkUrl.toString());

    return {
      success: true,
      message: 'Se o email for válido, o link de acesso foi enviado.',
      ...(process.env.NODE_ENV !== 'production' && {
        token,
        magicLinkUrl: magicLinkUrl.toString(),
      }),
    };
  }

  async verifyMagicLink(token: string, ip?: string) {
    await this.checkRateLimit(`magic-link-verify:${ip || 'ip-unknown'}`, 10, 60_000);

    const normalizedToken = String(token || '').trim();
    if (!normalizedToken) {
      throw new BadRequestException('Token do magic link é obrigatório.');
    }

    const tokenHash = this.hashOpaqueToken(normalizedToken);
    const magicLink = await this.prisma.magicLinkToken.findUnique({
      where: { tokenHash },
      include: {
        agent: {
          select: {
            id: true,
            email: true,
            workspaceId: true,
            name: true,
            role: true,
            provider: true,
            providerId: true,
            avatarUrl: true,
            emailVerified: true,
            disabledAt: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!magicLink || magicLink.usedAt || magicLink.expiresAt < new Date()) {
      throw new UnauthorizedException('Magic link inválido ou expirado.');
    }

    let agent = magicLink.agent;
    if (!agent) {
      const finalName = (() => {
        const local = normalizedToken ? magicLink.email.split('@')[0] || 'User' : 'User';
        const cleaned = local.replace(W_RE, ' ').trim();
        const candidate = cleaned || 'User';
        return candidate.charAt(0).toUpperCase() + candidate.slice(1);
      })();

      agent = await this.prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: { name: `${finalName}'s Workspace` },
          select: { id: true },
        });

        const createdAgent = await tx.agent.create({
          data: {
            name: finalName,
            email: magicLink.email,
            password: '',
            role: 'ADMIN',
            workspaceId: workspace.id,
            emailVerified: true,
          },
          select: {
            id: true,
            email: true,
            workspaceId: true,
            name: true,
            role: true,
            provider: true,
            providerId: true,
            avatarUrl: true,
            emailVerified: true,
            disabledAt: true,
            deletedAt: true,
          },
        });

        await tx.magicLinkToken.update({
          where: { id: magicLink.id },
          data: {
            agentId: createdAgent.id,
            usedAt: new Date(),
          },
        });

        return createdAgent;
      });

      return {
        ...(await this.issueTokens(agent, { isNewUser: true })),
        redirectTo: magicLink.redirectTo || '/dashboard',
      };
    }

    this.assertAgentCanAuthenticate(agent);

    await this.prisma.magicLinkToken.update({
      where: { id: magicLink.id },
      data: { usedAt: new Date() },
    });

    if (!agent.emailVerified) {
      await this.prisma.agent.update({
        where: { id: agent.id },
        data: { emailVerified: true },
      });
    }

    return {
      ...(await this.issueTokens(agent, { isNewUser: false })),
      redirectTo: magicLink.redirectTo || '/dashboard',
    };
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
  async verifyWhatsAppCode(phone: string, code: string, ip?: string) {
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

    return this.issueTokens(agent);
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
        token,
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
   * Redefine a senha usando o token
   */
  async resetPassword(token: string, newPassword: string, ip?: string) {
    await this.checkRateLimit(`reset-password:${ip || 'ip-unknown'}`, 5, 60 * 1000);

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: { agent: true },
    });

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
        data: { revoked: true },
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
        emailVerificationToken: token,
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
        where: { emailVerificationToken: token },
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
