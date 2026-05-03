import { randomUUID } from 'node:crypto';

import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { hash as bcryptHash } from 'bcrypt';
import { BCRYPT_ROUNDS } from '../../../common/constants';
import { DbInitErrorService } from '../../db-init-error.service';
import type { AuthPartsDeps } from './register-login';

export interface AuthSuccessResult {
  success: boolean;
  message: string;
  [key: string]: unknown;
}

export async function forgotPassword(
  deps: AuthPartsDeps,
  email: string,
  ip?: string,
): Promise<AuthSuccessResult> {
  await deps.rateLimitService.checkRateLimit(`forgot-password:${ip || 'ip-unknown'}`, 3, 60 * 1000);

  const agent = await deps.prisma.agent.findFirst({
    where: { email },
  });

  if (!agent) {
    return {
      success: true,
      message: 'Se o email existir, você receberá instruções de recuperação.',
    };
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await deps.prisma.passwordResetToken.updateMany({
    where: { agentId: agent.id, used: false },
    data: { used: true },
  });

  await deps.prisma.passwordResetToken.create({
    data: {
      token,
      agentId: agent.id,
      expiresAt,
    },
  });

  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
  await deps.emailService.sendPasswordResetEmail(email, resetUrl);

  return {
    success: true,
    message: 'Se o email existir, você receberá instruções de recuperação.',
    ...(process.env.NODE_ENV !== 'production' && { token, resetUrl }),
  };
}

export async function resetPassword(
  deps: AuthPartsDeps,
  token: string,
  newPassword: string,
  ip?: string,
): Promise<AuthSuccessResult> {
  await deps.rateLimitService.checkRateLimit(`reset-password:${ip || 'ip-unknown'}`, 5, 60 * 1000);

  const resetToken = await deps.prisma.passwordResetToken.findUnique({
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

  await deps.prisma.$transaction([
    deps.prisma.agent.update({
      where: { id: resetToken.agentId },
      data: { password: hashedPassword },
    }),
    deps.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    }),
    deps.prisma.refreshToken.updateMany({
      where: { agentId: resetToken.agentId },
      data: { revoked: true },
    }),
  ]);

  return {
    success: true,
    message: 'Senha redefinida com sucesso. Faça login novamente.',
  };
}

export async function sendVerificationEmail(
  deps: AuthPartsDeps,
  agentId: string,
): Promise<AuthSuccessResult> {
  const agent = await deps.prisma.agent.findUnique({
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

  const token = randomUUID();
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await deps.prisma.agent.update({
    where: { id: agentId },
    data: {
      emailVerificationToken: token,
      emailVerificationExpiry: expiry,
    },
  });

  const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
  await deps.emailService.sendVerificationEmail(agent.email, verifyUrl);

  return {
    success: true,
    message: 'Email de verificação enviado.',
    ...(process.env.NODE_ENV !== 'production' && { token, verifyUrl }),
  };
}

export async function verifyEmail(
  deps: AuthPartsDeps,
  token: string,
  ip?: string,
): Promise<AuthSuccessResult> {
  await deps.rateLimitService.checkRateLimit(`verify-email:${ip || 'ip-unknown'}`, 10, 60 * 1000);

  try {
    const agent = await deps.prisma.agent.findFirst({
      where: { emailVerificationToken: token },
    });

    if (!agent) {
      throw new UnauthorizedException('Token de verificação inválido');
    }

    if (agent.emailVerificationExpiry && agent.emailVerificationExpiry < new Date()) {
      throw new UnauthorizedException('Token de verificação expirado. Solicite um novo.');
    }

    await deps.prisma.agent.update({
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
    DbInitErrorService.throwFriendlyDbInitError(error);
  }
}

export async function resendVerificationEmail(
  deps: AuthPartsDeps,
  email: string,
  ip?: string,
): Promise<AuthSuccessResult> {
  await deps.rateLimitService.checkRateLimit(
    `resend-verification:${ip || 'ip-unknown'}`,
    3,
    60 * 1000,
  );

  const agent = await deps.prisma.agent.findFirst({
    where: { email },
  });

  if (!agent) {
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

  return sendVerificationEmail(deps, agent.id);
}
