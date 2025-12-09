import { Test, TestingModule } from '@nestjs/testing';
import { SegmentationService, PRESET_SEGMENTS } from './segmentation.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SegmentationService', () => {
  let service: SegmentationService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      contact: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      deal: {
        findMany: jest.fn(),
        groupBy: jest.fn(),
      },
      campaignMessage: {
        findMany: jest.fn(),
      },
      contactTag: {
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SegmentationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SegmentationService>(SegmentationService);
    prisma = module.get(PrismaService);
  });

  describe('getAvailablePresets', () => {
    it('should return all preset segments', () => {
      const presets = service.getAvailablePresets();
      
      expect(presets.length).toBeGreaterThan(0);
      expect(presets.map(p => p.name)).toContain('HOT_LEADS');
      expect(presets.map(p => p.name)).toContain('COLD_LEADS');
      expect(presets.map(p => p.name)).toContain('RECENT_BUYERS');
    });

    it('should have valid criteria for each preset', () => {
      const presets = service.getAvailablePresets();
      
      for (const preset of presets) {
        expect(preset.criteria).toBeDefined();
        expect(typeof preset.description).toBe('string');
      }
    });
  });

  describe('PRESET_SEGMENTS', () => {
    it('should have HOT_LEADS with correct criteria', () => {
      expect(PRESET_SEGMENTS.HOT_LEADS.lastMessageDays).toBe(3);
      expect(PRESET_SEGMENTS.HOT_LEADS.engagement).toBe('hot');
    });

    it('should have COLD_LEADS with correct criteria', () => {
      expect(PRESET_SEGMENTS.COLD_LEADS.noMessageDays).toBe(30);
      expect(PRESET_SEGMENTS.COLD_LEADS.engagement).toBe('cold');
    });

    it('should have GHOST_LEADS with correct criteria', () => {
      expect(PRESET_SEGMENTS.GHOST_LEADS.noMessageDays).toBe(60);
      expect(PRESET_SEGMENTS.GHOST_LEADS.engagement).toBe('ghost');
    });

    it('should have HIGH_VALUE with minimum purchase value', () => {
      expect(PRESET_SEGMENTS.HIGH_VALUE.purchaseMinValue).toBe(1000);
    });
  });

  describe('getAudienceBySegment', () => {
    it('should return contacts matching criteria', async () => {
      const mockContacts = [
        { id: '1', phone: '5511999999999', name: 'John', lastMessageAt: new Date(), deals: [] },
        { id: '2', phone: '5511888888888', name: 'Jane', lastMessageAt: new Date(), deals: [] },
      ];

      (prisma.contact.findMany as jest.Mock).mockResolvedValue(mockContacts);

      const result = await service.getAudienceBySegment('workspace-1', {
        lastMessageDays: 7,
        limit: 100,
      });

      expect(result.total).toBe(2);
      expect(result.contacts).toHaveLength(2);
      expect(result.contacts[0].phone).toBe('5511999999999');
    });

    it('should filter by tags', async () => {
      (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      await service.getAudienceBySegment('workspace-1', {
        tags: ['vip', 'premium'],
      });

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tags: { some: { name: { in: ['vip', 'premium'] } } },
          }),
        }),
      );
    });

    it('should exclude tags', async () => {
      (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      await service.getAudienceBySegment('workspace-1', {
        excludeTags: ['unsubscribed'],
      });

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            NOT: { tags: { some: { name: { in: ['unsubscribed'] } } } },
          }),
        }),
      );
    });
  });

  describe('calculateEngagementScore', () => {
    it('should return ghost level for contact not found', async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.calculateEngagementScore('unknown-id');

      expect(result.score).toBe(0);
      expect(result.level).toBe('ghost');
    });

    it('should calculate score based on multiple factors', async () => {
      const now = new Date();
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue({
        lastMessageAt: now, // Recent = high recency score
        conversations: [
          {
            messages: [
              { direction: 'INBOUND', createdAt: now },
              { direction: 'OUTBOUND', createdAt: now },
              { direction: 'INBOUND', createdAt: now },
            ],
          },
        ],
        deals: [{ value: 500, status: 'WON' }],
      });

      const result = await service.calculateEngagementScore('contact-1');

      expect(result.score).toBeGreaterThan(0);
      expect(result.factors.recency).toBeDefined();
      expect(result.factors.frequency).toBeDefined();
      expect(result.factors.responseRate).toBeDefined();
      expect(result.factors.purchaseValue).toBeDefined();
    });

    it('should classify hot contacts correctly', async () => {
      const now = new Date();
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue({
        lastMessageAt: now,
        conversations: [
          {
            messages: Array(20).fill(null).map(() => ({
              direction: Math.random() > 0.5 ? 'INBOUND' : 'OUTBOUND',
              createdAt: now,
            })),
          },
        ],
        deals: [{ value: 2000, status: 'WON' }],
      });

      const result = await service.calculateEngagementScore('hot-contact');

      expect(result.level).toBe('hot');
      expect(result.score).toBeGreaterThanOrEqual(60);
    });
  });

  describe('getPresetSegment', () => {
    it('should apply preset criteria with overrides', async () => {
      (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      await service.getPresetSegment('workspace-1', 'HOT_LEADS', { limit: 50 });

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });
  });
});
