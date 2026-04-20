import { prisma } from '../db';
import { redis, redisPub } from '../redis-client';

const S_RE = /\s+/g;

const PENSANDO_NA_MELHOR_RESP_RE = /^Pensando na melhor resposta para /i;
const A_RESPOSTA_J__HAVIA_SID_RE = /^A resposta já havia sido executada anteriormente\.?$/i;

export type AgentEventType =
  | 'thought'
  | 'status'
  | 'error'
  | 'backlog'
  | 'prompt'
  | 'contact'
  | 'summary'
  | 'sale'
  | 'heartbeat'
  | 'typing'
  | 'action'
  | 'proof'
  | 'account';

export interface AgentEventPayload {
  type: AgentEventType;
  workspaceId: string;
  message: string;
  phase?: string;
  runId?: string;
  persistent?: boolean;
  streaming?: boolean;
  token?: string;
  meta?: Record<string, unknown>;
}

type BacklogRunState = {
  runId: string;
  workspaceId: string;
  total: number;
  finished: number;
  sent: number;
  failed: number;
  skipped: number;
  mode: string;
  startedAt: string;
  completedAt?: string;
};

const RUN_TTL_SECONDS = 60 * 60;

function runStateKey(workspaceId: string) {
  return `cia:run:${workspaceId}`;
}

function normalizeAgentMessage(payload: AgentEventPayload): string {
  let message = String(payload.message || '')
    .replace(S_RE, ' ')
    .trim();

  if (!message && payload.streaming && payload.token) {
    message = String(payload.token || '').trim();
  }

  if (message.startsWith('Prova registrada:')) {
    message = message.slice('Prova registrada:'.length).trim();
  }

  if (payload.phase === 'compose_reply' && PENSANDO_NA_MELHOR_RESP_RE.test(message)) {
    message = message.replace(PENSANDO_NA_MELHOR_RESP_RE, 'Preparando resposta para ');
  }

  if (A_RESPOSTA_J__HAVIA_SID_RE.test(message)) {
    message = 'A resposta já havia sido executada.';
  }

  return message;
}

export async function publishAgentEvent(payload: AgentEventPayload): Promise<void> {
  const normalized = {
    ...payload,
    message: normalizeAgentMessage(payload),
    streaming: payload.streaming ?? payload.meta?.streaming === true,
    token:
      typeof payload.token === 'string'
        ? payload.token
        : typeof payload.meta?.token === 'string'
          ? payload.meta.token
          : undefined,
    ts: new Date().toISOString(),
  };

  if (!normalized.workspaceId || !normalized.message) {
    return;
  }

  await redisPub.publish('ws:agent', JSON.stringify(normalized)).catch(() => 0);
}

export async function createBacklogRunState(input: {
  workspaceId: string;
  runId: string;
  total: number;
  mode: string;
}) {
  const state: BacklogRunState = {
    workspaceId: input.workspaceId,
    runId: input.runId,
    total: input.total,
    finished: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    mode: input.mode,
    startedAt: new Date().toISOString(),
  };

  await redis
    .set(runStateKey(input.workspaceId), JSON.stringify(state), 'EX', RUN_TTL_SECONDS)
    .catch(() => 'OK');

  return state;
}

export async function getBacklogRunState(workspaceId: string): Promise<BacklogRunState | null> {
  try {
    const raw = await redis.get(runStateKey(workspaceId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as BacklogRunState;
  } catch {
    return null;
  }
}

export async function finishBacklogRunTask(input: {
  workspaceId: string;
  runId?: string;
  contactId?: string;
  contactName?: string;
  phone?: string;
  status: 'sent' | 'failed' | 'skipped';
  summary: string;
}) {
  if (!input.runId) {
    return null;
  }

  const state = await getBacklogRunState(input.workspaceId);
  if (!state || state.runId !== input.runId) {
    return null;
  }

  const increment = state.total > 0 ? 1 : 0;
  const next: BacklogRunState = {
    ...state,
    finished: state.finished + increment,
    sent: state.sent + (input.status === 'sent' ? increment : 0),
    failed: state.failed + (input.status === 'failed' ? increment : 0),
    skipped: state.skipped + (input.status === 'skipped' ? increment : 0),
  };

  if (next.finished >= next.total) {
    next.completedAt = new Date().toISOString();
  }

  await redis
    .set(runStateKey(input.workspaceId), JSON.stringify(next), 'EX', RUN_TTL_SECONDS)
    .catch(() => 'OK');

  const displayName = input.contactName || input.phone || 'contato';
  const remaining = Math.max(next.total - next.finished, 0);

  await publishAgentEvent({
    type: input.status === 'failed' ? 'error' : 'contact',
    workspaceId: input.workspaceId,
    runId: input.runId,
    phase: input.status === 'failed' ? 'contact_error' : 'contact_done',
    message:
      input.status === 'failed'
        ? `${displayName} terminou com falha. ${input.summary}`
        : input.status === 'skipped'
          ? `${displayName} foi pulado. ${input.summary}`
          : `${displayName} foi processado com sucesso. Restam ${remaining} conversa(s) nesta execução.`,
    persistent: input.status !== 'sent',
    meta: {
      contactId: input.contactId,
      contactName: input.contactName,
      phone: input.phone,
      remaining,
      finished: next.finished,
      total: next.total,
      sent: next.sent,
      failed: next.failed,
      skipped: next.skipped,
    },
  });

  if (next.finished >= next.total) {
    try {
      if (prisma.autonomyRun) {
        await prisma.autonomyRun.update({
          where: { id: input.runId },
          data: {
            status: next.failed > 0 ? 'FAILED' : 'COMPLETED',
            endedAt: new Date(),
            meta: {
              total: next.total,
              sent: next.sent,
              failed: next.failed,
              skipped: next.skipped,
              finished: next.finished,
              mode: next.mode,
            },
          },
        });
      }
    } catch {
      // Best-effort update for ledger status.
    }

    await publishAgentEvent({
      type: 'summary',
      workspaceId: input.workspaceId,
      runId: input.runId,
      phase: 'run_complete',
      persistent: true,
      message: `Execução encerrada com ${next.sent} conversa(s) concluídas, ${next.failed} falha(s) e ${next.skipped} item(ns) pulado(s).`,
      meta: {
        total: next.total,
        sent: next.sent,
        failed: next.failed,
        skipped: next.skipped,
        finished: next.finished,
      },
    });
  }

  return next;
}
