/**
 * Pure helpers extracted from {@link ./useWhatsAppSession.ts}.
 *
 * WhatsApp connection is Meta Cloud API only. No legacy non-Meta branch is
 * part of this hook contract.
 */

import { kloelT } from '@/lib/i18n/t';

/* -- Status / autonomy classification sets -- */

/** Connection statuses that indicate the official Meta authorization is not complete yet. */
export const PENDING_META_STATUSES: ReadonlySet<string> = new Set([
  'authorization_required',
  'authorization_expired',
  'connect_required',
  'connection_incomplete',
  'connecting',
  'reconnect_required',
]);

/** CIA autonomy modes where the autopilot is actively driving the inbox. */
export const CIA_ACTIVE_MODES: ReadonlySet<string> = new Set(['LIVE', 'BACKLOG', 'FULL']);

/** CIA autonomy modes that map to a human-requested pause of the autopilot. */
export const CIA_MANUAL_PAUSE_MODES: ReadonlySet<string> = new Set(['HUMAN_ONLY', 'SUSPENDED']);

/** Canonical wire values returned by the Meta connection endpoints. */
export const STATUS_RESPONSES = {
  alreadyConnected: 'already_connected',
  connectRequired: 'connect_required',
  disconnected: 'disconnected',
} as const;

/** Reason codes attached to CIA autonomy events. */
export const AUTONOMY_ACTIONS = {
  manualPause: 'manual_pause',
} as const;

/** Polling intervals (ms) used by the hook. */
export const POLL_INTERVALS = {
  statusMs: 12_000,
} as const;

/** Connect feedback delay (ms). Meta authorization redirects after the official URL is issued. */
export const TIMEOUTS = {
  connectFeedbackMs: 1_500,
} as const;

/* -- User-facing copy (PT-BR, wrapped via kloelT) -- */

export const SESSION_COPY = {
  active: kloelT(`Meta Cloud API ativa e sincronizada.`),
  authorizingMeta: kloelT(`Conexão oficial da Meta pendente.`),
  disconnected: kloelT(`WhatsApp Meta Cloud desconectado.`),
  workspaceReload: kloelT(
    `Workspace não carregado. Recarregue a página para sincronizar sua conta.`,
  ),
  workspaceRetry: kloelT(`Workspace não carregado. Tente novamente.`),
  loadStatusFailed: kloelT(`Não foi possível carregar o status Meta agora.`),
  connectedSuccess: kloelT(`Meta Cloud API conectada com sucesso.`),
  alreadyConnected: kloelT(`Meta Cloud API já estava conectada.`),
  connectFailed: kloelT(`Falha ao iniciar a conexão oficial da Meta.`),
  connectRetry: kloelT(`Falha ao abrir a conexão oficial da Meta. Tente novamente.`),
  disconnectSuccess: kloelT(`Meta desconectada.`),
  disconnectRetry: kloelT(`Falha ao desconectar a Meta. Tente novamente.`),
  resetSuccess: kloelT(`Conexão Meta reiniciada. Conecte novamente pelo fluxo oficial.`),
  resetRetry: kloelT(`Falha ao reiniciar a conexão Meta. Tente novamente.`),
  pauseSuccess: kloelT(`IA pausada. O WhatsApp Meta Cloud continua conectado.`),
  pauseRetry: kloelT(`Falha ao pausar a IA.`),
  resumeSuccess: kloelT(`IA retomada. O atendimento automático voltou a agir.`),
  resumeRetry: kloelT(`Falha ao retomar a IA.`),
  runtimeResumeSuccess: kloelT(`Meta Cloud ativa. A autonomia total foi retomada automaticamente.`),
  redirectingMeta: kloelT(`Abrindo autorização oficial da Meta.`),
  invalidMetaRedirect: kloelT(`Redirecionamento bloqueado: destino Meta inválido.`),
} as const;

/** Log-prefix strings for the hook's console.error calls. */
export const SESSION_LOG = {
  recoverWorkspace: 'Failed to recover authenticated workspace:',
  recoverWorkspaceOnMount: 'Failed to recover workspace on session hook mount:',
  loadStatus: 'Failed to load Meta WhatsApp status:',
  connect: 'Failed to initiate official Meta WhatsApp connection:',
  disconnect: 'Failed to disconnect Meta WhatsApp:',
  reset: 'Failed to reset Meta WhatsApp connection:',
  syncRuntime: 'Failed to sync CIA runtime for connected Meta WhatsApp:',
} as const;

/* -- Pure helpers -- */

/** Lowercase / trim a wire status string for set-membership checks. */
export function normalizeStatusKey(status?: string | null): string {
  return String(status || '')
    .trim()
    .toLowerCase();
}

/** True when the wire status indicates the official Meta authorization is pending. */
export function isPendingMetaStatus(status?: string | null): boolean {
  return PENDING_META_STATUSES.has(normalizeStatusKey(status));
}

