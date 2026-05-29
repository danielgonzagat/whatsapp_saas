import type { ResolvedOAuthRedirect } from './meta-oauth-url.helpers';
import type { MetaMarketingChannel } from './meta-scopes.helpers';
import { readRecord, readStrictText } from '../read-model/meta-read-helpers';

/**
 * Defense-in-depth open-redirect filter for the `returnTo` query param fed
 * back to the user after the Meta OAuth callback completes.
 *
 * Rejects:
 *  - Protocol-relative ("//evil")
 *  - Backslash tricks ("/\\evil")
 *  - URL-encoded slashes/backslashes ("/%2fevil", "/%5cevil")
 *  - CR/LF injection
 *  - Absolute URLs with any scheme
 *  - Anything that does not resolve same-origin against the trusted FRONTEND_URL
 *
 * Falls back to /marketing/<channel> for known marketing channels, otherwise
 * /settings?section=apps.
 */
function isSafeReturnPath(raw: string): boolean {
  const lowerPrefix = raw.slice(0, 4).toLowerCase();
  return (
    raw.length > 0 &&
    raw.length <= 512 &&
    raw.startsWith('/') &&
    !raw.startsWith('//') &&
    !raw.startsWith('/\\') &&
    // ReDoS mitigation: regex checks replaced with safe string operations.
    // All four original patterns were applied to user-supplied `raw` input.
    lowerPrefix !== '/%2f' &&
    lowerPrefix !== '/%5c' &&
    raw.indexOf('\r') === -1 &&
    raw.indexOf('\n') === -1 &&
    raw.indexOf('\t') === -1 &&
    // Scheme-URI guard: replaced /^[a-z][a-z0-9+.-]*:/i with char-level scan
    // (no backtracking). Redundant when startsWith('/') holds, but preserved
    // as defense-in-depth against open-redirect.
    !looksLikeUrlScheme(raw)
  );
}

