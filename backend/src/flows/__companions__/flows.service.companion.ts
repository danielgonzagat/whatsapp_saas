import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { forEachSequential } from '../../common/async-sequence';

/** Shape of data stored in a waitForReply node */
export interface WaitForReplyNodeData {
  timeout?: number;
  timeoutUnit?: 'seconds' | 'minutes' | 'hours' | 'days';
  fallbackMessage?: string;
}

/** Extra fields persisted inside FlowExecution.state while waiting */
export interface WaitState {
  user?: string;
  waitNodeId: string;
  waitingForContact: string;
  waitExpiresAt: string; // ISO-8601 absolute timestamp
  fallbackMessage?: string;
  [key: string]: unknown;
}

/** Return value of resumeFromWait so the caller (worker) knows what to do */
export interface ResumeResult {
  resumed: boolean;
  executionId?: string;
  flowId?: string;
  workspaceId?: string;
  resumeEdge?: 'Respondeu' | 'Timeout';
  waitNodeId?: string;
  fallbackMessage?: string;
  state?: Record<string, unknown>;
}

// ── WaitForReply functions ──

export function resolveTimeoutMs(
  timeout: number,
  unit: 'seconds' | 'minutes' | 'hours' | 'days',
): number {
  const multipliers: Record<string, number> = {
    seconds: 1_000,
    minutes: 60_000,
    hours: 3_600_000,
    days: 86_400_000,
  };
  return Math.max(1_000, timeout * (multipliers[unit] || 60_000));
}

export async function pauseForWaitNode(
  deps: { prisma: any; logger: Logger },
  params: {
    executionId: string;
    contactPhone: string;
    waitNodeId: string;
    nodeData: WaitForReplyNodeData;
  },
): Promise<void> {
  const { executionId, contactPhone, waitNodeId, nodeData } = params;

  const timeoutMs = resolveTimeoutMs(nodeData.timeout ?? 60, nodeData.timeoutUnit ?? 'minutes');
  const waitExpiresAt = new Date(Date.now() + timeoutMs).toISOString();

  const execution = await deps.prisma.flowExecution.findFirst({
    where: { id: executionId, workspaceId: { not: '' } },
  });
  if (!execution) {
    deps.logger.warn(`[WaitForReply] Execution ${executionId} not found, cannot pause`);
    return;
  }

  const existingState = (execution.state as Record<string, unknown>) || {};
  const waitState: WaitState = {
    ...existingState,
    waitNodeId,
    waitingForContact: contactPhone,
    waitExpiresAt,
    fallbackMessage: nodeData.fallbackMessage || undefined,
  };

  await deps.prisma.flowExecution.updateMany({
    where: { id: executionId, workspaceId: execution.workspaceId },
    data: {
      status: 'WAITING_INPUT',
      currentNodeId: waitNodeId,
      state: waitState as Prisma.InputJsonValue,
      logs: {
        push: {
          timestamp: Date.now(),
          nodeId: waitNodeId,
          message: `Aguardando resposta do contato ${contactPhone} (expira em ${waitExpiresAt})`,
          level: 'info',
        },
      },
    },
  });

  deps.logger.log(
    `[WaitForReply] Execution ${executionId} paused at node ${waitNodeId}, ` +
      `waiting for ${contactPhone} until ${waitExpiresAt}`,
  );
}

export async function resumeFromWait(
  deps: { prisma: any; logger: Logger },
  params: {
    contactPhone: string;
    workspaceId: string;
    message?: string;
  },
): Promise<ResumeResult> {
  const { contactPhone, workspaceId, message } = params;

  const executions = await deps.prisma.flowExecution.findMany({
    where: {
      workspaceId,
      status: 'WAITING_INPUT',
      state: {
        path: ['waitingForContact'],
        equals: contactPhone,
      },
    },
    select: {
      id: true,
      workspaceId: true,
      flowId: true,
      contactId: true,
      status: true,
      state: true,
      currentNodeId: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 1,
  });

  if (executions.length === 0) {
    return { resumed: false };
  }

  const execution = executions[0];
  const state = (execution.state as WaitState) || ({} as WaitState);
  const now = new Date();
  const expired = state.waitExpiresAt ? now > new Date(state.waitExpiresAt) : false;

  const resumeEdge: 'Respondeu' | 'Timeout' = expired ? 'Timeout' : 'Respondeu';

  const updatedState: Record<string, unknown> = {
    ...state,
    lastReplyMessage: message || null,
    resumedAt: now.toISOString(),
    resumeEdge,
  };

  await deps.prisma.flowExecution.updateMany({
    where: { id: execution.id, workspaceId },
    data: {
      status: 'RUNNING',
      state: updatedState as Prisma.InputJsonValue,
      logs: {
        push: {
          timestamp: Date.now(),
          nodeId: state.waitNodeId,
          message: expired
            ? `Timeout expirado — retomando pelo edge "Timeout"`
            : `Contato ${contactPhone} respondeu — retomando pelo edge "Respondeu"`,
          level: 'info',
        },
      },
    },
  });

  deps.logger.log(
    `[WaitForReply] Execution ${execution.id} resumed via "${resumeEdge}" ` +
      `(contact: ${contactPhone})`,
  );

  return {
    resumed: true,
    executionId: execution.id,
    flowId: execution.flowId,
    workspaceId: execution.workspaceId,
    resumeEdge,
    waitNodeId: state.waitNodeId,
    fallbackMessage: expired ? state.fallbackMessage : undefined,
    state: updatedState,
  };
}

export async function expireWaitTimeouts(
  deps: { prisma: any; logger: Logger },
  workspaceId?: string,
  batchSize = 50,
): Promise<ResumeResult[]> {
  const now = new Date();
  const results: ResumeResult[] = [];

  const candidates = await deps.prisma.flowExecution.findMany({
    where: {
      status: 'WAITING_INPUT',
      ...(workspaceId ? { workspaceId } : {}),
    },
    select: {
      id: true,
      workspaceId: true,
      flowId: true,
      contactId: true,
      status: true,
      state: true,
      currentNodeId: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'asc' },
    take: batchSize,
  });

  await forEachSequential(candidates, async (exec: any) => {
    const state = (exec.state as WaitState) || ({} as WaitState);
    if (!state.waitExpiresAt) {
      return;
    }
    if (now <= new Date(state.waitExpiresAt)) {
      return;
    }

    const updatedState: Record<string, unknown> = {
      ...state,
      resumedAt: now.toISOString(),
      resumeEdge: 'Timeout',
    };

    await deps.prisma.flowExecution.updateMany({
      where: { id: exec.id, workspaceId: exec.workspaceId },
      data: {
        status: 'RUNNING',
        state: updatedState as Prisma.InputJsonValue,
        logs: {
          push: {
            timestamp: Date.now(),
            nodeId: state.waitNodeId,
            message: `Timeout expirado para contato ${state.waitingForContact} — retomando pelo edge "Timeout"`,
            level: 'warn',
          },
        },
      },
    });

    deps.logger.log(
      `[WaitForReply] Execution ${exec.id} expired (timeout), resuming via "Timeout"`,
    );

    results.push({
      resumed: true,
      executionId: exec.id,
      flowId: exec.flowId,
      workspaceId: exec.workspaceId,
      resumeEdge: 'Timeout',
      waitNodeId: state.waitNodeId,
      fallbackMessage: state.fallbackMessage,
      state: updatedState,
    });
  });

  return results;
}
