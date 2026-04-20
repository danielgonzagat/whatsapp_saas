import type {
  ProviderSettings,
  ProviderSessionSnapshot,
} from '../whatsapp/provider-settings.types';
import type { ResolvedWhatsAppProvider } from '../whatsapp/providers/provider-env';

/** Normalized connection status type. */
export type NormalizedConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'failed'
  | 'disconnected'
  | 'connection_incomplete';

/** Whats app provider type type. */
export type WhatsAppProviderType = ResolvedWhatsAppProvider;

/** Extract raw status. */
export function extractRawStatus(
  session: ProviderSessionSnapshot,
  settings: ProviderSettings,
): string {
  return String(session.rawStatus || session.status || settings.connectionStatus || '')
    .trim()
    .toUpperCase();
}

/** Extract phone number id. */
export function extractPhoneNumberId(
  providerType: WhatsAppProviderType,
  session: ProviderSessionSnapshot,
): string | null {
  if (providerType !== 'meta-cloud') {
    return null;
  }
  const trimmed = String(session.phoneNumberId || '').trim();
  return trimmed || null;
}

/**
 * Maps WAHA raw session statuses to our normalized connection-status vocabulary.
 * Declared as a dispatch table so `resolveWahaStatus` stays at CCN 2 instead
 * of ballooning into a chain of string-OR branches.
 */
const WAHA_STATUS_MAP: Record<string, NormalizedConnectionStatus> = {
  CONNECTED: 'connected',
  WORKING: 'connected',
  SCAN_QR_CODE: 'connecting',
  STARTING: 'connecting',
  OPENING: 'connecting',
  FAILED: 'failed',
};

/** Resolve waha status. */
export function resolveWahaStatus(rawStatus: string): NormalizedConnectionStatus {
  return WAHA_STATUS_MAP[rawStatus] ?? 'disconnected';
}

/** Resolve meta status. */
export function resolveMetaStatus(
  rawStatus: string,
  phoneNumberId: string | null,
): NormalizedConnectionStatus {
  if (rawStatus === 'CONNECTED' || rawStatus === 'WORKING') {
    return 'connected';
  }
  return phoneNumberId ? 'connection_incomplete' : 'disconnected';
}

/** Compute normalized status. */
export function computeNormalizedStatus(
  providerType: WhatsAppProviderType,
  rawStatus: string,
  phoneNumberId: string | null,
): NormalizedConnectionStatus {
  if (providerType === 'whatsapp-api') {
    return resolveWahaStatus(rawStatus);
  }
  return resolveMetaStatus(rawStatus, phoneNumberId);
}

/** Meta disconnect reason. */
export function metaDisconnectReason(phoneNumberId: string | null): string {
  return phoneNumberId ? 'meta_whatsapp_phone_number_id_missing' : 'meta_auth_required';
}

/** Waha disconnect reason. */
export function wahaDisconnectReason(status: NormalizedConnectionStatus): string {
  if (status === 'connecting') {
    return 'waha_qr_pending';
  }
  if (status === 'failed') {
    return 'waha_session_failed';
  }
  return 'waha_session_disconnected';
}

/** Compute disconnect reason. */
export function computeDisconnectReason(
  session: ProviderSessionSnapshot,
  providerType: WhatsAppProviderType,
  normalizedStatus: NormalizedConnectionStatus,
  phoneNumberId: string | null,
): string {
  const sessionReason = session.disconnectReason;
  if (typeof sessionReason === 'string' && sessionReason.trim()) {
    return sessionReason;
  }
  return providerType === 'meta-cloud'
    ? metaDisconnectReason(phoneNumberId)
    : wahaDisconnectReason(normalizedStatus);
}
