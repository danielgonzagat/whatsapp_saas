import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '../logging/structured-logger';
import { createPublicKey, createVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getTraceHeaders } from '../common/trace-headers';
import { GoogleVerifiedProfile } from './google-auth.service';
import {
  APPLE_ISSUER,
  APPLE_JWKS_URL,
  APPLE_TOKEN_URL,
  type AppleIdentityPayload,
  type AppleJwk,
  type AppleJwksResponse,
  type AppleJwtHeader,
  type AppleTokenResponse,
  type AppleUserHint,
  type AppleVerifiedToken,
  buildAppleName,
  buildClientSecret,
  decodeBase64UrlJson,
  normalizeEmailVerified,
  sanitizeAppleError,
  tokenAudienceIncludes,
} from './apple-auth.support';

export { buildClientSecret };

@Injectable()
export class AppleAuthService {
  private readonly logger = StructuredLogger.from(AppleAuthService.name);
  private jwksCache: { expiresAt: number; keys: AppleJwk[] } | null = null;

  constructor(private readonly config: ConfigService) {}

  async verifyIdentityToken(
    identityToken: string,
  ): Promise<AppleIdentityPayload & { sub: string }> {
    const token = identityToken?.trim();
    if (!token) {
      throw new UnauthorizedException('Identity token Apple ausente.');
    }

    const [rawHeader, rawPayload, rawSig] = token.split('.');
    if (rawHeader === undefined || rawPayload === undefined || rawSig === undefined) {
      throw new UnauthorizedException('Identity token Apple malformado.');
    }

    const header = this.decodeTokenHeader(rawHeader);
    if (header.alg !== 'RS256' || !header.kid) {
      throw new UnauthorizedException('Header do token Apple invalido.');
    }

    const key = await this.findJwk(header.kid);
    this.verifySignature(`${rawHeader}.${rawPayload}`, rawSig, key);

    const payload = this.decodeTokenPayload(rawPayload);
    this.assertIdentityPayload(payload);
    return payload as AppleIdentityPayload & { sub: string };
  }

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
    this.assertAllowedRedirectUri(redirectUri);

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

  private assertAllowedRedirectUri(redirectUri: string): void {
    const normalized = this.normalizeRedirectUri(redirectUri);
    const allowed = this.resolveAllowedRedirectUris();
    if (!allowed.length) {
      this.logger.error('apple_auth_not_configured: APPLE_CALLBACK_URL ausente');
      throw new ServiceUnavailableException('Callback Apple nao configurado no servidor.');
    }
    if (!allowed.includes(normalized)) {
      throw new UnauthorizedException('Redirect URI Apple nao autorizado.');
    }
  }

  private resolveAllowedRedirectUris(): string[] {
    const explicit = [
      this.config.get<string>('APPLE_CALLBACK_URL'),
      this.config.get<string>('APPLE_REDIRECT_URI'),
      this.config.get<string>('APPLE_ALLOWED_REDIRECT_URIS'),
    ];
    const derived = [
      this.config.get<string>('NEXT_PUBLIC_AUTH_URL'),
      this.config.get<string>('AUTH_PUBLIC_URL'),
      this.config.get<string>('AUTH_URL'),
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .map((origin) => this.buildCallbackUrl(origin))
      .filter((value): value is string => Boolean(value));
    return [...explicit, ...derived]
      .filter((value): value is string => typeof value === 'string')
      .flatMap((value) => value.split(','))
      .map((value) => this.normalizeRedirectUri(value))
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index);
  }

  private normalizeRedirectUri(value: string): string {
    try {
      const url = new URL(value.trim());
      url.hash = '';
      return url.toString();
    } catch {
      throw new UnauthorizedException('Redirect URI Apple invalido.');
    }
  }

  private buildCallbackUrl(origin: string): string | null {
    try {
      return new URL('/api/auth/callback/apple', origin).toString();
    } catch {
      return null;
    }
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
    return buildClientSecret({
      clientId: input.clientId,
      teamId: input.teamId || '',
      keyId: input.keyId || '',
      privateKey: input.privateKey || '',
    });
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