function resolveSameOriginPath(raw: string, frontendUrl: string): string | null {
  try {
    const parsed = new URL(raw, frontendUrl);
    const base = new URL(frontendUrl);
    if (parsed.origin === base.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    /* fall through */
  }
  return null;
}

export function sanitizeReturnTo(
  requestedReturnTo: string | null | undefined,
  channel: string | null | undefined,
  frontendUrl: string,
): string {
  const raw = String(requestedReturnTo || '').trim();

  if (isSafeReturnPath(raw)) {
    const sameOrigin = resolveSameOriginPath(raw, frontendUrl);
    if (sameOrigin !== null) {
      return sameOrigin;
    }
  }

  const marketingChannel = String(channel || '')
    .trim()
    .toLowerCase();
  if (['whatsapp', 'instagram', 'facebook', 'email'].includes(marketingChannel)) {
    return `/marketing/${marketingChannel}`;
  }

  return '/settings?section=apps';
}

/**
 * Map a Meta Graph API error (numeric code + human-readable text) to a
 * user-facing Portuguese remediation hint. Code-based matches run first
 * because they are more reliable than message regex.
 *
 * Reference: https://developers.facebook.com/docs/graph-api/guides/error-handling/
 */
const META_ERROR_CODE_MESSAGES: ReadonlyArray<readonly [readonly string[], string]> = [
  [['190'], 'O token Meta expirou ou foi revogado. Reconecte o canal para gerar um novo.'],
  [
    ['200', '10', '299'],
    'O usuario nao concedeu todas as permissoes necessarias. Tente conectar novamente marcando todas as opcoes.',
  ],
  [
    ['4', '17', '32', '613'],
    'Limite de requisicoes da Meta atingido. Aguarde alguns minutos e tente novamente.',
  ],
  [
    ['368'],
    'A Meta bloqueou esta acao temporariamente para o seu app. Aguarde algumas horas antes de reenviar.',
  ],
  [
    ['100'],
    'A Meta recusou um parametro obrigatorio. Verifique se o redirect_uri cadastrado bate exatamente com o backend e tente novamente.',
  ],
  [
    ['80004', '131056'],
    'O numero WhatsApp atingiu o limite de mensagens ou nao esta aprovado para o tier atual.',
  ],
];

const META_ERROR_MESSAGE_RULES: ReadonlyArray<readonly [(msg: string) => boolean, string]> = [
  [
    (msg) =>
      msg.includes("url's domain") ||
      msg.includes('app domains') ||
      (msg.includes('url isn') && msg.includes('domain')) ||
      (msg.includes('not in') && msg.includes('domain')) ||
      msg.includes('redirect_uri') ||
      msg.includes('redirect uri'),
    'A URL de retorno nao consta nos dominios do app Meta. Cadastre o backend (ex: api.kloel.com) em "App Domains" + "Allowed Domains" + "OAuth Redirect URIs" e confira BACKEND_PUBLIC_URL / META_OAUTH_REDIRECT_URI.',
  ],
  [
    (msg) => msg.includes('expired') || msg.includes('code has expired'),
    'O codigo de autorizacao Meta expirou. Tente conectar novamente.',
  ],
  [
    (msg) => msg.includes('invalid') && (msg.includes('code') || msg.includes('token')),
    'Codigo de autorizacao Meta invalido ou ja usado. Tente conectar novamente.',
  ],
  [
    (msg) => msg.includes('client_id') || msg.includes('app_id'),
    'A configuracao do app Meta nao foi aceita. Revise META_APP_ID/META_APP_SECRET e o status do app no dashboard.',
  ],
  [
    (msg) => msg.includes('whatsapp') && (msg.includes('not enabled') || msg.includes('disabled')),
    'Seu numero WhatsApp Business ainda nao foi habilitado para o app. Conclua o Embedded Signup ou peca verificacao a Meta.',
  ],
  [
    (msg) => msg.includes('no business') || msg.includes('not associated with'),
    'O usuario Meta nao esta associado a nenhum Business Manager. Crie um em business.facebook.com antes de continuar.',
  ],
  [
    (msg) => msg.includes('no page') || msg.includes('no pages'),
    'O usuario Meta nao possui uma pagina do Facebook associada. Crie a pagina e tente conectar de novo.',
  ],
  [
    (msg) => msg.includes('instagram') && (msg.includes('not connected') || msg.includes('no instagram')),
    'Sua pagina do Facebook nao possui uma conta Instagram Business vinculada. Vincule pela pagina e reconecte.',
  ],
  [
    (msg) => msg.includes('permission') || msg.includes('permissions'),
    'Permissoes insuficientes no app Meta. Verifique os scopes configurados no dashboard.',
  ],
  [
    (msg) => msg.includes('rate') || msg.includes('limit'),
    'Limite de requisicoes da Meta atingido. Aguarde alguns minutos e tente novamente.',
  ],
];

export function humanizeMetaError(rawMessage: string, errorCode?: string | number | null): string {
  const msg = rawMessage.toLowerCase();
  const code = String(errorCode || '').trim();

  for (const [codes, message] of META_ERROR_CODE_MESSAGES) {
    if (codes.includes(code)) {
      return message;
    }
  }

  for (const [matches, message] of META_ERROR_MESSAGE_RULES) {
    if (matches(msg)) {
      return message;
    }
  }

  return 'Nao foi possivel concluir a autenticacao Meta. Tente novamente em instantes.';
}

export interface MetaDiagnosticsPayload {
  redirectUri: string;
  redirectUriSource: ResolvedOAuthRedirect['source'];
  isFallback: boolean;
  backendBaseUrl: string;
  frontendUrl: string;
  appId: string | null;
  appIdSet: boolean;
  appSecretSet: boolean;
  verifyTokenSet: boolean;
  graphApiVersion: string;
  configIds: { whatsapp: boolean; instagram: boolean; messenger: boolean };
  scopes: Record<MetaMarketingChannel, string[]>;
  checklist: {
    /**
     * True when the resolved redirect URI did NOT fall back to localhost — i.e.
     * an env var (BACKEND_PUBLIC_URL / META_OAUTH_REDIRECT_URI / ...) provided
     * a public URL. Does NOT verify the URL is registered in the Meta App
     * console — that check is done by scripts/ops/check-meta-oauth-prod.sh
     * and by hitting the actual OAuth flow.
     */
    backendUrlResolved: boolean;
    appCredentialsPresent: boolean;
    webhookVerifyTokenPresent: boolean;
  };
}

/**
 * Build the JSON payload returned by GET /meta/auth/diagnostics. Pure function
 * over env + resolved redirect + scope lookup so it can be tested without
 * instantiating the controller. Never embeds secret values, only booleans
 * and a masked App ID prefix/suffix.
 */
function firstNonEmptyEnv(env: NodeJS.ProcessEnv, keys: readonly string[]): string {
  for (const key of keys) {
    const value = String(env[key] || '').trim();
    if (value) {
      return value;
    }
  }
  return '';
}

export function buildDiagnosticsPayload(input: {
  env: NodeJS.ProcessEnv;
  resolved: ResolvedOAuthRedirect;
  frontendUrl: string;
  scopesByChannel: Record<MetaMarketingChannel, string[]>;
}): MetaDiagnosticsPayload {
  const { env, resolved, frontendUrl, scopesByChannel } = input;
  const appIdRaw = String(env.META_APP_ID || '').trim();
  const appSecretSet = Boolean(String(env.META_APP_SECRET || '').trim());
  const verifyTokenSet = Boolean(String(env.META_VERIFY_TOKEN || '').trim());

  return {
    redirectUri: resolved.redirectUri,
    redirectUriSource: resolved.source,
    isFallback: resolved.isFallback,
    backendBaseUrl: resolved.baseUrl,
    frontendUrl,
    appId: maskAppId(appIdRaw),
    appIdSet: Boolean(appIdRaw),
    appSecretSet,
    verifyTokenSet,
    graphApiVersion: String(env.META_GRAPH_API_VERSION || 'v21.0').trim(),
    configIds: {
      whatsapp: Boolean(firstNonEmptyEnv(env, ['META_CONFIG_ID_WHATSAPP', 'META_CONFIG_ID'])),
      instagram: Boolean(firstNonEmptyEnv(env, ['META_CONFIG_ID_INSTAGRAM', 'META_CONFIG_ID'])),
      messenger: Boolean(
        firstNonEmptyEnv(env, [
          'META_CONFIG_ID_MESSENGER',
          'META_CONFIG_ID_FACEBOOK',
          'META_CONFIG_ID',
        ]),
      ),
    },
    scopes: scopesByChannel,
    checklist: {
      backendUrlResolved: !resolved.isFallback,
      appCredentialsPresent: Boolean(appIdRaw) && appSecretSet,
      webhookVerifyTokenPresent: verifyTokenSet,
    },
  };
}

/**
 * ReDoS-safe non-regex check: does `s` start with a URL scheme
 * (e.g. javascript:, data:, http:)?  Replaces /^[a-z][a-z0-9+.-]*:/i
 * which could backtrack on long crafted inputs.
 */
function looksLikeUrlScheme(s: string): boolean {
  if (s.length < 2) {
    return false;
  }
  // charAt returns '' for OOB and string (not string|undefined) for in-bounds,
  // satisfying TS strict-null-checks without runtime cost.
  const c0 = s.charAt(0);
  if (!((c0 >= 'a' && c0 <= 'z') || (c0 >= 'A' && c0 <= 'Z'))) {
    return false;
  }
  for (let i = 1; i < s.length; i++) {
    const c = s.charAt(i);
    if (c === ':') {
      return true;
    }
    if (
      !(
        (c >= 'a' && c <= 'z') ||
        (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') ||
        c === '+' ||
        c === '.' ||
        c === '-'
      )
    ) {
      return false;
    }
  }
  return false;
}

/**
 * Mask App ID for the diagnostics endpoint. For IDs <= 8 chars the entire
 * value would be revealed by the prefix+suffix slice, so we return a constant
 * placeholder instead. Longer IDs get the standard prefix…suffix mask.
 */
function maskAppId(raw: string): string | null {
  if (!raw) {
    return null;
  }
  if (raw.length <= 8) {
    return '****';
  }
  return `${raw.slice(0, 4)}…${raw.slice(-4)}`;
}

// ─── State + Graph response shaping ─────────────────────────────────

export interface ParsedOAuthState {
  workspaceId: string;
  channel?: string | null;
  returnTo?: string | null;
}

/**
 * Parse the `state` query parameter Meta echoes back in the OAuth callback.
 *
 * Accepted shapes (in order of preference):
 *  1. URL-encoded JSON: `%7B%22workspaceId%22%3A%22ws-1%22%7D` →
 *     `{ workspaceId, channel?, returnTo? }`
 *  2. Raw JSON: `{"workspaceId":"ws-1"}`
 *  3. Legacy plain workspaceId string: `ws-1`
 *
 * Always returns a value; `workspaceId === ''` signals invalid_state.
 */
export function parseOAuthState(rawState: string | null | undefined): ParsedOAuthState {
  const raw = String(rawState || '').trim();
  if (!raw) {
    return { workspaceId: '' };
  }

  const candidates = [raw];
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded && decoded !== raw) {
      candidates.unshift(decoded);
    }
  } catch {
    void 0;
  }

  for (const candidate of candidates) {
    if (!candidate.startsWith('{')) {
      continue;
    }
    try {
      const parsed = readRecord(JSON.parse(candidate) as unknown);
      return {
        workspaceId: readStrictText(parsed.workspaceId)?.trim() || '',
        channel: readStrictText(parsed.channel)?.trim() || null,
        returnTo: readStrictText(parsed.returnTo)?.trim() || null,
      };
    } catch {
      continue;
    }
  }

  return { workspaceId: raw };
}

