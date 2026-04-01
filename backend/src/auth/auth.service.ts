import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Optional,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';
import { EmailService } from './email.service';
import {
  GoogleAuthService,
  GoogleVerifiedProfile,
} from './google-auth.service';
import { getJwtExpiresIn } from './jwt-config';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Fallback seguro quando Redis está indisponível.
  // Em produção multi-instância, Redis é recomendado para rate limit global.
  private readonly localRateLimit = new Map<
    string,
    { count: number; resetAt: number; lastSeenAt: number }
  >();
  private readonly warnCooldown = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly googleAuthService: GoogleAuthService,
    @Optional() @InjectRedis() private readonly redis?: Redis,
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

  private async checkRateLimit(
    key: string,
    limit = 5,
    windowMs = 5 * 60 * 1000,
  ) {
    const throwTooMany = () => {
      throw new HttpException(
        'Muitas tentativas, aguarde alguns minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    };

    const now = Date.now();
    const warnOnce = (
      warnKey: string,
      message: string,
      cooldownMs = 60_000,
    ) => {
      const last = this.warnCooldown.get(warnKey) || 0;
      if (now - last < cooldownMs) return;
      this.warnCooldown.set(warnKey, now);
      this.logger.warn(message);
    };

    const cleanup = () => {
      // Evita crescimento infinito: remove expirados e, se necessário, os menos recentes.
      for (const [k, v] of this.localRateLimit.entries()) {
        if (v.resetAt <= now) this.localRateLimit.delete(k);
      }
      const maxKeys = 10_000;
      if (this.localRateLimit.size <= maxKeys) return;
      const entries = Array.from(this.localRateLimit.entries()).sort(
        (a, b) => a[1].lastSeenAt - b[1].lastSeenAt,
      );
      const toDelete = entries.slice(0, this.localRateLimit.size - maxKeys);
      for (const [k] of toDelete) this.localRateLimit.delete(k);
    };

    const enforceLocal = () => {
      const existing = this.localRateLimit.get(key);
      if (!existing || existing.resetAt <= now) {
        this.localRateLimit.set(key, {
          count: 1,
          resetAt: now + windowMs,
          lastSeenAt: now,
        });
        cleanup();
        return;
      }

      existing.count += 1;
      existing.lastSeenAt = now;
      if (existing.count > limit) throwTooMany();
    };

    // Redis preferencial. Se indisponível, usa fallback em memória (sem quebrar login).
    if (!this.redis) {
      warnOnce(
        `ratelimit:no_redis:${key.split(':')[0]}`,
        'Rate limit em fallback local: Redis não configurado/indisponível.',
      );
      enforceLocal();
      return;
    }

    try {
      const ttlSeconds = Math.ceil(windowMs / 1000);
      const total = await this.redis.incr(key);
      if (total === 1) {
        await this.redis.expire(key, ttlSeconds);
      }
      if (total > limit) throwTooMany();
    } catch (err: any) {
      warnOnce(
        `ratelimit:redis_error:${key.split(':')[0]}`,
        `Rate limit em fallback local: Redis falhou (${err?.message || 'erro desconhecido'}).`,
      );
      enforceLocal();
    }
  }

  private async issueTokens(agent: any, extra?: { isNewUser?: boolean }) {
    try {
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
          const repairId = randomUUID();
          const baseName =
            typeof agent?.name === 'string' && agent.name.trim()
              ? agent.name.trim()
              : 'User';
          const newWsName = `${baseName}'s Workspace`;
          const repairResult = await this.prisma.$transaction(async (tx) => {
            const createdWs = await tx.workspace.create({
              data: { name: newWsName },
              select: { id: true },
            });
            const updatedAgent = await tx.agent.update({
              where: { id: agent.id },
              data: { workspaceId: createdWs.id },
            });
            return { updatedAgent, createdWorkspaceId: createdWs.id };
          });

          const repairedWorkspaceId =
            repairResult?.updatedAgent?.workspaceId ||
            repairResult?.createdWorkspaceId;

          this.logger.warn(
            `workspace_repaired_on_login: ${JSON.stringify({
              repairId,
              agentId: agent.id,
              oldWorkspaceId: agent.workspaceId,
              newWorkspaceId: repairedWorkspaceId,
              newWorkspaceName: newWsName,
            })}`,
          );

          if (repairResult?.updatedAgent) {
            agent = repairResult.updatedAgent;
          } else {
            agent = { ...agent, workspaceId: repairedWorkspaceId };
          }
          workspaceMeta = {
            id: repairedWorkspaceId,
            name: newWsName,
          };
        } else {
          workspaceMeta = ws;
        }
      } catch (error: any) {
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

  async checkEmail(email: string): Promise<{ exists: boolean }> {
    try {
      const agent = await this.prisma.agent.findFirst({
        where: { email },
      });
      return { exists: !!agent };
    } catch (error: any) {
      this.throwFriendlyDbInitError(error);
    }
  }

  async createAnonymous(ip?: string) {
    await this.checkRateLimit(`anonymous:${ip || 'ip-unknown'}`, 3, 60_000);

    const uid = randomUUID().replace(/-/g, '').slice(0, 12);
    const email = `guest_${uid}@guest.kloel.local`;
    const name = 'Guest';

    let workspace;
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
    } catch (error: any) {
      this.throwFriendlyDbInitError(error);
    }

    let agent;
    try {
      agent = await this.prisma.agent.create({
        data: {
          name,
          email,
          password: await bcrypt.hash(randomUUID(), 10),
          role: 'ADMIN',
          workspaceId: workspace.id,
        },
      });
    } catch (error: any) {
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
      const cleaned = local.replace(/[\W_]+/g, ' ').trim();
      const candidate = cleaned || 'User';
      return candidate.charAt(0).toUpperCase() + candidate.slice(1);
    };
    const finalName = (name && name.trim()) || deriveName(email);
    const finalWorkspaceName =
      (workspaceName && workspaceName.trim()) || `${finalName}'s Workspace`;

    // 1. Verificar se já existe agent com este email em qualquer workspace
    let existing;
    try {
      existing = await this.prisma.agent.findFirst({
        where: { email },
      });
    } catch (error: any) {
      this.throwFriendlyDbInitError(error);
    }

    if (existing) {
      throw new ConflictException('Email já em uso');
    }

    // 2. Criar Workspace
    let workspace;
    try {
      workspace = await this.prisma.workspace.create({
        data: {
          name: finalWorkspaceName,
        },
      });
    } catch (error: any) {
      this.throwFriendlyDbInitError(error);
    }

    // 3. Hash da senha
    const hashed = await bcrypt.hash(password, 10);

    // 4. Criar Agent (ADMIN) vinculado ao workspace
    let agent;
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
    } catch (error: any) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
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

    let agent;
    try {
      agent = await this.prisma.agent.findFirst({
        where: { email },
      });
    } catch (error: any) {
      this.throwFriendlyDbInitError(error);
    }

    if (!agent) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!agent.password) {
      if (agent.provider === 'google') {
        throw new UnauthorizedException(
          'Esta conta usa Google. Entre com o Google.',
        );
      }

      throw new UnauthorizedException(
        'Esta conta não possui senha cadastrada.',
      );
    }

    const valid = await bcrypt.compare(password, agent.password);
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
    const payload: Record<string, any> = {
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
    let stored;
    try {
      stored = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { agent: true },
      });
    } catch (error) {
      this.throwFriendlyDbInitError(error);
    }

    if (
      !stored ||
      stored.revoked ||
      !stored.agent ||
      stored.expiresAt.getTime() < Date.now()
    ) {
      // If the token exists but was already revoked, this may indicate token
      // theft (replay). Revoke ALL tokens for the agent as a precaution.
      if (stored?.revoked && stored.agent) {
        await this.prisma.refreshToken.updateMany({
          where: { agentId: stored.agent.id, revoked: false },
          data: { revoked: true },
        });
        this.logger.warn(
          `Revoked refresh token replay detected for agent ${stored.agent.id}`,
        );
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
      message:
        'Use o endpoint seguro /auth/oauth/google com a credential emitida pelo Google.',
    });
  }

  async loginWithGoogleCredential(data: { credential: string; ip?: string }) {
    await this.checkRateLimit(`oauth:google:${data.ip || 'ip-unknown'}`);
    const profile = await this.googleAuthService.verifyCredential(
      data.credential,
    );
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
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(data.identityToken);
    if (!decoded?.sub) {
      throw new BadRequestException({
        error: 'invalid_apple_token',
        message: 'Apple identity token invalido ou expirado.',
      });
    }

    // Apple only sends user info on FIRST sign-in, so we use decoded JWT + optional user data
    const email =
      decoded.email ||
      data.user?.email ||
      `${decoded.sub}@privaterelay.appleid.com`;
    const name = data.user?.name
      ? `${data.user.name.firstName || ''} ${data.user.name.lastName || ''}`.trim()
      : email.split('@')[0];

    const profile = {
      provider: 'apple' as const,
      providerId: decoded.sub,
      email,
      name: name || 'Apple User',
      image: null as string | null,
      emailVerified: !!decoded.email_verified,
    };

    return this.completeTrustedOAuthLogin(profile);
  }

  private async completeTrustedOAuthLogin(profile: GoogleVerifiedProfile) {
    const { provider, providerId, email, name, image, emailVerified } = profile;

    const deriveName = (addr: string) => {
      const local = addr.split('@')[0] || 'User';
      const cleaned = local.replace(/[\W_]+/g, ' ').trim();
      const candidate = cleaned || 'User';
      return candidate.charAt(0).toUpperCase() + candidate.slice(1);
    };

    const normalizedProvider =
      typeof provider === 'string' ? provider.trim().toLowerCase() : '';
    if (!['google', 'apple'].includes(normalizedProvider)) {
      throw new BadRequestException({
        error: 'invalid_provider',
        message: 'Provedor OAuth inválido ou não suportado.',
      });
    }

    const normalizedEmail =
      typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!normalizedEmail) {
      throw new BadRequestException({
        error: 'missing_email',
        message: 'Email é obrigatório para login OAuth.',
      });
    }

    const normalizedProviderId =
      typeof providerId === 'string' ? providerId.trim() : '';
    if (!normalizedProviderId) {
      throw new BadRequestException({
        error: 'missing_provider_id',
        message: 'providerId é obrigatório para login OAuth.',
      });
    }

    const finalName =
      (typeof name === 'string' && name.trim()) || deriveName(normalizedEmail);

    try {
      let agent: any | null = null;
      try {
        agent = await this.prisma.agent.findFirst({
          where: {
            provider: normalizedProvider,
            providerId: normalizedProviderId,
          },
          orderBy: { createdAt: 'asc' },
        });

        if (!agent) {
          const candidates = await this.prisma.agent.findMany({
            where: { email: normalizedEmail },
            orderBy: { createdAt: 'asc' },
            take: 10,
            select: {
              id: true, name: true, email: true, password: true, role: true,
              provider: true, providerId: true, avatarUrl: true,
              emailVerified: true, workspaceId: true, createdAt: true,
              isOnline: true, phone: true,
            },
          });

          if (candidates.length === 1) {
            agent = candidates[0];
          } else if (candidates.length > 1) {
            agent =
              candidates.find(
                (a) =>
                  a.provider === normalizedProvider &&
                  a.providerId === normalizedProviderId,
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
        }
      } catch (error: any) {
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
        } catch (error: any) {
          this.throwFriendlyDbInitError(error);
        }

        // Se já existe e está vinculado a outro provedor, não força link automático.
        if (
          agent.provider &&
          agent.provider !== normalizedProvider &&
          agent.providerId
        ) {
          throw new ConflictException(
            'Conta já cadastrada e vinculada a outro provedor',
          );
        }

        // Se existe provider diferente mesmo sem providerId (legado), também bloqueia.
        if (agent.provider && agent.provider !== normalizedProvider) {
          throw new ConflictException(
            'Conta já cadastrada e vinculada a outro provedor',
          );
        }

        // Vincula/atualiza providerId quando necessário.
        const nextAgentData: Record<string, any> = {};
        if (agent.provider !== normalizedProvider) {
          nextAgentData.provider = normalizedProvider;
        }
        if (agent.providerId !== normalizedProviderId) {
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
        return this.issueTokens(agent, { isNewUser: false });
      }

      // Criar novo workspace + agent para OAuth (transação)
      let newAgent;
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

          return agent;
        });
        newAgent = created;
      } catch (error: any) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('Email já em uso');
        }
        this.throwFriendlyDbInitError(error);
      }

      return this.issueTokens(newAgent, { isNewUser: true });
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
        message: error instanceof Error ? error.message : String(error),
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
    await this.checkRateLimit(
      `whatsapp-code:${ip || 'ip-unknown'}`,
      3,
      60 * 1000,
    );

    // Gera código de 6 dígitos (crypto-secure)
    const crypto = require('crypto');
    const code = String(crypto.randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos

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
        const message = `🔐 Seu código de verificação KLOEL é: *${code}*\n\nEsse código expira em 5 minutos. Não compartilhe com ninguém.`;

        const response = await fetch(
          `https://graph.facebook.com/v19.0/${metaPhoneId}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${metaToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: phone.replace(/\D/g, ''), // Remove não-dígitos
              type: 'text',
              text: { body: message },
            }),
            signal: AbortSignal.timeout(30000),
          },
        );

        const result = await response.json();

        if (result.error) {
          this.logger.error(
            `WhatsApp API: erro ao enviar código: ${result.error.message}`,
          );
          // Não falha, apenas loga - código será mostrado em dev
        } else {
          this.logger.log(`WhatsApp API: código enviado para ${phone}`);
          return {
            success: true,
            message: 'Código enviado via WhatsApp',
          };
        }
      } catch (error: any) {
        this.logger.error(
          `WhatsApp API: erro ao enviar código: ${error.message}`,
          typeof error?.stack === 'string' ? error.stack : undefined,
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
    await this.checkRateLimit(
      `whatsapp-verify:${ip || 'ip-unknown'}`,
      5,
      60 * 1000,
    );

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
    await this.checkRateLimit(
      `forgot-password:${ip || 'ip-unknown'}`,
      3,
      60 * 1000,
    );

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
    await this.checkRateLimit(
      `reset-password:${ip || 'ip-unknown'}`,
      5,
      60 * 1000,
    );

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: { agent: true },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    // Validação de senha
    if (newPassword.length < 8) {
      throw new HttpException(
        'A senha deve ter pelo menos 8 caracteres',
        HttpStatus.BAD_REQUEST,
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

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
    await this.checkRateLimit(
      `verify-email:${ip || 'ip-unknown'}`,
      10,
      60 * 1000,
    );

    try {
      const agent = await this.prisma.agent.findFirst({
        where: { emailVerificationToken: token },
      });

      if (!agent) {
        throw new UnauthorizedException('Token de verificação inválido');
      }

      if (
        agent.emailVerificationExpiry &&
        agent.emailVerificationExpiry < new Date()
      ) {
        throw new UnauthorizedException(
          'Token de verificação expirado. Solicite um novo.',
        );
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
    } catch (error: any) {
      this.throwFriendlyDbInitError(error);
    }
  }

  /**
   * Reenvia email de verificação
   */
  async resendVerificationEmail(email: string, ip?: string) {
    await this.checkRateLimit(
      `resend-verification:${ip || 'ip-unknown'}`,
      3,
      60 * 1000,
    );

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
