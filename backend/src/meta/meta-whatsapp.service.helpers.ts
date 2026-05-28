import { decryptMetaToken } from './meta-token-crypto';
import { readRecord, readStrictText } from './read-model/meta-read-helpers';
import {
  buildMediaMessageContent,
  buildTextMessageContent,
  normalizeWhatsAppPhone,
} from './meta-whatsapp.message.helpers';

/**
 * Resolved Meta connection contract — pure, persistence-agnostic view used by
 * {@link MetaWhatsAppService} to resolve workspace OAuth state before issuing
 * any Graph API call.
 */
export type ResolvedMetaConnection = {
  workspaceId: string;
  accessToken: string;
  phoneNumberId: string;
  whatsappBusinessId: string | null;
  pageId: string | null;
  pageName: string | null;
  pageAccessToken: string | null;
  instagramAccountId: string | null;
  instagramUsername: string | null;
  adAccountId: string | null;
  tokenExpired: boolean;
  persistedConnection: boolean;
};

/**
 * Minimal projection of `prisma.metaConnection.findFirst` consumed by the
 * helper builders below. Mirrors the `select` block in
 * {@link MetaWhatsAppService.resolveConnection}.
 */
export type MetaConnectionRow = {
  accessToken?: string | null;
  tokenExpiresAt?: Date | string | null;
  pageId?: string | null;
  pageName?: string | null;
  pageAccessToken?: string | null;
  instagramAccountId?: string | null;
  instagramUsername?: string | null;
  whatsappPhoneNumberId?: string | null;
  whatsappBusinessId?: string | null;
  adAccountId?: string | null;
} | null;

/**
 * Environment slice required to resolve a Meta connection. Reads only the
 * three fallback variables — never logs values, never mutates `process.env`.
 */
export type MetaConnectionEnv = {
  META_ACCESS_TOKEN?: string | null | undefined;
  META_PHONE_NUMBER_ID?: string | null | undefined;
  META_WABA_ID?: string | null | undefined;
};

/**
 * Compute whether `tokenExpiresAt` (if present) is strictly before `now`.
 * Returns `false` for null/undefined/invalid dates so callers can treat
 * missing expiry as "not expired" rather than expired-by-default.
 */
export function computeMetaTokenExpired(
  tokenExpiresAt: Date | string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!tokenExpiresAt) {
    return false;
  }
  const expiresAt = new Date(tokenExpiresAt).getTime();
  if (!Number.isFinite(expiresAt)) {
    return false;
  }
  return expiresAt < now;
}

/**
 * Build the immutable {@link ResolvedMetaConnection} shape from a Prisma
 * `metaConnection` row plus env fallbacks. Pure — no Prisma, no env reads of
 * its own, no logging.
 */
export function buildResolvedMetaConnection(params: {
  workspaceId: string;
  channelSession: MetaConnectionRow;
  env: MetaConnectionEnv;
  now?: number;
}): ResolvedMetaConnection {
  const { workspaceId, channelSession, env, now } = params;
  const accessToken = String(
    decryptMetaToken(channelSession?.accessToken ?? null) || env.META_ACCESS_TOKEN || '',
  ).trim();
  const phoneNumberId = String(
    channelSession?.whatsappPhoneNumberId || env.META_PHONE_NUMBER_ID || '',
  ).trim();
  const whatsappBusinessId = String(
    channelSession?.whatsappBusinessId || env.META_WABA_ID || '',
  ).trim();
  const tokenExpired = computeMetaTokenExpired(channelSession?.tokenExpiresAt ?? null, now);
  return {
    workspaceId,
    accessToken,
    phoneNumberId,
    whatsappBusinessId: whatsappBusinessId || null,
    pageId: channelSession?.pageId || null,
    pageName: channelSession?.pageName || null,
    pageAccessToken: decryptMetaToken(channelSession?.pageAccessToken ?? null),
    instagramAccountId: channelSession?.instagramAccountId || null,
    instagramUsername: channelSession?.instagramUsername || null,
    adAccountId: channelSession?.adAccountId || null,
    tokenExpired,
    persistedConnection: Boolean(channelSession),
  };
}

/**
 * Build the JSON body for `POST {phoneNumberId}/messages` text sends.
 * Caller is responsible for normalising the recipient — we just place it as-is
 * after one trimming pass to match Meta's strict-numeric expectations.
 */
export function buildSendTextMessagePayload(params: {
  to: string;
  message: string;
  quotedMessageId?: string | null;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizeWhatsAppPhone(params.to),
    type: 'text',
    text: buildTextMessageContent(params.message),
  };
  if (params.quotedMessageId) {
    payload.context = {
      message_id: String(params.quotedMessageId).trim(),
    };
  }
  return payload;
}

/**
 * Build the JSON body for `POST {phoneNumberId}/messages` media sends.
 * Mirrors the Meta Cloud API contract where the media-type key (`image`,
 * `video`, `audio`, `document`) carries the link + optional caption.
 */
