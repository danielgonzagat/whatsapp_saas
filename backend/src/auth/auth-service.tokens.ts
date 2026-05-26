import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service';
import { DbInitErrorService } from './db-init-error.service';
import { getJwtExpiresIn } from './jwt-config';
import {
  assertAgentCanAuthenticate,
  buildAuthLogMessage,
  hashOpaqueToken,
} from './auth-service.helpers';

interface AgentForTokens {
  id: string;
  email: string;
  workspaceId: string;
  name?: string | null;
  role?: string | null;
  disabledAt?: Date | null;
  deletedAt?: Date | null;
}

export interface TokenIssuanceResult {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    name: string | null | undefined;
    email: string;
    workspaceId: string;
    role: string | null | undefined;
  };
  workspace: { id: string; name: string } | null;
  workspaces: { id: string; name: string }[];
  isNewUser: boolean;
}

async function signToken(
  jwt: JwtService,
  agentId: string,
  email: string,
  workspaceId: string,
  role: string | null | undefined,
  name?: string | null,
): Promise<string> {
  const payload: Record<string, unknown> = {
    sub: agentId,
    email,
    workspaceId,
    role,
  };
  if (name) {
    payload.name = name;
  }
  const expiresIn = getJwtExpiresIn();
  return jwt.signAsync(payload, {
    ...(expiresIn !== undefined ? { expiresIn } : {}),
  });
}

export async function issueTokens(
  prisma: PrismaService,
  jwt: JwtService,
  logger: Logger,
  agent: AgentForTokens,
  extra?: { isNewUser?: boolean },
): Promise<TokenIssuanceResult> {
  try {
    assertAgentCanAuthenticate(agent);

    if (!agent?.workspaceId) {
      const errorId = randomUUID();
      logger.error(
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

    let workspaceMeta: {
      id: string;
      name: string;
    } | null = null;

    try {
      const ws = await prisma.workspace.findUnique({
        where: { id: agent.workspaceId },
        select: { id: true, name: true },
      });

      if (!ws) {
        const errorId = randomUUID();
        logger.error(
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

    const access_token = await signToken(
      jwt,
      agent.id,
      agent.email,
      agent.workspaceId,
      agent.role,
      agent.name,
    );

    await prisma.refreshToken.updateMany({
      where: { agentId: agent.id, revoked: false },
      data: { revoked: true },
    });

    const refreshTokenValue = randomUUID() + randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: { token: refreshTokenValue, agentId: agent.id, expiresAt },
    });

    return {
      access_token,
      refresh_token: refreshTokenValue,
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

export async function issueTokensForAgentId(
  prisma: PrismaService,
  jwt: JwtService,
  logger: Logger,
  agentId: string,
): Promise<TokenIssuanceResult> {
  const agent = await prisma.agent.findUnique({
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

  return issueTokens(prisma, jwt, logger, agent);
}

export async function refreshToken(
  prisma: PrismaService,
  jwt: JwtService,
  logger: Logger,
  token: string,
): Promise<TokenIssuanceResult> {
  const tokenHash = hashOpaqueToken(token);

  let stored: {
    id: string;
    revoked: boolean;
    expiresAt: Date;
    agent: AgentForTokens;
  } | null;

  try {
    stored = await prisma.refreshToken.findUnique({
      where: { token },
      include: { agent: true },
    });
  } catch (error) {
    logger.error(
      buildAuthLogMessage('refresh_token_db_lookup_failed', {
        tokenHash,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    throw new ServiceUnavailableException(
      'Serviço indisponível. Erro ao buscar token de atualização.',
    );
  }

  if (!stored) {
    logger.warn(buildAuthLogMessage('refresh_token_not_found', { tokenHash }));
    throw new UnauthorizedException('Refresh token inválido ou expirado');
  }

  if (!stored.agent) {
    logger.error(
      buildAuthLogMessage('refresh_token_agent_missing', {
        tokenHash,
        tokenId: stored.id,
      }),
    );
    throw new UnauthorizedException('Refresh token inválido ou expirado');
  }

  if (stored.revoked) {
    // Revoke all sibling tokens — likely a replay attack.
    prisma.refreshToken
      .updateMany({
        where: { agentId: stored.agent.id, revoked: false },
        data: { revoked: true },
      })
      .catch(() => {});
    logger.warn(
      buildAuthLogMessage('refresh_token_replay_detected', {
        tokenHash,
        agentId: stored.agent.id,
        workspaceId: stored.agent.workspaceId,
      }),
    );
    throw new UnauthorizedException('Refresh token inválido ou expirado');
  }

  if (stored.expiresAt.getTime() < Date.now()) {
    logger.warn(
      buildAuthLogMessage('refresh_token_expired', {
        tokenHash,
        agentId: stored.agent.id,
        workspaceId: stored.agent.workspaceId,
      }),
    );
    throw new UnauthorizedException('Refresh token expirado');
  }

  // Atomic claim: only one concurrent request may claim this token.
  let claimResult: { count: number };
  try {
    claimResult = await prisma.refreshToken.updateMany({
      where: { id: stored.id, revoked: false },
      data: { revoked: true },
    });
  } catch (error) {
    logger.error(
      buildAuthLogMessage('refresh_token_claim_db_error', {
        tokenHash,
        agentId: stored.agent.id,
        workspaceId: stored.agent.workspaceId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    throw new ServiceUnavailableException(
      'Serviço indisponível. Erro ao processar token de atualização.',
    );
  }

  if (claimResult.count === 0) {
    // Another concurrent request already claimed this token.
    logger.warn(
      buildAuthLogMessage('refresh_token_race_lost', {
        tokenHash,
        agentId: stored.agent.id,
        workspaceId: stored.agent.workspaceId,
      }),
    );
    throw new UnauthorizedException('Refresh token inválido ou expirado');
  }

  try {
    assertAgentCanAuthenticate(stored.agent);
  } catch (error) {
    logger.warn(
      buildAuthLogMessage('refresh_token_agent_invalid', {
        tokenHash,
        agentId: stored.agent.id,
        workspaceId: stored.agent.workspaceId,
      }),
    );
    throw error;
  }

  try {
    const result = await issueTokens(prisma, jwt, logger, stored.agent);
    logger.log(
      buildAuthLogMessage('refresh_token_success', {
        agentId: stored.agent.id,
        workspaceId: stored.agent.workspaceId,
      }),
    );
    return result;
  } catch (error) {
    logger.error(
      buildAuthLogMessage('refresh_token_issue_failed', {
        tokenHash,
        agentId: stored.agent.id,
        workspaceId: stored.agent.workspaceId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    if (error instanceof UnauthorizedException || error instanceof ServiceUnavailableException) {
      throw error;
    }
    throw new ServiceUnavailableException('Serviço indisponível. Erro ao emitir novos tokens.');
  }
}
