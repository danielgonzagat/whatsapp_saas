import { Prisma } from '@prisma/client';
import type { OpsAlertService } from '../../observability/ops-alert.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { sanitizeAgentRuntimeText, toInputJsonValue } from './agent-runtime.sanitizer';

export type AgentJobPayload = {
  jobKey: string;
  title: string;
  prompt: string;
  toolScope: string[];
  envelope: unknown;
};

export type ClaimedAgentJobEvent = {
  id: string;
  eventType: string;
  subject: string;
  payload: Prisma.JsonValue;
  idempotencyKey: string;
  occurredAt: Date;
  attempts: number;
  lastError: string | null;
};

export type AgentJobExecutionHistory = {
  attempt: number;
  status: 'succeeded' | 'failed' | 'dead_lettered';
  startedAt: string;
  finishedAt: string;
  message: string;
  error?: string;
  eventId: string;
  idempotencyKey: string;
};

const MAX_RETRIES = 3;

export async function recordJobHistory(
  prisma: PrismaService,
  opsAlert: OpsAlertService | undefined,
  logWarn: (msg: string) => void,
  workspaceId: string,
  event: ClaimedAgentJobEvent,
  payload: AgentJobPayload,
  entry: AgentJobExecutionHistory,
): Promise<void> {
  const historyKey = `agent_job_history:${event.subject}`;

  try {
    const existing = await prisma.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId, key: historyKey } },
      select: { value: true },
    });

    const existingValue = extractPayloadRecord(existing?.value ?? null);
    const history: AgentJobExecutionHistory[] = Array.isArray(existingValue?.history)
      ? (existingValue.history as AgentJobExecutionHistory[])
      : [];

    history.push(entry);

    await prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key: historyKey } },
      update: {
        value: toInputJsonValue({
          subject: event.subject,
          eventType: event.eventType,
          jobKey: payload.jobKey,
          maxRetries: MAX_RETRIES,
          history,
        }),
        content: `job=${event.subject} attempt=${entry.attempt} status=${entry.status}`,
      },
      create: {
        workspaceId,
        key: historyKey,
        category: 'agent_job_history',
        type: 'execution_log',
        value: toInputJsonValue({
          subject: event.subject,
          eventType: event.eventType,
          jobKey: payload.jobKey,
          maxRetries: MAX_RETRIES,
          history,
        }),
        content: `job=${event.subject} attempt=${entry.attempt} status=${entry.status}`,
      },
    });
  } catch (error: unknown) {
    void opsAlert?.alertOnCriticalError(error, 'AgentRuntimeJobRunnerService.recordJobHistory');
    logWarn(`Failed to record agent job history for ${event.subject}: ${messageFor(error)}`);
  }
}

export async function recordJobExecutionSnapshot(
  prisma: PrismaService,
  opsAlert: OpsAlertService | undefined,
  logWarn: (msg: string) => void,
  workspaceId: string,
  payload: AgentJobPayload,
  result: { status: 'succeeded' | 'failed'; eventId: string; message: string },
): Promise<void> {
  const key = payload.jobKey.startsWith('agent_job:')
    ? payload.jobKey
    : `agent_job:${payload.jobKey}`;
  try {
    const row = await prisma.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
      select: { value: true, metadata: true },
    });
    const now = new Date().toISOString();
    const value =
      row?.value && typeof row.value === 'object' && !Array.isArray(row.value)
        ? (row.value as Record<string, unknown>)
        : {};
    const metadata =
      row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    await prisma.kloelMemory.updateMany({
      where: { workspaceId, key, category: 'agent_job', type: 'scheduled' },
      data: {
        value: toInputJsonValue({
          ...value,
          lastResultAt: now,
          lastResultStatus: result.status,
          lastResultSummary: sanitizeAgentRuntimeText(result.message, 1000),
          lastError:
            result.status === 'failed'
              ? sanitizeAgentRuntimeText(result.message, 500)
              : undefined,
        }),
        metadata: {
          ...metadata,
          kind: 'agent_job',
          lastResultAt: now,
          lastResultStatus: result.status,
          lastEventId: result.eventId,
          ...(result.status === 'failed'
            ? { lastError: sanitizeAgentRuntimeText(result.message, 500) }
            : { lastError: null }),
        } satisfies Prisma.InputJsonObject,
      },
    });
  } catch (error: unknown) {
    void opsAlert?.alertOnCriticalError(
      error,
      'AgentRuntimeJobRunnerService.recordJobExecutionSnapshot',
    );
    logWarn(`Failed to persist agent job execution snapshot: ${messageFor(error)}`);
  }
}

function extractPayloadRecord(payload: Prisma.JsonValue): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  return payload;
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
