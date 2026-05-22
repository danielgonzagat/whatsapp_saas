import type { ResolvedOAuthRedirect } from './meta-oauth-url.helpers';
import type { MetaMarketingChannel } from './meta-scopes.helpers';

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
export function sanitizeReturnTo(
  requestedReturnTo: string | null | undefined,
  channel: string | null | undefined,
  frontendUrl: string,
): string {
  const raw = String(requestedReturnTo || '').trim();

  const looksSafe =
    raw.length > 0 &&
    raw.length <= 512 &&
    raw.startsWith('/') &&
    !raw.startsWith('//') &&
    !raw.startsWith('/\\') &&
    !/^\/%2f/i.test(raw) &&
    !/^\/%5c/i.test(raw) &&
    !/[\r\n\t]/.test(raw) &&
    !/^[a-z][a-z0-9+.-]*:/i.test(raw);

  if (looksSafe) {
    try {
      const parsed = new URL(raw, frontendUrl);
      const base = new URL(frontendUrl);
      if (parsed.origin === base.origin) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      /* fall through */
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
export function humanizeMetaError(rawMessage: string, errorCode?: string | number | null): string {
  const msg = rawMessage.toLowerCase();
  const code = String(errorCode || '').trim();

  if (code === '190') {
    return 'O token Meta expirou ou foi revogado. Reconecte o canal para gerar um novo.';
  }
  if (code === '200' || code === '10' || code === '299') {
    return 'O usuario nao concedeu todas as permissoes necessarias. Tente conectar novamente marcando todas as opcoes.';
  }
  if (code === '4' || code === '17' || code === '32' || code === '613') {
    return 'Limite de requisicoes da Meta atingido. Aguarde alguns minutos e tente novamente.';
  }
  if (code === '368') {
    return 'A Meta bloqueou esta acao temporariamente para o seu app. Aguarde algumas horas antes de reenviar.';
  }
  if (code === '100') {
    return 'A Meta recusou um parametro obrigatorio. Verifique se o redirect_uri cadastrado bate exatamente com o backend e tente novamente.';
  }
  if (code === '80004' || code === '131056') {
    return 'O numero WhatsApp atingiu o limite de mensagens ou nao esta aprovado para o tier atual.';
  }

  if (
    msg.includes("url's domain") ||
    msg.includes('app domains') ||
    (msg.includes('url isn') && msg.includes('domain')) ||
    (msg.includes('not in') && msg.includes('domain')) ||
    msg.includes('redirect_uri') ||
    msg.includes('redirect uri')
  ) {
    return 'A URL de retorno nao consta nos dominios do app Meta. Cadastre o backend (ex: api.kloel.com) em "App Domains" + "Allowed Domains" + "OAuth Redirect URIs" e confira BACKEND_PUBLIC_URL / META_OAUTH_REDIRECT_URI.';
  }
  if (msg.includes('expired') || msg.includes('code has expired')) {
    return 'O codigo de autorizacao Meta expirou. Tente conectar novamente.';
  }
  if (msg.includes('invalid') && (msg.includes('code') || msg.includes('token'))) {
    return 'Codigo de autorizacao Meta invalido ou ja usado. Tente conectar novamente.';
  }
  if (msg.includes('client_id') || msg.includes('app_id')) {
    return 'A configuracao do app Meta nao foi aceita. Revise META_APP_ID/META_APP_SECRET e o status do app no dashboard.';
  }
  if (msg.includes('whatsapp') && (msg.includes('not enabled') || msg.includes('disabled'))) {
    return 'Seu numero WhatsApp Business ainda nao foi habilitado para o app. Conclua o Embedded Signup ou peca verificacao a Meta.';
  }
  if (msg.includes('no business') || msg.includes('not associated with')) {
    return 'O usuario Meta nao esta associado a nenhum Business Manager. Crie um em business.facebook.com antes de continuar.';
  }
  if (msg.includes('no page') || msg.includes('no pages')) {
    return 'O usuario Meta nao possui uma pagina do Facebook associada. Crie a pagina e tente conectar de novo.';
  }
  if (
    msg.includes('instagram') &&
    (msg.includes('not connected') || msg.includes('no instagram'))
  ) {
    return 'Sua pagina do Facebook nao possui uma conta Instagram Business vinculada. Vincule pela pagina e reconecte.';
  }
  if (msg.includes('permission') || msg.includes('permissions')) {
    return 'Permissoes insuficientes no app Meta. Verifique os scopes configurados no dashboard.';
  }
  if (msg.includes('rate') || msg.includes('limit')) {
    return 'Limite de requisicoes da Meta atingido. Aguarde alguns minutos e tente novamente.';
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
      whatsapp: Boolean(String(env.META_CONFIG_ID_WHATSAPP || env.META_CONFIG_ID || '').trim()),
      instagram: Boolean(String(env.META_CONFIG_ID_INSTAGRAM || env.META_CONFIG_ID || '').trim()),
      messenger: Boolean(
        String(
          env.META_CONFIG_ID_MESSENGER || env.META_CONFIG_ID_FACEBOOK || env.META_CONFIG_ID || '',
        ).trim(),
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
