import { asProviderSettings, type ProviderSessionSnapshot } from '../provider-settings.types';
import type { CiaRuntimePort } from '../../../../kloel/mind/cia/cia-runtime.port';
import type { SessionStatus } from '../providers/provider-registry.types';
import type {
  WahaRuntimeConfigDiagnostics,
  WahaSessionConfigDiagnostics,
} from '../providers/whatsapp-api.provider.types';

/**
 * Pure helpers extracted from {@link WhatsAppApiController} so they can be
 * unit-tested in isolation without instantiating the Nest module.
 *
 * No side effects, no Prisma access, no provider calls — only the inputs they
 * receive. The controller keeps its HTTP wiring and orchestration logic.
 */

/** Backlog mode literal accepted by {@link CiaRuntimePort.startBacklogRun}. */
export type BacklogMode = Exclude<Parameters<CiaRuntimePort['startBacklogRun']>[1], undefined>;

/**
 * Return `value` when it is a string; otherwise return `fallback`. Mirrors the
 * previous private `readText` guard used throughout the controller.
 */
export function readText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Pick the WhatsApp provider session snapshot out of the workspace's raw
 * provider-settings JSON. Prefers the `whatsappWebSession` slot (WAHA flow)
 * and falls back to `whatsappApiSession` (Meta Cloud flow), matching the
 * existing controller behavior.
 */
export function readSessionSnapshot(providerSettings: unknown): ProviderSessionSnapshot | null {
  const settings = asProviderSettings(providerSettings);
  return settings.whatsappWebSession ?? settings.whatsappApiSession ?? null;
}

/**
 * Narrow the loosely-typed `mode` body field into the {@link BacklogMode}
 * literal expected by the CIA runtime. Unknown values collapse to
 * `'reply_all_recent_first'`, preserving the previous default.
 */
export function readBacklogMode(value: unknown): BacklogMode {
  switch (value) {
    case 'reply_only_new':
    case 'prioritize_hot':
    case 'reply_all_recent_first':
      return value;
    default:
      return 'reply_all_recent_first';
  }
}

/** Backlog snapshot subset consumed by {@link deriveProviderStatusDegradedReasons}. */
export interface ProviderStatusBacklog {
  pendingConversations?: number | string | null;
}

/** Input bundle for {@link deriveProviderStatusDegradedReasons}. */
export interface DeriveDegradedReasonsInput {
  runtimeDiagnostics: WahaRuntimeConfigDiagnostics;
  sessionDiagnostics: WahaSessionConfigDiagnostics;
  sessionStatus: SessionStatus;
  sessionMeta: ProviderSessionSnapshot | null;
  backlog: ProviderStatusBacklog | null;
}

/**
 * Compute the ordered list of `degradedReasons` surfaced by the
 * `provider-status` endpoint. Pure: only reads the supplied snapshots, never
 * touches Prisma or external providers.
 *
 * The output order mirrors the previous inline `if` chain inside the
 * controller, so existing dashboard consumers see the same string sequence:
 *
 * 1. runtime webhook / events / store flags
 * 2. session config presence + webhook flags
 * 3. session_config_unavailable when connected but diagnostics unreachable
 * 4. recoveryBlockedReason carried in the workspace's session metadata
 * 5. `backlog_empty_after_catchup_error` heuristic
 */
export function deriveProviderStatusDegradedReasons(input: DeriveDegradedReasonsInput): string[] {
  const { runtimeDiagnostics, sessionDiagnostics, sessionStatus, sessionMeta, backlog } = input;
  const degradedReasons: string[] = [];

  if (!runtimeDiagnostics.webhookConfigured) {
    degradedReasons.push('meta_webhook_missing');
  } else if (!runtimeDiagnostics.inboundEventsConfigured) {
    degradedReasons.push('meta_webhook_events_missing_inbound');
  }
  if (!runtimeDiagnostics.storeEnabled) {
    degradedReasons.push('meta_store_disabled_in_runtime');
  }
  if (!runtimeDiagnostics.storeFullSync) {
    degradedReasons.push('meta_store_full_sync_disabled_in_runtime');
  }

  if (sessionDiagnostics.available) {
    if (!sessionDiagnostics.configPresent) {
      degradedReasons.push('meta_session_config_missing');
    }
    if (!sessionDiagnostics.webhookConfigured) {
      degradedReasons.push('meta_session_webhook_missing');
    } else if (!sessionDiagnostics.inboundEventsConfigured) {
      degradedReasons.push('meta_session_webhook_events_missing_inbound');
    }
    if (sessionDiagnostics.storeEnabled === false) {
      degradedReasons.push('meta_session_store_disabled');
    }
    if (sessionDiagnostics.storeFullSync === false) {
      degradedReasons.push('meta_session_store_full_sync_disabled');
    }
  } else if (sessionStatus.connected) {
    degradedReasons.push('meta_session_config_unavailable');
  }

  const recoveryBlockedReason = readText(sessionMeta?.recoveryBlockedReason).trim();
  if (recoveryBlockedReason) {
    degradedReasons.push(recoveryBlockedReason);
  }

  if (
    sessionStatus.connected &&
    backlog &&
    Number(backlog.pendingConversations || 0) === 0 &&
    sessionMeta?.lastCatchupError
  ) {
    degradedReasons.push('backlog_empty_after_catchup_error');
  }

  return degradedReasons;
}

/**
 * Build the `diagnostics.catchup` subobject surfaced by `provider-status`.
 * Pure projection of the session-meta snapshot — keeps the same null-fallback
 * behavior for fields that may be absent on a fresh workspace.
 */
export function buildProviderStatusCatchup(sessionMeta: ProviderSessionSnapshot | null) {
  return {
    lastCatchupAt: sessionMeta?.lastCatchupAt || null,
    lastCatchupReason: sessionMeta?.lastCatchupReason || null,
    lastCatchupImportedMessages: sessionMeta?.lastCatchupImportedMessages ?? null,
    lastCatchupTouchedChats: sessionMeta?.lastCatchupTouchedChats ?? null,
    lastCatchupProcessedChats: sessionMeta?.lastCatchupProcessedChats ?? null,
    lastCatchupOverflow: sessionMeta?.lastCatchupOverflow ?? null,
    lastCatchupError: sessionMeta?.lastCatchupError || null,
    lastCatchupFailedAt: sessionMeta?.lastCatchupFailedAt || null,
    recoveryBlockedReason: sessionMeta?.recoveryBlockedReason || null,
    recoveryBlockedAt: sessionMeta?.recoveryBlockedAt || null,
    backfillCursor: sessionMeta?.backfillCursor || null,
  };
}
