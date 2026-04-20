// WhatsApp Connection API functions
import { mutate } from 'swr';
import { apiFetch } from './core';

const invalidateWhatsApp = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/api/whatsapp'));
import type {
  WhatsAppConnectResponse,
  WhatsAppConnectionStatus,
  WhatsAppProofEntry,
  WhatsAppScreencastTokenResponse,
} from './core';

const A_Z_A_Z__A_Z_A_Z_D_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;
const PATTERN_RE = /^\/+/;
const PATTERN_RE_2 = /\/+$/;

export type {
  WhatsAppConnectionStatus,
  WhatsAppConnectResponse,
  WhatsAppScreencastTokenResponse,
  WhatsAppProofEntry,
};

interface WhatsAppApiError extends Error {
  status?: number;
}

function createWhatsAppApiError(message: string, status = 0): WhatsAppApiError {
  const error = new Error(message) as WhatsAppApiError;
  error.status = status;
  return error;
}

/**
 * Executes a WhatsApp API call via `apiFetch` and throws a normalized
 * error when the backend responds with a failure. Used by the many
 * small "call this endpoint and return data or throw" helpers below.
 */
async function whatsappApiRequest<T = unknown>(
  path: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<T> {
  const res = await apiFetch<T>(path, options);
  if (res.error) {
    throw createWhatsAppApiError(res.error, res.status);
  }
  return res.data as T;
}

/** Runs a mutating WhatsApp request and invalidates cached SWR keys on success. */
async function whatsappMutatingRequest<T = unknown>(
  path: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<T> {
  const data = await whatsappApiRequest<T>(path, options);
  invalidateWhatsApp();
  return data;
}

const CONNECTED_WHATSAPP_STATUS_LABELS = new Set(['CONNECTED', 'WORKING']);

function readWhatsAppStatusLabel(data: Record<string, unknown> | undefined): string {
  return String(data?.status || '').toUpperCase();
}

function isConnectedWhatsAppStatus(data: Record<string, unknown> | undefined): boolean {
  if (data?.connected === true) {
    return true;
  }
  return CONNECTED_WHATSAPP_STATUS_LABELS.has(readWhatsAppStatusLabel(data));
}

function normalizeWsBase(value: string | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  try {
    const explicit = A_Z_A_Z__A_Z_A_Z_D_RE.test(raw)
      ? new URL(raw)
      : new URL(
          `${
            typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
          }//${raw.replace(PATTERN_RE, '')}`,
        );
    if (explicit.protocol === 'http:') {
      explicit.protocol = 'ws:';
    }
    if (explicit.protocol === 'https:') {
      explicit.protocol = 'wss:';
    }
    return explicit.toString().replace(PATTERN_RE_2, '');
  } catch {
    return '';
  }
}

/** Get whats app screencast ws base. */
export function getWhatsAppScreencastWsBase(): string {
  const explicit = normalizeWsBase(process.env.NEXT_PUBLIC_SCREENCAST_WS_URL);
  if (explicit) {
    return explicit;
  }

  if (typeof window !== 'undefined') {
    console.warn('[Kloel] NEXT_PUBLIC_SCREENCAST_WS_URL not set — screencast disabled');
  }
  return '';
}

/** Build whats app screencast ws url. */
export function buildWhatsAppScreencastWsUrl(workspaceId: string, token?: string): string {
  const base = getWhatsAppScreencastWsBase();
  if (!base || !workspaceId) {
    return '';
  }

  const safeToken = String(token || '').trim();
  return `${base}/stream/${encodeURIComponent(workspaceId)}?token=${encodeURIComponent(
    safeToken || 'guest',
  )}`;
}

interface WhatsAppStatusRaw {
  connected?: boolean;
  status?: string;
  phone?: string;
  phoneNumber?: string;
  pushName?: string;
  businessName?: string;
  authUrl?: string;
  phoneNumberId?: string;
  whatsappBusinessId?: string | null;
  qr?: string;
  qrCode?: string;
  qrCodeImage?: string;
  message?: string;
  provider?: string;
  providerType?: string;
  degradedReason?: string | null;
  workerAvailable?: boolean;
  workerHealthy?: boolean;
  workerError?: string | null;
  degraded?: boolean;
  qrAvailable?: boolean;
  browserSessionStatus?: string;
  screencastStatus?: string;
  viewerAvailable?: boolean;
  takeoverActive?: boolean;
  agentPaused?: boolean;
  lastObservationAt?: string | null;
  lastActionAt?: string | null;
  observationSummary?: string | null;
  activeProvider?: string | null;
  proofCount?: number;
  viewport?: { width: number; height: number };
}

function normalizeWhatsAppStatusLabel(rawStatus: string, connected: boolean): string {
  if (connected) {
    return 'connected';
  }
  if (rawStatus === 'CONNECTION_INCOMPLETE') {
    return 'connection_incomplete';
  }
  return rawStatus ? rawStatus.toLowerCase() : 'disconnected';
}

function mapWhatsAppStatusPayload(
  data: WhatsAppStatusRaw | undefined,
  connected: boolean,
  normalizedStatus: string,
): WhatsAppConnectionStatus {
  return {
    connected,
    status: normalizedStatus,
    phone: data?.phone || data?.phoneNumber || undefined,
    pushName: data?.pushName || data?.businessName || undefined,
    authUrl: data?.authUrl || undefined,
    phoneNumberId: data?.phoneNumberId || undefined,
    whatsappBusinessId: data?.whatsappBusinessId || null,
    qrCode: data?.qr || data?.qrCode || data?.qrCodeImage || undefined,
    message: data?.message,
    provider: data?.provider || data?.providerType,
    degradedReason: data?.degradedReason || null,
    workerAvailable: typeof data?.workerAvailable === 'boolean' ? data.workerAvailable : true,
    workerHealthy: typeof data?.workerHealthy === 'boolean' ? data.workerHealthy : undefined,
    workerError: data?.workerError || null,
    degraded: Boolean(data?.degraded),
    qrAvailable:
      typeof data?.qrAvailable === 'boolean'
        ? data.qrAvailable
        : Boolean(data?.qr || data?.qrCode || data?.qrCodeImage),
    browserSessionStatus: data?.browserSessionStatus || undefined,
    screencastStatus: data?.screencastStatus || undefined,
    viewerAvailable: Boolean(data?.viewerAvailable),
    takeoverActive: Boolean(data?.takeoverActive),
    agentPaused: Boolean(data?.agentPaused),
    lastObservationAt: data?.lastObservationAt || null,
    lastActionAt: data?.lastActionAt || null,
    observationSummary: data?.observationSummary || null,
    activeProvider: data?.activeProvider || null,
    proofCount: Number(data?.proofCount || 0) || 0,
    viewport: data?.viewport,
  };
}

/** Get whats app status. */
export async function getWhatsAppStatus(_workspaceId: string): Promise<WhatsAppConnectionStatus> {
  const res = await apiFetch<WhatsAppStatusRaw>(`/api/whatsapp-api/session/status`);
  if (res.error) {
    throw createWhatsAppApiError(res.error, res.status);
  }

  const data = res.data as WhatsAppStatusRaw | undefined;
  const connected = isConnectedWhatsAppStatus(data as Record<string, unknown>);
  const rawStatus = String(data?.status || '');
  const normalizedStatus = normalizeWhatsAppStatusLabel(rawStatus, connected);

  return mapWhatsAppStatusPayload(data, connected, normalizedStatus);
}

/** Initiate whats app connection. */
export async function initiateWhatsAppConnection(
  _workspaceId: string,
): Promise<WhatsAppConnectResponse> {
  const res = await apiFetch<Record<string, unknown>>(`/api/whatsapp-api/session/start`, {
    method: 'POST',
  });
  if (res.error) {
    throw createWhatsAppApiError(res.error, res.status);
  }
  invalidateWhatsApp();

  interface SessionStartData {
    success?: boolean;
    message?: string;
    authUrl?: string;
    qr?: string;
    qrCode?: string;
    qrCodeImage?: string;
  }
  const data = res.data as SessionStartData | undefined;
  return {
    status:
      data?.success === false
        ? 'error'
        : data?.message === 'already_connected'
          ? 'already_connected'
          : data?.authUrl
            ? 'connect_required'
            : 'pending',
    message: data?.message,
    authUrl: data?.authUrl,
    qrCode: data?.qr || data?.qrCode,
    qrCodeImage: data?.qrCodeImage || data?.qr || data?.qrCode,
    error: data?.success === false,
  };
}

/** Get whats app qr. */
export async function getWhatsAppQR(
  _workspaceId: string,
): Promise<{ qrCode: string | null; connected: boolean; status?: string; message?: string }> {
  const [qrResponse, statusResponse] = await Promise.all([
    getWhatsAppQrImageOnly(_workspaceId),
    apiFetch<Record<string, unknown>>(`/api/whatsapp-api/session/status`),
  ]);

  if (statusResponse.error) {
    throw createWhatsAppApiError(statusResponse.error, statusResponse.status);
  }

  interface StatusData {
    status?: string;
    message?: string;
    connected?: boolean;
  }
  const statusData = (statusResponse.data || {}) as StatusData;
  const connected = isConnectedWhatsAppStatus(statusData as Record<string, unknown>);

  return {
    qrCode: qrResponse.qrCode,
    connected,
    status: connected
      ? 'connected'
      : String(statusData.status || qrResponse.status || 'pending').toLowerCase(),
    message: qrResponse.message || statusData.message || undefined,
  };
}

interface WhatsAppQrImageData {
  status?: string;
  connected?: boolean;
  qr?: string;
  qrCode?: string;
  message?: string;
}

function resolveWhatsAppQrConnectedFlag(rawStatus: string, connected?: boolean): boolean {
  return connected === true || rawStatus === 'connected' || rawStatus === 'working';
}

/** Get whats app qr image only. */
export async function getWhatsAppQrImageOnly(
  _workspaceId: string,
): Promise<{ qrCode: string | null; connected: boolean; status?: string; message?: string }> {
  const qrResponse = await apiFetch<Record<string, unknown>>(`/api/whatsapp-api/session/qr`);

  if (qrResponse.error) {
    throw createWhatsAppApiError(qrResponse.error, qrResponse.status);
  }

  const qrData = (qrResponse.data || {}) as WhatsAppQrImageData;
  const rawStatus = String(qrData.status || '').toLowerCase();
  const connected = resolveWhatsAppQrConnectedFlag(rawStatus, qrData.connected);

  return {
    qrCode: qrData.qr || qrData.qrCode || null,
    connected,
    status: rawStatus || undefined,
    message: qrData.message || undefined,
  };
}

/** Disconnect whats app. */
export async function disconnectWhatsApp(_workspaceId: string): Promise<unknown> {
  return whatsappMutatingRequest(`/api/whatsapp-api/session/disconnect`, { method: 'DELETE' });
}

/** Logout whats app. */
export async function logoutWhatsApp(_workspaceId: string): Promise<unknown> {
  return whatsappMutatingRequest(`/api/whatsapp-api/session/logout`, { method: 'POST' });
}

/** Get whats app viewer. */
export async function getWhatsAppViewer(_workspaceId: string): Promise<unknown> {
  return {
    success: true,
    provider: 'whatsapp-api',
    snapshot: {
      connected: false,
      viewerAvailable: false,
      screenshotDataUrl: null,
      state: 'NOT_SUPPORTED',
      viewport: { width: 0, height: 0 },
    },
    image: null,
    message: 'Viewer/browser session nao esta habilitado nesta operacao do WhatsApp.',
  };
}

/** Get whats app screencast token. */
export async function getWhatsAppScreencastToken(
  _workspaceId: string,
): Promise<WhatsAppScreencastTokenResponse> {
  return {
    token: 'meta-cloud-disabled',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    workspaceId: _workspaceId,
    requireToken: false,
  };
}

/** Perform whats app viewer action. */
export async function performWhatsAppViewerAction(
  _workspaceId: string,
  _action: Record<string, unknown>,
): Promise<unknown> {
  return {
    success: false,
    message: 'Viewer actions nao estao habilitados nesta operacao do WhatsApp.',
  };
}

/** Takeover whats app viewer. */
export async function takeoverWhatsAppViewer(_workspaceId: string): Promise<unknown> {
  return { success: false, message: 'Takeover nao esta habilitado nesta operacao do WhatsApp.' };
}

/** Resume whats app agent. */
export async function resumeWhatsAppAgent(_workspaceId: string): Promise<unknown> {
  return {
    success: false,
    message: 'Resume-agent nao esta habilitado nesta operacao do WhatsApp.',
  };
}

/** Pause whats app agent. */
export async function pauseWhatsAppAgent(_workspaceId: string, paused = true): Promise<unknown> {
  return {
    success: false,
    paused,
    message: 'Pause-agent nao esta habilitado nesta operacao do WhatsApp.',
  };
}

/** Reconcile whats app session. */
export async function reconcileWhatsAppSession(
  _workspaceId: string,
  objective?: string,
): Promise<unknown> {
  return {
    success: false,
    objective,
    message: 'Reconcile nao esta habilitado nesta operacao do WhatsApp.',
  };
}

/** Get whats app proofs. */
export async function getWhatsAppProofs(
  _workspaceId: string,
  limit = 12,
): Promise<WhatsAppProofEntry[]> {
  void limit;
  return [];
}

/** Run whats app action turn. */
export async function runWhatsAppActionTurn(
  _workspaceId: string,
  objective: string,
  dryRun = false,
  mode?: string,
): Promise<unknown> {
  return {
    success: false,
    objective,
    dryRun,
    mode,
    message: 'Action turn nao existe no runtime Meta Cloud.',
  };
}

// ============= WHATSAPP SESSION MANAGEMENT (advanced) =============

export async function getWhatsAppSessionDiagnostics(_workspaceId: string): Promise<unknown> {
  return whatsappApiRequest(`/api/whatsapp-api/session/diagnostics`);
}

/** Force whats app session check. */
export async function forceWhatsAppSessionCheck(_workspaceId: string): Promise<unknown> {
  return whatsappMutatingRequest(`/api/whatsapp-api/session/force-check`, { method: 'POST' });
}

/** Force whats app reconnect. */
export async function forceWhatsAppReconnect(_workspaceId: string): Promise<unknown> {
  return whatsappMutatingRequest(`/api/whatsapp-api/session/force-reconnect`, { method: 'POST' });
}

/** Repair whats app session config. */
export async function repairWhatsAppSessionConfig(_workspaceId: string): Promise<unknown> {
  return whatsappMutatingRequest(`/api/whatsapp-api/session/repair-config`, { method: 'POST' });
}

/** Link whats app session. */
export async function linkWhatsAppSession(
  _workspaceId: string,
  sessionName: string,
): Promise<unknown> {
  return whatsappMutatingRequest(`/api/whatsapp-api/session/link`, {
    method: 'POST',
    body: { sessionName },
  });
}

/** Recreate whats app session if invalid. */
export async function recreateWhatsAppSessionIfInvalid(_workspaceId: string): Promise<unknown> {
  return whatsappMutatingRequest(`/api/whatsapp-api/session/recreate-if-invalid`, {
    method: 'POST',
  });
}

/** Get whats app provider status. */
export async function getWhatsAppProviderStatus(_workspaceId: string): Promise<unknown> {
  return whatsappApiRequest(`/api/whatsapp-api/provider-status`);
}

/** Check whats app phone. */
export async function checkWhatsAppPhone(
  _workspaceId: string,
  phone: string,
): Promise<{ phone: string; registered: boolean }> {
  return whatsappApiRequest<{ phone: string; registered: boolean }>(
    `/api/whatsapp-api/check/${encodeURIComponent(phone)}`,
  );
}

// ============= WHATSAPP CATALOG =============

export interface WhatsAppCatalogContact {
  contactId: string;
  name?: string | null;
  phone?: string | null;
  leadScore?: number;
  purchaseProbabilityScore?: number;
  lastMessageAt?: string | null;
  catalogedAt?: string | null;
  [key: string]: unknown;
}

function extractWhatsAppContactList(data: Record<string, unknown> | undefined): {
  contacts: WhatsAppCatalogContact[];
  total: number;
} {
  return {
    contacts: Array.isArray(data?.contacts) ? (data.contacts as WhatsAppCatalogContact[]) : [],
    total: Number(data?.total || 0),
  };
}

/** Get whats app catalog contacts. */
export async function getWhatsAppCatalogContacts(
  _workspaceId: string,
  params?: { days?: number; page?: number; limit?: number; onlyCataloged?: boolean },
): Promise<{ contacts: WhatsAppCatalogContact[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.days) {
    qs.set('days', String(params.days));
  }
  if (params?.page) {
    qs.set('page', String(params.page));
  }
  if (params?.limit) {
    qs.set('limit', String(params.limit));
  }
  if (params?.onlyCataloged !== undefined) {
    qs.set('onlyCataloged', String(params.onlyCataloged));
  }
  const query = qs.toString();
  const data = await whatsappApiRequest<Record<string, unknown>>(
    `/api/whatsapp-api/catalog/contacts${query ? `?${query}` : ''}`,
  );
  return extractWhatsAppContactList(data);
}

/** Get whats app catalog ranking. */
export async function getWhatsAppCatalogRanking(
  _workspaceId: string,
  params?: { days?: number; limit?: number; minLeadScore?: number; excludeBuyers?: boolean },
): Promise<{ contacts: WhatsAppCatalogContact[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.days) {
    qs.set('days', String(params.days));
  }
  if (params?.limit) {
    qs.set('limit', String(params.limit));
  }
  if (params?.minLeadScore !== undefined) {
    qs.set('minLeadScore', String(params.minLeadScore));
  }
  if (params?.excludeBuyers !== undefined) {
    qs.set('excludeBuyers', String(params.excludeBuyers));
  }
  const query = qs.toString();
  const data = await whatsappApiRequest<Record<string, unknown>>(
    `/api/whatsapp-api/catalog/ranking${query}`,
  );
  return extractWhatsAppContactList(data);
}

/** Refresh whats app catalog. */
export async function refreshWhatsAppCatalog(
  _workspaceId: string,
  params?: { days?: number; reason?: string },
): Promise<unknown> {
  return whatsappMutatingRequest(`/api/whatsapp-api/catalog/refresh`, {
    method: 'POST',
    body: { days: params?.days, reason: params?.reason },
  });
}

/** Score whats app catalog. */
export async function scoreWhatsAppCatalog(
  _workspaceId: string,
  params?: { contactId?: string; days?: number; limit?: number; reason?: string },
): Promise<unknown> {
  return whatsappMutatingRequest(`/api/whatsapp-api/catalog/score`, {
    method: 'POST',
    body: params,
  });
}

// ============= WHATSAPP MESSAGING =============

export interface WhatsappTemplate {
  name: string;
  language: string;
  components?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** Connect whatsapp. */
export async function connectWhatsapp(_workspaceId: string): Promise<unknown> {
  // Uses existing session/status endpoint via proxy
  const res = await apiFetch<unknown>(`/api/whatsapp-api/session/status`);
  if (res.error) {
    throw new Error('Failed to connect WhatsApp');
  }
  return res.data;
}

/** Send whatsapp message. */
export async function sendWhatsappMessage(params: {
  workspaceId: string;
  to: string;
  message: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
}): Promise<unknown> {
  const { workspaceId, ...body } = params;
  const res = await apiFetch<unknown>(`/whatsapp/${workspaceId}/send`, {
    method: 'POST',
    body: body,
  });
  if (res.error) {
    throw new Error('Failed to send WhatsApp message');
  }
  return res.data;
}

/** Send whatsapp template. */
export async function sendWhatsappTemplate(params: {
  workspaceId: string;
  to: string;
  templateName: string;
  language: string;
  components?: Array<Record<string, unknown>>;
}): Promise<unknown> {
  // Templates require WhatsApp Business API (not available with Puppeteer/web provider)
  // When Business API is configured, this will call the actual endpoint
  const { workspaceId, ...body } = params;
  const res = await apiFetch<unknown>(`/whatsapp/${workspaceId}/send`, {
    method: 'POST',
    body: { ...body, type: 'template' },
  });
  if (res.error) {
    throw new Error('Templates require WhatsApp Business API');
  }
  return res.data;
}

/** List whatsapp templates. */
export async function listWhatsappTemplates(_workspaceId: string): Promise<WhatsappTemplate[]> {
  // Templates are a WhatsApp Business API feature — not available with web provider
  // Returns empty array with graceful degradation
  return [];
}

/** Whatsapp opt in. */
export async function whatsappOptIn(workspaceId: string, phone: string): Promise<unknown> {
  const res = await apiFetch<unknown>(`/whatsapp/${workspaceId}/opt-in/bulk`, {
    method: 'POST',
    body: { phones: [phone] },
  });
  if (res.error) {
    throw new Error('Failed to opt-in');
  }
  return res.data;
}

/** Whatsapp opt out. */
export async function whatsappOptOut(workspaceId: string, phone: string): Promise<unknown> {
  const res = await apiFetch<unknown>(`/whatsapp/${workspaceId}/opt-out/bulk`, {
    method: 'POST',
    body: { phones: [phone] },
  });
  if (res.error) {
    throw new Error('Failed to opt-out');
  }
  return res.data;
}

/** Whatsapp opt status. */
export async function whatsappOptStatus(workspaceId: string, phone: string): Promise<unknown> {
  const res = await apiFetch<unknown>(
    `/whatsapp/${workspaceId}/opt-status/${encodeURIComponent(phone)}`,
  );
  if (res.error) {
    throw new Error('Failed to get opt status');
  }
  return res.data;
}

// ============= WHATSAPP BRAIN (simulate / status) =============

export async function simulateWhatsAppConversation(
  workspaceId: string,
  customerMessage: string,
  customerPhone: string,
): Promise<{ customerPhone: string; kloelResponse: unknown }> {
  const res = await apiFetch<{ customerPhone: string; kloelResponse: unknown }>(
    `/kloel/whatsapp/simulate/${encodeURIComponent(workspaceId)}`,
    {
      method: 'POST',
      body: { customerMessage, customerPhone },
    },
  );
  if (res.error) {
    throw new Error(res.error || 'Failed to simulate conversation');
  }
  return res.data as { customerPhone: string; kloelResponse: unknown };
}

/** Get whats app brain status. */
export async function getWhatsAppBrainStatus(): Promise<{
  status: string;
  service: string;
  version: string;
}> {
  const res = await apiFetch<unknown>('/kloel/whatsapp/status');
  if (res.error) {
    throw new Error(res.error || 'Failed to get brain status');
  }
  return res.data as { status: string; service: string; version: string };
}