export function buildSendMediaMessagePayload(params: {
  to: string;
  type: 'image' | 'video' | 'audio' | 'document';
  mediaUrl: string;
  caption?: string;
  quotedMessageId?: string | null;
}): Record<string, unknown> {
  const mediaPayload = buildMediaMessageContent(params.mediaUrl, params.type, params.caption);
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizeWhatsAppPhone(params.to),
    type: params.type,
    [params.type]: mediaPayload,
  };
  if (params.quotedMessageId) {
    payload.context = {
      message_id: String(params.quotedMessageId).trim(),
    };
  }
  return payload;
}

/**
 * Build the JSON body for marking a Meta WhatsApp message as `read`.
 * Static-shape payload — the helper exists so call sites stop carrying
 * the literal around.
 */
export function buildMarkAsReadPayload(messageId: string): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  };
}

/**
 * Discovery payload returned by `MetaWhatsAppService.discoverWhatsAppAssets`.
 */
export type DiscoveredWhatsAppAssets = {
  whatsappBusinessId: string | null;
  whatsappPhoneNumberId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
};

/**
 * Pure parse of the `me/businesses?fields=...owned_whatsapp_business_accounts...`
 * Graph response into a normalised discovery payload. Env fallbacks are folded
 * in by the caller via {@link buildDiscoveryFallback}.
 */
export function extractDiscoveredWhatsAppAssets(
  response: unknown,
  fallback: DiscoveredWhatsAppAssets,
): DiscoveredWhatsAppAssets {
  const root = readRecord(response);
  const businessRows = Array.isArray(root.data) ? root.data : [];
  const firstBusiness = readRecord(businessRows[0]);
  const ownedWhatsappAccounts = firstBusiness.owned_whatsapp_business_accounts;
  const wabaRows = Array.isArray(ownedWhatsappAccounts) ? ownedWhatsappAccounts : [];
  const firstWaba = readRecord(wabaRows[0]);
  const phoneRows = Array.isArray(firstWaba.phone_numbers) ? firstWaba.phone_numbers : [];
  const firstPhone = readRecord(phoneRows[0]);
  return {
    whatsappBusinessId: readStrictText(firstWaba.id) || fallback.whatsappBusinessId || null,
    whatsappPhoneNumberId:
      readStrictText(firstPhone.id) || fallback.whatsappPhoneNumberId || null,
    displayPhoneNumber: readStrictText(firstPhone.display_phone_number) || null,
    verifiedName: readStrictText(firstPhone.verified_name) || null,
  };
}

/**
 * Build the env-derived fallback row for {@link extractDiscoveredWhatsAppAssets}.
 * Trims whitespace and collapses empty strings to `null` so callers can use
 * `??` / `||` safely.
 */
export function buildDiscoveryFallback(env: {
  META_WABA_ID?: string | null | undefined;
  META_PHONE_NUMBER_ID?: string | null | undefined;
}): DiscoveredWhatsAppAssets {
  const envWabaId = String(env.META_WABA_ID || '').trim();
  const envPhoneNumberId = String(env.META_PHONE_NUMBER_ID || '').trim();
  return {
    whatsappBusinessId: envWabaId || null,
    whatsappPhoneNumberId: envPhoneNumberId || null,
    displayPhoneNumber: null,
    verifiedName: null,
  };
}

/**
 * Output of {@link buildPhoneNumberDetailsFromGraphResponse}: just the fields
 * that depend on the Graph response shape; the service merges these into the
 * fuller connection-state DTO returned to callers.
 */
export type ParsedPhoneNumberDetails = {
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  selfIds: string[];
};

/**
 * Parse the `{phoneNumberId}?fields=display_phone_number,verified_name,...`
 * Graph response. Caller decides what to do with `error` — this helper
 * trusts that no error key is present.
 *
 * `verifiedName` falls back to `pageNameFallback` when the Graph response
 * lacks a usable verified name, matching the pre-refactor behaviour.
 */
export function buildPhoneNumberDetailsFromGraphResponse(
  response: unknown,
  pageNameFallback: string | null,
): ParsedPhoneNumberDetails {
  const root = readRecord(response);
  const displayPhoneNumber = readStrictText(root.display_phone_number) ?? null;
  const verifiedName = readStrictText(root.verified_name) || pageNameFallback || null;
  const phoneDigits = normalizeWhatsAppPhone(displayPhoneNumber || '');
  const selfIds = phoneDigits
    ? [`${phoneDigits}@c.us`, `${phoneDigits}@s.whatsapp.net`]
    : [];
  return {
    displayPhoneNumber,
    verifiedName,
    selfIds,
  };
}

/**
 * Compare a requested phone-number ID against the env fallback after the
 * same trimming the service applies. Used as a guard inside
 * `resolveWorkspaceIdByPhoneNumberId` when no `metaConnection` row matched.
 */
export function isMatchingEnvPhoneNumberId(
  phoneNumberId: string,
  envPhoneNumberId: string | null | undefined,
): boolean {
  const normalized = String(phoneNumberId || '').trim();
  if (!normalized) {
    return false;
  }
  const envValue = String(envPhoneNumberId || '').trim();
  return Boolean(envValue) && envValue === normalized;
}
