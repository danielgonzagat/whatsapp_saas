import { CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT } from './cia-bootstrap.service.companion';
import type { CiaBootstrapService } from '../cia-bootstrap.service';
import type { CiaChatFilterService } from '../cia-chat-filter.service';
import type { CiaRuntimeStateService } from '../cia-runtime-state.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { WhatsAppProviderRegistry } from '../providers/provider-registry';
import { asProviderSettings } from '../provider-settings.types';

export type BacklogMode = 'reply_all_recent_first' | 'reply_only_new' | 'prioritize_hot';
export type WorkspaceAutonomyMode =
  | 'OFF'
  | 'LIVE'
  | 'BACKLOG'
  | 'FULL'
  | 'HUMAN_ONLY'
  | 'SUSPENDED';

export const safeStr = (v: unknown, fb = ''): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : fb;

type StartBacklogRunFn = (
  workspaceId: string,
  mode: BacklogMode,
  limit: number,
  options: { autoStarted: boolean; runtimeState: string; triggeredBy: string },
) => Promise<{ runId?: string; totalQueued?: number }>;

export async function ensureBacklogCoverageHelper(
  deps: {
    prisma: PrismaService;
    providerRegistry: WhatsAppProviderRegistry;
    chatFilter: CiaChatFilterService;
    bootstrapService: CiaBootstrapService;
    runtimeState: CiaRuntimeStateService;
    startBacklogRun: StartBacklogRunFn;
  },
  workspaceId: string,
  options:
    | {
        triggeredBy?: string;
        limit?: number;
        allowBootstrap?: boolean;
      }
    | undefined,
  bootstrapFn: () => Promise<unknown>,
  startPresenceHeartbeat: (workspaceId: string) => Promise<void>,
  stopPresenceHeartbeat: (workspaceId: string) => Promise<void>,
) {
  const workspace = await deps.prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  const settings = asProviderSettings(workspace?.providerSettings);
  const autonomy = (settings.autonomy || {}) as Record<string, unknown>;
  const runtime = (settings.ciaRuntime || {}) as Record<string, unknown>;
  const autonomyMode = safeStr(autonomy.mode).trim().toUpperCase();
  const triggeredBy = options?.triggeredBy || 'runtime_maintenance';
  const staleRuntimeReset = await deps.runtimeState.resetStaleRuntimeRunIfNeeded(
    workspaceId,
    runtime,
    triggeredBy,
  );
  const effectiveRuntime = staleRuntimeReset ? staleRuntimeReset : runtime;
  const effectiveRuntimeState = safeStr(effectiveRuntime.state).trim().toUpperCase();

  if (autonomy.autoBootstrapOnConnected === false) {
    return { action: 'skipped', reason: 'auto_bootstrap_disabled' };
  }

  if (!autonomyMode || autonomyMode === 'OFF' || effectiveRuntimeState === 'PAUSED') {
    await stopPresenceHeartbeat(workspaceId);
    if (options?.allowBootstrap === false) {
      return { action: 'skipped', reason: 'bootstrap_disallowed' };
    }
    return bootstrapFn();
  }

  if (autonomyMode === 'HUMAN_ONLY' || autonomyMode === 'SUSPENDED') {
    await stopPresenceHeartbeat(workspaceId);
    return { action: 'skipped', reason: 'autonomy_blocked' };
  }

  await startPresenceHeartbeat(workspaceId);

  if (
    ['EXECUTING_BACKLOG', 'EXECUTING_IMMEDIATELY'].includes(effectiveRuntimeState) ||
    safeStr(effectiveRuntime.currentRunId).trim()
  ) {
    return { action: 'skipped', reason: 'run_in_progress' };
  }

  const pendingConversations = await deps.bootstrapService.listPendingConversations(
    workspaceId,
    options?.limit || 500,
  );
  if (!pendingConversations.length) {
    const chats = deps.chatFilter.normalizeChats(await deps.providerRegistry.getChats(workspaceId));
    const remotePending = deps.chatFilter.selectRemotePendingChats(chats);
    if (remotePending.length > 0) {
      return {
        action: 'backlog_started',
        run: await deps.startBacklogRun(
          workspaceId,
          'reply_all_recent_first',
          Math.max(
            1,
            Math.min(options?.limit || CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT, remotePending.length),
          ),
          {
            autoStarted: true,
            runtimeState: 'EXECUTING_BACKLOG',
            triggeredBy,
          },
        ),
        remotePending: remotePending.length,
      };
    }

    await deps.runtimeState.updateWorkspaceAutonomy(workspaceId, {
      mode: 'FULL',
      reason: triggeredBy,
      runtime: {
        state: 'LIVE_READY',
        currentRunId: null,
        mode: 'reply_only_new',
      },
      autonomy: {
        reactiveEnabled: true,
        proactiveEnabled: false,
        autoBootstrapOnConnected: settings.autonomy?.autoBootstrapOnConnected ?? true,
      },
    });
    const catalog = await deps.runtimeState.scheduleContactCatalogRefresh(workspaceId, triggeredBy);

    return {
      action: catalog.scheduled ? 'catalog_scheduled' : 'idle',
      pendingConversations: 0,
      catalog,
    };
  }

  const run = await deps.startBacklogRun(
    workspaceId,
    'reply_all_recent_first',
    Math.max(
      1,
      Math.min(options?.limit || CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT, pendingConversations.length),
    ),
    {
      autoStarted: true,
      runtimeState: 'EXECUTING_BACKLOG',
      triggeredBy,
    },
  );

  return {
    action: 'backlog_started',
    run,
    pendingConversations: pendingConversations.length,
  };
}
