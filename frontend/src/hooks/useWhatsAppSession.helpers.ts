/**
 * Pure helpers extracted from {@link ./useWhatsAppSession.ts}.
 *
 * These constants and functions touch no React state, no SWR, no network,
 * no `tokenStorage`, no `window`. They exist so the hook file can shrink
 * and so the status-key/autonomy-mode logic can be unit-tested in
 * isolation without spinning up `renderHook`.
 *
 * Anything that touches `authApi`, `ciaApi`, `tokenStorage`, or React
 * state stays in `useWhatsAppSession.ts`.
 */

import { kloelT } from '@/lib/i18n/t';

/* ── Status / autonomy classification sets ── */

/**
 * Connection statuses that indicate the WhatsApp session is mid-handshake
 * and the UI should be polling for the QR code rather than treating the
 * session as live.
 */
export const PENDING_QR_STATUSES: ReadonlySet<string> = new Set([
  'qr_pending',
  'scan_qr_code',
  'starting',
  'opening',
  'connecting',
]);

/** CIA autonomy modes where the autopilot is actively driving the inbox. */
export const CIA_ACTIVE_MODES: ReadonlySet<string> = new Set(['LIVE', 'BACKLOG', 'FULL']);

/** CIA autonomy modes that map to a human-requested pause of the autopilot. */
export const CIA_MANUAL_PAUSE_MODES: ReadonlySet<string> = new Set(['HUMAN_ONLY', 'SUSPENDED']);

/** Canonical wire values returned by the WhatsApp status/connect endpoints. */
export const STATUS_RESPONSES = {
  alreadyConnected: 'already_connected',
  qrReady: 'qr_ready',
  disconnected: 'disconnected',
} as const;

/** Reason codes attached to CIA autonomy events. */
export const AUTONOMY_ACTIONS = {
  manualPause: 'manual_pause',
} as const;

/** Polling intervals (ms) used by the hook. */
export const POLL_INTERVALS = {
  statusMs: 12_000,
  qrMs: 3_000,
} as const;

/** Connect/QR setTimeout durations (ms). */
export const TIMEOUTS = {
  connectFeedbackMs: 1_500,
  qrGenerationMs: 500,
} as const;

/* ── User-facing copy (PT-BR, wrapped via kloelT) ── */

export const SESSION_COPY = {
  active: kloelT(`Sessão ativa e sincronizada.`),
  waitingQr: kloelT(`Aguardando leitura do QR Code no aparelho.`),
  disconnected: kloelT(`WhatsApp desconectado.`),
  workspaceReload: kloelT(
    `Workspace não carregado. Recarregue a página para sincronizar sua conta.`,
  ),
  workspaceRetry: kloelT(`Workspace não carregado. Tente novamente.`),
  loadStatusFailed: kloelT(`Não foi possível carregar o status agora.`),
  scanQr: kloelT(`Escaneie o QR Code para conectar.`),
  connectedSuccess: kloelT(`Sessão conectada com sucesso.`),
  alreadyConnected: kloelT(`Sessão já estava conectada.`),
  connectFailed: kloelT(`Falha ao iniciar conexão.`),
  connectRetry: kloelT(`Falha ao iniciar conexão. Tente novamente.`),
  disconnectSuccess: kloelT(`Sessão desconectada.`),
  disconnectRetry: kloelT(`Falha ao desconectar. Tente novamente.`),
  resetSuccess: kloelT(`Sessão resetada. Gere um novo QR Code para reconectar.`),
  resetRetry: kloelT(`Falha ao resetar a sessão. Tente novamente.`),
  pauseSuccess: kloelT(`IA pausada. O WhatsApp continua conectado.`),
  pauseRetry: kloelT(`Falha ao pausar a IA.`),
  resumeSuccess: kloelT(`IA retomada. O atendimento automático voltou a agir.`),
  resumeRetry: kloelT(`Falha ao retomar a IA.`),
  runtimeResumeSuccess: kloelT(`Sessão ativa. A autonomia total foi retomada automaticamente.`),
  qrRefreshRetry: kloelT(`Falha ao atualizar o QR Code. Tente novamente.`),
} as const;

/** Log-prefix strings for the hook's console.error calls. */
export const SESSION_LOG = {
  recoverWorkspace: 'Failed to recover authenticated workspace:',
  recoverWorkspaceOnMount: 'Failed to recover workspace on session hook mount:',
  loadStatus: 'Failed to load WhatsApp status:',
  loadQr: 'Failed to load QR:',
  connect: 'Failed to initiate channel session:',
  disconnect: 'Failed to disconnect:',
  reset: 'Failed to reset WhatsApp session:',
  syncRuntime: 'Failed to sync CIA runtime for connected session:',
} as const;

/* ── Pure helpers ── */

/** Lowercase / trim a wire status string for set-membership checks. */
export function normalizeStatusKey(status?: string | null): string {
  return String(status || '')
    .trim()
    .toLowerCase();
}

/** True when the wire status indicates the session is waiting for QR scan. */
export function isPendingQrStatus(status?: string | null): boolean {
  return PENDING_QR_STATUSES.has(normalizeStatusKey(status));
}

/**
 * Resolve the user-facing status banner from the current connection data.
 * Connected → active; pending → waitingQr; otherwise → disconnected.
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
 * True when the CIA autonomy payload represents an active autopilot — i.e.,
 * the mode is one of LIVE/BACKLOG/FULL and there is no manual-pause marker
 * on either the reason or the mode itself.
 */
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
