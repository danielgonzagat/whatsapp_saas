import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DbInitErrorService } from './db-init-error.service';
import { UserNameDerivationService } from './user-name-derivation.service';
import { PrismaService } from '../prisma/prisma.service';

type ResolvedAgent = {
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

const AGENT_SELECT = {
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
} as const;

function _buildAuthLogMessage(event: string, payload: Record<string, unknown>) {
  return JSON.stringify({ event, ...payload });
}

/**
 * Handles the DB lookup / creation part of OAuth agent resolution,
 * extracted from AuthOAuthService to keep file sizes within limits.
 */
@Injectable()
export class AuthOAuthResolverService {
  private readonly logger = new Logger(AuthOAuthResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Find an existing agent by social-account or legacy provider fields. */
  async findExistingAgent(
    normalizedProvider: string,
    normalizedProviderId: string,
    normalizedEmail: string,
  ): Promise<ResolvedAgent | null> {
    const socialAccount = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: normalizedProvider,
          providerUserId: normalizedProviderId,
        },
      },
      include: { agent: { select: AGENT_SELECT } },
    });

    if (socialAccount?.agent) {
      return socialAccount.agent;
    }

    const byProvider = await this.prisma.agent.findFirst({
      where: { provider: normalizedProvider, providerId: normalizedProviderId },
      orderBy: { createdAt: 'asc' },
      select: AGENT_SELECT,
    });

    if (byProvider) {
      return byProvider;
    }

    const candidates = await this.prisma.agent.findMany({
      where: { email: normalizedEmail },
      orderBy: { createdAt: 'asc' },
      take: 10,
      select: AGENT_SELECT,
    });

    const legacySameProviderCandidate =
      candidates.find(
        (c) =>
          c.provider === normalizedProvider &&
          (!c.providerId || c.providerId === normalizedProviderId),
      ) || null;

    if (legacySameProviderCandidate) {
      return legacySameProviderCandidate;
    }

    if (candidates.length > 0) {
      throw new ConflictException({
        error: 'oauth_reauthentication_required',
        message:
          'Já existe uma conta com este e-mail. Por segurança, entre primeiro com o método já cadastrado ou use o link mágico e depois conecte este provedor nas configurações da conta.',
      });
    }

    return null;
  }

  /** Update stale fields on an existing agent and return the refreshed record. */
  async patchExistingAgent(
    agent: ResolvedAgent,
    opts: {
      normalizedProvider: string;
      normalizedProviderId: string;
      normalizedEmail: string;
      finalName: string;
      image?: string | null;
      emailVerified?: boolean;
      syntheticEmail?: boolean;
    },
  ): Promise<ResolvedAgent> {
    const nextAgentData: Prisma.AgentUpdateInput = {};
    if (!agent.provider) nextAgentData.provider = opts.normalizedProvider;
    if (!agent.providerId && agent.provider === opts.normalizedProvider)
      nextAgentData.providerId = opts.normalizedProviderId;
    if (opts.image && agent.avatarUrl !== opts.image) nextAgentData.avatarUrl = opts.image;
    if (opts.emailVerified && !agent.emailVerified) nextAgentData.emailVerified = true;
    if (!opts.syntheticEmail && agent.email !== opts.normalizedEmail)
      nextAgentData.email = opts.normalizedEmail;
    if (!agent.name || agent.name.trim() === '') nextAgentData.name = opts.finalName;

    if (Object.keys(nextAgentData).length === 0) {
      return agent;
    }

    return this.prisma.agent.update({
      where: { id: agent.id },
      data: nextAgentData,
      select: AGENT_SELECT,
    });
  }

  /** Create a new workspace + agent for a first-time OAuth login. */
  async createAgentForOAuth(opts: {
    finalName: string;
    normalizedEmail: string;
    normalizedProvider: string;
    normalizedProviderId: string;
    image?: string | null;
    emailVerified?: boolean;
  }): Promise<ResolvedAgent> {
    const wsName = `${opts.finalName}'s Workspace`;
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: { name: wsName },
        select: { id: true },
      });

      return tx.agent.create({
        data: {
          name: opts.finalName,
          email: opts.normalizedEmail,
          password: '',
          role: 'ADMIN',
          workspaceId: workspace.id,
          provider: opts.normalizedProvider,
          providerId: opts.normalizedProviderId,
          avatarUrl: opts.image,
          emailVerified: !!opts.emailVerified,
        },
        select: AGENT_SELECT,
      });
    });
  }

  /** Map unexpected errors into structured HTTP exceptions. */
  handleOAuthError(error: unknown, profile: { provider: string; email: string }): never {
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
      provider: profile.provider,
      email: profile.email,
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

  /** Derive a normalised name from a profile. */
  static deriveFinalName(name: unknown, normalizedEmail: string): string {
    return (
      (typeof name === 'string' && name.trim()) ||
      UserNameDerivationService.deriveNameFromEmail(normalizedEmail)
    );
  }
}
