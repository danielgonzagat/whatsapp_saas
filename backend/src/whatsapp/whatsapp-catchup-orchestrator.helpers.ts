import { randomUUID } from 'node:crypto';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import {
  AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB,
  buildSweepUnreadConversationsJobData,
} from '../contracts/autopilot-jobs';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue } from '../queue/queue';
import { AgentEventsService } from './agent-events.service';
import { asProviderSettings } from './provider-settings.types';
import { WorkerRuntimeService } from './worker-runtime.service';
import { isNowebStoreMisconfiguredExt } from './whatsapp-catchup.helpers';
import { safeStr, type GuestCheckSettings, CATCHUP_SWEEP_LIMIT } from './whatsapp-catchup-config';
import type { ICiaRuntime } from './whatsapp.interfaces';

export type CatchupRunSummary = {
  importedMessages: number;
  touchedChats: number;
  processedChats: number;
  overflow: boolean;
};

export type CatchupUpdatePayload = {
  status?: string;
  lastCatchupAt?: string | null;
  lastCatchupError?: string | null;
  lastCatchupFailedAt?: string | null;
  recoveryBlockedReason?: string | null;
  recoveryBlockedAt?: string | null;
  [key: string]: unknown;
};

type CatchupLifecycle = {
  catchupEnabled?: boolean;
  autoManage?: boolean;
  autoCatchup?: boolean;
  [key: string]: unknown;
};

function isGuestWorkspace(name?: string, s?: GuestCheckSettings | null): boolean {
  const n = String(name || '')
    .trim()
    .toLowerCase();
  if (n === 'guest workspace') {
    return true;
  }
  return (
    s?.guestMode === true ||
    s?.anonymousGuest === true ||
    s?.workspaceMode === 'guest' ||
    s?.authMode === 'anonymous' ||
    s?.auth?.anonymous === true
  );
}

export function getLifecycleBlockReason(
  name?: string,
  s?: Record<string, unknown> | null,
): string | null {
  const lc = (s?.whatsappLifecycle || {}) as CatchupLifecycle;
  if (isGuestWorkspace(name, s)) {
    return 'guest_workspace_disabled';
  }
  if (lc.catchupEnabled === false || lc.autoManage === false || lc.autoCatchup === false) {
    return 'catchup_disabled';
  }
  return null;
}

export function isSessionMissingError(error: unknown): boolean {
  const m = String(
    typeof error === 'string' ? error : error instanceof Error ? error.message : safeStr(error),
  ).toLowerCase();
  return (
    m.includes('session') &&
    (m.includes('does not exist') || m.includes('not found') || m.includes('404'))
  );
}

export async function persistCatchupSnapshot(
  prisma: PrismaService,
  ws: string,
  update: CatchupUpdatePayload,
) {
  await prisma.$transaction(async (tx) => {
    const w = await tx.workspace.findUnique({
      where: { id: ws },
      select: { providerSettings: true },
    });
    if (!w) {
      return;
    }
    const s = asProviderSettings(w.providerSettings);
    const sm = s.whatsappApiSession || {};
    await tx.workspace.update({
      where: { id: ws },
      data: {
        providerSettings: toPrismaJsonValue({
          ...s,
          ...(typeof update.status === 'string' ? { connectionStatus: update.status } : {}),
          whatsappApiSession: { ...sm, ...update },
        }),
      },
    });
  });
}

export async function getCatchupBlockReason(
  prisma: PrismaService,
  ws: string,
): Promise<string | null> {
  const w = await prisma.workspace.findUnique({
    where: { id: ws },
    select: { name: true, providerSettings: true },
  });
  if (!w) {
    return null;
  }
  const s = asProviderSettings(w.providerSettings);
  const lb = getLifecycleBlockReason(w.name || undefined, s);
  if (lb) {
    return lb;
  }
  const sm = s.whatsappApiSession || {};
  const rb = safeStr(sm.recoveryBlockedReason).trim();
  return isNowebStoreMisconfiguredExt(rb) ? rb || 'noweb_store_misconfigured' : null;
}

export async function scheduleUnreadSweep(input: {
  ws: string;
  reason: string;
  processedChats: number;
  touchedChats: number;
  workerRuntime: WorkerRuntimeService;
  ciaRuntime: ICiaRuntime;
  agentEvents: AgentEventsService;
}): Promise<void> {
  if (!input.ws) {
    return;
  }
  const workerOk = await input.workerRuntime.isAvailable().catch(() => false);
  const triggeredBy = `catchup:${input.reason}`;
  if (!workerOk) {
    await input.ciaRuntime.startBacklogRun(
      input.ws,
      'reply_all_recent_first',
      CATCHUP_SWEEP_LIMIT,
      { autoStarted: true, runtimeState: 'EXECUTING_BACKLOG', triggeredBy },
    );
    await input.agentEvents.publish({
      type: 'status',
      workspaceId: input.ws,
      phase: 'sync_queue_unread',
      persistent: true,
      message:
        'Sincronização concluída. O worker não está saudável, então vou zerar as conversas não lidas diretamente pelo fallback inline.',
      meta: {
        reason: input.reason,
        processedChats: input.processedChats,
        touchedChats: input.touchedChats,
        limit: CATCHUP_SWEEP_LIMIT,
        inlineFallback: true,
      },
    });
    return;
  }
  await autopilotQueue.add(
    AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB,
    buildSweepUnreadConversationsJobData({
      workspaceId: input.ws,
      runId: randomUUID(),
      limit: CATCHUP_SWEEP_LIMIT,
      mode: 'reply_all_recent_first',
      triggeredBy,
    }),
    { jobId: buildQueueJobId('catchup-sweep-unread', input.ws), removeOnComplete: true },
  );
  await input.agentEvents.publish({
    type: 'status',
    workspaceId: input.ws,
    phase: 'sync_queue_unread',
    persistent: true,
    message:
      input.processedChats > 0
        ? 'Sincronização concluída. Vou começar imediatamente a zerar as conversas não lidas.'
        : 'Sincronização concluída. Vou conferir imediatamente se ainda restam conversas não lidas no WAHA.',
    meta: {
      reason: input.reason,
      processedChats: input.processedChats,
      touchedChats: input.touchedChats,
      limit: CATCHUP_SWEEP_LIMIT,
    },
  });
}
