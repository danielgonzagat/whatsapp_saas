/**
 * Pure types and status-mapping utilities for the WAHA provider.
 * Contains no I/O — safe to import from any layer.
 *
 * Extracted from waha.provider.ts to keep each file under 600 lines.
 */

/** Session status shape returned by WahaProvider. */
export interface SessionStatus {
  /** Success property. */
  success: boolean;
  /** State property. */
  state: 'CONNECTED' | 'DISCONNECTED' | 'OPENING' | 'SCAN_QR_CODE' | 'STARTING' | 'FAILED' | null;
  /** Message property. */
  message: string;
  /** Phone number property. */
  phoneNumber?: string | null;
  /** Push name property. */
  pushName?: string | null;
  /** Self ids property. */
  selfIds?: string[];
}

/** Qr code response shape. */
export interface QrCodeResponse {
  /** Success property. */
  success: boolean;
  /** Qr property. */
  qr?: string;
  /** Message property. */
  message?: string;
}

/** Waha lid mapping shape. */
export interface WahaLidMapping {
  lid: string;
  pn: string;
}

/** Waha session overview shape. */
export interface WahaSessionOverview {
  name: string;
  success: boolean;
  rawStatus: string;
  state: SessionStatus['state'];
  phoneNumber?: string | null;
  pushName?: string | null;
}

/** Waha runtime config diagnostics shape. */
export interface WahaRuntimeConfigDiagnostics {
  webhookUrl: string | null;
  webhookConfigured: boolean;
  inboundEventsConfigured: boolean;
  events: string[];
  secretConfigured: boolean;
  storeEnabled: boolean;
  storeFullSync: boolean;
  allowSessionWithoutWebhook: boolean;
  allowInternalWebhookUrl: boolean;
}

/** Waha session config diagnostics shape. */
export interface WahaSessionConfigDiagnostics {
  sessionName: string;
  available: boolean;
  rawStatus: string | null;
  state: SessionStatus['state'];
  phoneNumber?: string | null;
  pushName?: string | null;
  webhookUrl: string | null;
  webhookConfigured: boolean;
  inboundEventsConfigured: boolean;
  events: string[];
  secretConfigured: boolean;
  storeEnabled: boolean | null;
  storeFullSync: boolean | null;
  configPresent: boolean;
  configMismatch?: boolean;
  mismatchReasons?: string[];
  sessionRestartRisk?: boolean;
  error?: string;
}

interface WahaSessionRaw {
  engine?: { state?: unknown };
  state?: unknown;
  session?: { state?: unknown; config?: unknown; status?: unknown };
  status?: unknown;
  [key: string]: unknown;
}

// ─── Status mapping ───────────────────────────────────────────────────────────

const WAHA_SESSION_STATUS_MAP: Record<string, NonNullable<SessionStatus['state']>> = {
  WORKING: 'CONNECTED',
  CONNECTED: 'CONNECTED',
  SCAN_QR_CODE: 'SCAN_QR_CODE',
  QR: 'SCAN_QR_CODE',
  QRCODE: 'SCAN_QR_CODE',
  STARTING: 'STARTING',
  OPENING: 'STARTING',
  FAILED: 'FAILED',
  STOPPED: 'DISCONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  LOGGED_OUT: 'DISCONNECTED',
};

/** Normalize waha session status. */
function normalizeWahaSessionStatus(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const normalized = raw.trim().toUpperCase();
  return normalized || null;
}

/** Map waha session status. */
export function mapWahaSessionStatus(rawStatus: string | null): SessionStatus['state'] {
  if (!rawStatus) {
    return null;
  }
  return WAHA_SESSION_STATUS_MAP[rawStatus] ?? null;
}

/** Resolve waha session state from a raw API response object. */
export function resolveWahaSessionState(data: Record<string, unknown>): {
  rawStatus: string;
  state: SessionStatus['state'];
} {
  const raw = data as WahaSessionRaw;
  const engine = raw.engine;
  const session = raw.session;
  const rawCandidates = [engine?.state, raw.state, session?.state, raw.status, session?.status]
    .map((value) => normalizeWahaSessionStatus(value))
    .filter((value): value is string => Boolean(value));

  const uniqueCandidates = Array.from(new Set(rawCandidates));
  const priority: SessionStatus['state'][] = [
    'CONNECTED',
    'SCAN_QR_CODE',
    'STARTING',
    'FAILED',
    'DISCONNECTED',
  ];

  for (const desiredState of priority) {
    const matched = uniqueCandidates.find(
      (candidate) => mapWahaSessionStatus(candidate) === desiredState,
    );
    if (matched) {
      return { rawStatus: matched, state: desiredState };
    }
  }

  return {
    rawStatus: uniqueCandidates[0] || 'UNKNOWN',
    state: 'DISCONNECTED',
  };
}
