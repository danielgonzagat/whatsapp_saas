import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { UserNameDerivationService } from '../../user-name-derivation.service';
import {
  normalizeEmail,
  assertAgentCanAuthenticate,
  generateOpaqueToken,
  hashOpaqueToken,
} from './helpers';
import { issueTokens, type TokenIssuanceResult } from './tokens';
import type { AuthPartsDeps } from './register-login';

export interface RequestMagicLinkResult {
  success: boolean;
  message: string;
  token?: string;
  magicLinkUrl?: string;
}

export interface VerifyMagicLinkResult extends TokenIssuanceResult {
  redirectTo: string;
}

export async function requestMagicLink(
  deps: AuthPartsDeps,
  data: { email: string; redirectTo?: string; ip?: string },
): Promise<RequestMagicLinkResult> {
  await deps.rateLimitService.checkRateLimit(`magic-link:${data.ip || 'ip-unknown'}`, 5, 60_000);

  const normalizedEmail = normalizeEmail(data.email);
  if (!normalizedEmail) {
    throw new BadRequestException('Email é obrigatório.');
  }

  const token = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const redirectTo = String(data.redirectTo || '').trim() || '/dashboard';

  const existingAgent = await deps.prisma.agent.findFirst({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  await deps.prisma.magicLinkToken.create({
    data: {
      email: normalizedEmail,
      tokenHash,
      redirectTo,
      expiresAt,
      agentId: existingAgent?.id || null,
    },
  });

  const frontendUrl = deps.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  const magicLinkUrl = new URL('/magic-link', frontendUrl);
  magicLinkUrl.searchParams.set('token', token);
  if (redirectTo) {
    magicLinkUrl.searchParams.set('redirectTo', redirectTo);
  }

  await deps.emailService.sendMagicLinkEmail(normalizedEmail, magicLinkUrl.toString());

  return {
    success: true,
    message: 'Se o email for válido, o link de acesso foi enviado.',
    ...(process.env.NODE_ENV !== 'production' && {
      token,
      magicLinkUrl: magicLinkUrl.toString(),
    }),
  };
}

export async function verifyMagicLink(
  deps: AuthPartsDeps,
  token: string,
  ip?: string,
): Promise<VerifyMagicLinkResult> {
  await deps.rateLimitService.checkRateLimit(`magic-link-verify:${ip || 'ip-unknown'}`, 10, 60_000);

  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    throw new BadRequestException('Token do magic link é obrigatório.');
  }

  const tokenHash = hashOpaqueToken(normalizedToken);
  const magicLink = await deps.prisma.magicLinkToken.findUnique({
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
    const finalName = normalizedToken
      ? UserNameDerivationService.deriveNameFromEmail(magicLink.email)
      : 'User';

    agent = await deps.prisma.$transaction(async (tx) => {
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
      ...(await issueTokens(deps.prisma, deps.jwt, deps.logger, agent, { isNewUser: true })),
      redirectTo: magicLink.redirectTo || '/dashboard',
    };
  }

  assertAgentCanAuthenticate(agent);

  await deps.prisma.magicLinkToken.update({
    where: { id: magicLink.id },
    data: { usedAt: new Date() },
  });

  if (!agent.emailVerified) {
    await deps.prisma.agent.update({
      where: { id: agent.id },
      data: { emailVerified: true },
    });
  }

  return {
    ...(await issueTokens(deps.prisma, deps.jwt, deps.logger, agent, { isNewUser: false })),
    redirectTo: magicLink.redirectTo || '/dashboard',
  };
}
