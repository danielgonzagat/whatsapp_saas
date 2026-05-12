import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { MetaSdkService } from './meta-sdk.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { REDIS_MODULE_CONNECTION_TOKEN, REDIS_MODULE_CONNECTION } from '@nestjs-modules/ioredis';

function buildSignature(secret: string, payload: string): string {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

function createMockFetch() {
  return jest.fn<typeof fetch>();
}

function createMockRedis() {
  return {
    incr: jest.fn<(...args: unknown[]) => Promise<number>>(),
    expire: jest.fn<(...args: unknown[]) => Promise<number>>(),
  };
}

function createMockOpsAlert() {
  return {
    alertOnCriticalError: jest.fn<(...args: unknown[]) => Promise<void>>(),
    alertOnDegradation: jest.fn<(...args: unknown[]) => Promise<void>>(),
  };
}

async function buildModule(
  appId = 'test-app-id',
  appSecret = 'test-app-secret',
): Promise<{
  module: TestingModule;
  redis: ReturnType<typeof createMockRedis>;
  opsAlert: ReturnType<typeof createMockOpsAlert>;
}> {
  const redis = createMockRedis();
  const opsAlert = createMockOpsAlert();

  process.env.META_APP_ID = appId;
  process.env.META_APP_SECRET = appSecret;

  const module = await Test.createTestingModule({
    providers: [
      MetaSdkService,
      {
        provide: `${REDIS_MODULE_CONNECTION}_${REDIS_MODULE_CONNECTION_TOKEN}`,
        useValue: redis,
      },
      { provide: OpsAlertService, useValue: opsAlert },
    ],
  }).compile();

  return { module, redis, opsAlert };
}

describe('MetaSdkService', () => {
  let service: MetaSdkService;
  let mockRedis: ReturnType<typeof createMockRedis>;
  let mockOpsAlert: ReturnType<typeof createMockOpsAlert>;

  beforeEach(async () => {
    const result = await buildModule();
    service = result.module.get<MetaSdkService>(MetaSdkService);
    mockRedis = result.redis;
    mockOpsAlert = result.opsAlert;
  });

  // ── graphApiGet ──

  describe('graphApiGet', () => {
    it('returns parsed JSON on success', async () => {
      const mockFetch = createMockFetch().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: '1' }] })),
      );
      globalThis.fetch = mockFetch;

      const result = await service.graphApiGet('me', {}, 'token');

      expect(result).toEqual({ data: [{ id: '1' }] });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const urlArg = mockFetch.mock.calls[0][0] as string;
      expect(urlArg).toContain('graph.facebook.com');
      expect(urlArg).toContain('access_token=token');
    });

    it('returns error object when Graph API responds with error', async () => {
      const errorBody = {
        error: { message: 'Invalid token', type: 'OAuthException', code: 190 },
      };
      const mockFetch = createMockFetch().mockResolvedValue(
        new Response(JSON.stringify(errorBody)),
      );
      globalThis.fetch = mockFetch;

      const result = await service.graphApiGet('me', {}, 'bad-token');

      expect(result).toEqual(errorBody);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toBe('Invalid token');
    });

    it('throws and alerts on network failure', async () => {
      const networkError = new Error('ECONNREFUSED');
      const mockFetch = createMockFetch().mockRejectedValue(networkError);
      globalThis.fetch = mockFetch;

      await expect(service.graphApiGet('me', {}, 'token')).rejects.toThrow('ECONNREFUSED');
      expect(mockOpsAlert.alertOnCriticalError).toHaveBeenCalledWith(
        networkError,
        'MetaSdkService.graphApiGet',
      );
    });

    it('passes query params correctly to the URL', async () => {
      const mockFetch = createMockFetch().mockResolvedValue(
        new Response(JSON.stringify({ data: [] })),
      );
      globalThis.fetch = mockFetch;

      await service.graphApiGet('me', { fields: 'id,name', limit: '10' }, 'token');

      const urlArg = mockFetch.mock.calls[0][0] as string;
      expect(urlArg).toContain('fields=id%2Cname');
      expect(urlArg).toContain('limit=10');
    });
  });

  // ── graphApiPost ──

  describe('graphApiPost', () => {
    it('sends POST with JSON body and returns parsed response', async () => {
      const mockFetch = createMockFetch().mockResolvedValue(
        new Response(JSON.stringify({ id: '123', success: true })),
      );
      globalThis.fetch = mockFetch;

      const result = await service.graphApiPost('me/feed', { message: 'hello' }, 'token');

      expect(result).toEqual({ id: '123', success: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(options.method).toBe('POST');
      expect(options.headers).toHaveProperty('Content-Type', 'application/json');
      const body = JSON.parse(options.body as string);
      expect(body.access_token).toBe('token');
      expect(body.message).toBe('hello');
    });

    it('returns error object on Graph API error response', async () => {
      const errorBody = {
        error: {
          message: 'Permission denied',
          type: 'OAuthException',
          code: 200,
        },
      };
      const mockFetch = createMockFetch().mockResolvedValue(
        new Response(JSON.stringify(errorBody)),
      );
      globalThis.fetch = mockFetch;

      const result = await service.graphApiPost('me/feed', { message: 'x' }, 'token');

      expect(result.error).toBeDefined();
      expect(result.error!.message).toBe('Permission denied');
    });

    it('throws and alerts on network failure', async () => {
      const networkError = new Error('ENOTFOUND');
      const mockFetch = createMockFetch().mockRejectedValue(networkError);
      globalThis.fetch = mockFetch;

      await expect(service.graphApiPost('me/feed', {}, 'token')).rejects.toThrow('ENOTFOUND');
      expect(mockOpsAlert.alertOnCriticalError).toHaveBeenCalledWith(
        networkError,
        'MetaSdkService.graphApiPost',
      );
    });
  });

  // ── graphApiDelete ──

  describe('graphApiDelete', () => {
    it('sends DELETE and returns parsed response', async () => {
      const mockFetch = createMockFetch().mockResolvedValue(
        new Response(JSON.stringify({ success: true })),
      );
      globalThis.fetch = mockFetch;

      const result = await service.graphApiDelete('me/permissions', 'token');

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(options.method).toBe('DELETE');
    });

    it('returns error object on Graph API error response', async () => {
      const errorBody = {
        error: {
          message: 'Not found',
          type: 'GraphMethodException',
          code: 100,
        },
      };
      const mockFetch = createMockFetch().mockResolvedValue(
        new Response(JSON.stringify(errorBody)),
      );
      globalThis.fetch = mockFetch;

      const result = await service.graphApiDelete('nonexistent', 'token');

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe(100);
    });

    it('throws and alerts on network failure', async () => {
      const networkError = new Error('ETIMEDOUT');
      const mockFetch = createMockFetch().mockRejectedValue(networkError);
      globalThis.fetch = mockFetch;

      await expect(service.graphApiDelete('me/permissions', 'token')).rejects.toThrow('ETIMEDOUT');
      expect(mockOpsAlert.alertOnCriticalError).toHaveBeenCalledWith(
        networkError,
        'MetaSdkService.graphApiDelete',
      );
    });
  });

  // ── exchangeToken ──

  describe('exchangeToken', () => {
    it('returns long-lived token data on success', async () => {
      const tokenResponse = {
        access_token: 'long-lived-token-abc',
        token_type: 'bearer',
        expires_in: 5184000,
      };
      const mockFetch = createMockFetch().mockResolvedValue(
        new Response(JSON.stringify(tokenResponse)),
      );
      globalThis.fetch = mockFetch;

      const result = await service.exchangeToken('short-token');

      expect(result.access_token).toBe('long-lived-token-abc');
      expect(result.token_type).toBe('bearer');
      expect(result.expires_in).toBe(5184000);
    });

    it('throws when Graph API returns an error', async () => {
      const errorBody = {
        error: {
          message: 'Invalid OAuth token',
          type: 'OAuthException',
          code: 190,
        },
      };
      const mockFetch = createMockFetch().mockResolvedValue(
        new Response(JSON.stringify(errorBody)),
      );
      globalThis.fetch = mockFetch;

      await expect(service.exchangeToken('bad-token')).rejects.toThrow('Invalid OAuth token');
    });

    it('handles missing access_token in response gracefully', async () => {
      const mockFetch = createMockFetch().mockResolvedValue(
        new Response(JSON.stringify({ token_type: 'bearer' })),
      );
      globalThis.fetch = mockFetch;

      const result = await service.exchangeToken('token');

      expect(result.access_token).toBe('');
      expect(result.token_type).toBe('bearer');
      expect(result.expires_in).toBeUndefined();
    });

    it('alerts on network failure', async () => {
      const networkError = new Error('Network error');
      const mockFetch = createMockFetch().mockRejectedValue(networkError);
      globalThis.fetch = mockFetch;

      await expect(service.exchangeToken('token')).rejects.toThrow('Network error');
      expect(mockOpsAlert.alertOnCriticalError).toHaveBeenCalledWith(
        networkError,
        'MetaSdkService.exchangeCodeForToken',
      );
    });
  });

  // ── getAppAccessToken ──

  describe('getAppAccessToken', () => {
    it('returns app_id|app_secret format', () => {
      const token = service.getAppAccessToken();
      expect(token).toBe('test-app-id|test-app-secret');
    });

    it('does not expose raw app secret beyond the | delimiter', () => {
      const token = service.getAppAccessToken();
      expect(token).toContain('|');
      expect(token).not.toBe('test-app-secret');
      expect(token).not.toBe('test-app-id');
    });
  });

  // ── validateWebhookSignature ──

  describe('validateWebhookSignature', () => {
    it('returns true for a valid signature', () => {
      const payload = '{"object":"page"}';
      const signature = buildSignature('test-app-secret', payload);

      const result = service.validateWebhookSignature(payload, signature);
      expect(result).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      const payload = '{"object":"page"}';
      const signature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';

      const result = service.validateWebhookSignature(payload, signature);
      expect(result).toBe(false);
    });

    it('returns false when app secret is not configured', async () => {
      const { module } = await buildModule('test-app-id', '');
      const svc = module.get<MetaSdkService>(MetaSdkService);
      const payload = '{"object":"page"}';
      const signature = buildSignature('test-app-secret', payload);

      const result = svc.validateWebhookSignature(payload, signature);
      expect(result).toBe(false);
    });

    it('validates Buffer payload correctly', () => {
      const payload = Buffer.from('{"object":"page"}');
      const signature = buildSignature('test-app-secret', '{"object":"page"}');

      const result = service.validateWebhookSignature(payload, signature);
      expect(result).toBe(true);
    });

    it('returns false for a tampered payload', () => {
      const originalPayload = '{"object":"page"}';
      const signature = buildSignature('test-app-secret', originalPayload);
      const tamperedPayload = '{"object":"hacked"}';

      const result = service.validateWebhookSignature(tamperedPayload, signature);
      expect(result).toBe(false);
    });
  });

  // ── checkRateLimit ──

  describe('checkRateLimit', () => {
    it('returns true when under the rate limit', async () => {
      mockRedis.incr.mockResolvedValue(5);
      mockRedis.expire.mockResolvedValue(1);

      const result = await service.checkRateLimit('acct-1', 'instagram');

      expect(result).toBe(true);
      expect(mockRedis.incr).toHaveBeenCalledWith('meta:ratelimit:instagram:acct-1');
    });

    it('sets TTL on first call (counter === 1)', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      await service.checkRateLimit('acct-2', 'ads');

      expect(mockRedis.expire).toHaveBeenCalledWith('meta:ratelimit:ads:acct-2', 3600);
    });

    it('does not set TTL when counter > 1', async () => {
      mockRedis.incr.mockResolvedValue(10);
      mockRedis.expire.mockResolvedValue(1);

      await service.checkRateLimit('acct-3', 'graph');

      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('returns false when rate limit exceeded for instagram (200)', async () => {
      mockRedis.incr.mockResolvedValue(201);
      mockRedis.expire.mockResolvedValue(1);

      const result = await service.checkRateLimit('acct-4', 'instagram');

      expect(result).toBe(false);
    });

    it('returns false when rate limit exceeded for ads (1000)', async () => {
      mockRedis.incr.mockResolvedValue(1001);
      mockRedis.expire.mockResolvedValue(1);

      const result = await service.checkRateLimit('acct-5', 'ads');

      expect(result).toBe(false);
    });

    it('returns false when rate limit exceeded for graph (500)', async () => {
      mockRedis.incr.mockResolvedValue(501);
      mockRedis.expire.mockResolvedValue(1);

      const result = await service.checkRateLimit('acct-6', 'graph');

      expect(result).toBe(false);
    });

    it('returns true (fail open) when Redis is unavailable', async () => {
      mockRedis.incr.mockRejectedValue(new Error('Redis connection error'));

      const result = await service.checkRateLimit('acct-7', 'instagram');

      expect(result).toBe(true);
      expect(mockOpsAlert.alertOnDegradation).toHaveBeenCalledWith(
        'Redis connection error',
        'MetaSdkService.checkRateLimit',
      );
    });

    it('uses graph platform for the default limit check', async () => {
      mockRedis.incr.mockResolvedValue(400);
      mockRedis.expire.mockResolvedValue(1);

      const result = await service.checkRateLimit('acct-8', 'graph');

      expect(result).toBe(true);
      expect(mockRedis.incr).toHaveBeenCalledWith('meta:ratelimit:graph:acct-8');
    });
  });
});