interface MetaAuthPageLike {
  id?: unknown;
  name?: unknown;
  access_token?: unknown;
  instagram_business_account?: unknown;
  [key: string]: unknown;
}

export interface PrimaryPageInfo {
  pageId: string | null;
  pageName: string | null;
  pageAccessToken: string | null;
  instagramAccountId: string | null;
  instagramUsername: string | null;
}

/**
 * Extract the first Meta Page from `me/accounts` and its linked Instagram
 * Business Account, if any. Pure shape coercion — defensively typed for the
 * Graph API's permissive responses.
 */
export function extractPrimaryPageInfo(pages: unknown): PrimaryPageInfo {
  const empty: PrimaryPageInfo = {
    pageId: null,
    pageName: null,
    pageAccessToken: null,
    instagramAccountId: null,
    instagramUsername: null,
  };
  if (!Array.isArray(pages) || pages.length === 0) {
    return empty;
  }
  const first = pages[0] as MetaAuthPageLike | undefined;
  if (!first || typeof first !== 'object') {
    return empty;
  }

  const pageId = typeof first.id === 'string' ? first.id : null;
  const pageName = typeof first.name === 'string' ? first.name : null;
  const pageAccessToken = typeof first.access_token === 'string' ? first.access_token : null;

  const igRaw = first.instagram_business_account;
  const ig =
    igRaw && typeof igRaw === 'object' && !Array.isArray(igRaw)
      ? (igRaw as { id?: unknown; username?: unknown })
      : null;
  const instagramAccountId = ig && typeof ig.id === 'string' ? ig.id : null;
  const instagramUsername = ig && typeof ig.username === 'string' ? ig.username : null;

  return { pageId, pageName, pageAccessToken, instagramAccountId, instagramUsername };
}

