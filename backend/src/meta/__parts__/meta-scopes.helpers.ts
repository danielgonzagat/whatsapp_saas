/**
 * Scopes that the Embedded Signup will request per Marketing channel.
 *
 * Kept in a companion so the OAuth controller and the diagnostics endpoint
 * share a single source of truth — operators can verify against the App
 * Review submission without grepping two places.
 */

export type MetaMarketingChannel = 'whatsapp' | 'instagram' | 'facebook';

const COMMON_SCOPES = ['pages_show_list', 'pages_read_engagement', 'business_management'];

const WHATSAPP_SCOPES = [
  ...COMMON_SCOPES,
  'whatsapp_business_management',
  'whatsapp_business_messaging',
];

const INSTAGRAM_SCOPES = [
  ...COMMON_SCOPES,
  'instagram_basic',
  'instagram_manage_messages',
  'instagram_manage_comments',
  'instagram_content_publish',
];

const FACEBOOK_SCOPES = [...COMMON_SCOPES, 'pages_messaging', 'pages_manage_metadata'];

/**
 * Full scope superset requested by buildEmbeddedSignupUrl when the user opens
 * the unified Embedded Signup flow (no channel-specific override). Kept here
 * so /meta/auth/diagnostics and the OAuth URL builder share the same list.
 */
export const EMBEDDED_SIGNUP_SUPERSET_SCOPES: ReadonlyArray<string> = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_messaging',
  'instagram_basic',
  'instagram_manage_messages',
  'instagram_manage_comments',
  'instagram_content_publish',
  'business_management',
  'ads_management',
  'ads_read',
  'catalog_management',
  'whatsapp_business_management',
  'whatsapp_business_messaging',
];

export function getRequestedScopesForChannel(channel: MetaMarketingChannel): string[] {
  if (channel === 'whatsapp') return [...WHATSAPP_SCOPES];
  if (channel === 'instagram') return [...INSTAGRAM_SCOPES];
  return [...FACEBOOK_SCOPES];
}
