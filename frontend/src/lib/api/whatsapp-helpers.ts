// WhatsApp API internal utilities
import { mutate } from 'swr';
import { apiFetch, type WhatsAppConnectionStatus } from './core';

const A_Z_A_Z__A_Z_A_Z_D_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;
const PATTERN_RE = /^\/+/;
const PATTERN_RE_2 = /\/+$/;

export function invalidateWhatsApp() {
  mutate((key: string) => typeof key === 'string' && key.startsWith('/whatsapp'));
}

export interface WhatsAppApiError extends Error {
  status?: number;
}

export function createWhatsAppApiError(message: string, status = 0): WhatsAppApiError {
  const error = new Error(message) as WhatsAppApiError;
  error.status = status;
  return error;
}

export async function whatsappApiRequest<T = unknown>(
  path: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<T> {
  const res = await apiFetch<T>(path, options);
  if (res.error) {
    throw createWhatsAppApiError(res.error, res.status);
  }
  return res.data as T;
}

export async function whatsappMutatingRequest<T = unknown>(
  path: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<T> {
  const data = await whatsappApiRequest<T>(path, options);
  invalidateWhatsApp();
  return data;
}

export const CONNECTED_WHATSAPP_STATUS_LABELS = new Set(['CONNECTED', 'WORKING']);

export function readWhatsAppStatusLabel(data: Record<string, unknown> | undefined): string {
  return String(data?.status || '').toUpperCase();
}

export function isConnectedWhatsAppStatus(data: Record<string, unknown> | undefined): boolean {
  if (data?.connected === true) {
    return true;
  }
  return CONNECTED_WHATSAPP_STATUS_LABELS.has(readWhatsAppStatusLabel(data));
}

export function normalizeWsBase(value: string | undefined): string {
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

export interface WhatsAppStatusRaw {
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

export function normalizeWhatsAppStatusLabel(rawStatus: string, connected: boolean): string {
  if (connected) {
    return 'connected';
  }
  if (rawStatus === 'CONNECTION_INCOMPLETE') {
    return 'connection_incomplete';
  }
  return rawStatus ? rawStatus.toLowerCase() : 'disconnected';
}

export function mapWhatsAppStatusPayload(
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

export interface WhatsAppQrImageData {
  status?: string;
  connected?: boolean;
  qr?: string;
  qrCode?: string;
  message?: string;
}

export function resolveWhatsAppQrConnectedFlag(rawStatus: string, connected?: boolean): boolean {
  return connected === true || rawStatus === 'connected' || rawStatus === 'working';
}

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

export function extractWhatsAppContactList(data: Record<string, unknown> | undefined): {
  contacts: WhatsAppCatalogContact[];
  total: number;
} {
  return {
    contacts: Array.isArray(data?.contacts) ? (data.contacts as WhatsAppCatalogContact[]) : [],
    total: Number(data?.total || 0),
  };
}
