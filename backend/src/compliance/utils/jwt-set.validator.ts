import { createPublicKey, KeyObject } from 'node:crypto';
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decode, JwtPayload, verify } from 'jsonwebtoken';
import { getTraceHeaders } from '../../common/trace-headers';

type Jwk = {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
};

type GoogleJwksResponse = {
  keys?: Jwk[];
};

/** Security event token payload type. */
export type SecurityEventTokenPayload = JwtPayload & {
  events?: Record<string, Record<string, unknown>>;
  sub?: string;
};

/** Jwt set validator. */
@Injectable()
export class JwtSetValidator {
  private readonly jwksUrl = 'https://www.googleapis.com/oauth2/v3/certs';
  private cachedKeys = new Map<string, KeyObject>();
  private cacheExpiresAt = 0;

  constructor(private readonly config: ConfigService) {}

  /** Validate. */
  async validate(rawJwt: string): Promise<SecurityEventTokenPayload> {
    const token = String(rawJwt || '').trim();
    if (!token) {
      throw new UnauthorizedException('Security Event Token ausente.');
    }

    const decoded = decode(token, { complete: true });
    if (!decoded || typeof decoded !== 'object' || typeof decoded.header !== 'object') {
      throw new UnauthorizedException('Security Event Token malformado.');
    }

    const kid = String(decoded.header.kid || '').trim();
    const alg = String(decoded.header.alg || '').trim();
    if (!kid || alg !== 'RS256') {
      throw new UnauthorizedException('Security Event Token inválido.');
    }

    const key = await this.resolveKey(kid);
    const audience =
      this.config.get<string>('GOOGLE_CLIENT_ID') ||
      this.config.get<string>('NEXT_PUBLIC_GOOGLE_CLIENT_ID');
    if (!audience?.trim()) {
      throw new ServiceUnavailableException('GOOGLE_CLIENT_ID não configurado para validar RISC.');
    }

    const payload = verify(token, key, {
      algorithms: ['RS256'],
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: audience.trim(),
    }) as SecurityEventTokenPayload;

    return payload;
  }

  private async resolveKey(kid: string) {
    const now = Date.now();
    if (this.cacheExpiresAt <= now || !this.cachedKeys.has(kid)) {
      await this.refreshKeys();
    }

    const key = this.cachedKeys.get(kid);
    if (!key) {
      throw new UnauthorizedException('Security Event Token assinado com chave desconhecida.');
    }

    return key;
  }

  private async refreshKeys() {
    const response = await fetch(this.jwksUrl, {
      method: 'GET',
      headers: getTraceHeaders(),
      signal: AbortSignal.timeout(15000),
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown_error';
      throw new ServiceUnavailableException(`Falha ao buscar JWKS do Google: ${message}`);
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Falha ao buscar JWKS do Google: status ${response.status}`,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as GoogleJwksResponse;
    const nextKeys = new Map<string, KeyObject>();
    for (const jwk of payload.keys || []) {
      const kid = String(jwk.kid || '').trim();
      if (!kid || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) {
        continue;
      }

      nextKeys.set(
        kid,
        createPublicKey({
          key: {
            kty: 'RSA',
            n: jwk.n,
            e: jwk.e,
          },
          format: 'jwk',
        }),
      );
    }

    if (nextKeys.size === 0) {
      throw new ServiceUnavailableException('Google JWKS retornou zero chaves válidas.');
    }

    this.cachedKeys = nextKeys;
    this.cacheExpiresAt = Date.now() + this.resolveMaxAgeMs(response.headers.get('cache-control'));
  }

  private resolveMaxAgeMs(cacheControl: string | null) {
    const raw = String(cacheControl || '');
    const match = raw.match(/max-age=(\d+)/i);
    if (!match) {
      return 5 * 60 * 1000;
    }

    const seconds = Number.parseInt(match[1] || '300', 10);
    return Number.isFinite(seconds) ? Math.max(seconds, 60) * 1000 : 5 * 60 * 1000;
  }
}
