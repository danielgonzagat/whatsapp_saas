import { randomInt, randomUUID } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BCRYPT_ROUNDS } from '../common/constants';
import { getTraceHeaders } from '../common/trace-headers';
import { PrismaService } from '../prisma/prisma.service';
import { hash as bcryptHash } from 'bcrypt';
import type { Redis } from 'ioredis';
import { EmailService } from './email.service';
import { RateLimitService } from './rate-limit.service';

const D_RE = /\D/g;

/**
 * Handles WhatsApp OTP send/verify and password-recovery (forgot + reset),
 * extracted from AuthVerificationService for line-count compliance.
 */
@Injectable()
export class AuthWhatsappPasswordService {
  private readonly logger = new Logger(AuthWhatsappPasswordService.name);
  private readonly rateLimitService: RateLimitService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    @Optional() @InjectRedis() private readonly redis?: Redis,
  ) {
    this.rateLimitService = new RateLimitService(this.redis || null);
  }

  // =========================================
  // WHATSAPP OTP
  // =========================================

  /** Send a 6-digit OTP via WhatsApp. */
  async sendWhatsAppCode(phone: string, ip?: string) {
    await this.rateLimitService.checkRateLimit(`whatsapp-code:${ip || 'ip-unknown'}`, 3, 60 * 1000);

    const code = String(randomInt(100000, 999999));

    if (this.redis) {
      await this.redis.setex(`whatsapp-verify:${phone}`, 300, code);
    } else {
      this.logger.warn('Redis não disponível, código WhatsApp não persistido');
    }

    const metaToken = this.config.get<string>('META_ACCESS_TOKEN');
    const metaPhoneId = this.config.get<string>('META_PHONE_NUMBER_ID');

    if (metaToken && metaPhoneId) {
      try {
        const message = `Seu código de verificação KLOEL é: *${code}*\n\nEsse código expira em 5 minutos. Não compartilhe com ninguém.`;

        // Not SSRF: hardcoded Meta Graph API endpoint; metaPhoneId from server env var
        const response = await fetch(`https://graph.facebook.com/v19.0/${metaPhoneId}/messages`, {
          method: 'POST',
          headers: {
            ...getTraceHeaders(),
            Authorization: `Bearer ${metaToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone.replace(D_RE, ''),
            type: 'text',
            text: { body: message },
          }),
          signal: AbortSignal.timeout(30000),
        });

        const result = await response.json();

        if (result.error) {
          this.logger.error(`WhatsApp API: erro ao enviar código: ${result.error.message}`);
        } else {
          this.logger.log(`WhatsApp API: código enviado para ${phone}`);
          return { success: true, message: 'Código enviado via WhatsApp' };
        }
      } catch (error: unknown) {
        const err =
          error instanceof Error
            ? error
            : new Error(typeof error === 'string' ? error : 'unknown error');
        this.logger.error(
          `WhatsApp API: erro ao enviar código: ${err.message}`,
          typeof err.stack === 'string' ? err.stack : undefined,
        );
      }
    }

    this.logger.debug(`WhatsApp Code (dev): ${phone}: ${code}`);

    return {
      success: true,
      message: 'Código enviado via WhatsApp',
      ...(process.env.NODE_ENV !== 'production' && { code }),
    };
  }

  /**
   * Verify a WhatsApp OTP and return the resolved agent (or create one).
   * Caller issues tokens.
   */
  async verifyWhatsAppCode(
    phone: string,
    code: string,
    ip?: string,
  ): Promise<{
    id: string;
    email: string;
    workspaceId: string;
    name?: string | null;
    role?: string | null;
    disabledAt?: Date | null;
    deletedAt?: Date | null;
  }> {
    await this.rateLimitService.checkRateLimit(
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

    if (this.redis) {
      await this.redis.del(`whatsapp-verify:${phone}`);
    }

    const AGENT_AUTH_SELECT = {
      id: true,
      email: true,
      workspaceId: true,
      name: true,
      role: true,
      disabledAt: true,
      deletedAt: true,
    } as const;

    let agent = await this.prisma.agent.findFirst({
      where: { phone },
      select: { ...AGENT_AUTH_SELECT, workspaceId: true },
    });

    if (!agent) {
      const workspace = await this.prisma.workspace.create({
        data: { name: `WhatsApp User` },
      });

      agent = await this.prisma.agent.create({
        data: {
          name: `User ${phone.slice(-4)}`,
          email: `${phone}@whatsapp.kloel.com`,
          password: '',
          role: 'ADMIN',
          workspaceId: workspace.id,
          phone,
          provider: 'whatsapp',
          providerId: phone,
        },
        select: AGENT_AUTH_SELECT,
      });
    }

    return agent;
  }

  // =========================================
  // PASSWORD RECOVERY
  // =========================================

  /** Send a password-reset email. */
  async forgotPassword(email: string, ip?: string) {
    await this.rateLimitService.checkRateLimit(
      `forgot-password:${ip || 'ip-unknown'}`,
      3,
      60 * 1000,
    );

    const agent = await this.prisma.agent.findFirst({
      where: { email },
      select: { id: true, workspaceId: true },
    });

    if (!agent) {
      return {
        success: true,
        message: 'Se o email existir, você receberá instruções de recuperação.',
      };
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.passwordResetToken.updateMany({
      where: { agentId: agent.id, used: false },
      data: { used: true },
    });

    await this.prisma.passwordResetToken.create({
      data: { token, agentId: agent.id, expiresAt },
    });

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    await this.emailService.sendPasswordResetEmail(email, resetUrl);

    return {
      success: true,
      message: 'Se o email existir, você receberá instruções de recuperação.',
      ...(process.env.NODE_ENV !== 'production' && { token, resetUrl }),
    };
  }

  /** Reset a password using the emailed token. */
  async resetPassword(token: string, newPassword: string, ip?: string) {
    await this.rateLimitService.checkRateLimit(
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

    if (newPassword.length < 8) {
      throw new HttpException('A senha deve ter pelo menos 8 caracteres', HttpStatus.BAD_REQUEST);
    }

    const hashedPassword = await bcryptHash(newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction(
      [
        this.prisma.agent.update({
          where: { id: resetToken.agentId },
          data: { password: hashedPassword },
          select: { id: true, workspaceId: true },
        }),
        this.prisma.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { used: true },
        }),
        this.prisma.refreshToken.updateMany({
          where: { agentId: resetToken.agentId },
          data: { revoked: true },
        }),
      ],
      { isolationLevel: 'ReadCommitted' },
    );

    return { success: true, message: 'Senha redefinida com sucesso. Faça login novamente.' };
  }
}
