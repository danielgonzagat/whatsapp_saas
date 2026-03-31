// WhatsApp Connection API functions
import { apiFetch } from './core';
import type {
  WhatsAppConnectionStatus,
  WhatsAppConnectResponse,
  WhatsAppScreencastTokenResponse,
  WhatsAppProofEntry,
} from './core';

function isConnectedWhatsAppStatus(data: any): boolean {
  const rawStatus = String(data?.status || '').toUpperCase();
  return (
    data?.connected === true ||
    rawStatus === 'CONNECTED' ||
    rawStatus === 'WORKING' ||
    rawStatus === 'CONNECTED'
  );
}

function normalizeWsBase(value: string | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const explicit = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw)
      ? new URL(raw)
      : new URL(
          `${
            typeof window !== 'undefined' && window.location.protocol === 'https:'
              ? 'wss:'
              : 'ws:'
          }//${raw.replace(/^\/+/, '')}`,
        );
    if (explicit.protocol === 'http:') explicit.protocol = 'ws:';
    if (explicit.protocol === 'https:') explicit.protocol = 'wss:';
    return explicit.toString().replace(/\/+$/, '');
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

export function buildWhatsAppScreencastWsUrl(
  workspaceId: string,
  token?: string,
): string {
  const base = getWhatsAppScreencastWsBase();
  if (!base || !workspaceId) {
    return '';
  }

  const safeToken = String(token || '').trim();
  return `${base}/stream/${encodeURIComponent(workspaceId)}?token=${encodeURIComponent(
    safeToken || 'guest',
  )}`;
}

export async function getWhatsAppStatus(_workspaceId: string): Promise<WhatsAppConnectionStatus> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/status`);
  if (res.error) throw new Error(res.error);

  const data = res.data as Record<string, any> | undefined;
  const connected = isConnectedWhatsAppStatus(data);
  const rawStatus = String(data?.status || '');
  const normalizedStatus =
    connected
      ? 'connected'
      : rawStatus === 'SCAN_QR_CODE'
        ? 'qr_pending'
        : rawStatus
          ? rawStatus.toLowerCase()
          : 'disconnected';

  return {
    connected,
    status: normalizedStatus,
    phone: data?.phone || data?.phoneNumber || undefined,
    pushName: data?.pushName || data?.businessName || undefined,
    qrCode: data?.qr || data?.qrCode || data?.qrCodeImage || null,
    message: data?.message,
    provider: data?.provider || data?.providerType,
    workerAvailable:
      typeof data?.workerAvailable === 'boolean' ? data.workerAvailable : true,
    workerHealthy:
      typeof data?.workerHealthy === 'boolean' ? data.workerHealthy : undefined,
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

export async function initiateWhatsAppConnection(_workspaceId: string): Promise<WhatsAppConnectResponse> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/start`, {
    method: 'POST',
  });
  if (res.error) throw new Error(res.error);

  const data = res.data as Record<string, any> | undefined;
  return {
    status: data?.success === false ? 'error' : data?.message === 'already_connected' ? 'already_connected' : data?.qrCode ? 'qr_ready' : 'pending',
    message: data?.message,
    qrCode: data?.qr || data?.qrCode,
    qrCodeImage: data?.qrCodeImage || data?.qr || data?.qrCode,
    error: data?.success === false,
  };
}

