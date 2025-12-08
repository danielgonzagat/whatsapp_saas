import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Optional,
  Inject,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Optional() @InjectRedis() private readonly redis?: Redis,
  ) {}

  private async checkRateLimit(
    key: string,
    limit = 5,
    windowMs = 5 * 60 * 1000,
  ) {
    // Se Redis não estiver disponível, pula rate limiting
    if (!this.redis) {
      console.warn('⚠️ [AUTH] Rate limiting desativado - Redis não configurado');
      return;
    }

    const ttlSeconds = Math.ceil(windowMs / 1000);
    const total = await this.redis.incr(key);
    if (total === 1) {
      await this.redis.expire(key, ttlSeconds);
    }
    if (total > limit) {
      throw new HttpException(
        'Muitas tentativas, aguarde alguns minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async issueTokens(agent: any) {
    const access_token = await this.signToken(
      agent.id,
      agent.email,
      agent.workspaceId,
      agent.role,
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
    };
  }

  async checkEmail(email: string): Promise<{ exists: boolean }> {
    try {
      const agent = await this.prisma.agent.findFirst({
        where: { email },
      });
      return { exists: !!agent };
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
        // Database table is missing (e.g., migrations not applied)
        throw new InternalServerErrorException(
          'Database not initialized. Run Prisma migrations to create tables.'
        );
      }
      throw error;
    }
  }

  async register(data: {
    name: string;
    email: string;
    password: string;
    workspaceName?: string;
    ip?: string;
  }) {
    const { name, email, password, workspaceName, ip } = data;
    await this.checkRateLimit(`register:${ip || 'ip-unknown'}`);

    // 1. Verificar se já existe agent com este email em qualquer workspace
    let existing;
    try {
      existing = await this.prisma.agent.findFirst({
        where: { email },
      });
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
        throw new InternalServerErrorException(
          'Database not initialized. Run Prisma migrations to create tables.'
        );
      }
      throw error;
    }

    if (existing) {
      throw new ConflictException('Email já em uso');
    }

    // 2. Criar Workspace
    const workspace = await this.prisma.workspace.create({
      data: {
        name: workspaceName || `${name}'s Workspace`,
      },
    });

    // 3. Hash da senha
    const hashed = await bcrypt.hash(password, 10);

    // 4. Criar Agent (ADMIN) vinculado ao workspace
    let agent;
    try {
      agent = await this.prisma.agent.create({
        data: {
          name,
          email,
          password: hashed,
          role: 'ADMIN',
          workspaceId: workspace.id,
        },
      });
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
        throw new InternalServerErrorException(
          'Database not initialized. Run Prisma migrations to create tables.'
        );
      }
      throw error;
    }

    return this.issueTokens(agent);
  }

  async login(data: { email: string; password: string; ip?: string }) {
    const { email, password, ip } = data;
    await this.checkRateLimit(`login:${ip || 'ip-unknown'}:${email}`);

    let agent;
    try {
      agent = await this.prisma.agent.findFirst({
        where: { email },
      });
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
        throw new InternalServerErrorException(
          'Database not initialized. Run Prisma migrations to create tables.'
        );
      }
      throw error;
    }

    if (!agent) {
      throw new UnauthorizedException('Credenciais inválidas');
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
  ) {
    const payload = { sub: agentId, email, workspaceId, role };
    return this.jwt.signAsync(payload);
  }

  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { agent: true },
    });

    if (
      !stored ||
      stored.revoked ||
      !stored.agent ||
      stored.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    return this.issueTokens(stored.agent);
  }
}
