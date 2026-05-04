import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DbInitErrorService } from '../../db-init-error.service';
import { UserNameDerivationService } from '../../user-name-derivation.service';
import type { GoogleVerifiedProfile } from '../../google-auth.service';
import { assertAgentCanAuthenticate, buildAuthLogMessage } from './helpers';
import { issueTokens, type TokenIssuanceResult } from './tokens';
import { upsertSocialAccount } from './social-account';
import type { AuthPartsDeps } from './register-login';

export async function completeTrustedOAuthLogin(
  deps: AuthPartsDeps,
  profile: GoogleVerifiedProfile,
): Promise<TokenIssuanceResult> {
  const { provider, providerId, email, name, image, emailVerified, syntheticEmail } = profile;

  const normalizedProvider = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
  if (!['google', 'apple', 'facebook', 'tiktok'].includes(normalizedProvider)) {
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

  const finalName =
    (typeof name === 'string' && name.trim()) ||
    UserNameDerivationService.deriveNameFromEmail(normalizedEmail);

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
      const socialAccount = await deps.prisma.socialAccount.findUnique({
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
        agent = await deps.prisma.agent.findFirst({
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
        const candidates = await deps.prisma.agent.findMany({
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

        const legacySameProviderCandidate =
          candidates.find(
            (candidate) =>
              candidate.provider === normalizedProvider &&
              (!candidate.providerId || candidate.providerId === normalizedProviderId),
          ) || null;

        if (legacySameProviderCandidate) {
          agent = legacySameProviderCandidate;
        } else if (candidates.length > 0) {
          throw new ConflictException({
            error: 'oauth_reauthentication_required',
            message:
              'Já existe uma conta com este e-mail. Por segurança, entre primeiro com o método já cadastrado ou use o link mágico e depois conecte este provedor nas configurações da conta.',
          });
        }
      }
    } catch (error: unknown) {
      DbInitErrorService.throwFriendlyDbInitError(error);
    }

    if (agent) {
      assertAgentCanAuthenticate(agent);

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
      if (!syntheticEmail && agent.email !== normalizedEmail) {
        nextAgentData.email = normalizedEmail;
      }
      if (!agent.name || agent.name.trim() === '') {
        nextAgentData.name = finalName;
      }

      if (Object.keys(nextAgentData).length > 0) {
        agent = await deps.prisma.agent.update({
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

      await upsertSocialAccount(deps, agent.id, {
        ...profile,
        provider: normalizedProvider as GoogleVerifiedProfile['provider'],
        providerId: normalizedProviderId,
        email: normalizedEmail,
        name: finalName,
        image: image || null,
        emailVerified: !!emailVerified,
      });

      return issueTokens(deps.prisma, deps.jwt, deps.logger, agent, { isNewUser: false });
    }

    const wsName = `${finalName}'s Workspace`;
    const created = await deps.prisma.$transaction(async (tx) => {
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

    await upsertSocialAccount(deps, created.id, {
      ...profile,
      provider: normalizedProvider as GoogleVerifiedProfile['provider'],
      providerId: normalizedProviderId,
      email: normalizedEmail,
      name: finalName,
      image: image || null,
      emailVerified: !!emailVerified,
    });

    return issueTokens(deps.prisma, deps.jwt, deps.logger, created, { isNewUser: true });
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
        deps.logger.warn(
          buildAuthLogMessage('oauthLogin_http_exception', {
            status,
            provider: normalizedProvider,
            email: normalizedEmail,
            response: safeResponse,
          }),
        );
      } catch {
        // PULSE:OK — Error log stringify failure; original error is re-thrown below
      }
      throw error;
    }

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
      DbInitErrorService.throwFriendlyDbInitError(error);
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException({
        error: 'invalid_oauth_payload',
        message: 'Dados OAuth inválidos. Verifique permissões do provedor.',
      });
    }

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
      deps.logger.error(
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
