'use client';

import { kloelT } from '@/lib/i18n/t';
import { authApi, resolveWorkspaceFromAuthPayload } from '@/lib/api';

/**
 * Status keys reported by the backend that mean "QR scan still pending".
 * Used by {@link isPendingQrStatus} to centralise the check.
 */
const PENDING_QR_STATUSES = new Set([
  'qr_pending',
  'scan_qr_code',
  'starting',
  'opening',
  'connecting',
]);

/**
 * CIA autonomy modes that should be treated as "automation is currently running".
 * Used to decide whether the runtime needs to be resumed.
 */
const CIA_ACTIVE_MODES = new Set(['LIVE', 'BACKLOG', 'FULL']);

/**
 * CIA autonomy modes that mean "automation was paused on purpose by a human".
 * The runtime sync flow must NOT auto-resume these.
 */
const CIA_MANUAL_PAUSE_MODES = new Set(['HUMAN_ONLY', 'SUSPENDED']);

/**
 * Domain-specific reason codes attached to autonomy state changes.
 */
export const AUTONOMY_ACTIONS = {
  manualPause: 'manual_pause',
} as const;

/**
 * Backend status string constants used by the WhatsApp connect/QR flow.
 */
export const STATUS_RESPONSES = {
  alreadyConnected: 'already_connected',
  disconnected: 'disconnected',
  qrReady: 'qr_ready',
} as const;

/**
 * Polling intervals (in milliseconds) used by the session hook.
 */
export const POLL_INTERVALS = {
  qrMs: 3_000,
  statusMs: 12_000,
} as const;

/**
 * One-shot timeouts (in milliseconds) used by the session hook.
 */
export const TIMEOUTS = {
  connectFeedbackMs: 1_500,
  qrGenerationMs: 500,
} as const;

/**
 * Localized user-facing copy used by the WhatsApp session hook.
 * Centralised here so translators can find every string in one place
 * and so the hook itself stays focused on logic.
 */
export const SESSION_COPY = {
  active: kloelT(`Sessão ativa e sincronizada.`),
  alreadyConnected: kloelT(`Sessão já estava conectada.`),
  connectFailed: kloelT(`Falha ao iniciar conexão.`),
  connectRetry: kloelT(`Falha ao iniciar conexão. Tente novamente.`),
  connectedSuccess: kloelT(`Sessão conectada com sucesso.`),
  disconnectRetry: kloelT(`Falha ao desconectar. Tente novamente.`),
  disconnectSuccess: kloelT(`Sessão desconectada.`),
  disconnected: kloelT(`WhatsApp desconectado.`),
  loadStatusFailed: kloelT(`Não foi possível carregar o status agora.`),
  pauseRetry: kloelT(`Falha ao pausar a IA.`),
  pauseSuccess: kloelT(`IA pausada. O WhatsApp continua conectado.`),
  qrRefreshRetry: kloelT(`Falha ao atualizar o QR Code. Tente novamente.`),
  resetRetry: kloelT(`Falha ao resetar a sessão. Tente novamente.`),
  resetSuccess: kloelT(`Sessão resetada. Gere um novo QR Code para reconectar.`),
  resumeRetry: kloelT(`Falha ao retomar a IA.`),
  resumeSuccess: kloelT(`IA retomada. O atendimento automático voltou a agir.`),
  runtimeResumeSuccess: kloelT(`Sessão ativa. A autonomia total foi retomada automaticamente.`),
  scanQr: kloelT(`Escaneie o QR Code para conectar.`),
  waitingQr: kloelT(`Aguardando leitura do QR Code no aparelho.`),
  workspaceReload: kloelT(
    `Workspace não carregado. Recarregue a página para sincronizar sua conta.`,
  ),
  workspaceRetry: kloelT(`Workspace não carregado. Tente novamente.`),
} as const;

/**
 * Log message prefixes for `console.error` calls inside the session hook.
 * Externalising these makes log lines greppable and avoids repeated string literals.
 */
export const SESSION_LOG = {
  connect: 'Failed to initiate connection:',
  disconnect: 'Failed to disconnect:',
  loadQr: 'Failed to load QR:',
  loadStatus: 'Failed to load WhatsApp status:',
  recoverWorkspace: 'Failed to recover authenticated workspace:',
  recoverWorkspaceOnMount: 'Failed to recover workspace on session hook mount:',
  reset: 'Failed to reset WhatsApp session:',
  syncRuntime: 'Failed to sync CIA runtime for connected session:',
} as const;

/**
 * Normalises a backend status string for case-insensitive comparison
 * (trims whitespace, lowercases, coerces nullish to empty string).
 */
export function normalizeStatusKey(status?: string | null): string {
  return String(status || '')
    .trim()
    .toLowerCase();
}

/**
 * Returns `true` if the given backend status indicates the session is
 * waiting for a QR scan (e.g. `qr_pending`, `scan_qr_code`, `starting`...).
 */
export function isPendingQrStatus(status?: string | null): boolean {
  return PENDING_QR_STATUSES.has(normalizeStatusKey(status));
}

/**
 * Maps the connection status returned by the backend to the user-facing
 * copy that should be shown in the UI.
 *
 * @param data - The connection-status snapshot returned by the API.
 * @returns Localised status message.
 */
export function resolveStatusMessage(data: { connected: boolean; status?: string | null }): string {
  if (data.connected) {
    return SESSION_COPY.active;
  }
  if (isPendingQrStatus(data.status)) {
    return SESSION_COPY.waitingQr;
  }
  return SESSION_COPY.disconnected;
}

/**
 * Re-fetches the current authenticated user and returns the workspace ID
 * resolved from the auth payload. Returns an empty string if no workspace
 * could be resolved.
 */
export async function recoverAuthenticatedWorkspaceId(): Promise<string> {
  const me = await authApi.getMe();
  return resolveWorkspaceFromAuthPayload(me.data)?.id || '';
}

/**
 * Builds an `Error` object with a session-specific message.
 * Centralised so call sites can stay declarative.
 */
export function createSessionError(message: string): Error {
  return new Error(message);
}

/**
 * Determines whether the CIA autonomy runtime is currently in an active state.
 * Active means: mode is one of {@link CIA_ACTIVE_MODES} AND the autonomy was
 * not manually paused (mode/reason in {@link CIA_MANUAL_PAUSE_MODES} or
 * `manual_pause`).
 *
 * @param autonomy - Autonomy snapshot from the CIA surface payload.
 */
export function isCiaAutonomyActive(autonomy: Record<string, unknown> | null | undefined): boolean {
  const mode = String(autonomy?.mode || 'OFF').toUpperCase();
  const reason = String(autonomy?.reason || '');
  const isActive = CIA_ACTIVE_MODES.has(mode);
  const isManualPause = reason === AUTONOMY_ACTIONS.manualPause || CIA_MANUAL_PAUSE_MODES.has(mode);
  return isActive && !isManualPause;
}