/**
 * Extract the first ad account ID from `me/adaccounts`. Returns null when the
 * user has no ad accounts or the response shape is unexpected.
 */
export function extractPrimaryAdAccountId(adAccounts: unknown): string | null {
  if (!Array.isArray(adAccounts) || adAccounts.length === 0) {
    return null;
  }
  const first = adAccounts[0] as { id?: unknown } | undefined;
  if (!first || typeof first !== 'object') {
    return null;
  }
  return typeof first.id === 'string' ? first.id : null;
}

// ─── Connection status shaping ──────────────────────────────────────

export interface MetaConnectionStatusRow {
  pageId?: string | null;
  pageName?: string | null;
  instagramAccountId?: string | null;
  instagramUsername?: string | null;
  whatsappPhoneNumberId?: string | null;
  whatsappBusinessId?: string | null;
  adAccountId?: string | null;
  pixelId?: string | null;
  catalogId?: string | null;
  tokenExpiresAt?: Date | null;
}

/**
 * Merge multiple MetaConnection rows (one per channel) into a single record by
 * keeping the first non-empty value for each field. Pure — no mutation of
 * inputs, deterministic over input order.
 */
export function mergeMetaConnections(
  connections: MetaConnectionStatusRow[],
): Record<string, unknown> {
  return connections.reduce<Record<string, unknown>>((acc, c) => {
    if (c.pageId) {
      acc.pageId = c.pageId;
    }
    if (c.pageName) {
      acc.pageName = c.pageName;
    }
    if (c.instagramAccountId) {
      acc.instagramAccountId = c.instagramAccountId;
    }
    if (c.instagramUsername) {
      acc.instagramUsername = c.instagramUsername;
    }
    if (c.whatsappPhoneNumberId) {
      acc.whatsappPhoneNumberId = c.whatsappPhoneNumberId;
    }
    if (c.whatsappBusinessId) {
      acc.whatsappBusinessId = c.whatsappBusinessId;
    }
    if (c.adAccountId) {
      acc.adAccountId = c.adAccountId;
    }
    if (c.pixelId) {
      acc.pixelId = c.pixelId;
    }
    if (c.catalogId) {
      acc.catalogId = c.catalogId;
    }
    if (c.tokenExpiresAt) {
      acc.tokenExpiresAt = c.tokenExpiresAt;
    }
    return acc;
  }, {});
}