/** Connected -> active; pending Meta authorization -> action-needed; otherwise -> disconnected. */
export function resolveStatusMessage(data: { connected: boolean; status?: string | null }): string {
  if (data.connected) {
    return SESSION_COPY.active;
  }
  if (isPendingMetaStatus(data.status)) {
    return SESSION_COPY.authorizingMeta;
  }
  return SESSION_COPY.disconnected;
}

/** True when the CIA autonomy payload represents an active autopilot. */
export function isCiaAutonomyActive(autonomy: Record<string, unknown> | null | undefined): boolean {
  const mode = String(autonomy?.mode || 'OFF').toUpperCase();
  const reason = String(autonomy?.reason || '');
  const isActive = CIA_ACTIVE_MODES.has(mode);
  const isManualPause = reason === AUTONOMY_ACTIONS.manualPause || CIA_MANUAL_PAUSE_MODES.has(mode);
  return isActive && !isManualPause;
}

/** Throw-safe Error wrapper so the hook callers can use one constructor. */
export function createSessionError(message: string): Error {
  return new Error(message);
}

/* -- Credentials state classification -- */

/** True when both an auth token and a workspaceId are present (non-empty). */
export function hasCompleteCredentials(creds: {
  authToken?: string | null | undefined;
  workspaceId?: string | null | undefined;
}): boolean {
  return Boolean(creds.authToken) && Boolean(creds.workspaceId);
}

/** True when a token exists but no workspaceId. */
export function needsWorkspaceRecovery(creds: {
  authToken?: string | null | undefined;
  workspaceId?: string | null | undefined;
}): boolean {
  return Boolean(creds.authToken) && !creds.workspaceId;
}

/* -- Connect response classification -- */

/** Shape of the subset of WhatsAppConnectResponse we branch on. */
export interface ConnectResponseLike {
  status?: string | null | undefined;
  error?: unknown;
  message?: string | null | undefined;
  authUrl?: string | null | undefined;
}

/** Discriminated outcome of {@link classifyConnectResponse}. */
export type ConnectOutcome =
  | { kind: 'error'; message: string }
  | { kind: 'already_connected' }
  | { kind: 'connect_required'; authUrl: string; message: string }
  | { kind: 'pending' };

/** True for absolute URLs under official Meta/Facebook authorization hosts. */
export function isTrustedMetaAuthorizationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
      return false;
    }
    return url.hostname === 'www.facebook.com'
      || url.hostname === 'facebook.com'
      || url.hostname.endsWith('.facebook.com')
      || url.hostname === 'business.facebook.com'
      || url.hostname === 'www.meta.com'
      || url.hostname.endsWith('.meta.com');
  } catch {
    return false;
  }
}

/** Classify the Meta connect response without any legacy fallback. */
export function classifyConnectResponse(response: ConnectResponseLike): ConnectOutcome {
  if (response.error || response.status === 'error') {
    return {
      kind: 'error',
      message: response.message || SESSION_COPY.connectFailed,
    };
  }

  if (response.status === STATUS_RESPONSES.alreadyConnected) {
    return { kind: 'already_connected' };
  }

  const authUrl = String(response.authUrl || '').trim();
  if (authUrl || response.status === STATUS_RESPONSES.connectRequired) {
    if (!authUrl || !isTrustedMetaAuthorizationUrl(authUrl)) {
      return { kind: 'error', message: SESSION_COPY.invalidMetaRedirect };
    }
    return {
      kind: 'connect_required',
      authUrl,
      message: response.message || SESSION_COPY.redirectingMeta,
    };
  }

  return { kind: 'pending' };
}

/* -- Status snapshot factories -- */

/** Minimal disconnected state after Meta disconnect/reset or status failures. */
export interface DisconnectedSnapshot {
  connected: false;
  status: typeof STATUS_RESPONSES.disconnected;
  provider: 'meta-cloud';
}

export function buildDisconnectedStatus(): DisconnectedSnapshot {
  return { connected: false, status: STATUS_RESPONSES.disconnected, provider: 'meta-cloud' };
}

/* -- Effect-gating predicates -- */

export interface SessionGate {
  enabled: boolean;
  workspaceId: string;
  authToken: string;
}

export function isSessionPollEnabled(gate: SessionGate): boolean {
  return Boolean(gate.enabled && gate.workspaceId && gate.authToken);
}

export function shouldSkipCiaRuntimeSync(
  gate: SessionGate & { connected: boolean; guardedWorkspaceId: string | null },
): boolean {
  if (!isSessionPollEnabled(gate) || !gate.connected) {
    return true;
  }
  return gate.guardedWorkspaceId === gate.workspaceId;
}

/* -- Auth/me payload resolution -- */

export function pickRecoveredWorkspaceId<TPayload, TWorkspace extends { id?: string | null }>(
  payload: TPayload,
  resolver: (data: TPayload) => TWorkspace | null | undefined,
): string {
  return resolver(payload)?.id || '';
}

/* -- Connection-change detection -- */

export function hasConnectionStateChanged(previous: boolean, current: boolean): boolean {
  return previous !== current;
}
