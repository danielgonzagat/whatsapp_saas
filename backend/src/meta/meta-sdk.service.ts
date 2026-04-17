import { createHmac } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { validateExternalUrl } from '../common/utils/url-validator';
import { normalizeMetaGraphPath } from './meta-input.util';

export interface GraphApiResponse {
  data?: unknown;
  error?: { message: string; type: string; code: number };
  [key: string]: unknown;
}

@Injectable()
export class MetaSdkService {
  private readonly logger = new Logger(MetaSdkService.name);

  private readonly appId = process.env.META_APP_ID || '';
  private readonly appSecret = process.env.META_APP_SECRET || '';
  private readonly graphApiVersion = process.env.META_GRAPH_API_VERSION || 'v21.0';

  private get baseUrl(): string {
    return `https://graph.facebook.com/${this.graphApiVersion}`;
  }

  constructor(@InjectRedis() private readonly redis: Redis) {}

  // ─── Graph API helpers ───────────────────────────────────────────

  async graphApiGet(
    endpoint: string,
    params: Record<string, string> = {},
    accessToken: string,
  ): Promise<GraphApiResponse> {
    const url = this.buildGraphApiUrl(endpoint);
    url.searchParams.set('access_token', accessToken);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    try {
      validateExternalUrl(url.toString(), new Set(['graph.facebook.com']));
      const res = await fetch(url.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(30000),
      });
      const json = await res.json();

      if (json.error) {
        this.logger.warn(`Graph API GET /${endpoint} error: ${json.error.message}`);
      }

      return json as GraphApiResponse;
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      this.logger.error(`Graph API GET /${endpoint} failed: ${errInstanceofError.message}`);
      throw err;
    }
  }

  async graphApiPost(
    endpoint: string,
    data: Record<string, unknown>,
    accessToken: string,
  ): Promise<GraphApiResponse> {
    const url = this.buildGraphApiUrl(endpoint);

    try {
      validateExternalUrl(url.toString(), new Set(['graph.facebook.com']));
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, access_token: accessToken }),
        signal: AbortSignal.timeout(30000),
      });
      const json = await res.json();

      if (json.error) {
        this.logger.warn(`Graph API POST /${endpoint} error: ${json.error.message}`);
      }

      return json as GraphApiResponse;
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      this.logger.error(`Graph API POST /${endpoint} failed: ${errInstanceofError.message}`);
      throw err;
    }
  }

  async graphApiDelete(endpoint: string, accessToken: string): Promise<GraphApiResponse> {
    const url = this.buildGraphApiUrl(endpoint);
    url.searchParams.set('access_token', accessToken);

    try {
      validateExternalUrl(url.toString(), new Set(['graph.facebook.com']));
      const res = await fetch(url.toString(), {
        method: 'DELETE',
        signal: AbortSignal.timeout(30000),
      });
      const json = await res.json();

      if (json.error) {
        this.logger.warn(`Graph API DELETE /${endpoint} error: ${json.error.message}`);
      }

      return json as GraphApiResponse;
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      this.logger.error(`Graph API DELETE /${endpoint} failed: ${errInstanceofError.message}`);
      throw err;
    }
  }

  private buildGraphApiUrl(endpoint: string): URL {
    const safeEndpoint = normalizeMetaGraphPath(endpoint, 'Meta endpoint');
    const baseUrl = new URL(`${this.baseUrl}/`);
    const pathname = baseUrl.pathname.endsWith('/')
      ? baseUrl.pathname.slice(0, -1)
      : baseUrl.pathname;
    baseUrl.pathname = `${pathname}/${safeEndpoint}`;
    return baseUrl;
  }

  // ─── Token exchange ──────────────────────────────────────────────

  /**
   * Exchange a short-lived token for a long-lived token (60-day expiry).
   */
  async exchangeToken(shortLivedToken: string): Promise<{
    access_token: string;
    token_type: string;
    expires_in?: number;
  }> {
    try {
      const res = await this.graphApiGet(
        'oauth/access_token',
        {
          grant_type: 'fb_exchange_token',
          client_id: this.appId,
          client_secret: this.appSecret,
          fb_exchange_token: shortLivedToken,
        },
        shortLivedToken,
      );

      if (res.error) {
        throw new Error(res.error.message);
      }

      return {
        access_token: typeof res.access_token === 'string' ? res.access_token : '',
        token_type: typeof res.token_type === 'string' ? res.token_type : 'bearer',
        expires_in: typeof res.expires_in === 'number' ? res.expires_in : undefined,
      };
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      this.logger.error(`Token exchange failed: ${errInstanceofError.message}`);
      throw err;
    }
  }

  /**
   * Returns an app-level access token (app_id|app_secret).
   */
  getAppAccessToken(): string {
    return `${this.appId}|${this.appSecret}`;
  }

  // ─── Webhook signature validation ────────────────────────────────

  /**
   * Validates the X-Hub-Signature-256 header from Meta webhooks.
   * Returns true if valid.
   */
  validateWebhookSignature(payload: string | Buffer, signature: string): boolean {
    if (!this.appSecret) {
      this.logger.warn('META_APP_SECRET not set — cannot validate webhook');
      return false;
    }

    const expected = `sha256=${createHmac('sha256', this.appSecret).update(payload).digest('hex')}`;

    return expected === signature;
  }

  // ─── Rate limiting ───────────────────────────────────────────────

  /**
   * Redis-based rate limiter for Meta API calls.
   * Instagram: 200 calls/hr, Ads: 1000 calls/hr.
   * Returns true if the call is allowed, false if rate-limited.
   */
  async checkRateLimit(
    accountId: string,
    platform: 'instagram' | 'ads' | 'graph',
  ): Promise<boolean> {
    const limits: Record<string, number> = {
      instagram: 200,
      ads: 1000,
      graph: 500,
    };

    const limit = limits[platform] || 500;
    const key = `meta:ratelimit:${platform}:${accountId}`;

    try {
      const current = await this.redis.incr(key);

      // Set TTL on first call (1 hour window)
      if (current === 1) {
        await this.redis.expire(key, 3600);
      }

      if (current > limit) {
        this.logger.warn(`Rate limit exceeded for ${platform}:${accountId} (${current}/${limit})`);
        return false;
      }

      return true;
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      // If Redis is unavailable, allow the call (fail open)
      this.logger.warn(`Rate limit check failed (Redis): ${errInstanceofError.message}`);
      return true;
    }
  }
}
