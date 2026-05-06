/**
 * Type contracts and pure helpers for WhatsAppApiProvider.
 *
 * Extracted from whatsapp-api.provider.ts to keep the provider class file under
 * the architecture touched-file cap. Behavior is unchanged — these are the
 * existing public type exports plus the pure raw-status normalization helpers.
 */

/** Session status shape. */
export interface SessionStatus {
  /** Success property. */
  success: boolean;
  /** State property. */
  state: 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED' | 'CONNECTION_INCOMPLETE' | null;
  /** Message property. */
  message: string;
  /** Phone number property. */
  phoneNumber?: string | null;
  /** Push name property. */
  pushName?: string | null;
  /** Self ids property. */
  selfIds?: string[];
}

/** Qr code response shape. */
export interface QrCodeResponse {
  /** Success property. */
  success: boolean;
  /** Qr property. */
  qr?: string;
  /** Message property. */
  message?: string;
}

/** Normalize waha session status. */
export function normalizeWahaSessionStatus(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const normalized = raw.trim().toUpperCase();
  return normalized || null;
}

/** Map waha session status. */
export function mapWahaSessionStatus(rawStatus: string | null): SessionStatus['state'] {
  switch (rawStatus) {
    case 'CONNECTED':
      return 'CONNECTED';
    case 'CONNECTION_INCOMPLETE':
      return 'CONNECTION_INCOMPLETE';
    case 'DEGRADED':
      return 'DEGRADED';
    case 'DISCONNECTED':
      return 'DISCONNECTED';
    default:
      return null;
  }
}

/** Resolve waha session state. */
export function resolveWahaSessionState(data: Record<string, unknown> | null | undefined): {
  rawStatus: string;
  state: SessionStatus['state'];
} {
  const rawStatus = normalizeWahaSessionStatus(
    data?.state || data?.status || data?.rawStatus || 'DISCONNECTED',
  );

  return {
    rawStatus: rawStatus || 'DISCONNECTED',
    state: mapWahaSessionStatus(rawStatus || 'DISCONNECTED'),
  };
}

/** Waha chat summary shape. */
export interface WahaChatSummary {
  /** Id property. */
  id: string;
  /** Unread count property. */
  unreadCount?: number;
  /** Timestamp property. */
  timestamp?: number;
  /** Last message timestamp property. */
  lastMessageTimestamp?: number;
  /** Last message recv timestamp property. */
  lastMessageRecvTimestamp?: number;
  /** Last message from me property. */
  lastMessageFromMe?: boolean | null;
  /** Name property. */
  name?: string | null;
  /** Contact property. */
  contact?: { pushName?: string; name?: string } | null;
  /** Push name property. */
  pushName?: string | null;
  /** Notify name property. */
  notifyName?: string | null;
  /** Last message property. */
  lastMessage?: {
    _data?: {
      notifyName?: string;
      verifiedBizName?: string;
    };
  } | null;
}

/** Waha chat message shape. */
export interface WahaChatMessage {
  /** Id property. */
  id: string;
  /** From property. */
  from?: string;
  /** To property. */
  to?: string;
  /** From me property. */
  fromMe?: boolean;
  /** Body property. */
  body?: string;
  /** Type property. */
  type?: string;
  /** Has media property. */
  hasMedia?: boolean;
  /** Media url property. */
  mediaUrl?: string;
  /** Mimetype property. */
  mimetype?: string;
  /** Timestamp property. */
  timestamp?: number;
  /** Chat id property. */
  chatId?: string;
  /** Raw property. */
  raw?: Record<string, unknown>;
}

/** Waha lid mapping shape. */
export interface WahaLidMapping {
  /** Lid property. */
  lid: string;
  /** Pn property. */
  pn: string;
}

/** Waha session overview shape. */
export interface WahaSessionOverview {
  /** Name property. */
  name: string;
  /** Success property. */
  success: boolean;
  /** Raw status property. */
  rawStatus: string;
  /** State property. */
  state: SessionStatus['state'];
  /** Phone number property. */
  phoneNumber?: string | null;
  /** Push name property. */
  pushName?: string | null;
}

/** Waha runtime config diagnostics shape. */
export interface WahaRuntimeConfigDiagnostics {
  /** Provider property. */
  provider: 'meta-cloud';
  /** Webhook configured property. */
  webhookConfigured: boolean;
  /** Inbound events configured property. */
  inboundEventsConfigured: boolean;
  /** Events property. */
  events: string[];
  /** Secret configured property. */
  secretConfigured: boolean;
  /** Store enabled property. */
  storeEnabled: boolean;
  /** Store full sync property. */
  storeFullSync: boolean;
  /** App id configured property. */
  appIdConfigured: boolean;
  /** App secret configured property. */
  appSecretConfigured: boolean;
  /** Access token configured property. */
  accessTokenConfigured: boolean;
  /** Phone number id configured property. */
  phoneNumberIdConfigured: boolean;
}

/** Waha session config diagnostics shape. */
export interface WahaSessionConfigDiagnostics {
  /** Session name property. */
  sessionName: string;
  /** Available property. */
  available: boolean;
  /** Raw status property. */
  rawStatus: string | null;
  /** State property. */
  state: SessionStatus['state'];
  /** Phone number property. */
  phoneNumber?: string | null;
  /** Push name property. */
  pushName?: string | null;
  /** Webhook configured property. */
  webhookConfigured: boolean;
  /** Inbound events configured property. */
  inboundEventsConfigured: boolean;
  /** Events property. */
  events: string[];
  /** Secret configured property. */
  secretConfigured: boolean;
  /** Store enabled property. */
  storeEnabled: boolean | null;
  /** Store full sync property. */
  storeFullSync: boolean | null;
  /** Config present property. */
  configPresent: boolean;
  /** Config mismatch property. */
  configMismatch?: boolean;
  /** Mismatch reasons property. */
  mismatchReasons?: string[];
  /** Session restart risk property. */
  sessionRestartRisk?: boolean;
  /** Error property. */
  error?: string;
  /** Auth url property. */
  authUrl?: string;
  /** Phone number id property. */
  phoneNumberId?: string;
  /** Whatsapp business id property. */
  whatsappBusinessId?: string | null;
}
