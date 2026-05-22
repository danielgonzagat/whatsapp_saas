import { DestructiveIntentKind } from '@prisma/client';
import { UnsupportedUndoError } from '../destructive-handler.registry';
import type { DestructiveIntentRecord } from '../destructive-intent.types';
import { CachePurgeHandler, NotConfiguredException } from './cache-purge.handler';

const FAKE_REDIS_URL = 'redis://localhost:6379';

function fakeIntent(overrides?: Partial<DestructiveIntentRecord>): DestructiveIntentRecord {
  return {
    id: 'intent-1',
    kind: DestructiveIntentKind.CACHE_PURGE,
    targetType: 'workspace',
    targetId: 'ws-123',
    reason: 'debug',
    challenge: 'AB12CD',
    requiresOtp: false,
    reversible: false,
    status: 'CONFIRMED',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    confirmedAt: null,
    executedAt: null,
    executedByAdminUserId: null,
    failureMessage: null,
    resultSnapshot: null,
    undoTokenHash: null,
    undoExpiresAt: null,
    undoAt: null,
    createdByAdminUserId: 'admin-1',
    ip: '127.0.0.1',
    userAgent: 'jest',
    ...overrides,
  };
}

function buildHandler(opts?: { scan?: jest.Mock; del?: jest.Mock; append?: jest.Mock }) {
  const redis = {
    scan: opts?.scan ?? jest.fn().mockResolvedValue(['0', []]),
    del: opts?.del ?? jest.fn().mockResolvedValue(0),
  };
  const adminAudit = {
    append: opts?.append ?? jest.fn().mockResolvedValue(undefined),
  };
  return {
    handler: new CachePurgeHandler(redis as never, adminAudit as never),
    redis,
    adminAudit,
  };
}

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const backup: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    backup[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(backup)) {
      if (backup[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = backup[key];
      }
    }
  }
}

