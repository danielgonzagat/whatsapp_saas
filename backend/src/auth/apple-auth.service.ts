import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, createSign, createVerify, type JsonWebKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getTraceHeaders } from '../common/trace-headers';
import { GoogleVerifiedProfile } from './google-auth.service';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_CLIENT_SECRET_TTL_SECONDS = 60 * 60 * 24 * 180;

type AppleJwtHeader = {
  alg?: string;
  kid?: string;
};

type AppleIdentityPayload = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
};

type AppleJwk = JsonWebKey & {
  kid?: string;
  alg?: string;
};

type AppleJwksResponse = {
  keys?: AppleJwk[];
};

type AppleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type AppleUserHint = {
  name?: { firstName?: string; lastName?: string };
  email?: string;
};

type AppleVerifiedToken = {
  payload: AppleIdentityPayload & { sub: string };
  raw: AppleTokenResponse | null;
};

function sanitizeAppleError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'unknown_error';
}

function decodeBase64UrlJson<T>(segment: string): T {
  const decoded = Buffer.from(segment, 'base64url').toString('utf8');
  return JSON.parse(decoded) as T;
}

function normalizeEmailVerified(value: AppleIdentityPayload['email_verified']): boolean {
  return value === true || value === 'true';
}

function tokenAudienceIncludes(audience: AppleIdentityPayload['aud'], allowed: string[]): boolean {
  if (typeof audience === 'string') {
    return allowed.includes(audience);
  }
  if (Array.isArray(audience)) {
    return audience.some((entry) => allowed.includes(entry));
  }
  return false;
}

function buildAppleName(user?: AppleUserHint | null, email?: string): string {
  const firstName = user?.name?.firstName?.trim() || '';
  const lastName = user?.name?.lastName?.trim() || '';
  const joined = `${firstName} ${lastName}`.trim();
  if (joined) {
    return joined;
  }
  const fallbackEmail = email?.trim();
  return fallbackEmail ? fallbackEmail.split('@')[0] : 'Apple User';
}

/** Sign in with Apple validation and token exchange. */
@Injectable()
export class AppleAuthService {
  private readonly logger = new Logger(AppleAuthService.name);
  private jwksCache: { expiresAt: number; keys: AppleJwk[] } | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Verify an Apple identity token. */
  async verifyIdentityToken(
    identityToken: string,
  ): Promise<AppleIdentityPayload & { sub: string }> {
    const token = identityToken?.trim();
    if (!token) {
      throw new UnauthorizedException('Identity token Apple ausente.');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Identity token Apple malformado.');
    }

    const header = this.decodeTokenHeader(parts[0]);
    if (header.alg !== 'RS256' || !header.kid) {
      throw new UnauthorizedException('Header do token Apple invalido.');
    }

    const key = await this.findJwk(header.kid);
    this.verifySignature(`${parts[0]}.${parts[1]}`, parts[2], key);

    const payload = this.decodeTokenPayload(parts[1]);
    this.assertIdentityPayload(payload);
    return payload as AppleIdentityPayload & { sub: string };
  }

  /** Exchange an authorization code and verify the returned identity token. */
  async verifyAuthorizationCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<AppleVerifiedToken> {
    const code = input.code?.trim();
    const redirectUri = input.redirectUri?.trim();
    if (!code) {
      throw new UnauthorizedException('Codigo Apple ausente.');
    }
    if (!redirectUri) {
      throw new UnauthorizedException('Redirect URI Apple ausente.');
    }

    const config = this.requireClientSecretConfig();
    const clientSecret = this.resolveClientSecret(config);
    const response = await this.exchangeCode({
      clientId: config.clientId,
      clientSecret,
      code,
      redirectUri,
    });

    const identityToken = response.id_token?.trim();
    if (!identityToken) {
      throw new UnauthorizedException('Apple nao retornou identity token.');
    }

    return {
      payload: await this.verifyIdentityToken(identityToken),
      raw: response,
    };
  }

  /** Verify either a code or an identity token and normalize it to the KLOEL profile contract. */
  async verifyCredential(input: {
    identityToken?: string;
    authorizationCode?: string;
    redirectUri?: string;
    user?: AppleUserHint;
  }): Promise<GoogleVerifiedProfile> {
    const verified = input.authorizationCode?.trim()
      ? await this.verifyAuthorizationCode({
          code: input.authorizationCode,
          redirectUri: input.redirectUri || '',
        })
      : {
          payload: await this.verifyIdentityToken(input.identityToken || ''),
          raw: null,
        };

    return this.buildVerifiedProfile(verified.payload, input.user, verified.raw);
  }

