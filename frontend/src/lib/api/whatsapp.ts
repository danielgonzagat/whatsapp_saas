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

function buildLegacyQrDisabledResponse() {
  return {
    qrCode: null,
    connected: false,
    status: 'legacy_disabled',
    message: 'Runtime legado descontinuado. Use a integração Meta.',
  } as const;
}

function isConnectedWhatsAppStatus(data: Record<string, unknown> | undefined): boolean {
  const rawStatus = String(data?.status || '').toUpperCase();
  return (
    data?.connected === true ||
    rawStatus === 'CONNECTED' ||
    rawStatus === 'WORKING' ||
    rawStatus === 'CONNECTED'
  );
}

function normalizeWhatsAppProviderSurface(value: unknown): string | undefined {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (!normalized) return undefined;
  if (
    normalized === 'whatsapp-api' ||
    normalized === 'waha' ||
    normalized === 'legacy-runtime' ||
    normalized === 'whatsapp-web-agent'
  ) {
    return 'legacy-runtime';
  }
  return normalized;
}

function isLegacyRuntimeProvider(value: unknown): boolean {
  return normalizeWhatsAppProviderSurface(value) === 'legacy-runtime';
}

function normalizeSessionStartMessage(message: unknown): string | undefined {
  const normalized = String(message || '').trim();
  if (!normalized) return undefined;

  switch (normalized) {
    case 'legacy_runtime_disabled':
      return 'O runtime legado foi descontinuado. Abra o fluxo oficial da Meta.';
    case 'meta_embedded_signup_not_configured':
      return 'Meta Embedded Signup não configurado no servidor.';
    default:
      return normalized;
  }
}

function normalizeWsBase(value: string | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const explicit = A_Z_A_Z__A_Z_A_Z_D_RE.test(raw)
      ? new URL(raw)
      : new URL(
          `${
            typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
          }//${raw.replace(PATTERN_RE, '')}`,
        );
    if (explicit.protocol === 'http:') explicit.protocol = 'ws:';
    if (explicit.protocol === 'https:') explicit.protocol = 'wss:';
    return explicit.toString().replace(PATTERN_RE_2, '');
  } catch {
    return '';
  }
}

export function getWhatsAppScreencastWsBase(): string {
  const explicit = normalizeWsBase(process.env.NEXT_PUBLIC_SCREENCAST_WS_URL);
  if (explicit) return explicit;

  if (typeof window !== 'undefined') {
    console.warn('[Kloel] NEXT_PUBLIC_SCREENCAST_WS_URL not set — screencast disabled');
  }
  return '';
}

