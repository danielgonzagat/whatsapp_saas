import { randomUUID } from 'node:crypto';
import { Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertAgentCanAuthenticate, buildAuthLogMessage } from './auth.helpers';
import { DbInitErrorService } from './db-init-error.service';
import { getJwtExpiresIn } from './jwt-config';

type TokenAgent = {
  id: string;
  email: string;
  workspaceId: string;
  name?: string | null;
  role?: string | null;
  disabledAt?: Date | null;
  deletedAt?: Date | null;
};

/** Internal collaborator that owns JWT/refresh-token issuance and refresh-token rotation. */
export class AuthTokenService {
  private readonly logger = new Logger(AuthTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async signToken(
    agentId: string,
    email: string,
    workspaceId: string,
    role: string,
    name?: string,
  ): Promise<string> {
    const payload: Record<string, unknown> = { sub: agentId, email, workspaceId, role };
    if (name) {
      payload.name = name;
    }
    return this.jwt.signAsync(payload, { expiresIn: getJwtExpiresIn() });
  }

  private async loadWorkspaceMeta(agent: TokenAgent): Promise<{ id: string; name: string } | null> {
    let workspaceMeta: { id: string; name: string } | null = null;
    try {
      const ws = await this.prisma.workspace.findUnique({
        where: { id: agent.workspaceId },
        select: { id: true, name: true },
      });

      if (!ws) {
        const errorId = randomUUID();
        this.logger.error(
          buildAuthLogMessage('workspace_not_found_on_login', {
            errorId,
            agentId: agent.id,
            workspaceId: agent.workspaceId,
            email: agent?.email,
          }),
        );
        throw new ServiceUnavailableException(
          `Conta com inconsistência detectada (ref: ${errorId}). Contate o suporte para reativar seu acesso.`,
        );
      }
      workspaceMeta = ws;
    } catch (error: unknown) {
      DbInitErrorService.throwFriendlyDbInitError(error);
    }
    return workspaceMeta;
  }

  private assertWorkspaceIdPresent(agent: TokenAgent): void {
    if (!agent?.workspaceId) {
      const errorId = randomUUID();
      this.logger.error(
        buildAuthLogMessage('agent_invalid_workspaceId', {
          errorId,
          agentId: agent?.id,
          email: agent?.email,
        }),
      );
      throw new ServiceUnavailableException(
        'Serviço indisponível. Workspace inválido para este usuário.',
      );
    }
  }

  private async rotateRefreshToken(agentId: string): Promise<string> {
    const refreshToken = randomUUID() + randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Atomic: revoke any active refresh tokens AND insert the new one in
    // a single Serializable transaction so concurrent issueTokens calls
    // cannot leave multiple active rows for the same agent.
    await this.prisma.$transaction(
      async (tx) => {
        await tx.refreshToken.updateMany({
          where: { agentId, revoked: false },
          data: { revoked: true },
        });
        await tx.refreshToken.create({
          data: { token: refreshToken, agentId, expiresAt },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return refreshToken;
  }

  /** Issue access + refresh tokens, rotating any prior active refresh tokens. */
  async issueTokens(agent: TokenAgent, extra?: { isNewUser?: boolean }) {
    try {
      assertAgentCanAuthenticate(agent);
      this.assertWorkspaceIdPresent(agent);

      const workspaceMeta = await this.loadWorkspaceMeta(agent);

      const access_token = await this.signToken(
        agent.id,
        agent.email,
        agent.workspaceId,
        agent.role,
        agent.name,
      );

      const refreshToken = await this.rotateRefreshToken(agent.id);

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
      DbInitErrorService.throwFriendlyDbInitError(error);
    }
  }

  /** Look up an agent by id and issue tokens. */
  async issueTokensForAgentId(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        email: true,
        workspaceId: true,
        name: true,
        role: true,
        disabledAt: true,
        deletedAt: true,
      },
    });

    if (!agent) {
      throw new UnauthorizedException('Usuário não encontrado para emissão de sessão.');
    }

    return this.issueTokens(agent);
  }

  /** Validate a refresh token, revoke it, and issue a new pair. */
  async refresh(refreshToken: string) {
    let stored: Prisma.RefreshTokenGetPayload<{ include: { agent: true } }> | null;
    let revokedFirst = false;
    try {
      // Atomic claim: only one concurrent refresh wins the right to revoke
      // an active token; the loser sees count=0 and is rejected below.
      stored = await this.prisma.$transaction(
        async (tx) => {
          const found = await tx.refreshToken.findUnique({
            where: { token: refreshToken },
            include: { agent: true },
          });

          if (!found || found.revoked || !found.agent || found.expiresAt.getTime() < Date.now()) {
            return found;
          }

          // Skip the claim for inactive agents — caller will reject below
          // and we avoid burning the rotation slot for a doomed refresh.
          if (found.agent.disabledAt || found.agent.deletedAt) {
            return found;
          }

          const claim = await tx.refreshToken.updateMany({
            where: { id: found.id, revoked: false },
            data: { revoked: true },
          });

          if (claim.count === 0) {
            // Lost the race; another concurrent call already revoked it.
            return { ...found, revoked: true };
          }

          revokedFirst = true;
          return found;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      DbInitErrorService.throwFriendlyDbInitError(error);
    }

    if (
      !stored ||
      (!revokedFirst && stored.revoked) ||
      !stored.agent ||
      stored.expiresAt.getTime() < Date.now()
    ) {
      if (stored?.revoked && stored.agent && !revokedFirst) {
        // Replay attempt of an already-revoked token: defensively revoke any
        // remaining active tokens for the agent.
        await this.prisma.refreshToken.updateMany({
          where: { agentId: stored.agent.id, revoked: false },
          data: { revoked: true },
        });
        this.logger.warn(`Revoked refresh token replay detected for agent ${stored.agent.id}`);
      }
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    assertAgentCanAuthenticate(stored.agent);
    return this.issueTokens(stored.agent);
  }
}
