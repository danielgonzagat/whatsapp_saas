import { type FlowExecutionStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { ContextStore } from './context-store';
import { prisma } from './db';
import type { ExecutionState, FlowLogEntry, PersistedFlowLogEntry } from './flow-engine.types';
import type { WorkerLogger } from './logger';
import { flowStatusCounter } from './metrics';

export async function appendLog(
  context: ContextStore,
  state: ExecutionState,
  logEntry: FlowLogEntry,
): Promise<void> {
  if (!state.executionId) {
    return;
  }
  const entry = {
    id: randomUUID(),
    ts: Date.now(),
    ...logEntry,
  };

  // Robust Append: Fetch current logs first to avoid overwriting with stale state
  const currentExec = await prisma.flowExecution.findFirst({
    where: { id: state.executionId, workspaceId: state.workspaceId },
    select: { logs: true },
  });

  const currentLogs = (currentExec?.logs as never as PersistedFlowLogEntry[]) || [];
  const newLogs = [...currentLogs, entry];

  await prisma.flowExecution.updateMany({
    where: { id: state.executionId, workspaceId: state.workspaceId },
    data: {
      logs: newLogs as never as Prisma.InputJsonValue,
      state: state.variables as Prisma.InputJsonValue,
      currentNodeId: state.nodeId,
    },
  });

  // Real-time Socket Publish to feed dashboard console
  const typeMap: Record<string, string> = {
    node_start: 'node_start',
    node_end: 'node_complete',
    error: 'node_error',
    ai_response: 'node_complete',
    failed: 'node_error',
  };

  await context.publish(`flow:log:${state.workspaceId}`, {
    id: entry.id,
    timestamp: entry.ts,
    type: typeMap[logEntry.event] || logEntry.event || 'flow_log',
    nodeId: logEntry.nodeId,
    nodeType: logEntry.nodeType,
    message: logEntry.message || (logEntry.result ? JSON.stringify(logEntry.result) : undefined),
    data: logEntry,
    workspaceId: state.workspaceId,
    flowId: state.flowId,
    executionId: state.executionId,
  });
}

export async function markStatus(
  context: ContextStore,
  log: WorkerLogger,
  state: ExecutionState,
  status: string,
): Promise<void> {
  if (!state.executionId) {
    return;
  }
  await prisma.flowExecution.updateMany({
    where: { id: state.executionId, workspaceId: state.workspaceId },
    data: {
      status: status as FlowExecutionStatus,
      currentNodeId: state.nodeId,
      state: state.variables as Prisma.InputJsonValue,
    },
  });

  try {
    flowStatusCounter.inc({ workspaceId: state.workspaceId || 'unknown', status });
  } catch (err) {
    // PULSE:OK — Prometheus metric increment non-critical; flow state already persisted
    log.error('flow_status_metric_error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (status === 'COMPLETED' || status === 'FAILED') {
    await context.publish(`flow:log:${state.workspaceId}`, {
      id: randomUUID(),
      timestamp: Date.now(),
      type: 'flow_end',
      message: `Fluxo finalizado: ${status}`,
    });
  }
}

export async function getConversationHistory(
  log: WorkerLogger,
  workspaceId: string,
  contactPhone: string,
  limit = 10,
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  try {
    // 1. Find Contact
    const contact = await prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone: contactPhone } },
    });
    if (!contact) {
      return [];
    }

    // 2. Fetch Messages
    const messages = await prisma.message.findMany({
      where: {
        workspaceId,
        contactId: contact.id,
        type: 'TEXT',
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // 3. Format (Reverse to chronological order)
    return messages.reverse().map((m) => ({
      role: m.direction === 'INBOUND' ? 'user' : 'assistant',
      content: m.content,
    }));
  } catch (err) {
    log.error('history_fetch_error', { error: err });
    return [];
  }
}

export async function failExecution(
  context: ContextStore,
  log: WorkerLogger,
  state: ExecutionState,
  message: string,
): Promise<void> {
  if (!state.executionId) {
    return;
  }
  await appendLog(context, state, { event: 'failed', message });
  await prisma.flowExecution.updateMany({
    where: { id: state.executionId, workspaceId: state.workspaceId },
    data: { status: 'FAILED' },
  });
  try {
    flowStatusCounter.inc({ workspaceId: state.workspaceId || 'unknown', status: 'FAILED' });
  } catch (err) {
    // PULSE:OK — Prometheus metric increment non-critical; FAILED status already persisted
    log.error('flow_status_metric_error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