  private decodeTokenHeader(segment: string): AppleJwtHeader {
    try {
      return decodeBase64UrlJson<AppleJwtHeader>(segment);
    } catch {
      throw new UnauthorizedException('Header do token Apple invalido.');
    }
  }

  private decodeTokenPayload(segment: string): AppleIdentityPayload {
    try {
      return decodeBase64UrlJson<AppleIdentityPayload>(segment);
    } catch {
      throw new UnauthorizedException('Payload do token Apple invalido.');
    }
  }

  private assertIdentityPayload(payload: AppleIdentityPayload) {
    const allowedClientIds = this.requireAllowedClientIds();
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (payload.iss !== APPLE_ISSUER) {
      throw new UnauthorizedException('Issuer Apple invalido.');
    }
    if (!tokenAudienceIncludes(payload.aud, allowedClientIds)) {
      throw new UnauthorizedException('Audience Apple invalida.');
    }
    if (!payload.sub?.trim()) {
      throw new UnauthorizedException('Identificador Apple ausente.');
    }
    if (!Number.isFinite(payload.exp) || Number(payload.exp) <= nowSeconds) {
      throw new UnauthorizedException('Identity token Apple expirado.');
    }
    if (!Number.isFinite(payload.iat) || Number(payload.iat) > nowSeconds + 300) {
      throw new UnauthorizedException('Identity token Apple emitido no futuro.');
    }
  }

  private async findJwk(kid: string): Promise<AppleJwk> {
    const keys = await this.getJwks();
    const key = keys.find((entry) => entry.kid === kid);
    if (!key) {
      this.jwksCache = null;
      const refreshed = await this.getJwks();
      const refreshedKey = refreshed.find((entry) => entry.kid === kid);
      if (refreshedKey) {
        return refreshedKey;
      }
      throw new UnauthorizedException('Chave publica Apple nao encontrada para o token.');
    }
    return key;
  }

  private async getJwks(): Promise<AppleJwk[]> {
    if (this.jwksCache && this.jwksCache.expiresAt > Date.now()) {
      return this.jwksCache.keys;
    }

    const response = await fetch(APPLE_JWKS_URL, {
      headers: getTraceHeaders(),
      signal: AbortSignal.timeout(15000),
    }).catch((error: unknown) => {
      throw new ServiceUnavailableException(
        `Falha ao consultar chaves Apple: ${sanitizeAppleError(error)}`,
      );
    });

    const payload = (await response.json().catch(() => ({}))) as AppleJwksResponse;
    if (!response.ok || !Array.isArray(payload.keys)) {
      throw new ServiceUnavailableException(`Falha ao consultar chaves Apple: ${response.status}`);
    }

    this.jwksCache = {
      expiresAt: Date.now() + 60 * 60 * 1000,
      keys: payload.keys,
    };
    return payload.keys;
  }

  private verifySignature(signingInput: string, signatureSegment: string, jwk: AppleJwk) {
    const signature = Buffer.from(signatureSegment, 'base64url');
    const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    const verifier = createVerify('RSA-SHA256');
    verifier.update(signingInput);
    verifier.end();
    if (!verifier.verify(publicKey, signature)) {
      throw new UnauthorizedException('Assinatura Apple invalida.');
    }
  }