/**
 * Project the merged MetaConnection record into the per-channel status shape
 * returned by GET /meta/auth/status. Pure over the merged record.
 */
export function buildMetaChannelsStatus(
  merged: Record<string, unknown>,
): Record<'whatsapp' | 'instagram' | 'messenger' | 'facebook' | 'ads', Record<string, unknown>> {
  return {
    whatsapp: {
      connected: Boolean(merged.whatsappPhoneNumberId),
      provider: 'meta-cloud',
      phoneNumberId: merged.whatsappPhoneNumberId,
      whatsappBusinessId: merged.whatsappBusinessId,
      status: merged.whatsappPhoneNumberId ? 'connected' : 'connection_incomplete',
    },
    instagram: {
      connected: Boolean(merged.instagramAccountId),
      instagramAccountId: merged.instagramAccountId,
      username: merged.instagramUsername,
      status: merged.instagramAccountId ? 'connected' : 'disconnected',
    },
    messenger: {
      connected: Boolean(merged.pageId),
      pageId: merged.pageId,
      status: merged.pageId ? 'connected' : 'disconnected',
    },
    facebook: {
      connected: Boolean(merged.pageId),
      pageId: merged.pageId,
      status: merged.pageId ? 'connected' : 'disconnected',
    },
    ads: {
      connected: Boolean(merged.adAccountId),
      adAccountId: merged.adAccountId,
      status: merged.adAccountId ? 'connected' : 'disconnected',
    },
  };
}
