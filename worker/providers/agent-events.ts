import { redis, redisPub } from "../redis-client";

export type AgentEventType =
  | "thought"
  | "status"
  | "error"
  | "backlog"
  | "prompt"
  | "contact"
  | "summary"
  | "sale";

export interface AgentEventPayload {
  type: AgentEventType;
  workspaceId: string;
  message: string;
  phase?: string;
  runId?: string;
  persistent?: boolean;
  meta?: Record<string, any>;
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

export async function publishAgentEvent(
  payload: AgentEventPayload,
): Promise<void> {
  const normalized = {
    ...payload,
    message: String(payload.message || "").trim(),
    ts: new Date().toISOString(),
  };

  if (!normalized.workspaceId || !normalized.message) {
    return;
  }

  await redisPub.publish("ws:agent", JSON.stringify(normalized)).catch(() => 0);
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
    .set(runStateKey(input.workspaceId), JSON.stringify(state), "EX", RUN_TTL_SECONDS)
    .catch(() => "OK");

  return state;
}

export async function getBacklogRunState(
  workspaceId: string,
): Promise<BacklogRunState | null> {
  try {
    const raw = await redis.get(runStateKey(workspaceId));
    if (!raw) return null;
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
  status: "sent" | "failed" | "skipped";
  summary: string;
}) {
  if (!input.runId) return null;

  const state = await getBacklogRunState(input.workspaceId);
  if (!state || state.runId !== input.runId) {
    return null;
  }

  const next: BacklogRunState = {
    ...state,
    finished: state.finished + 1,
    sent: state.sent + (input.status === "sent" ? 1 : 0),
    failed: state.failed + (input.status === "failed" ? 1 : 0),
    skipped: state.skipped + (input.status === "skipped" ? 1 : 0),
  };

  if (next.finished >= next.total) {
    next.completedAt = new Date().toISOString();
  }

  await redis
    .set(runStateKey(input.workspaceId), JSON.stringify(next), "EX", RUN_TTL_SECONDS)
    .catch(() => "OK");

  const displayName = input.contactName || input.phone || "contato";
  const remaining = Math.max(next.total - next.finished, 0);

  await publishAgentEvent({
    type: input.status === "failed" ? "error" : "contact",
    workspaceId: input.workspaceId,
    runId: input.runId,
    phase: input.status === "failed" ? "contact_error" : "contact_done",
    message:
      input.status === "failed"
        ? `Falhei ao responder ${displayName}. Motivo: ${input.summary}`
        : input.status === "skipped"
          ? `Pulei ${displayName}. ${input.summary}`
          : `Respondi ${displayName}. Restam ${remaining} conversas.`,
    persistent: input.status !== "sent",
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
    await publishAgentEvent({
      type: "summary",
      workspaceId: input.workspaceId,
      runId: input.runId,
      phase: "run_complete",
      persistent: true,
      message: `Concluí o backlog. ${next.sent} conversas respondidas, ${next.failed} com erro e ${next.skipped} puladas.`,
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
