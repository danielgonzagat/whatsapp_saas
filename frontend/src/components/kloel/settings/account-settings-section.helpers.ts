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
