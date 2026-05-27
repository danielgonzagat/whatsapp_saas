import type { PrismaService } from '../prisma/prisma.service';
import { AdsSyncProcessor } from './ads-sync.processor';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

describe('AdsSyncProcessor', () => {
  let processor: AdsSyncProcessor;
  let mockPrisma: ReturnType<typeof createPartialPrismaMock>;
  let mockGoogleAds: {
    syncAccounts: jest.Mock;
    syncCampaigns: jest.Mock;
    syncInsights: jest.Mock;
  };
  let mockMetaMarketing: {
    syncAccounts: jest.Mock;
    syncCampaigns: jest.Mock;
    syncInsights: jest.Mock;
  };

  beforeEach(() => {
    mockPrisma = createPartialPrismaMock({
      adAccount: ['upsert', 'findFirst'],
      adCampaign: ['upsert', 'findFirst'],
      adInsight: ['upsert'],
      metaConnection: ['findFirst'],
    });

    mockGoogleAds = {
      syncAccounts: jest.fn().mockResolvedValue({ accounts: [] }),
      syncCampaigns: jest.fn().mockResolvedValue({ campaigns: [] }),
      syncInsights: jest.fn().mockResolvedValue({ insights: [] }),
    };

    mockMetaMarketing = {
      syncAccounts: jest.fn().mockResolvedValue({ accounts: [] }),
      syncCampaigns: jest.fn().mockResolvedValue({ campaigns: [] }),
      syncInsights: jest.fn().mockResolvedValue({ insights: [] }),
    };

    processor = new AdsSyncProcessor(
      mockPrisma as never as PrismaService,
      mockGoogleAds as never,
      mockMetaMarketing as never,
    );
  });

  describe('static enqueue* methods', () => {
    it('AdsSyncProcessor.enqueueSyncAccounts exists as static', () => {
      expect(typeof AdsSyncProcessor.enqueueSyncAccounts).toBe('function');
    });

    it('AdsSyncProcessor.enqueueSyncCampaigns exists as static', () => {
      expect(typeof AdsSyncProcessor.enqueueSyncCampaigns).toBe('function');
    });

    it('AdsSyncProcessor.enqueueSyncInsights exists as static', () => {
      expect(typeof AdsSyncProcessor.enqueueSyncInsights).toBe('function');
    });

    it('AdsSyncProcessor.enqueueMetaSyncAccounts exists as static', () => {
      expect(typeof AdsSyncProcessor.enqueueMetaSyncAccounts).toBe('function');
    });

    it('AdsSyncProcessor.enqueueMetaSyncCampaigns exists as static', () => {
      expect(typeof AdsSyncProcessor.enqueueMetaSyncCampaigns).toBe('function');
    });

    it('AdsSyncProcessor.enqueueMetaSyncInsights exists as static', () => {
      expect(typeof AdsSyncProcessor.enqueueMetaSyncInsights).toBe('function');
    });
  });

  describe('getSyncStatus', () => {
    it('returns empty for workspace with no sync data', async () => {
      const result = await processor.getSyncStatus('ws-none');

      expect(result).toHaveProperty('workspaceId', 'ws-none');
      expect(result).toHaveProperty('meta', {
        connected: false,
        adAccountId: null,
        lastAccountSync: null,
        lastCampaignSync: null,
      });
    });

    it('returns meta connected when MetaConnection exists', async () => {
      mockPrisma.metaConnection.findFirst.mockResolvedValue({
        adAccountId: 'act_123',
        status: 'connected',
      });

      const result = await processor.getSyncStatus('ws-1');

      expect(result.meta.connected).toBe(true);
      expect(result.meta.adAccountId).toBe('act_123');
    });
  });
});
