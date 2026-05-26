import { AbiSnapshotCacheService } from './abi-snapshot-cache.service';
import type { CognitiveStateAbi } from './abi-schema';
import { ABI_VERSION } from './abi-schema';
const workspaceId = 'wks_test_cache';
function sampleAbi(overrides?: Partial<CognitiveStateAbi>): CognitiveStateAbi {
  return {
    abiVersion: ABI_VERSION,
    lineage: {
      canonicalName: 'Kloel',
      genesisEventId: '01JD90000000000000000000GE',
      lineageStatus: 'intact',
      operationalAge: { sinceGenesisDays: 100, sinceFirstWorkspaceDays: 50 },
      capabilities: [],
    },
    identityProjection: {
      audience: 'public',
      currentMaturity: 'developing',
      truthMode: 'observed',
    },
    perception: {
      currentSnapshot: { channel: 'whatsapp', workspaceId },
      recentSalientEvents: [],
    },
    beliefs: [],
    predictions: { active: [], recentSurprises: [] },
    attention: { candidates: [] },
    memory: {
      workingMemory: [],
      episodicRefs: [],
      consolidatedRefs: [],
    },
    capabilities: {
      available: [],
      restricted: [],
    },
    valence: {
      recentTrace: [],
      aggregatedMood: {
        positive: 0,
        negative: 0,
        neutral: 1,
        ambiguous: 0,
        windowHours: 24,
      },
    },
    pulseTruth: {
      noOverclaimStatus: 'PASS',
      capabilityHealthScore: 0,
      gates: [],
      certificationVerdict: {
        verdict: 'INSUFFICIENT_EVIDENCE',
        score: 0,
        measuredAt: new Date().toISOString(),
      },
      overclaimRisk: 0,
    },
    currentInput: {
      raw: 'test',
      channel: 'whatsapp',
      arrivalTimestamp: new Date().toISOString(),
    },
    ...overrides,
  };
}
describe('AbiSnapshotCacheService', () => {
  describe('with a working Redis', () => {
    const store = new Map<string, string>();
    const mockRedis = {
      set: jest.fn((key: string, value: string, _mode: string, _ttl: number) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
      get: jest.fn((key: string) => {
        return Promise.resolve(store.get(key) ?? null);
      }),
    };
    let service: AbiSnapshotCacheService;

    beforeEach(() => {
      store.clear();
      jest.clearAllMocks();
      service = new AbiSnapshotCacheService(mockRedis as never);
    });
    it('caches a snapshot and retrieves it', async () => {
      const abi = sampleAbi();
      await service.cacheSnapshot(workspaceId, abi);

      const cached = await service.getCachedSnapshot(workspaceId);
      expect(cached).not.toBeNull();
      expect(cached!.abiVersion).toBe(ABI_VERSION);
      expect(cached!.perception.currentSnapshot.workspaceId).toBe(workspaceId);
    });
    it('returns null when no snapshot cached', async () => {
      const cached = await service.getCachedSnapshot('wks_nonexistent');
      expect(cached).toBeNull();
    });
    it('uses the correct key prefix and TTL', async () => {
      const abi = sampleAbi();
      await service.cacheSnapshot(workspaceId, abi);

      expect(mockRedis.set).toHaveBeenCalledWith(
        `abi:snap:${workspaceId}`,
        expect.any(String),
        'EX',
        300,
      );
    });
    it('survives Redis write failure gracefully', async () => {
      mockRedis.set.mockRejectedValueOnce(new Error('connection refused'));
      const abi = sampleAbi();

      await expect(service.cacheSnapshot(workspaceId, abi)).resolves.toBeUndefined();
    });
    it('survives Redis read failure gracefully', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('connection refused'));

      const cached = await service.getCachedSnapshot(workspaceId);
      expect(cached).toBeNull();
    });
    it('returns null on read when Redis returns null', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const cached = await service.getCachedSnapshot('wks_no_key');
      expect(cached).toBeNull();
    });
  });
  describe('without Redis (null injection)', () => {
    let service: AbiSnapshotCacheService;

    beforeEach(() => {
      service = new AbiSnapshotCacheService(undefined);
    });

    it('cacheSnapshot returns silently without Redis', async () => {
      await expect(service.cacheSnapshot(workspaceId, sampleAbi())).resolves.toBeUndefined();
    });

    it('getCachedSnapshot returns null without Redis', async () => {
      const cached = await service.getCachedSnapshot(workspaceId);
      expect(cached).toBeNull();
    });
  });
});
