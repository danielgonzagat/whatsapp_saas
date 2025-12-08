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

  /**
   * OAuth Login - usado por NextAuth para Google/Apple
   * Cria ou encontra usuário baseado no provider OAuth
   */
  async oauthLogin(data: {
    provider: 'google' | 'apple';
    providerId: string;
    email: string;
    name: string;
    image?: string;
    ip?: string;
  }) {
    const { provider, providerId, email, name, image, ip } = data;
    await this.checkRateLimit(`oauth:${ip || 'ip-unknown'}`);

    // Buscar agent existente por email
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

    if (agent) {
      // Atualiza providerId se ainda não tiver
      if (!agent.providerId) {
        await this.prisma.agent.update({
          where: { id: agent.id },
          data: {
            provider,
            providerId,
            avatarUrl: image || agent.avatarUrl,
          },
        });
      }
      return this.issueTokens(agent);
    }

    // Criar novo workspace + agent para OAuth
    const workspace = await this.prisma.workspace.create({
      data: {
        name: `${name}'s Workspace`,
      },
    });

    // Criar agent sem senha (OAuth only)
    const newAgent = await this.prisma.agent.create({
      data: {
        name,
        email,
        password: '', // OAuth não usa senha
        role: 'ADMIN',
        workspaceId: workspace.id,
        provider,
        providerId,
        avatarUrl: image,
      },
    });

    return this.issueTokens(newAgent);
  }

  /**
   * Envia código de verificação via WhatsApp
   */
  async sendWhatsAppCode(phone: string, ip?: string) {
    await this.checkRateLimit(`whatsapp-code:${ip || 'ip-unknown'}`, 3, 60 * 1000);

    // Gera código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos

    // Armazena no Redis se disponível
    if (this.redis) {
      await this.redis.setex(`whatsapp-verify:${phone}`, 300, code);
    } else {
      // Fallback: armazena em memória (não ideal para produção)
      console.warn('⚠️ [AUTH] Redis não disponível, código não persistido');
    }

    // TODO: Integrar com WhatsApp Cloud API para enviar mensagem
    // Por enquanto, loga o código para desenvolvimento
    console.log(`📱 [WhatsApp Code] ${phone}: ${code}`);

    // Em produção, enviar via WhatsApp Cloud API:
    // await this.whatsappService.sendMessage(phone, `Seu código KLOEL: ${code}`);

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
}
