import type {
  MetaWhatsAppRuntimeConfigDiagnostics,
  MetaWhatsAppSessionConfigDiagnostics,
  WahaSessionOverview,
} from './whatsapp-api.provider.types';

/** Channel session state surfaced by WhatsAppApiProvider responses. */
export type WhatsAppSessionState =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'DEGRADED'
  | 'CONNECTION_INCOMPLETE'
  | null;

/**
 * Returns true when the supplied environment variable name has a non-empty trimmed value.
 * Used to derive the boolean diagnostics flags surfaced by WhatsAppApiProvider.
 */
export function hasEnv(name: string): boolean {
  return Boolean(String(process.env[name] || '').trim());
}

/**
 * Returns true when at least one of the supplied environment variables has a non-empty value.
 * Used for fallbacks where multiple env names map to the same logical capability
 * (e.g. META_VERIFY_TOKEN vs META_WEBHOOK_VERIFY_TOKEN).
 */
export function hasAnyEnv(names: readonly string[]): boolean {
  return names.some((name) => hasEnv(name));
}

/**
 * Maps Meta phone number details into the canonical session-state enum used across the platform.
 * Centralizes the connected → CONNECTED, CONNECTION_INCOMPLETE → CONNECTION_INCOMPLETE,
 * DEGRADED → DEGRADED, otherwise → DISCONNECTED transition.
 */
export function deriveSessionStateFromDetails(details: {
  connected?: boolean;
  status?: string | null;
}): WhatsAppSessionState {
  if (details.connected) {
    return 'CONNECTED';
  }
  if (details.status === 'CONNECTION_INCOMPLETE') {
    return 'CONNECTION_INCOMPLETE';
  }
  if (details.status === 'DEGRADED') {
    return 'DEGRADED';
  }
  return 'DISCONNECTED';
}

/** Compose the canonical WAHA-style chat id (`<phone>@s.whatsapp.net`) from a phone string. */
export function composeWhatsAppChatId(phone: string): string {
  return `${phone}@s.whatsapp.net`;
}

