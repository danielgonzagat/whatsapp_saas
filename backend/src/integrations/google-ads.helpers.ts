import * as crypto from 'node:crypto';
import { GoogleAdsApi } from 'google-ads-api';
import { NotConfiguredException } from './exceptions/not-configured.exception';
import { encryptGoogleAdsToken, decryptGoogleAdsToken } from './google-ads-token-crypto';

export const GOOGLE_ADS_PLATFORM = 'google';
const GOOGLE_ADS_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_ADS_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_ADS_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';
export const GOOGLE_ADS_CURRENT_KEY_VERSION = 1;

export interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  [key: string]: unknown;
}

export function resolveGoogleAdsEnv(name: string): string {
  return String(process.env[name] || '').trim();
}

export function maskGoogleAdsToken(token: string): string {
  if (!token || token.length < 8) {
    return '****';
  }
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

export function generateGoogleAdsCodeVerifier(): string {
  return crypto.randomBytes(64).toString('base64url');
}

export function generateGoogleAdsCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function encryptGoogleAdsTokenOrPlain(token?: string): string | null | undefined {
  return encryptGoogleAdsToken(token) || token;
}

export function decryptGoogleAdsTokenOrPlain(token: string | null | undefined): string {
  return decryptGoogleAdsToken(token) || token || '';
}

export function computeGoogleAdsExpiresAt(expiresIn?: number): Date {
  return expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : new Date(Date.now() + 60 * 60 * 1000);
}

export function buildGoogleAdsClientParams() {
  const clientId = resolveGoogleAdsEnv('GOOGLE_ADS_CLIENT_ID');
  const clientSecret = resolveGoogleAdsEnv('GOOGLE_ADS_CLIENT_SECRET');
  const developerToken = resolveGoogleAdsEnv('GOOGLE_ADS_DEVELOPER_TOKEN');

  const missing: string[] = [];
  if (!clientId) {
    missing.push('GOOGLE_ADS_CLIENT_ID');
  }
  if (!clientSecret) {
    missing.push('GOOGLE_ADS_CLIENT_SECRET');
  }
  if (!developerToken) {
    missing.push('GOOGLE_ADS_DEVELOPER_TOKEN');
  }

  if (missing.length > 0) {
    throw new NotConfiguredException(
      `Google Ads provider not configured: missing ${missing.join(', ')}`,
      GOOGLE_ADS_PLATFORM,
      missing,
    );
  }

  return { clientId, clientSecret, developerToken };
}

export function createGoogleAdsApiClient({
  clientId,
  clientSecret,
  developerToken,
}: {
  clientId: string;
  clientSecret: string;
  developerToken: string;
}): GoogleAdsApi {
  return new GoogleAdsApi({
    client_id: clientId,
    client_secret: clientSecret,
    developer_token: developerToken,
  });
}

export function buildGoogleAdsAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  workspaceId: string;
  codeChallenge: string;
}): string {
  const url = new URL(GOOGLE_ADS_AUTH_URL);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_ADS_SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', params.workspaceId);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export function buildGoogleAdsTokenExchangeBody(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): URLSearchParams {
  const body = new URLSearchParams();
  body.set('client_id', params.clientId);
  body.set('client_secret', params.clientSecret);
  body.set('code', params.code);
  body.set('grant_type', 'authorization_code');
  body.set('redirect_uri', params.redirectUri);
  body.set('code_verifier', params.codeVerifier);
  return body;
}

export function buildGoogleAdsRefreshBody(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): URLSearchParams {
  const body = new URLSearchParams();
  body.set('client_id', params.clientId);
  body.set('client_secret', params.clientSecret);
  body.set('refresh_token', params.refreshToken);
  body.set('grant_type', 'refresh_token');
  return body;
}

export async function fetchGoogleAdsToken(body: URLSearchParams): Promise<Response> {
  return fetch(GOOGLE_ADS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(30000),
  });
}

export async function discoverGoogleAdsLoginCustomerId(
  client: GoogleAdsApi,
  refreshToken: string,
): Promise<string | null> {
  const accessible = await client.listAccessibleCustomers(refreshToken);
  const resourceNames = (accessible as { resource_names?: string[] }).resource_names || [];
  const ids = resourceNames.map((rn) => rn.replace('customers/', ''));
  return ids[0] ?? null;
}