export function buildWhatsAppScreencastWsUrl(workspaceId: string, token?: string): string {
  const base = getWhatsAppScreencastWsBase();
  if (!base || !workspaceId) {
    return '';
  }

  const safeToken = String(token || '').trim();
  return `${base}/stream/${encodeURIComponent(workspaceId)}?token=${encodeURIComponent(
    safeToken || 'visitor',
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
  qualityRating?: string | null;
  codeVerificationStatus?: string | null;
  nameStatus?: string | null;
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

export async function getWhatsAppStatus(_workspaceId: string): Promise<WhatsAppConnectionStatus> {
  const res = await apiFetch<WhatsAppStatusRaw>(`/api/whatsapp-api/session/status`);
  if (res.error) throw createWhatsAppApiError(res.error, res.status);

  const data = res.data as WhatsAppStatusRaw | undefined;
  const connected = isConnectedWhatsAppStatus(data as Record<string, unknown>);
  const rawStatus = String(data?.status || '');
  const provider = normalizeWhatsAppProviderSurface(data?.provider || data?.providerType);
  const activeProvider = normalizeWhatsAppProviderSurface(data?.activeProvider);
  const legacyRuntime = isLegacyRuntimeProvider(provider || activeProvider);
  const normalizedStatus = connected
    ? 'connected'
    : rawStatus === 'SCAN_QR_CODE' || rawStatus === 'STARTING' || rawStatus === 'OPENING'
      ? 'connecting'
    : rawStatus === 'CONNECTION_INCOMPLETE'
      ? 'connection_incomplete'
      : rawStatus
        ? rawStatus.toLowerCase()
        : 'disconnected';

  return {
    connected,
    status: normalizedStatus,
    phone: data?.phone || data?.phoneNumber || undefined,
    pushName: data?.pushName || data?.businessName || undefined,
    authUrl: data?.authUrl || undefined,
    phoneNumberId: data?.phoneNumberId || undefined,
    whatsappBusinessId: data?.whatsappBusinessId || null,
    qualityRating: data?.qualityRating || null,
    codeVerificationStatus: data?.codeVerificationStatus || null,
    nameStatus: data?.nameStatus || null,
    qrCode: legacyRuntime ? undefined : data?.qr || data?.qrCode || data?.qrCodeImage || undefined,
    message: data?.message,
    provider,
    degradedReason: data?.degradedReason || null,
    workerAvailable: typeof data?.workerAvailable === 'boolean' ? data.workerAvailable : true,
    workerHealthy: typeof data?.workerHealthy === 'boolean' ? data.workerHealthy : undefined,
    workerError: data?.workerError || null,
    degraded: Boolean(data?.degraded),
    qrAvailable: legacyRuntime
      ? false
      : typeof data?.qrAvailable === 'boolean'
        ? data.qrAvailable
        : Boolean(data?.qr || data?.qrCode || data?.qrCodeImage),
    browserSessionStatus: legacyRuntime ? undefined : data?.browserSessionStatus || undefined,
    screencastStatus: legacyRuntime ? undefined : data?.screencastStatus || undefined,
    viewerAvailable: legacyRuntime ? false : Boolean(data?.viewerAvailable),
    takeoverActive: Boolean(data?.takeoverActive),
    agentPaused: Boolean(data?.agentPaused),
    lastObservationAt: data?.lastObservationAt || null,
    lastActionAt: data?.lastActionAt || null,
    observationSummary: data?.observationSummary || null,
    activeProvider: activeProvider || null,
    proofCount: Number(data?.proofCount || 0) || 0,
    viewport: data?.viewport,
  };
}

export async function initiateWhatsAppConnection(
  _workspaceId: string,
): Promise<WhatsAppConnectResponse> {
  const res = await apiFetch<Record<string, unknown>>(`/api/whatsapp-api/session/start`, {
    method: 'POST',
  });
  if (res.error) throw createWhatsAppApiError(res.error, res.status);
  invalidateWhatsApp();

  interface SessionStartData {
    success?: boolean;
    message?: string;
    authUrl?: string;
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
    message: normalizeSessionStartMessage(data?.message),
    authUrl: data?.authUrl,
    error: data?.success === false,
  };
}

export async function getWhatsAppQR(
  _workspaceId: string,
): Promise<{ qrCode: string | null; connected: boolean; status?: string; message?: string }> {
  return buildLegacyQrDisabledResponse();
}

export async function getWhatsAppQrImageOnly(
  _workspaceId: string,
): Promise<{ qrCode: string | null; connected: boolean; status?: string; message?: string }> {
  return buildLegacyQrDisabledResponse();
}

export async function disconnectWhatsApp(_workspaceId: string): Promise<unknown> {
  const res = await apiFetch<unknown>(`/api/whatsapp-api/session/disconnect`, {
    method: 'DELETE',
  });
  if (res.error) throw createWhatsAppApiError(res.error, res.status);
  invalidateWhatsApp();
  return res.data;
}

export async function logoutWhatsApp(_workspaceId: string): Promise<unknown> {
  const res = await apiFetch<unknown>(`/api/whatsapp-api/session/logout`, {
    method: 'POST',
  });
  if (res.error) throw createWhatsAppApiError(res.error, res.status);
  invalidateWhatsApp();
  return res.data;
}

export async function getWhatsAppViewer(_workspaceId: string): Promise<unknown> {
  return {
    success: true,
    provider: 'meta-cloud',
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

export async function performWhatsAppViewerAction(
  _workspaceId: string,
  _action: Record<string, unknown>,
): Promise<unknown> {
  return {
    success: false,
    message: 'Viewer actions nao estao habilitados nesta operacao do WhatsApp.',
  };
}

export async function takeoverWhatsAppViewer(_workspaceId: string): Promise<unknown> {
  return { success: false, message: 'Takeover nao esta habilitado nesta operacao do WhatsApp.' };
}

export async function resumeWhatsAppAgent(_workspaceId: string): Promise<unknown> {
  return {
    success: false,
    message: 'Resume-agent nao esta habilitado nesta operacao do WhatsApp.',
  };
}

export async function pauseWhatsAppAgent(_workspaceId: string, paused = true): Promise<unknown> {
  return {
    success: false,
    paused,
    message: 'Pause-agent nao esta habilitado nesta operacao do WhatsApp.',
  };
}

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

export async function getWhatsAppProofs(
  _workspaceId: string,
  limit = 12,
): Promise<WhatsAppProofEntry[]> {
  void limit;
  return [];
}

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
    message: 'Action turn nao existe no runtime oficial do WhatsApp.',
  };
}

// ============= WHATSAPP SESSION MANAGEMENT (advanced) =============

export async function getWhatsAppSessionDiagnostics(_workspaceId: string): Promise<unknown> {
  const res = await apiFetch<unknown>(`/api/whatsapp-api/session/diagnostics`);
  if (res.error) throw createWhatsAppApiError(res.error, res.status);
  return res.data;
}

export async function forceWhatsAppSessionCheck(_workspaceId: string): Promise<unknown> {
  const res = await apiFetch<unknown>(`/api/whatsapp-api/session/force-check`, {
    method: 'POST',
  });
  if (res.error) throw createWhatsAppApiError(res.error, res.status);
  invalidateWhatsApp();
  return res.data;
}

export async function forceWhatsAppReconnect(_workspaceId: string): Promise<unknown> {
  const res = await apiFetch<unknown>(`/api/whatsapp-api/session/force-reconnect`, {
    method: 'POST',
  });
  if (res.error) throw createWhatsAppApiError(res.error, res.status);
  invalidateWhatsApp();
  return res.data;
}

export async function repairWhatsAppSessionConfig(_workspaceId: string): Promise<unknown> {
  const res = await apiFetch<unknown>(`/api/whatsapp-api/session/repair-config`, {
    method: 'POST',
  });
  if (res.error) throw createWhatsAppApiError(res.error, res.status);
  invalidateWhatsApp();
  return res.data;
}

export async function linkWhatsAppSession(
  _workspaceId: string,
  _sessionName: string,
): Promise<unknown> {
  return {
    success: false,
    provider: 'meta-cloud',
    feature: 'legacy_session_link',
    notSupported: true,
    reason: 'legacy_session_link_not_supported_for_meta_cloud',
    message: 'Descontinuado. Use a integração Meta.',
  };
}

export async function recreateWhatsAppSessionIfInvalid(_workspaceId: string): Promise<unknown> {
  const res = await apiFetch<unknown>(`/api/whatsapp-api/session/recreate-if-invalid`, {
    method: 'POST',
  });
  if (res.error) throw createWhatsAppApiError(res.error, res.status);
  invalidateWhatsApp();
  return res.data;
}

export async function getWhatsAppProviderStatus(_workspaceId: string): Promise<unknown> {
  const res = await apiFetch<unknown>(`/api/whatsapp-api/provider-status`);
  if (res.error) throw createWhatsAppApiError(res.error, res.status);
  return res.data;
}

export async function checkWhatsAppPhone(
  _workspaceId: string,
  phone: string,
): Promise<{ phone: string; registered: boolean }> {
  const res = await apiFetch<unknown>(`/api/whatsapp-api/check/${encodeURIComponent(phone)}`);
  if (res.error) throw createWhatsAppApiError(res.error, res.status);
  return res.data as { phone: string; registered: boolean };
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

export async function getWhatsAppCatalogContacts(
  _workspaceId: string,
  params?: { days?: number; page?: number; limit?: number; onlyCataloged?: boolean },
): Promise<{ contacts: WhatsAppCatalogContact[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.days) qs.set('days', String(params.days));
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.onlyCataloged !== undefined) qs.set('onlyCataloged', String(params.onlyCataloged));
  const query = qs.toString();
  const res = await apiFetch<unknown>(
    `/api/whatsapp-api/catalog/contacts${query ? `?${query}` : ''}`,
  );
  if (res.error) throw createWhatsAppApiError(res.error, res.status);
  const data = res.data as Record<string, unknown> | undefined;
  return {
    contacts: Array.isArray(data?.contacts) ? data.contacts : [],
    total: Number(data?.total || 0),
  };
}

export async function getWhatsAppCatalogRanking(
  _workspaceId: string,
  params?: { days?: number; limit?: number; minLeadScore?: number; excludeBuyers?: boolean },
): Promise<{ contacts: WhatsAppCatalogContact[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.days) qs.set('days', String(params.days));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.minLeadScore !== undefined) qs.set('minLeadScore', String(params.minLeadScore));
  if (params?.excludeBuyers !== undefined) qs.set('excludeBuyers', String(params.excludeBuyers));
  const query = qs.toString();
  const res = await apiFetch<unknown>(
    `/api/whatsapp-api/catalog/ranking${query ? `?${query}` : ''}`,
  );
  if (res.error) throw createWhatsAppApiError(res.error, res.status);
  const data = res.data as Record<string, unknown> | undefined;
  return {
    contacts: Array.isArray(data?.contacts) ? data.contacts : [],
    total: Number(data?.total || 0),
  };
}

export async function refreshWhatsAppCatalog(
  _workspaceId: string,
  params?: { days?: number; reason?: string },
): Promise<unknown> {
  const res = await apiFetch<unknown>(`/api/whatsapp-api/catalog/refresh`, {
    method: 'POST',
    body: { days: params?.days, reason: params?.reason },
  });
  if (res.error) throw createWhatsAppApiError(res.error, res.status);
  invalidateWhatsApp();
  return res.data;
}

export async function scoreWhatsAppCatalog(
  _workspaceId: string,
  params?: { contactId?: string; days?: number; limit?: number; reason?: string },
): Promise<unknown> {
  const res = await apiFetch<unknown>(`/api/whatsapp-api/catalog/score`, {
    method: 'POST',
    body: params,
  });
  if (res.error) throw createWhatsAppApiError(res.error, res.status);
  invalidateWhatsApp();
  return res.data;
}

// ============= WHATSAPP MESSAGING =============

export interface WhatsappTemplate {
  name: string;
  language: string;
  components?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export async function connectWhatsapp(_workspaceId: string): Promise<unknown> {
  // Uses existing session/status endpoint via proxy
  const res = await apiFetch<unknown>(`/api/whatsapp-api/session/status`);
  if (res.error) throw new Error('Failed to connect WhatsApp');
  return res.data;
}

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
  if (res.error) throw new Error('Failed to send WhatsApp message');
  return res.data;
}

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
  if (res.error) throw new Error('Templates require WhatsApp Business API');
  return res.data;
}

export async function listWhatsappTemplates(_workspaceId: string): Promise<WhatsappTemplate[]> {
  // Templates are a WhatsApp Business API feature — not available with web provider
  // Returns empty array with graceful degradation
  return [];
}

export async function whatsappOptIn(workspaceId: string, phone: string): Promise<unknown> {
  const res = await apiFetch<unknown>(`/whatsapp/${workspaceId}/opt-in/bulk`, {
    method: 'POST',
    body: { phones: [phone] },
  });
  if (res.error) throw new Error('Failed to opt-in');
  return res.data;
}

export async function whatsappOptOut(workspaceId: string, phone: string): Promise<unknown> {
  const res = await apiFetch<unknown>(`/whatsapp/${workspaceId}/opt-out/bulk`, {
    method: 'POST',
    body: { phones: [phone] },
  });
  if (res.error) throw new Error('Failed to opt-out');
  return res.data;
}

export async function whatsappOptStatus(workspaceId: string, phone: string): Promise<unknown> {
  const res = await apiFetch<unknown>(
    `/whatsapp/${workspaceId}/opt-status/${encodeURIComponent(phone)}`,
  );
  if (res.error) throw new Error('Failed to get opt status');
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
  if (res.error) throw new Error(res.error || 'Failed to simulate conversation');
  return res.data as { customerPhone: string; kloelResponse: unknown };
}

export async function getWhatsAppBrainStatus(): Promise<{
  status: string;
  service: string;
  version: string;
}> {
  const res = await apiFetch<unknown>('/kloel/whatsapp/status');
  if (res.error) throw new Error(res.error || 'Failed to get brain status');
  return res.data as { status: string; service: string; version: string };
}
