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
  status?: string;
  qrCode?: string | null;
  provider?: string;
  disconnectReason?: string | null;
  phoneNumber?: string | null;
  pushName?: string | null;
  selfIds?: string[] | null;
  sessionName?: string | null;
  authUrl?: string | null;
  phoneNumberId?: string | null;
  whatsappBusinessId?: string | null;
  lastWebhookAt?: string | null;
  rawStatus?: string | null;
  connectedAt?: string | null;
  lastUpdated?: string;
  lastCatchupError?: string | null;
  lastCatchupFailedAt?: string | null;
  recoveryBlockedReason?: string | null;
  recoveryBlockedAt?: string | null;
  lastCatchupAt?: string | null;
  lastCatchupReason?: string | null;
  lastCatchupImportedMessages?: number | null;
  lastCatchupTouchedChats?: number | null;
  lastCatchupProcessedChats?: number | null;
  lastCatchupOverflow?: boolean | null;
  backfillCursor?: Record<string, unknown> | null;
}

export interface ProviderAutonomySettings {
  mode?: string;
  reason?: string;
  lastTransitionAt?: string;
  reactiveEnabled?: boolean;
  proactiveEnabled?: boolean;
  autoBootstrapOnConnected?: boolean;

  [key: string]: unknown;
}

export interface ProviderCiaRuntime {
  currentRunId?: string | null;
  state?: string;
  mode?: string;
  startedAt?: string;
  autoStarted?: boolean;
  lastProgressAt?: string;
  updatedAt?: string;

  [key: string]: unknown;
}

export interface ProviderAutopilotSettings {
  enabled?: boolean;
  pausedAt?: string;
  enabledByOwnerDecision?: boolean;
  lastMode?: string;
  lastTrigger?: string;
  lastModeAt?: string;

  [key: string]: unknown;
}

export interface ProviderCalendarSettings {
  provider?: 'google' | 'outlook' | 'internal';
  credentials?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    accessToken?: string;
    [key: string]: unknown;
  };

  [key: string]: unknown;
}

export interface ProviderPlanLimitSettings {
  plan?: string;
  aiRequestsPerDay?: number;

  [key: string]: unknown;
}

export interface ProviderSettings {
  whatsappProvider?: string;
  connectionStatus?: string;
  whatsappApiSession?: ProviderSessionSnapshot;
  whatsappWebSession?: ProviderSessionSnapshot;
  autonomy?: ProviderAutonomySettings;
  ciaRuntime?: ProviderCiaRuntime;
  autopilot?: ProviderAutopilotSettings;
  whatsappLifecycle?: Record<string, unknown>;
  guestMode?: boolean;
  anonymousGuest?: boolean;
  workspaceMode?: string;
  authMode?: string;
  billingSuspended?: boolean;
  calendar?: ProviderCalendarSettings;
  planLimits?: ProviderPlanLimitSettings;
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