describe('CachePurgeHandler', () => {
  describe('execute', () => {
    it('throws NotConfiguredException when REDIS_URL is missing', async () => {
      const { handler } = buildHandler();

      await withEnv({ REDIS_URL: undefined }, async () => {
        await expect(handler.execute(fakeIntent())).rejects.toThrow(NotConfiguredException);
      });
    });

    it('purges Redis keys matching the pattern and reports count', async () => {
      const scan = jest
        .fn()
        .mockResolvedValueOnce(['0', ['cache:workspace:ws-123:a', 'cache:workspace:ws-123:b']]);

      const del = jest.fn().mockResolvedValueOnce(2);

      const append = jest.fn().mockResolvedValue(undefined);

      const { handler, adminAudit } = buildHandler({ scan, del, append });

      await withEnv({ REDIS_URL: FAKE_REDIS_URL }, async () => {
        const result = await handler.execute(fakeIntent());

        expect(result.ok).toBe(true);
        expect(result.snapshot.redisKeysDeleted).toBe(2);
        expect(result.snapshot.redisPattern).toBe('cache:workspace:ws-123*');

        expect(scan).toHaveBeenCalledWith('0', 'MATCH', 'cache:workspace:ws-123*', 'COUNT', 100);
        expect(del).toHaveBeenCalledWith('cache:workspace:ws-123:a', 'cache:workspace:ws-123:b');

        expect(adminAudit.append).toHaveBeenCalledWith(
          expect.objectContaining({
            adminUserId: 'admin-1',
            action: 'CACHE_PURGE',
            entityType: 'workspace',
            entityId: 'ws-123',
            details: expect.objectContaining({
              redisKeysDeleted: 2,
              cdnPurged: false,
            }),
          }),
        );
      });
    });

    it('iterates scan cursor until it returns zero', async () => {
      const scan = jest
        .fn()
        .mockResolvedValueOnce(['5', ['cache:workspace:ws-123:a', 'cache:workspace:ws-123:b']])
        .mockResolvedValueOnce(['0', ['cache:workspace:ws-123:c']]);

      const del = jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1);

      const { handler } = buildHandler({ scan, del });

      await withEnv({ REDIS_URL: FAKE_REDIS_URL }, async () => {
        const result = await handler.execute(fakeIntent());

        expect(result.snapshot.redisKeysDeleted).toBe(3);
        expect(scan).toHaveBeenCalledTimes(2);
        expect(del).toHaveBeenCalledTimes(2);
      });
    });

    it('returns zero deleted when no keys match', async () => {
      const scan = jest.fn().mockResolvedValue(['0', []]);

      const { handler } = buildHandler({ scan });

      await withEnv({ REDIS_URL: FAKE_REDIS_URL }, async () => {
        const result = await handler.execute(fakeIntent());

        expect(result.snapshot.redisKeysDeleted).toBe(0);
      });
    });

    it('attempts Cloudflare CDN purge when tokens are configured', async () => {
      const scan = jest.fn().mockResolvedValue(['0', ['k1']]);
      const del = jest.fn().mockResolvedValue(1);

      const originalFetch = global.fetch;
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
      global.fetch = fetchMock;

      const { handler } = buildHandler({ scan, del });

      try {
        await withEnv(
          {
            REDIS_URL: FAKE_REDIS_URL,
            CLOUDFLARE_API_TOKEN: 'cf-token',
            CLOUDFLARE_ZONE_ID: 'cf-zone',
          },
          async () => {
            const result = await handler.execute(fakeIntent());

            expect(result.snapshot.cdnPurged).toBe(true);
            expect(result.snapshot.cdnProvider).toBe('cloudflare');
            expect(fetchMock).toHaveBeenCalledWith(
              'https://api.cloudflare.com/client/v4/zones/cf-zone/purge_cache',
              expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                  Authorization: 'Bearer cf-token',
                }),
                body: JSON.stringify({ tags: ['kloel-workspace-ws-123'] }),
              }),
            );
          },
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('reports cdnPurged=false when Cloudflare API returns error', async () => {
      const scan = jest.fn().mockResolvedValue(['0', []]);

      const originalFetch = global.fetch;
      const fetchMock = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ success: false, errors: [{ code: 10000, message: 'bad' }] }),
      });
      global.fetch = fetchMock;

      const { handler } = buildHandler({ scan });

      try {
        await withEnv(
          {
            REDIS_URL: FAKE_REDIS_URL,
            CLOUDFLARE_API_TOKEN: 'cf-token',
            CLOUDFLARE_ZONE_ID: 'cf-zone',
          },
          async () => {
            const result = await handler.execute(fakeIntent());

            expect(result.snapshot.cdnPurged).toBe(false);
            expect(result.snapshot.cdnError).toContain('errors');
          },
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('skips CDN purge when Cloudflare tokens are not configured', async () => {
      const scan = jest.fn().mockResolvedValue(['0', ['k1']]);
      const del = jest.fn().mockResolvedValue(1);

      const { handler } = buildHandler({ scan, del });

      await withEnv(
        {
          REDIS_URL: FAKE_REDIS_URL,
          CLOUDFLARE_API_TOKEN: undefined,
          CLOUDFLARE_ZONE_ID: undefined,
        },
        async () => {
          const result = await handler.execute(fakeIntent());

          expect(result.snapshot.cdnPurged).toBe(false);
          expect(result.snapshot.cdnProvider).toBeNull();
        },
      );
    });

    it('audit log includes targetType, targetId, and layers purged', async () => {
      const scan = jest.fn().mockResolvedValue(['0', ['cache:workspace:ws-456:foo']]);
      const del = jest.fn().mockResolvedValue(1);
      const append = jest.fn().mockResolvedValue(undefined);

      const { handler, adminAudit } = buildHandler({ scan, del, append });

      await withEnv({ REDIS_URL: FAKE_REDIS_URL }, async () => {
        await handler.execute(fakeIntent({ targetType: 'product', targetId: 'prod-99' }));

        expect(adminAudit.append).toHaveBeenCalledWith(
          expect.objectContaining({
            entityType: 'product',
            entityId: 'prod-99',
            action: 'CACHE_PURGE',
            details: expect.objectContaining({
              redisKeysDeleted: 1,
              redisPattern: expect.stringContaining('product'),
            }),
          }),
        );
      });
    });
  });

  describe('undo', () => {
    it('throws UnsupportedUndoError', async () => {
      const { handler } = buildHandler();

      await expect(handler.undo()).rejects.toThrow(UnsupportedUndoError);
    });
  });
});
