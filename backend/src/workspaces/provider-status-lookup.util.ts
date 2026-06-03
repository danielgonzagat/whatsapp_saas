import type {
  ProviderSettings,
  ProviderSessionSnapshot,
} from '../marketing/channels/whatsapp/provider-settings.types';
import type { ResolvedWhatsAppProvider } from '../marketing/channels/whatsapp/providers/provider-env';

/** Normalized channel-session status type. */
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
  _providerType: WhatsAppProviderType,
  rawStatus: string,
  phoneNumberId: string | null,
): NormalizedConnectionStatus {
  return resolveMetaStatus(rawStatus, phoneNumberId);
}

/** Meta disconnect reason. */
export function metaDisconnectReason(phoneNumberId: string | null): string {
  return phoneNumberId ? 'meta_whatsapp_phone_number_id_missing' : 'meta_auth_required';
}

/** Compute disconnect reason. */
export function computeDisconnectReason(
  session: ProviderSessionSnapshot,
  _providerType: WhatsAppProviderType,
  _normalizedStatus: NormalizedConnectionStatus,
  phoneNumberId: string | null,
): string {
  const sessionReason = session.disconnectReason;
  if (typeof sessionReason === 'string' && sessionReason.trim()) {
    return sessionReason;
  }
  return metaDisconnectReason(phoneNumberId);
}