export async function getWhatsAppQR(_workspaceId: string): Promise<{ qrCode: string | null; connected: boolean; status?: string; message?: string }> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/qr`);
  if (res.error) throw new Error(res.error);
  const data = res.data as Record<string, any> | undefined;

  if (data?.qr || data?.qrCodeImage || data?.qrCode) {
    return {
      qrCode: data?.qr || data?.qrCodeImage || data?.qrCode || null,
      connected: false,
      status: data?.available ? 'qr_ready' : 'no_qr',
      message: data?.message,
    };
  }

  const statusRes = await apiFetch<any>(`/api/whatsapp-api/session/status`);
  if (statusRes.error) throw new Error(statusRes.error);
  const statusData = statusRes.data as Record<string, any> | undefined;
  const connected = isConnectedWhatsAppStatus(statusData);
  const fallbackQr =
    statusData?.qr ||
    statusData?.qrCode ||
    statusData?.qrCodeImage ||
    null;
  return {
    qrCode: fallbackQr,
    connected,
    status:
      connected
        ? 'connected'
        : data?.available
          ? 'qr_ready'
          : 'no_qr',
    message: data?.message || statusData?.message,
  };
}

export async function disconnectWhatsApp(_workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/disconnect`, {
    method: 'DELETE',
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function logoutWhatsApp(_workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/logout`, {
    method: 'POST',
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function getWhatsAppViewer(_workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/view`);
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function getWhatsAppScreencastToken(
  _workspaceId: string,
): Promise<WhatsAppScreencastTokenResponse> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/stream-token`, {
    method: 'POST',
  });
  if (res.error) throw new Error(res.error);
  return res.data as WhatsAppScreencastTokenResponse;
}

export async function performWhatsAppViewerAction(
  _workspaceId: string,
  action: Record<string, any>,
): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/action`, {
    method: 'POST',
    body: { action },
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function takeoverWhatsAppViewer(_workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/takeover`, {
    method: 'POST',
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function resumeWhatsAppAgent(_workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/resume-agent`, {
    method: 'POST',
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function pauseWhatsAppAgent(
  _workspaceId: string,
  paused = true,
): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/pause-agent`, {
    method: 'POST',
    body: { paused },
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function reconcileWhatsAppSession(
  _workspaceId: string,
  objective?: string,
): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/reconcile`, {
    method: 'POST',
    body: { objective },
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function getWhatsAppProofs(
  _workspaceId: string,
  limit = 12,
): Promise<WhatsAppProofEntry[]> {
  const res = await apiFetch<any>(
    `/api/whatsapp-api/session/proofs?limit=${encodeURIComponent(String(limit))}`,
  );
  if (res.error) throw new Error(res.error);
  const data = res.data as Record<string, any> | undefined;
  return Array.isArray(data?.proofs) ? data.proofs : [];
}

export async function runWhatsAppActionTurn(
  _workspaceId: string,
  objective: string,
  dryRun = false,
  mode?: string,
): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/action-turn`, {
    method: 'POST',
    body: { objective, dryRun, mode },
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

// ============= WHATSAPP SESSION MANAGEMENT (advanced) =============

export async function getWhatsAppSessionDiagnostics(_workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/diagnostics`);
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function forceWhatsAppSessionCheck(_workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/force-check`, {
    method: 'POST',
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function forceWhatsAppReconnect(_workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/force-reconnect`, {
    method: 'POST',
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function repairWhatsAppSessionConfig(_workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/repair-config`, {
    method: 'POST',
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function linkWhatsAppSession(
  _workspaceId: string,
  sessionName: string,
): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/link`, {
    method: 'POST',
    body: { sessionName },
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function recreateWhatsAppSessionIfInvalid(_workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/recreate-if-invalid`, {
    method: 'POST',
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function getWhatsAppProviderStatus(_workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/provider-status`);
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function checkWhatsAppPhone(
  _workspaceId: string,
  phone: string,
): Promise<{ phone: string; registered: boolean }> {
  const res = await apiFetch<any>(
    `/api/whatsapp-api/check/${encodeURIComponent(phone)}`,
  );
  if (res.error) throw new Error(res.error);
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
  [key: string]: any;
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
  const res = await apiFetch<any>(
    `/api/whatsapp-api/catalog/contacts${query ? `?${query}` : ''}`,
  );
  if (res.error) throw new Error(res.error);
  const data = res.data as Record<string, any> | undefined;
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
  const res = await apiFetch<any>(
    `/api/whatsapp-api/catalog/ranking${query ? `?${query}` : ''}`,
  );
  if (res.error) throw new Error(res.error);
  const data = res.data as Record<string, any> | undefined;
  return {
    contacts: Array.isArray(data?.contacts) ? data.contacts : [],
    total: Number(data?.total || 0),
  };
}

export async function refreshWhatsAppCatalog(
  _workspaceId: string,
  params?: { days?: number; reason?: string },
): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/catalog/refresh`, {
    method: 'POST',
    body: { days: params?.days, reason: params?.reason },
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function scoreWhatsAppCatalog(
  _workspaceId: string,
  params?: { contactId?: string; days?: number; limit?: number; reason?: string },
): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/catalog/score`, {
    method: 'POST',
    body: params,
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

// ============= WHATSAPP MESSAGING =============

export interface WhatsappTemplate {
  name: string;
  language: string;
  components?: any[];
  [key: string]: any;
}

export async function connectWhatsapp(workspaceId: string): Promise<any> {
  // Uses existing session/status endpoint via proxy
  const res = await apiFetch<any>(`/api/whatsapp-api/session/status`);
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
}): Promise<any> {
  const { workspaceId, ...body } = params;
  const res = await apiFetch<any>(`/whatsapp/${workspaceId}/send`, {
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
  components?: any[];
}): Promise<any> {
  // Templates require WhatsApp Business API (not available with Puppeteer/web provider)
  // When Business API is configured, this will call the actual endpoint
  const { workspaceId, ...body } = params;
  const res = await apiFetch<any>(`/whatsapp/${workspaceId}/send`, {
    method: 'POST',
    body: { ...body, type: 'template' },
  });
  if (res.error) throw new Error('Templates require WhatsApp Business API');
  return res.data;
}

export async function listWhatsappTemplates(workspaceId: string): Promise<WhatsappTemplate[]> {
  // Templates are a WhatsApp Business API feature — not available with web provider
  // Returns empty array with graceful degradation
  return [];
}

export async function whatsappOptIn(workspaceId: string, phone: string): Promise<any> {
  const res = await apiFetch<any>(`/whatsapp/${workspaceId}/opt-in/bulk`, {
    method: 'POST',
    body: { phones: [phone] },
  });
  if (res.error) throw new Error('Failed to opt-in');
  return res.data;
}

export async function whatsappOptOut(workspaceId: string, phone: string): Promise<any> {
  const res = await apiFetch<any>(`/whatsapp/${workspaceId}/opt-out/bulk`, {
    method: 'POST',
    body: { phones: [phone] },
  });
  if (res.error) throw new Error('Failed to opt-out');
  return res.data;
}

export async function whatsappOptStatus(workspaceId: string, phone: string): Promise<any> {
  const res = await apiFetch<any>(`/whatsapp/${workspaceId}/opt-status/${encodeURIComponent(phone)}`);
  if (res.error) throw new Error('Failed to get opt status');
  return res.data;
}

// ============= WHATSAPP BRAIN (simulate / status) =============

export async function simulateWhatsAppConversation(
  workspaceId: string,
  customerMessage: string,
  customerPhone: string,
): Promise<{ customerPhone: string; kloelResponse: any }> {
  const res = await apiFetch<any>(
    `/kloel/whatsapp/simulate/${encodeURIComponent(workspaceId)}`,
    {
      method: 'POST',
      body: { customerMessage, customerPhone },
    },
  );
  if (res.error) throw new Error(res.error || 'Failed to simulate conversation');
  return res.data as { customerPhone: string; kloelResponse: any };
}

export async function getWhatsAppBrainStatus(): Promise<{
  status: string;
  service: string;
  version: string;
}> {
  const res = await apiFetch<any>('/kloel/whatsapp/status');
  if (res.error) throw new Error(res.error || 'Failed to get brain status');
  return res.data as { status: string; service: string; version: string };
}
