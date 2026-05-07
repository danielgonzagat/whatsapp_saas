import type { ProviderSessionSnapshot } from '../whatsapp/provider-settings.types';
import type {
  NormalizedConnectionStatus,
  WhatsAppProviderType,
} from './provider-status-lookup.util';
import type { BuildSnapshotParams } from './provider-status.types';

export {
  computeDisconnectReason,
  computeNormalizedStatus,
  extractPhoneNumberId,
  extractRawStatus,
} from './provider-status-lookup.util';
export type { NormalizedConnectionStatus, WhatsAppProviderType };
export type { BuildSnapshotParams };

/** Pick waha qr code. */
export function pickWahaQrCode(providerType: WhatsAppProviderType, qrCode: unknown): string | null {
  if (providerType !== 'whatsapp-api') {
    return null;
  }
  if (typeof qrCode !== 'string') {
    return null;
  }
  const trimmed = qrCode.trim();
  return trimmed ? qrCode : null;
}

/** Pick meta auth url. */
export function pickMetaAuthUrl(
  providerType: WhatsAppProviderType,
  authUrl: unknown,
): string | null {
  if (providerType !== 'meta-cloud') {
    return null;
  }
  if (typeof authUrl !== 'string') {
    return null;
  }
  const trimmed = authUrl.trim();
  return trimmed ? authUrl : null;
}

function metaRawStatusFallback(phoneNumberId: string | null): string {
  return phoneNumberId ? 'CONNECTION_INCOMPLETE' : 'DISCONNECTED';
}

function wahaRawStatusFallback(normalizedStatus: NormalizedConnectionStatus): string {
  return normalizedStatus === 'connecting' ? 'SCAN_QR_CODE' : 'DISCONNECTED';
}

/** Resolve raw status fallback. */
export function resolveRawStatusFallback(
  rawStatus: string,
  providerType: WhatsAppProviderType,
  normalizedStatus: NormalizedConnectionStatus,
  phoneNumberId: string | null,
): string {
  if (rawStatus) {
    return rawStatus;
  }
  if (normalizedStatus === 'connected') {
    return 'CONNECTED';
  }
  return providerType === 'meta-cloud'
    ? metaRawStatusFallback(phoneNumberId)
    : wahaRawStatusFallback(normalizedStatus);
}

/** Resolve self ids. */
export function resolveSelfIds(selfIds: string[] | null | undefined): string[] {
  return Array.isArray(selfIds) ? selfIds : [];
}

/** Resolve session name. */
export function resolveSessionName(
  sessionName: string | null | undefined,
  workspaceId: string,
): string {
  const trimmed = String(sessionName || '').trim();
  return trimmed || workspaceId;
}

/** Resolve whatsapp business id. */
export function resolveWhatsappBusinessId(
  providerType: WhatsAppProviderType,
  whatsappBusinessId: string | null | undefined,
): string | null {
  if (providerType !== 'meta-cloud') {
    return null;
  }
  return whatsappBusinessId || null;
}

/** Resolve disconnect reason. */
export function resolveDisconnectReason(
  normalizedStatus: NormalizedConnectionStatus,
  disconnectReason: string,
): string | null {
  return normalizedStatus === 'connected' ? null : disconnectReason;
}

/** Build provider session snapshot. */
export function buildProviderSessionSnapshot(params: BuildSnapshotParams): ProviderSessionSnapshot {
  const {
    providerType,
    session,
    rawStatus,
    normalizedStatus,
    phoneNumberId,
    disconnectReason,
    workspaceId,
  } = params;

  return {
    qrCode: pickWahaQrCode(providerType, session.qrCode),
    status: normalizedStatus,
    authUrl: pickMetaAuthUrl(providerType, session.authUrl),
    selfIds: resolveSelfIds(session.selfIds),
    provider: providerType,
    pushName: session.pushName || null,
    rawStatus: resolveRawStatusFallback(rawStatus, providerType, normalizedStatus, phoneNumberId),
    connectedAt: session.connectedAt || null,
    lastUpdated: session.lastUpdated,
    phoneNumber: session.phoneNumber || null,
    sessionName: resolveSessionName(session.sessionName, workspaceId),
    phoneNumberId,
    disconnectReason: resolveDisconnectReason(normalizedStatus, disconnectReason),
    whatsappBusinessId: resolveWhatsappBusinessId(providerType, session.whatsappBusinessId),
  };
}
