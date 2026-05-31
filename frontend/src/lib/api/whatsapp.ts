// WhatsApp channel session API functions
import { apiFetch } from './core';
import {
  createWhatsAppApiError,
  invalidateWhatsApp,
  isConnectedWhatsAppStatus,
  mapWhatsAppStatusPayload,
  normalizeWhatsAppStatusLabel,
  normalizeWsBase,
  resolveWhatsAppQrConnectedFlag,
  whatsappMutatingRequest,
  type WhatsAppQrImageData,
  type WhatsAppStatusRaw,
} from './whatsapp-helpers';
import type { WhatsAppConnectResponse, WhatsAppConnectionStatus } from './core';

export type { WhatsAppConnectionStatus, WhatsAppConnectResponse };

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

/** Get whats app status. */
export async function getWhatsAppStatus(_workspaceId: string): Promise<WhatsAppConnectionStatus> {
  const res = await apiFetch<WhatsAppStatusRaw>(`/whatsapp-api/session/status`);
  if (res.error) {
    throw createWhatsAppApiError(res.error, res.status);
  }

  const data = res.data as WhatsAppStatusRaw | undefined;
  const connected = isConnectedWhatsAppStatus(data as Record<string, unknown>);
  const rawStatus = String(data?.status || '');
  const normalizedStatus = normalizeWhatsAppStatusLabel(rawStatus, connected);

  return mapWhatsAppStatusPayload(data, connected, normalizedStatus);
}

/** Initiate whats app channel session. */
export async function initiateWhatsAppConnection(
  _workspaceId: string,
): Promise<WhatsAppConnectResponse> {
  const res = await apiFetch<Record<string, unknown>>(`/whatsapp-api/session/start`, {
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
): Promise<{ qrCode: string | null; connected: boolean; status?: string | undefined; message?: string | undefined }> {
  const [qrResponse, statusResponse] = await Promise.all([
    getWhatsAppQrImageOnly(_workspaceId),
    apiFetch<Record<string, unknown>>(`/whatsapp-api/session/status`),
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

/** Get whats app qr image only. */
export async function getWhatsAppQrImageOnly(
  _workspaceId: string,
): Promise<{ qrCode: string | null; connected: boolean; status?: string | undefined; message?: string | undefined }> {
  const qrResponse = await apiFetch<Record<string, unknown>>(`/whatsapp-api/session/qr`);

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
  return whatsappMutatingRequest(`/whatsapp-api/session/disconnect`, { method: 'DELETE' });
}

/** Logout whats app. */
export async function logoutWhatsApp(_workspaceId: string): Promise<unknown> {
  return whatsappMutatingRequest(`/whatsapp-api/session/logout`, { method: 'POST' });
}
