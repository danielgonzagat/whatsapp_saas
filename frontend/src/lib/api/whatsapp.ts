// WhatsApp channel API functions — official Meta Cloud API only.
import { apiFetch, buildQuery } from './core';
import {
  createWhatsAppApiError,
  invalidateWhatsApp,
} from './whatsapp-helpers';
import type { WhatsAppConnectResponse, WhatsAppConnectionStatus } from './core';

export type { WhatsAppConnectionStatus, WhatsAppConnectResponse };

type MetaWhatsAppChannelStatus = {
  connected?: boolean;
  phoneNumberId?: string | null;
  whatsappBusinessId?: string | null;
  username?: string | null;
  displayPhoneNumber?: string | null;
  status?: string | null;
};

export type MetaAuthStatusResponse = {
  connected?: boolean;
  tokenExpired?: boolean;
  channels?: {
    whatsapp?: MetaWhatsAppChannelStatus | null;
  };
  whatsappPhoneNumberId?: string | null;
  whatsappBusinessId?: string | null;
  pageName?: string | null;
};

function readString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function readNullableString(value: unknown): string | null {
  return readString(value) || null;
}

function assertMetaPayload<T>(
  res: { data?: T; error?: string; status?: number },
  fallbackError: string,
  missingPayloadError: string,
): T {
  if (res.error) {
    throw createWhatsAppApiError(res.error, res.status);
  }
  if (typeof res.status === 'number' && res.status >= 400) {
    throw createWhatsAppApiError(fallbackError, res.status);
  }
  if (res.data === undefined || res.data === null) {
    throw createWhatsAppApiError(missingPayloadError, res.status);
  }
  return res.data;
}


/** Map a Meta auth payload into the WhatsApp session contract without another network call. */
export function mapMetaAuthStatusToWhatsAppStatus(
  data: MetaAuthStatusResponse,
): WhatsAppConnectionStatus {
  const whatsapp = data.channels?.whatsapp || null;
  const phoneNumberId = readString(whatsapp?.phoneNumberId) || readString(data.whatsappPhoneNumberId);
  const whatsappBusinessId = readNullableString(whatsapp?.whatsappBusinessId || data.whatsappBusinessId);
  const tokenExpired = data.tokenExpired === true;
  const connected = Boolean(whatsapp?.connected || phoneNumberId) && !tokenExpired;
  const status = connected
    ? 'connected'
    : tokenExpired
      ? 'authorization_expired'
      : readString(whatsapp?.status) || 'connection_incomplete';
  const metaOAuthConfigurationMissing = status === 'meta_oauth_configuration_missing';
  const degraded = tokenExpired || metaOAuthConfigurationMissing;
  const degradedReason = tokenExpired
    ? 'meta_token_expired'
    : metaOAuthConfigurationMissing
      ? 'meta_oauth_configuration_missing'
      : null;

  return {
    connected,
    status,
    phone: readString(whatsapp?.displayPhoneNumber),
    pushName: readString(whatsapp?.username || data.pageName),
    phoneNumberId,
    whatsappBusinessId,
    provider: 'meta-cloud',
    workerAvailable: true,
    workerHealthy: connected || !degraded,
    workerError: degradedReason,
    degraded,
    degradedReason,
    takeoverActive: false,
    agentPaused: false,
    proofCount: 0,
  };
}

/** Get the official Meta Cloud WhatsApp status for the current workspace. */
export async function getWhatsAppStatus(_workspaceId: string): Promise<WhatsAppConnectionStatus> {
  const res = await apiFetch<MetaAuthStatusResponse>('/meta/auth/status');
  const data = assertMetaPayload(
    res,
    'Falha ao consultar status oficial da Meta.',
    'Meta status did not return a confirmed payload.',
  );
  return mapMetaAuthStatusToWhatsAppStatus(data);
}

/** Initiate the official Meta OAuth / Embedded Signup flow. */
export async function initiateWhatsAppConnection(
  _workspaceId: string,
): Promise<WhatsAppConnectResponse> {
  const res = await apiFetch<{ url?: string }>('/meta/auth/url' + buildQuery({
    channel: 'whatsapp',
    returnTo: '/whatsapp',
  }));
  const data = assertMetaPayload(
    res,
    'Falha ao iniciar conexao oficial da Meta.',
    'Meta auth URL did not return a confirmed payload.',
  );
  const authUrl = readString(data.url);
  if (!authUrl) {
    throw createWhatsAppApiError('Meta auth URL did not return a confirmed payload.', res.status);
  }
  return {
    status: 'connect_required',
    authUrl,
    message: 'Abrindo autorizacao oficial da Meta.',
  };
}

/** Disconnect the official Meta integration for this workspace. */
export async function disconnectWhatsApp(_workspaceId: string): Promise<unknown> {
  const res = await apiFetch('/meta/auth/disconnect', { method: 'POST' });
  if (res.error) {
    throw createWhatsAppApiError(res.error, res.status);
  }
  invalidateWhatsApp();
  return res.data;
}

/** Reset is an alias for disconnect in the Meta-only channel model. */
export async function logoutWhatsApp(_workspaceId: string): Promise<unknown> {
  return disconnectWhatsApp(_workspaceId);
}
