import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Redis } from 'ioredis';
import { AuthWhatsappPasswordService } from './auth-whatsapp-password.service';
import { DbInitErrorService } from './db-init-error.service';
import { EmailService } from './email.service';
import { RateLimitService } from './rate-limit.service';
import { UserNameDerivationService } from './user-name-derivation.service';

/**
 * Handles magic link and email verification flows.
 * WhatsApp OTP and password recovery are delegated to AuthWhatsappPasswordService.
 */
@Injectable()
export class AuthVerificationService {
  private readonly logger = new Logger(AuthVerificationService.name);
  private readonly rateLimitService: RateLimitService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly authWhatsappPasswordService: AuthWhatsappPasswordService,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() @InjectRedis() private readonly redis?: Redis,
  ) {
    this.rateLimitService = new RateLimitService(this.redis || null);
  }

  private generateOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashOpaqueToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // =========================================
  // MAGIC LINK
  // =========================================

  /** Request magic link. */
  async requestMagicLink(data: { email: string; redirectTo?: string; ip?: string }) {
    await this.rateLimitService.checkRateLimit(`magic-link:${data.ip || 'ip-unknown'}`, 5, 60_000);

    const normalizedEmail = String(data.email || '')
      .trim()
      .toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('Email é obrigatório.');
    }

    const token = this.generateOpaqueToken();
    const tokenHash = this.hashOpaqueToken(token);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const redirectTo = String(data.redirectTo || '').trim() || '/dashboard';

    const existingAgent = await this.prisma.agent.findFirst({
      where: { email: normalizedEmail },
      select: { id: true, workspaceId: true },
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

  /**
   * Verify magic link token and return an agent record + redirectTo.
   * Caller (AuthService) issues tokens after receiving the agent.
   */
  async verifyMagicLink(
    token: string,
    ip?: string,
  ): Promise<{
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
    redirectTo: string;
  }> {
    await this.rateLimitService.checkRateLimit(
      `magic-link-verify:${ip || 'ip-unknown'}`,
      10,
      60_000,
    );

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

    const redirectTo = magicLink.redirectTo || '/dashboard';

    if (!magicLink.agent) {
      const finalName = UserNameDerivationService.deriveNameFromEmail(magicLink.email) || 'User';

      const createdAgent = await this.prisma.$transaction(
        async (tx) => {
          const workspace = await tx.workspace.create({
            data: { name: `${finalName}'s Workspace` },
            select: { id: true },
          });

          const agent = await tx.agent.create({
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
            data: { agentId: agent.id, usedAt: new Date() },
          });

          return agent;
        },
        { isolationLevel: 'ReadCommitted' },
      );

      return { agent: createdAgent, isNewUser: true, redirectTo };
    }

    await this.prisma.magicLinkToken.update({
      where: { id: magicLink.id },
      data: { usedAt: new Date() },
    });

    if (!magicLink.agent.emailVerified) {
      await this.prisma.agent.update({
        where: { id: magicLink.agent.id },
        data: { emailVerified: true },
        select: { id: true, workspaceId: true },
      });
    }

    return { agent: magicLink.agent, isNewUser: false, redirectTo };
  }

  // =========================================
  // WHATSAPP OTP — delegated
  // =========================================

  /** Send a 6-digit OTP via WhatsApp. */
  async sendWhatsAppCode(phone: string, ip?: string) {
    return this.authWhatsappPasswordService.sendWhatsAppCode(phone, ip);
  }

  /** Verify a WhatsApp OTP and return the resolved agent (or create one). */
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
    return this.authWhatsappPasswordService.verifyWhatsAppCode(phone, code, ip);
  }

  // =========================================
  // PASSWORD RECOVERY — delegated
  // =========================================

  /** Send a password-reset email. */
  async forgotPassword(email: string, ip?: string) {
    return this.authWhatsappPasswordService.forgotPassword(email, ip);
  }

  /** Reset a password using the emailed token. */
  async resetPassword(token: string, newPassword: string, ip?: string) {
    return this.authWhatsappPasswordService.resetPassword(token, newPassword, ip);
  }

  // =========================================
  // EMAIL VERIFICATION
  // =========================================

  /** Send email verification link to an agent. */
  async sendVerificationEmail(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, workspaceId: true, email: true, emailVerified: true },
    });

    if (!agent) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    if (agent.emailVerified) {
      return { success: true, message: 'Email já verificado.', alreadyVerified: true };
    }

    const token = randomUUID();
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.agent.update({
      where: { id: agentId },
      data: { emailVerificationToken: token, emailVerificationExpiry: expiry },
      select: { id: true, workspaceId: true },
    });

    const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
    await this.emailService.sendVerificationEmail(agent.email, verifyUrl);

    return {
      success: true,
      message: 'Email de verificação enviado.',
      ...(process.env.NODE_ENV !== 'production' && { token, verifyUrl }),
    };
  }

  /** Verify email using the token sent by email. */
  async verifyEmail(token: string, ip?: string) {
    await this.rateLimitService.checkRateLimit(`verify-email:${ip || 'ip-unknown'}`, 10, 60 * 1000);

    try {
      const agent = await this.prisma.agent.findFirst({
        where: { emailVerificationToken: token },
        select: { id: true, workspaceId: true, emailVerificationExpiry: true },
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
        select: { id: true, workspaceId: true },
      });

      return { success: true, message: 'Email verificado com sucesso!' };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AuthVerificationService.verifyEmail', {
        metadata: { token },
      });
      DbInitErrorService.throwFriendlyDbInitError(error);
    }
  }

  /** Resend verification email (no-op if already verified). */
  async resendVerificationEmail(email: string, ip?: string) {
    await this.rateLimitService.checkRateLimit(
      `resend-verification:${ip || 'ip-unknown'}`,
      3,
      60 * 1000,
    );

    const agent = await this.prisma.agent.findFirst({
      where: { email },
      select: { id: true, workspaceId: true, emailVerified: true },
    });

    if (!agent) {
      return {
        success: true,
        message: 'Se o email existir, você receberá um link de verificação.',
      };
    }

    if (agent.emailVerified) {
      return { success: true, message: 'Email já está verificado.', alreadyVerified: true };
    }

    return this.sendVerificationEmail(agent.id);
  }
}
