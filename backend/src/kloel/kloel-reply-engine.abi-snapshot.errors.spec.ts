import {
  buildAbiTestModule,
  callParams,
  extractCognitiveState,
  validAbi,
} from './kloel-reply-engine.abi-snapshot.fixtures';
import { KloelReplyEngineService } from './kloel-reply-engine.service';

const mockWarnCalls: Array<[string, Record<string, unknown>]> = [];

jest.mock('../logging/structured-logger', () => {
  const actual = jest.requireActual<typeof import('../logging/structured-logger')>(
    '../logging/structured-logger',
  );
  return {
    ...actual,
    StructuredLogger: class extends actual.StructuredLogger {
      static override from(context: string | { name?: string }) {
        const inst = new this(typeof context === 'string' ? context : (context.name ?? 'unknown'));
        return inst;
      }
      override warn(a: string | Record<string, unknown>, b?: unknown): void {
        if (typeof a === 'string' && b && typeof b === 'object') {
          mockWarnCalls.push([a, b as Record<string, unknown>]);
        }
        if (typeof a === 'string') {
          console.warn(a);
        }
      }
    },
  };
});
jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
  })),
}));

jest.mock('stripe', () => {
  const MockStripe = jest.fn().mockImplementation(() => ({
    customers: { create: jest.fn(), retrieve: jest.fn() },
    paymentMethods: { list: jest.fn(), attach: jest.fn() },
  }));
  (MockStripe as unknown as Record<string, unknown>).API_VERSION = '2025-01-27.acacia';
  return { default: MockStripe };
});

jest.mock('./kloel-reply-engine.helpers', () => ({
  WHITESPACE_RE: /\s+/,
  RELAT_O__RIO_DOCUMENTO_RE: /relat[oó]rio|documento/i,
  CRIE_CADASTRAR_CADASTRE_RE: /crie|cadastrar|cadastre/i,
  PRODUTO_CAT_A__LOGO_AUT_RE: /produto|cat[aá]logo|automa/i,
  KLOEL_STREAM_ABORT_REASON_TIMEOUT: 'kloel_stream_timeout',
  KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED: 'client_disconnected',
  buildDynamicRuntimeContextHelper: jest.fn().mockResolvedValue('Dynamic context'),
  buildAssistantReplyImpl: jest.fn().mockResolvedValue('Assistant reply'),
}));

describe('KloelReplyEngineService ABI snapshot cache (errors) (PI-k5)', () => {
  let service: KloelReplyEngineService;

  describe('not found', () => {
    let abiBuilder: { build: jest.Mock };
    let kloelMemory: { findUnique: jest.Mock; upsert: jest.Mock };

    beforeEach(async () => {
      mockWarnCalls.length = 0;
      abiBuilder = { build: jest.fn().mockResolvedValue(validAbi) };
      kloelMemory = {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(undefined),
      };
      service = await buildAbiTestModule({ abiBuilder, kloelMemory });
    });

    it('rebuilds cognitiveState and inserts new cache entry via upsert', async () => {
      const messages = await service.buildChatModelMessages(callParams);
      const cs = extractCognitiveState(messages);

      expect(abiBuilder.build).toHaveBeenCalled();
      expect(cs['abiVersion']).toBe('1.1.0');

      expect(kloelMemory.upsert).toHaveBeenCalledTimes(1);
      const upsertCalls = kloelMemory.upsert.mock.calls as Array<
        [
          {
            where: { workspaceId_key: { key: string; workspaceId: string } };
            update: { category: string };
            create: { category: string; workspaceId: string };
          },
        ]
      >;
      const upsertArgs = upsertCalls[0][0];
      expect(upsertArgs.where.workspaceId_key.key).toBe('abi_snapshot_cache');
      expect(upsertArgs.create.workspaceId).toBe('ws-1');
    });
  });

  describe('db-error on read', () => {
    let abiBuilder: { build: jest.Mock };
    let kloelMemory: { findUnique: jest.Mock; upsert: jest.Mock };

    beforeEach(async () => {
      mockWarnCalls.length = 0;
      abiBuilder = { build: jest.fn().mockResolvedValue(validAbi) };
      kloelMemory = {
        findUnique: jest.fn().mockRejectedValue(new Error('connection refused')),
        upsert: jest.fn().mockResolvedValue(undefined),
      };
      service = await buildAbiTestModule({ abiBuilder, kloelMemory });
    });

    it('falls back to rebuild and logs kloel_abi_snapshot_cache_skipped', async () => {
      const messages = await service.buildChatModelMessages(callParams);
      const cs = extractCognitiveState(messages);

      expect(abiBuilder.build).toHaveBeenCalled();
      expect(cs['abiVersion']).toBe('1.1.0');

      const cacheSkips = mockWarnCalls.filter(
        ([msg]) => msg === 'kloel_abi_snapshot_cache_skipped',
      );
      expect(cacheSkips).toHaveLength(1);
      expect(cacheSkips[0][1]).toMatchObject({ reason: 'connection refused' });
    });
  });

  describe('db-error on write', () => {
    let abiBuilder: { build: jest.Mock };
    let kloelMemory: { findUnique: jest.Mock; upsert: jest.Mock };

    beforeEach(async () => {
      mockWarnCalls.length = 0;
      abiBuilder = { build: jest.fn().mockResolvedValue(validAbi) };
      kloelMemory = {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockRejectedValue(new Error('disk full')),
      };
      service = await buildAbiTestModule({ abiBuilder, kloelMemory });
    });

    it('logs kloel_abi_snapshot_cache_skipped and continues gracefully', async () => {
      const messages = await service.buildChatModelMessages(callParams);
      const cs = extractCognitiveState(messages);

      expect(abiBuilder.build).toHaveBeenCalled();
      expect(cs['abiVersion']).toBe('1.1.0');

      const cacheSkips = mockWarnCalls.filter(
        ([msg]) => msg === 'kloel_abi_snapshot_cache_skipped',
      );
      expect(cacheSkips).toHaveLength(1);
      expect(cacheSkips[0][1]).toMatchObject({ reason: 'disk full' });
    });
  });
});
