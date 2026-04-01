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
  rawStatus?: string | null;
  connectedAt?: string | null;
  lastUpdated?: string;
  lastCatchupError?: string | null;
  lastCatchupFailedAt?: string | null;
  recoveryBlockedReason?: string | null;
  recoveryBlockedAt?: string | null;
}

export interface ProviderAutonomySettings {
  mode?: string;
  reason?: string;
  lastTransitionAt?: string;
  reactiveEnabled?: boolean;
  proactiveEnabled?: boolean;
  autoBootstrapOnConnected?: boolean;

  [key: string]: any;
}

export interface ProviderCiaRuntime {
  currentRunId?: string | null;
  state?: string;
  mode?: string;
  startedAt?: string;
  autoStarted?: boolean;
  lastProgressAt?: string;
  updatedAt?: string;

  [key: string]: any;
}

export interface ProviderAutopilotSettings {
  enabled?: boolean;
  pausedAt?: string;
  enabledByOwnerDecision?: boolean;
  lastMode?: string;
  lastTrigger?: string;
  lastModeAt?: string;

  [key: string]: any;
}

export interface ProviderSettings {
  whatsappProvider?: string;
  connectionStatus?: string;
  whatsappApiSession?: ProviderSessionSnapshot;
  whatsappWebSession?: ProviderSessionSnapshot;
  autonomy?: ProviderAutonomySettings;
  ciaRuntime?: ProviderCiaRuntime;
  autopilot?: ProviderAutopilotSettings;
  whatsappLifecycle?: Record<string, any>;
  guestMode?: boolean;
  anonymousGuest?: boolean;
  workspaceMode?: string;
  authMode?: string;
  auth?: { anonymous?: boolean; [key: string]: any };

  [key: string]: any;
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
