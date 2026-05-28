import { BadRequestException } from '@nestjs/common';

/**
 * Pure helpers for the Meta Embedded Signup OAuth URL builder.
 *
 * Extracted from {@link MetaWhatsAppService} so the URL composition is
 * unit-testable in isolation and so the service file stays under the
 * LOC budget that gates incidental complexity.
 */

export type MetaChannel = 'whatsapp' | 'instagram' | 'facebook';

const COMMON_META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'business_management',
];

/**
 * Scopes requested by the Embedded Signup dialog, per Marketing channel.
 *
 * Note: this differs from {@link getRequestedScopesForChannel} in
 * `meta-scopes.helpers.ts`, which exposes the public diagnostics view.
 * The Embedded Signup flow asks for the runtime-required subset only.
 */
export const CHANNEL_META_SCOPES: Record<MetaChannel, string[]> = {
  whatsapp: [...COMMON_META_SCOPES, 'whatsapp_business_management', 'whatsapp_business_messaging'],
  instagram: [
    ...COMMON_META_SCOPES,
    'instagram_basic',
    'instagram_manage_messages',
    'instagram_manage_comments',
  ],
  facebook: [...COMMON_META_SCOPES, 'pages_messaging'],
};

/**
 * Read the first non-empty value from a prioritized list of env keys.
 * Trims whitespace; empty strings count as missing.
 */
export function readFirstEnv(env: NodeJS.ProcessEnv, keys: string[]): string {
  return keys.map((key) => String(env[key] || '').trim()).find(Boolean) || '';
}

/**
 * Coerce an arbitrary `channel` query/body string into the typed enum.
 * Falls back to 'whatsapp' for unknown values to preserve historical
 * behavior (the WhatsApp Cloud API is the default integration).
 */
export function normalizeMetaChannel(channel?: string | null): MetaChannel {
  const normalized = String(channel || '')
    .trim()
    .toLowerCase();
  if (normalized === 'instagram' || normalized === 'facebook' || normalized === 'whatsapp') {
    return normalized;
  }
  return 'whatsapp';
}

/**
 * Resolve the Meta Embedded Signup `config_id` for a channel from env,
 * honoring channel-specific overrides and a shared fallback.
 *
 * Throws {@link BadRequestException} when no config id is configured —
 * the OAuth dialog cannot be opened without one.
 */
export function readChannelConfigId(env: NodeJS.ProcessEnv, channel: MetaChannel): string {
  const lookup = (primary: string, legacy: string): string =>
    readFirstEnv(env, [primary, legacy, 'META_CONFIG_ID', 'META_EMBEDDED_SIGNUP_CONFIG_ID']);
  if (channel === 'whatsapp') {
    const result = lookup('META_WHATSAPP_CONFIG_ID', 'META_CONFIG_ID_WHATSAPP');
    if (!result) {
      throw new BadRequestException('meta-config-id-missing-for-channel');
    }
    return result;
  }
  if (channel === 'instagram') {
    const result = lookup('META_INSTAGRAM_CONFIG_ID', 'META_CONFIG_ID_INSTAGRAM');
    if (!result) {
      throw new BadRequestException('meta-config-id-missing-for-channel');
    }
    return result;
  }
  const result = readFirstEnv(env, [
    'META_FACEBOOK_CONFIG_ID',
    'META_CONFIG_ID_MESSENGER',
    'META_CONFIG_ID_FACEBOOK',
    'META_CONFIG_ID',
    'META_EMBEDDED_SIGNUP_CONFIG_ID',
  ]);
  if (!result) {
    throw new BadRequestException('meta-config-id-missing-for-channel');
  }
  return result;
}

export interface BuildEmbeddedSignupUrlInput {
  env: NodeJS.ProcessEnv;
  workspaceId: string;
  redirectUri: string;
  options?: { channel?: string | null; returnTo?: string | null };
}

/**
 * Compose the full `dialog/oauth` URL for the Meta Embedded Signup flow.
 *
 * Returns an empty string when `META_APP_ID` (or accepted alias) is not
 * configured — callers render the "connect Meta" affordance as disabled
 * rather than crashing the page.
 *
 * Throws {@link BadRequestException} via {@link readChannelConfigId} when
 * the resolved channel has no `config_id` configured.
 */
export function buildEmbeddedSignupUrl(input: BuildEmbeddedSignupUrlInput): string {
  const { env, workspaceId, redirectUri, options } = input;
  const appId = readFirstEnv(env, ['META_APP_ID', 'FACEBOOK_APP_ID', 'META_CLIENT_ID']);
  if (!appId) {
    return '';
  }
  const channel = normalizeMetaChannel(options?.channel);
  const configId = readChannelConfigId(env, channel);
  const version = String(env.META_GRAPH_API_VERSION || 'v21.0').trim();
  const scopes = CHANNEL_META_SCOPES[channel].join(',');
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: scopes,
    response_type: 'code',
    override_default_response_type: String(true),
    state: JSON.stringify({
      workspaceId,
      channel,
      returnTo: options?.returnTo || null,
    }),
  });
  if (configId) {
    params.set('config_id', configId);
  }
  if (channel === 'whatsapp') {
    params.set('extras', JSON.stringify({ sessionInfoVersion: '3', version: 'v3' }));
  }
  return `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`;
}