  private requireAllowedClientIds(): string[] {
    const raw = [
      this.config.get<string>('APPLE_CLIENT_ID'),
      this.config.get<string>('NEXT_PUBLIC_APPLE_CLIENT_ID'),
      this.config.get<string>('APPLE_ALLOWED_CLIENT_IDS'),
    ]
      .filter((value): value is string => typeof value === 'string')
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean);
    const allowed = [...new Set(raw)];
    if (!allowed.length) {
      this.logger.error(
        'apple_auth_not_configured: APPLE_CLIENT_ID/NEXT_PUBLIC_APPLE_CLIENT_ID ausente',
      );
      throw new ServiceUnavailableException('Login com Apple nao configurado no servidor.');
    }
    return allowed;
  }

  private requireClientSecretConfig(): {
    clientId: string;
    teamId?: string;
    keyId?: string;
    privateKey?: string;
  } {
    const clientId = this.requireAllowedClientIds()[0];
    const teamId = this.config.get<string>('APPLE_TEAM_ID')?.trim() || '';
    const keyId =
      this.config.get<string>('APPLE_KEY_ID')?.trim() ||
      this.config.get<string>('APPLE_PRIVATE_KEY_ID')?.trim() ||
      '';
    const privateKey = this.resolvePrivateKey();
    const staticSecret = this.config.get<string>('APPLE_CLIENT_SECRET')?.trim();

    if (!clientId || (!staticSecret && (!teamId || !keyId || !privateKey))) {
      this.logger.error(
        'apple_auth_not_configured: APPLE_CLIENT_ID e APPLE_CLIENT_SECRET ou APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_PRIVATE_KEY ausentes',
      );
      throw new ServiceUnavailableException('Login com Apple nao configurado no servidor.');
    }

    return { clientId, teamId, keyId, privateKey };
  }

  private resolvePrivateKey(): string {
    const direct = this.config.get<string>('APPLE_PRIVATE_KEY')?.trim();
    if (direct) {
      return direct.includes('\\n') ? direct.replace(/\\n/g, '\n') : direct;
    }

    const path = this.config.get<string>('APPLE_PRIVATE_KEY_PATH')?.trim();
    if (!path) {
      return '';
    }

    try {
      return readFileSync(path, 'utf8').trim();
    } catch (error: unknown) {
      this.logger.error(
        'apple_private_key_read_failed: ' + JSON.stringify({ message: sanitizeAppleError(error) }),
      );
      return '';
    }
  }

  private buildClientSecret(input: {
    clientId: string;
    teamId: string;
    keyId: string;
    privateKey: string;
  }): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = { alg: 'ES256', kid: input.keyId };
    const payload = {
      iss: input.teamId,
      iat: issuedAt,
      exp: issuedAt + APPLE_CLIENT_SECRET_TTL_SECONDS,
      aud: APPLE_ISSUER,
      sub: input.clientId,
    };
    const signingInput = `${this.encodeJson(header)}.${this.encodeJson(payload)}`;
    const signer = createSign('SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign({
      key: input.privateKey,
      dsaEncoding: 'ieee-p1363',
    });
    return `${signingInput}.${signature.toString('base64url')}`;
  }

  private resolveClientSecret(input: {
    clientId: string;
    teamId?: string;
    keyId?: string;
    privateKey?: string;
  }): string {
    const staticSecret = this.config.get<string>('APPLE_CLIENT_SECRET')?.trim();
    if (staticSecret) {
      return staticSecret;
    }
    return this.buildClientSecret({
      clientId: input.clientId,
      teamId: input.teamId || '',
      keyId: input.keyId || '',
      privateKey: input.privateKey || '',
    });
  }

  private encodeJson(value: Record<string, string | number>): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private async exchangeCode(input: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
  }): Promise<AppleTokenResponse> {
    const body = new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      grant_type: 'authorization_code',
      redirect_uri: input.redirectUri,
    });

    const response = await fetch(APPLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        ...getTraceHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(15000),
    }).catch((error: unknown) => {
      throw new ServiceUnavailableException(
        `Falha ao validar login Apple: ${sanitizeAppleError(error)}`,
      );
    });

    const payload = (await response.json().catch(() => ({}))) as AppleTokenResponse;
    if (!response.ok || payload.error) {
      const message = payload.error_description?.trim() || payload.error?.trim() || '';
      if (response.status >= 400 && response.status < 500) {
        throw new UnauthorizedException(message || 'Codigo Apple invalido ou expirado.');
      }
      throw new ServiceUnavailableException(
        `Falha ao validar login Apple: ${message || `status ${response.status}`}`,
      );
    }

    return payload;
  }

  private buildVerifiedProfile(
    payload: AppleIdentityPayload & { sub: string },
    user?: AppleUserHint,
    tokenPayload?: AppleTokenResponse | null,
  ): GoogleVerifiedProfile {
    const email = payload.email?.trim().toLowerCase() || user?.email?.trim().toLowerCase() || '';
    const finalEmail = email || `${payload.sub}@privaterelay.appleid.com`;
    const syntheticEmail = !email;
    const expiresInSeconds =
      typeof tokenPayload?.expires_in === 'number' && Number.isFinite(tokenPayload.expires_in)
        ? tokenPayload.expires_in
        : null;

    return {
      provider: 'apple',
      providerId: payload.sub,
      email: finalEmail,
      name: buildAppleName(user, finalEmail),
      image: null,
      emailVerified: normalizeEmailVerified(payload.email_verified),
      accessToken: tokenPayload?.access_token?.trim() || null,
      refreshToken: tokenPayload?.refresh_token?.trim() || null,
      tokenExpiresAt:
        expiresInSeconds && expiresInSeconds > 0
          ? new Date(Date.now() + expiresInSeconds * 1000)
          : null,
      syntheticEmail,
      profileData: {
        syntheticEmail,
        token: tokenPayload
          ? {
              tokenType: tokenPayload.token_type || null,
              expiresIn: expiresInSeconds,
            }
          : null,
      },
    };
  }
}
