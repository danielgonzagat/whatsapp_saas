import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Decorator para marcar rotas como públicas do KLOEL
 */
export const KLOEL_PUBLIC_KEY = 'kloel_public';
export const KloelPublic = () =>
  import('@nestjs/common').then(({ SetMetadata }) =>
    SetMetadata(KLOEL_PUBLIC_KEY, true)
  );

/**
 * Decorator para definir rate limit customizado
 */
export const KLOEL_RATE_LIMIT_KEY = 'kloel_rate_limit';
export const KloelRateLimit = (requests: number, windowMs: number) =>
  import('@nestjs/common').then(({ SetMetadata }) =>
    SetMetadata(KLOEL_RATE_LIMIT_KEY, { requests, windowMs })
  );

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Guard de segurança para APIs KLOEL.
 * 
 * Features:
 * - Validação de workspace
 * - Rate limiting por workspace/IP
 * - Verificação de billing (suspensão)
 * - API Key interna para comunicação entre serviços
 */
@Injectable()
export class KloelSecurityGuard implements CanActivate {
  private readonly logger = new Logger(KloelSecurityGuard.name);
  private rateLimitCache: Map<string, RateLimitEntry> = new Map();

  // Rate limits padrão
  private readonly DEFAULT_RATE_LIMIT = 100; // requests
  private readonly DEFAULT_WINDOW_MS = 60 * 1000; // 1 minuto

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {
    // Limpar cache de rate limit a cada 5 minutos
    setInterval(() => this.cleanupRateLimitCache(), 5 * 60 * 1000);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const path = request.path;

    // 1. Verificar se é rota pública
    const isPublic = this.reflector.getAllAndOverride<boolean>(KLOEL_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // 2. Verificar API Key interna (para comunicação worker <-> backend)
    const internalKey = request.headers['x-internal-key'];
    const expectedKey = process.env.INTERNAL_API_KEY;
    if (internalKey && expectedKey && internalKey === expectedKey) {
      this.logger.debug('Internal API key validated');
      return true;
    }

    // 3. Extrair workspaceId da rota
    const workspaceId = request.params.workspaceId || request.body?.workspaceId;
    
    // 4. Rate Limiting
    const rateLimitConfig = this.reflector.getAllAndOverride<{
      requests: number;
      windowMs: number;
    }>(KLOEL_RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);

    const rateLimit = rateLimitConfig?.requests || this.DEFAULT_RATE_LIMIT;
    const windowMs = rateLimitConfig?.windowMs || this.DEFAULT_WINDOW_MS;

    const rateLimitKey = workspaceId
      ? `ws:${workspaceId}`
      : `ip:${request.ip || 'unknown'}`;

    if (!this.checkRateLimit(rateLimitKey, rateLimit, windowMs)) {
      this.logger.warn('Rate limit exceeded', { rateLimitKey, path });
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil(windowMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 5. Se tem workspaceId, validar workspace
    if (workspaceId) {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          id: true,
          name: true,
          providerSettings: true,
        },
      });

      if (!workspace) {
        throw new UnauthorizedException('Workspace not found');
      }

      // 6. Verificar se billing está suspenso
      const settings = workspace.providerSettings as any;
      if (settings?.billingSuspended === true) {
        // Permitir apenas endpoints de status/diagnóstico
        const allowedPaths = ['/health', '/diag', '/status', '/billing'];
        const isAllowed = allowedPaths.some((p) => path.includes(p));

        if (!isAllowed) {
          this.logger.warn('Billing suspended, blocking request', { workspaceId, path });
          throw new ForbiddenException({
            message: 'Billing suspended. Please update your payment to continue.',
            code: 'BILLING_SUSPENDED',
          });
        }
      }

      // 7. Verificar limites do plano
      const planLimits = settings?.planLimits as any;
      if (planLimits) {
        // Verificar endpoints específicos
        if (path.includes('/agent/process') && planLimits.aiRequestsPerDay) {
          const dailyUsage = await this.getDailyAIUsage(workspaceId);
          if (dailyUsage >= planLimits.aiRequestsPerDay) {
            throw new ForbiddenException({
              message: 'Daily AI request limit exceeded',
              code: 'PLAN_LIMIT_EXCEEDED',
              limit: planLimits.aiRequestsPerDay,
              used: dailyUsage,
            });
          }
        }
      }

      // Adicionar workspace ao request para uso posterior
      request.workspace = workspace;
    }

    // 8. Validar usuário autenticado (se não for API interna)
    const user = request.user;
    if (!user && workspaceId) {
      // Verificar se o endpoint requer autenticação
      const requiresAuth = !path.includes('/webhook') && !path.includes('/public');
      
      if (requiresAuth && process.env.AUTH_REQUIRED === 'true') {
        throw new UnauthorizedException('Authentication required');
      }
    }

    return true;
  }

  private checkRateLimit(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = this.rateLimitCache.get(key);

    if (!entry || now > entry.resetAt) {
      // Nova janela
      this.rateLimitCache.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return true;
    }

    if (entry.count >= limit) {
      return false;
    }

    entry.count++;
    return true;
  }

  private cleanupRateLimitCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.rateLimitCache.entries()) {
      if (now > entry.resetAt) {
        this.rateLimitCache.delete(key);
      }
    }
  }

  private async getDailyAIUsage(workspaceId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Contar eventos de autopilot do dia
    const count = await this.prisma.autopilotEvent.count({
      where: {
        workspaceId,
        createdAt: { gte: today },
        intent: { not: 'DISABLED' },
      },
    });

    return count;
  }
}

/**
 * Guard para verificar acesso ao workspace específico.
 * Verifica se o usuário é membro do workspace.
 */
@Injectable()
export class WorkspaceAccessGuard implements CanActivate {
  private readonly logger = new Logger(WorkspaceAccessGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const workspaceId = request.params.workspaceId || request.body?.workspaceId;

    if (!workspaceId) {
      return true; // Sem workspace específico, delegar para outros guards
    }

    if (!user) {
      // Se AUTH_OPTIONAL, permitir (útil para desenvolvimento)
      if (process.env.AUTH_OPTIONAL === 'true') {
        return true;
      }
      throw new UnauthorizedException('User not authenticated');
    }

    // Verificar se usuário é membro do workspace
    const membership = await this.prisma.agent.findFirst({
      where: {
        id: user.userId,
        workspaceId,
      },
      select: { id: true, role: true },
    });

    if (!membership) {
      this.logger.warn('Unauthorized workspace access attempt', {
        userId: user.userId,
        workspaceId,
      });
      throw new ForbiddenException('Not a member of this workspace');
    }

    // Adicionar role ao request
    request.userRole = membership.role;

    return true;
  }
}

/**
 * Guard para endpoints que modificam dados sensíveis.
 * Requer confirmação ou 2FA.
 */
@Injectable()
export class SensitiveOperationGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Verificar header de confirmação
    const confirmationToken = request.headers['x-confirm-action'];
    
    if (!confirmationToken) {
      throw new ForbiddenException({
        message: 'This operation requires confirmation',
        code: 'CONFIRMATION_REQUIRED',
        action: 'Please include X-Confirm-Action header',
      });
    }

    // Em produção, validar o token de confirmação
    // Por enquanto, aceitar qualquer valor
    return true;
  }
}
