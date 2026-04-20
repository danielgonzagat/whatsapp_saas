/**
 * Shape of the workspace.providerSettings JSON column.
 *
 * Prisma stores this as `JsonValue`, so reads must be cast. Using this
 * interface instead of `any` gives us autocomplete and catches typos.
 *
 * Index signatures use `any` deliberately so the object stays compatible
 * with Prisma's `InputJsonValue` (which rejects `unknown` values).
 */

export interface ProviderSessionSnapshot {
  /** Status property. */
  status?: string;
  /** Qr code property. */
  qrCode?: string | null;
  /** Provider property. */
  provider?: string;
  /** Disconnect reason property. */
  disconnectReason?: string | null;
  /** Phone number property. */
  phoneNumber?: string | null;
  /** Push name property. */
  pushName?: string | null;
  /** Self ids property. */
  selfIds?: string[] | null;
  /** Session name property. */
  sessionName?: string | null;
  /** Auth url property. */
  authUrl?: string | null;
  /** Phone number id property. */
  phoneNumberId?: string | null;
  /** Whatsapp business id property. */
  whatsappBusinessId?: string | null;
  /** Last webhook at property. */
  lastWebhookAt?: string | null;
  /** Raw status property. */
  rawStatus?: string | null;
  /** Connected at property. */
  connectedAt?: string | null;
  /** Last updated property. */
  lastUpdated?: string;
  /** Last catchup error property. */
  lastCatchupError?: string | null;
  /** Last catchup failed at property. */
  lastCatchupFailedAt?: string | null;
  /** Recovery blocked reason property. */
  recoveryBlockedReason?: string | null;
  /** Recovery blocked at property. */
  recoveryBlockedAt?: string | null;
  /** Last catchup at property. */
  lastCatchupAt?: string | null;
  /** Last catchup reason property. */
  lastCatchupReason?: string | null;
  /** Last catchup imported messages property. */
  lastCatchupImportedMessages?: number | null;
  /** Last catchup touched chats property. */
  lastCatchupTouchedChats?: number | null;
  /** Last catchup processed chats property. */
  lastCatchupProcessedChats?: number | null;
  /** Last catchup overflow property. */
  lastCatchupOverflow?: boolean | null;
  /** Backfill cursor property. */
  backfillCursor?: Record<string, unknown> | null;
}

/** Provider autonomy settings shape. */
export interface ProviderAutonomySettings {
  /** Mode property. */
  mode?: string;
  /** Reason property. */
  reason?: string;
  /** Last transition at property. */
  lastTransitionAt?: string;
  /** Reactive enabled property. */
  reactiveEnabled?: boolean;
  /** Proactive enabled property. */
  proactiveEnabled?: boolean;
  /** Auto bootstrap on connected property. */
  autoBootstrapOnConnected?: boolean;

  [key: string]: unknown;
}

/** Provider cia runtime shape. */
export interface ProviderCiaRuntime {
  /** Current run id property. */
  currentRunId?: string | null;
  /** State property. */
  state?: string;
  /** Mode property. */
  mode?: string;
  /** Started at property. */
  startedAt?: string;
  /** Auto started property. */
  autoStarted?: boolean;
  /** Last progress at property. */
  lastProgressAt?: string;
  /** Updated at property. */
  updatedAt?: string;

  [key: string]: unknown;
}

/** Provider autopilot settings shape. */
export interface ProviderAutopilotSettings {
  /** Enabled property. */
  enabled?: boolean;
  /** Paused at property. */
  pausedAt?: string;
  /** Enabled by owner decision property. */
  enabledByOwnerDecision?: boolean;
  /** Last mode property. */
  lastMode?: string;
  /** Last trigger property. */
  lastTrigger?: string;
  /** Last mode at property. */
  lastModeAt?: string;

  [key: string]: unknown;
}

/** Provider calendar settings shape. */
export interface ProviderCalendarSettings {
  /** Provider property. */
  provider?: 'google' | 'outlook' | 'internal';
  /** Credentials property. */
  credentials?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    accessToken?: string;
    [key: string]: unknown;
  };

  [key: string]: unknown;
}

/** Provider plan limit settings shape. */
export interface ProviderPlanLimitSettings {
  /** Plan property. */
  plan?: string;
  /** Ai requests per day property. */
  aiRequestsPerDay?: number;

  [key: string]: unknown;
}

/** Provider settings shape. */
export interface ProviderSettings {
  /** Whatsapp provider property. */
  whatsappProvider?: string;
  /** Connection status property. */
  connectionStatus?: string;
  /** Whatsapp api session property. */
  whatsappApiSession?: ProviderSessionSnapshot;
  /** Whatsapp web session property. */
  whatsappWebSession?: ProviderSessionSnapshot;
  /** Autonomy property. */
  autonomy?: ProviderAutonomySettings;
  /** Cia runtime property. */
  ciaRuntime?: ProviderCiaRuntime;
  /** Autopilot property. */
  autopilot?: ProviderAutopilotSettings;
  /** Whatsapp lifecycle property. */
  whatsappLifecycle?: Record<string, unknown>;
  /** Guest mode property. */
  guestMode?: boolean;
  /** Anonymous guest property. */
  anonymousGuest?: boolean;
  /** Workspace mode property. */
  workspaceMode?: string;
  /** Auth mode property. */
  authMode?: string;
  /** Billing suspended property. */
  billingSuspended?: boolean;
  /** Calendar property. */
  calendar?: ProviderCalendarSettings;
  /** Plan limits property. */
  planLimits?: ProviderPlanLimitSettings;
  /** Auth property. */
  auth?: { anonymous?: boolean; [key: string]: unknown };

  [key: string]: unknown;
}

/**
 * Safely cast a Prisma JsonValue to ProviderSettings.
 * Returns an empty object if the value is null/undefined.
 */
export function asProviderSettings(value: unknown): ProviderSettings {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as ProviderSettings;
  }
  return {};
}