/** Build the WAHA-shaped contact payload returned by WhatsAppApiProvider.getContacts. */
export function mapContactRowToWahaContact(contact: {
  phone: string;
  name?: string | null;
  email?: string | null;
  createdAt: Date;
  updatedAt: Date;
}): {
  id: string;
  phone: string;
  name: string | null;
  pushName: string | null;
  email: string | null;
  source: 'crm';
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: composeWhatsAppChatId(contact.phone),
    phone: contact.phone,
    name: contact.name || null,
    pushName: contact.name || null,
    email: contact.email || null,
    source: 'crm',
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

/** Build the WAHA-shaped chat summary payload returned by WhatsAppApiProvider.getChats. */
export function mapConversationRowToWahaChat(conversation: {
  id: string;
  unreadCount?: number | null;
  lastMessageAt?: Date | null;
  contact?: { phone?: string | null; name?: string | null } | null;
}): {
  id: string;
  phone: string;
  name: string | null;
  unreadCount: number;
  timestamp: number;
  lastMessageAt: string | null;
  source: 'crm';
} {
  const phone = String(conversation.contact?.phone || '').trim();
  const chatId = phone ? composeWhatsAppChatId(phone) : conversation.id;
  const timestamp = conversation.lastMessageAt?.getTime?.() || Date.now();
  return {
    id: chatId,
    phone,
    name: conversation.contact?.name || phone || null,
    unreadCount: conversation.unreadCount || 0,
    timestamp,
    lastMessageAt: conversation.lastMessageAt?.toISOString?.() || null,
    source: 'crm',
  };
}

/** Build the WAHA-shaped message payload returned by WhatsAppApiProvider.getChatMessages. */
export function mapMessageRowToWahaMessage(
  message: {
    id: string;
    content?: string | null;
    direction: string;
    status?: string | null;
    createdAt: Date;
    mediaUrl?: string | null;
    externalId?: string | null;
    type?: string | null;
  },
  phone: string,
): {
  id: string;
  chatId: string;
  phone: string;
  body: string;
  direction: string;
  fromMe: boolean;
  type: string;
  hasMedia: boolean;
  mediaUrl: string | null;
  timestamp: number;
  isoTimestamp: string;
  source: 'crm';
  status: string | null;
} {
  return {
    id: message.externalId || message.id,
    chatId: composeWhatsAppChatId(phone),
    phone,
    body: message.content || '',
    direction: message.direction,
    fromMe: message.direction === 'OUTBOUND',
    type: String(message.type || 'TEXT').toLowerCase(),
    hasMedia: Boolean(message.mediaUrl),
    mediaUrl: message.mediaUrl || null,
    timestamp: message.createdAt.getTime(),
    isoTimestamp: message.createdAt.toISOString(),
    source: 'crm',
    status: message.status || null,
  };
}

/**
 * Clamp the chat-message pagination options to safe ranges:
 * - `limit`: defaults to 100, clamped to [1, 200]
 * - `offset`: defaults to 0, clamped to [0, +∞)
 *
 * Mirrors the inline normalization previously inline in
 * WhatsAppApiProvider.getChatMessages so the same NaN-tolerant `Number(x) || default`
 * semantics are preserved.
 */
export function clampChatMessagePagination(options?: { limit?: number; offset?: number }): {
  take: number;
  skip: number;
} {
  const take = Math.max(1, Math.min(200, Number(options?.limit || 100) || 100));
  const skip = Math.max(0, Number(options?.offset || 0) || 0);
  return { take, skip };
}

/**
 * Build the Meta-cloud runtime config diagnostics surfaced by
 * WhatsAppApiProvider.getRuntimeConfigDiagnostics. Reads env via {@link hasEnv}
 * and {@link hasAnyEnv}, but the assembly itself is pure relative to those
 * boolean inputs and emits a stable shape consumed by the frontend.
 */
export function buildRuntimeConfigDiagnostics(): MetaWhatsAppRuntimeConfigDiagnostics {
  const secretConfigured = hasAnyEnv(['META_APP_SECRET', 'FACEBOOK_APP_SECRET']);
  const verifyTokenConfigured = hasAnyEnv(['META_VERIFY_TOKEN', 'META_WEBHOOK_VERIFY_TOKEN']);
  return {
    provider: 'meta-cloud',
    webhookConfigured: secretConfigured && verifyTokenConfigured,
    inboundEventsConfigured: true,
    events: ['messages', 'message_template_status_update', 'comments'],
    secretConfigured,
    storeEnabled: true,
    storeFullSync: true,
    appIdConfigured: hasAnyEnv(['META_APP_ID', 'FACEBOOK_APP_ID', 'META_CLIENT_ID']),
    appSecretConfigured: secretConfigured,
    accessTokenConfigured: hasEnv('META_ACCESS_TOKEN'),
    phoneNumberIdConfigured: hasEnv('META_PHONE_NUMBER_ID'),
  };
}

/**
 * Build the WAHA session overview list emitted when only the env-configured
 * phone number id is known (no DB-backed sessions). Returns an empty list when
 * the env value is missing or blank.
 */
export function buildEnvBackedSessionOverview(envPhoneNumberId: string): WahaSessionOverview[] {
  const trimmed = String(envPhoneNumberId || '').trim();
  if (!trimmed) {
    return [];
  }
  return [
    {
      name: trimmed,
      success: true,
      rawStatus: 'CONNECTED',
      state: 'CONNECTED',
    },
  ];
}

/**
 * Assemble the session-config diagnostics payload surfaced by
 * WhatsAppApiProvider.getSessionConfigDiagnostics. Encapsulates the exact
 * conditional-spread shape (`error`, `authUrl`, `phoneNumberId` only present
 * when defined and non-null) the frontend relies on.
 */
export function buildSessionConfigDiagnosticsPayload(input: {
  sessionName: string;
  details: {
    status?: string | null;
    phoneNumber?: string | null;
    pushName?: string | null;
    whatsappBusinessId?: string | null;
    connected?: boolean;
    degradedReason?: string | null;
    authUrl?: string | null;
    phoneNumberId?: string | null;
  };
  runtimeConfig: MetaWhatsAppRuntimeConfigDiagnostics;
}): MetaWhatsAppSessionConfigDiagnostics {
  const { sessionName, details, runtimeConfig } = input;
  const degradedReason = details.degradedReason;
  const authUrl = details.authUrl;
  const phoneNumberId = details.phoneNumberId;

  return {
    sessionName,
    available: true,
    rawStatus: details.status || null,
    state: deriveSessionStateFromDetails(details),
    phoneNumber: details.phoneNumber || null,
    pushName: details.pushName || null,
    webhookConfigured: runtimeConfig.webhookConfigured,
    inboundEventsConfigured: runtimeConfig.inboundEventsConfigured,
    events: runtimeConfig.events,
    secretConfigured: runtimeConfig.secretConfigured,
    storeEnabled: true,
    storeFullSync: true,
    configPresent: Boolean(details.phoneNumberId),
    configMismatch: false,
    mismatchReasons: [],
    sessionRestartRisk: false,
    whatsappBusinessId: details.whatsappBusinessId ?? null,
    ...(degradedReason !== undefined && degradedReason !== null ? { error: degradedReason } : {}),
    ...(authUrl !== undefined && authUrl !== null ? { authUrl } : {}),
    ...(phoneNumberId !== undefined && phoneNumberId !== null ? { phoneNumberId } : {}),
  };
}
