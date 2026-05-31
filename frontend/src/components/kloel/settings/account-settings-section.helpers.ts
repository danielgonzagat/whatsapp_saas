// Pure helpers extracted from account-settings-section.tsx to reduce
// cyclomatic complexity on the initial-load effect. Behaviour is
// byte-identical to the original inline implementation.

export interface AccountProfile {
  /** Name property. */
  name: string;
  /** Email property. */
  email: string;
  /** Phone property. */
  phone: string;
  /** Webhook url property. */
  webhookUrl: string;
  /** Website property. */
  website: string;
}

/** Account preferences shape. */
export interface AccountPreferences {
  /** Language property. */
  language: string;
  /** Timezone property. */
  timezone: string;
  /** Date format property. */
  dateFormat: string;
  /** Email important property. */
  emailImportant: boolean;
  /** Email tips property. */
  emailTips: boolean;
}

/** Account channels shape. */
export interface AccountChannels {
  /** Provider property. */
  provider: string;
  /** Jitter min property. */
  jitterMin: number;
  /** Jitter max property. */
  jitterMax: number;
  /** Email enabled property. */
  emailEnabled: boolean;
}

function toRecord(value: unknown): Record<string, unknown> {
  return (value as Record<string, unknown>) || {};
}

/** Extract account profile. */
export function extractAccountProfile(
  workspace: Record<string, unknown>,
  settings: Record<string, unknown>,
  user: Record<string, unknown>,
): AccountProfile {
  return {
    name: (workspace.name as string) || '',
    email: (user.email as string) || '',
    phone: (settings.phone as string) || '',
    webhookUrl: (settings.webhookUrl as string) || '',
    website: (settings.website as string) || (workspace.customDomain as string) || '',
  };
}

/** Extract account preferences. */
export function extractAccountPreferences(settings: Record<string, unknown>): AccountPreferences {
  const notifications = settings.notifications as Record<string, boolean> | undefined;
  return {
    language: (settings.language as string) || 'pt-BR',
    timezone: (settings.timezone as string) || 'America/Sao_Paulo',
    dateFormat: (settings.dateFormat as string) || 'DD/MM/YYYY',
    emailImportant: notifications?.emailImportant ?? true,
    emailTips: notifications?.emailTips ?? false,
  };
}

/** Extract account channels. */
export function extractAccountChannels(
  workspace: Record<string, unknown>,
  settings: Record<string, unknown>,
  channelData: Record<string, unknown>,
): AccountChannels {
  return {
    provider: (settings.whatsappProvider as string) || 'meta-cloud',
    jitterMin: (workspace.jitterMin as number) || 5,
    jitterMax: (workspace.jitterMax as number) || 15,
    emailEnabled: !!channelData.email,
  };
}

/** Account settings payload shape. */
export interface AccountSettingsPayload {
  /** Profile property. */
  profile: AccountProfile;
  /** Preferences property. */
  preferences: AccountPreferences;
  /** Channels property. */
  channels: AccountChannels;
}

/** Build account settings payload. */
export function buildAccountSettingsPayload(
  workspaceData: unknown,
  authData: unknown,
  channelsData: unknown,
): AccountSettingsPayload {
  const workspace = toRecord(workspaceData);
  const settings = toRecord(workspace.providerSettings);
  const user = toRecord(toRecord(authData).user);
  const channelData = toRecord(channelsData);

  return {
    profile: extractAccountProfile(workspace, settings, user),
    preferences: extractAccountPreferences(settings),
    channels: extractAccountChannels(workspace, settings, channelData),
  };
}

/** Body sent to workspaceApi.updateAccount. */
export interface UpdateAccountBody {
  /** Workspace / account name. */
  name: string;
  /** Business phone. */
  phone: string;
  /** Outbound webhook URL. */
  webhookUrl: string;
  /** Public website / domain. */
  website: string;
  /** IANA timezone identifier. */
  timezone: string;
  /** Locale code (e.g. pt-BR). */
  language: string;
  /** Date format token. */
  dateFormat: string;
  /** Email notification toggles. */
  notifications: {
    /** Important account emails. */
    emailImportant: boolean;
    /** Tips / growth emails. */
    emailTips: boolean;
  };
}

/**
 * Build the request body for workspaceApi.updateAccount from the
 * component's profile + preferences slices. Pure: no I/O, no mutation.
 */
export function buildUpdateAccountBody(
  profile: AccountProfile,
  preferences: AccountPreferences,
): UpdateAccountBody {
  return {
    name: profile.name,
    phone: profile.phone,
    webhookUrl: profile.webhookUrl,
    website: profile.website,
    timezone: preferences.timezone,
    language: preferences.language,
    dateFormat: preferences.dateFormat,
    notifications: {
      emailImportant: preferences.emailImportant,
      emailTips: preferences.emailTips,
    },
  };
}

/** Body sent to workspaceApi.updateChannels. */
export interface UpdateChannelsBody {
  /** Whether the e-mail channel is enabled. */
  email: boolean;
}

/**
 * Build the request body for workspaceApi.updateChannels from the
 * component's channels slice. Pure: no I/O, no mutation.
 */
export function buildUpdateChannelsBody(channels: AccountChannels): UpdateChannelsBody {
  return {
    email: channels.emailEnabled,
  };
}

/**
 * Pick the first non-empty error string from a list of API response
 * envelopes. Returns null when all envelopes are successful. Pure.
 */
export function firstApiError(
  responses: ReadonlyArray<{ error?: string | null | undefined }>,
): string | null {
  for (const response of responses) {
    if (response?.error) {
      return response.error;
    }
  }
  return null;
}

/**
 * Coerce a free-form number input value (string from <input type="number">
 * or already-numeric) into a finite non-negative integer-or-float, defaulting
 * to 0 on empty / NaN. Mirrors the inline `Number(e.target.value || 0)`
 * pattern used previously in the component. Pure.
 */
export function coerceJitterInput(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
