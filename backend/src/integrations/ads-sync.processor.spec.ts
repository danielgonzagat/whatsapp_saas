import type { PrismaService } from '../prisma/prisma.service';
import { AdsSyncProcessor } from './ads-sync.processor';

describe('AdsSyncProcessor', () => {
  let processor: AdsSyncProcessor;
  let mockPrisma: {
    adAccount: { upsert: jest.Mock; findFirst: jest.Mock };
    adCampaign: { upsert: jest.Mock; findFirst: jest.Mock };
    adInsight: { upsert: jest.Mock };
    metaConnection: { findUnique: jest.Mock };
  };
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
    mockPrisma = {
      adAccount: {
        upsert: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      adCampaign: {
        upsert: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      adInsight: { upsert: jest.fn().mockResolvedValue({}) },
      metaConnection: { findUnique: jest.fn().mockResolvedValue(null) },
    };

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
      mockPrisma.metaConnection.findUnique.mockResolvedValue({
        adAccountId: 'act_123',
        status: 'connected',
      });

      const result = await processor.getSyncStatus('ws-1');

      expect(result.meta.connected).toBe(true);
      expect(result.meta.adAccountId).toBe('act_123');
    });
  });
});
