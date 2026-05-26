import { CampaignEventEmitterService } from '../kloel/campaign-emitter/campaign-event-emitter.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SmartTimeService } from '../analytics/smart-time/smart-time.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';
import { MetaWhatsAppService } from '../meta/meta-whatsapp.service';

const mockQueueAdd = jest.fn();
const mockWorkerOn = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockQueueAdd,
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: mockWorkerOn,
  })),
}));

jest.mock('../common/redis/redis.util', () => ({
  createRedisClient: jest.fn(() => ({})),
}));

function buildMockPrisma(): ReturnType<typeof createPartialPrismaMock> {
  const base = createPartialPrismaMock({
    campaign: ['create', 'findMany', 'findFirst', 'updateMany'],
    workspace: ['findUnique'],
    metaConnection: ['findFirst'],
    contact: ['findMany'],
  });
  (base.campaign.create as jest.Mock).mockResolvedValue({
    id: 'camp-1',
    name: 'Test Campaign',
    status: 'DRAFT',
    stats: { sent: 0, delivered: 0, read: 0, failed: 0 },
  });
  (base.campaign.findFirst as jest.Mock).mockResolvedValue({
    id: 'camp-1',
    name: 'Test Campaign',
    status: 'DRAFT',
    stats: { sent: 0, delivered: 0, read: 0, failed: 0 },
    workspaceId: 'ws-1',
    filters: {},
    messageTemplate: 'Hello {{name}}',
    aiStrategy: null,
    parentId: null,
    scheduledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  (base.campaign.findMany as jest.Mock).mockResolvedValue([]);
  (base.campaign.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  (base.workspace.findUnique as jest.Mock).mockResolvedValue({
    id: 'ws-1',
    providerSettings: { whatsappApiSession: { status: 'connected' } },
  });
  (base.contact.findMany as jest.Mock).mockResolvedValue([]);
  return base;
}

describe('CampaignsService', () => {
  let service: CampaignsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockAudit: { log: jest.Mock; logWithTx: jest.Mock; getLogs: jest.Mock };
  let mockSmartTime: { getBestTime: jest.Mock };
  let mockMetaWhatsApp: { sendTextMessage: jest.Mock };
  let mockCampaignEmitter: {
    emitAudienceReached: jest.Mock;
    emitCreativeSwapped: jest.Mock;
  };

  beforeEach(async () => {
    mockQueueAdd.mockResolvedValue(undefined);
    mockWorkerOn.mockReturnValue(undefined);
    mockPrisma = buildMockPrisma();
    mockAudit = {
      log: jest.fn().mockResolvedValue(undefined),
      logWithTx: jest.fn().mockResolvedValue(undefined),
      getLogs: jest.fn(),
    };
    mockSmartTime = {
      getBestTime: jest.fn().mockResolvedValue({ bestHour: 10 }),
    };
    mockMetaWhatsApp = {
      sendTextMessage: jest.fn().mockResolvedValue({ success: true, messageId: 'wamid-1' }),
    };
    mockCampaignEmitter = {
      emitAudienceReached: jest.fn(),
      emitCreativeSwapped: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: SmartTimeService, useValue: mockSmartTime },
        { provide: CampaignEventEmitterService, useValue: mockCampaignEmitter },
        { provide: MetaWhatsAppService, useValue: mockMetaWhatsApp },
      ],
    }).compile();

    service = module.get<CampaignsService>(CampaignsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates a campaign in DRAFT status with default stats', async () => {
      const result = await service.create('ws-1', {
        name: 'Summer Sale',
        messageTemplate: 'Hello {{name}}, check our deals!',
      });

      expect(mockPrisma.campaign.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Summer Sale',
          status: 'DRAFT',
          workspace: { connect: { id: 'ws-1' } },
          stats: { sent: 0, delivered: 0, read: 0, failed: 0 },
        }),
      });
      expect(result.status).toBe('DRAFT');
    });
  });

  describe('findAll', () => {
    it('returns campaigns for a workspace ordered by createdAt desc', async () => {
      const campaigns = [{ id: 'c1', name: 'Camp 1', status: 'DRAFT', stats: {} }];
      mockPrisma.campaign.findMany.mockResolvedValue(campaigns);

      const result = await service.findAll('ws-1');

      expect(mockPrisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1' },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      );
      expect(result).toEqual(campaigns);
    });
  });

  describe('findOne', () => {
    it('returns the campaign when found', async () => {
      const camp = { id: 'camp-1', name: 'Found', status: 'DRAFT' };
      mockPrisma.campaign.findFirst.mockResolvedValue(camp);

      const result = await service.findOne('ws-1', 'camp-1');

      expect(result).toEqual(camp);
      expect(mockPrisma.campaign.findFirst).toHaveBeenCalledWith({
        where: { id: 'camp-1', workspaceId: 'ws-1' },
      });
    });

    it('throws NotFoundException when campaign does not exist', async () => {
      mockPrisma.campaign.findFirst.mockResolvedValue(null);

      await expect(service.findOne('ws-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('pause', () => {
    it('sets status to PAUSED for a RUNNING campaign', async () => {
      mockPrisma.campaign.findFirst.mockResolvedValue({
        id: 'camp-1',
        status: 'RUNNING',
        workspaceId: 'ws-1',
        name: 'Test',
      });

      await service.pause('ws-1', 'camp-1');

      expect(mockPrisma.campaign.updateMany).toHaveBeenCalledWith({
        where: { id: 'camp-1', workspaceId: 'ws-1' },
        data: { status: 'PAUSED' },
      });
    });

    it('sets status to PAUSED for a SCHEDULED campaign', async () => {
      mockPrisma.campaign.findFirst.mockResolvedValue({
        id: 'camp-1',
        status: 'SCHEDULED',
        workspaceId: 'ws-1',
        name: 'Test',
      });

      await service.pause('ws-1', 'camp-1');

      expect(mockPrisma.campaign.updateMany).toHaveBeenCalledWith({
        where: { id: 'camp-1', workspaceId: 'ws-1' },
        data: { status: 'PAUSED' },
      });
    });

    it('throws NotFoundException when campaign does not exist', async () => {
      mockPrisma.campaign.findFirst.mockResolvedValue(null);

      await expect(service.pause('ws-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for DRAFT campaign', async () => {
      mockPrisma.campaign.findFirst.mockResolvedValue({
        id: 'camp-1',
        status: 'DRAFT',
        workspaceId: 'ws-1',
        name: 'Test',
      });

      await expect(service.pause('ws-1', 'camp-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for COMPLETED campaign', async () => {
      mockPrisma.campaign.findFirst.mockResolvedValue({
        id: 'camp-1',
        status: 'COMPLETED',
        workspaceId: 'ws-1',
        name: 'Test',
      });

      await expect(service.pause('ws-1', 'camp-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getStats', () => {
    it('delegates to findOne', async () => {
      const camp = { id: 'camp-1', name: 'Test', status: 'COMPLETED', stats: { sent: 100 } };
      mockPrisma.campaign.findFirst.mockResolvedValue(camp);

      const result = await service.getStats('ws-1', 'camp-1');

      expect(result).toEqual(camp);
    });
  });

  describe('launch - validation', () => {
    it('throws BadRequestException when WhatsApp is not connected', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { whatsappApiSession: { status: 'disconnected' } },
      });
      mockPrisma.metaConnection.findFirst.mockResolvedValue(null);

      await expect(service.launch('ws-1', 'camp-1')).rejects.toThrow(BadRequestException);
    });

    it('launches when the official Meta WhatsApp connection is ready', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: {},
      });
      mockPrisma.metaConnection.findFirst.mockResolvedValue({
        whatsappPhoneNumberId: 'phone-number-id',
        status: 'connected',
        tokenExpiresAt: new Date(Date.now() + 3_600_000),
      });

      await service.launch('ws-1', 'camp-1');

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'process-campaign',
        { campaignId: 'camp-1', workspaceId: 'ws-1' },
        expect.any(Object),
      );
    });

    it('throws BadRequestException when campaign is already RUNNING', async () => {
      mockPrisma.campaign.findFirst.mockResolvedValue({
        id: 'camp-1',
        name: 'Running Camp',
        status: 'RUNNING',
        workspaceId: 'ws-1',
        filters: {},
        messageTemplate: 'hello',
        aiStrategy: null,
        parentId: null,
        scheduledAt: null,
        stats: { sent: 0, delivered: 0, read: 0, failed: 0 },
      });

      await expect(service.launch('ws-1', 'camp-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when campaign is already COMPLETED', async () => {
      mockPrisma.campaign.findFirst.mockResolvedValue({
        id: 'camp-1',
        name: 'Done Camp',
        status: 'COMPLETED',
        workspaceId: 'ws-1',
        filters: {},
        messageTemplate: 'hello',
        aiStrategy: null,
        parentId: null,
        scheduledAt: null,
        stats: { sent: 0, delivered: 0, read: 0, failed: 0 },
      });

      await expect(service.launch('ws-1', 'camp-1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when campaign does not exist', async () => {
      mockPrisma.campaign.findFirst.mockResolvedValue(null);

      await expect(service.launch('ws-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('evaluateDarwin', () => {
    it('throws BadRequestException when there are no variants', async () => {
      const parentCamp = {
        id: 'parent-1',
        name: 'Parent',
        status: 'COMPLETED',
        stats: { sent: 50, replied: 10 },
        workspaceId: 'ws-1',
        messageTemplate: 'base',
        aiStrategy: null,
        parentId: null,
        filters: {},
        scheduledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.campaign.findFirst.mockResolvedValue(parentCamp);
      mockPrisma.campaign.findMany.mockResolvedValue([]);

      await expect(service.evaluateDarwin('ws-1', 'parent-1')).rejects.toThrow(BadRequestException);
    });

    it('promotes the variant with highest reply rate', async () => {
      const parentCamp = {
        id: 'parent-1',
        name: 'Parent',
        status: 'COMPLETED',
        stats: { sent: 100, replied: 15 },
        messageTemplate: 'base',
        aiStrategy: null,
        workspaceId: 'ws-1',
        filters: {},
        parentId: null,
        scheduledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const betterVariant = {
        id: 'var-2',
        name: 'Var 2',
        status: 'COMPLETED',
        stats: { sent: 100, replied: 40 },
        messageTemplate: 'better copy',
        aiStrategy: null,
        parentId: 'parent-1',
        workspaceId: 'ws-1',
        filters: {},
        scheduledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const worseVariant = {
        id: 'var-1',
        name: 'Var 1',
        status: 'COMPLETED',
        stats: { sent: 100, replied: 10 },
        messageTemplate: 'worse copy',
        aiStrategy: null,
        parentId: 'parent-1',
        workspaceId: 'ws-1',
        filters: {},
        scheduledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.campaign.findFirst.mockResolvedValue(parentCamp);
      mockPrisma.campaign.findMany.mockResolvedValue([betterVariant, worseVariant]);

      const result = await service.evaluateDarwin('ws-1', 'parent-1');

      expect(result.winner).toBe('var-2');
      expect(result.promotedTo).toBe('parent-1');
      expect(result.score).toBeCloseTo(0.4);

      expect(mockPrisma.campaign.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'parent-1', workspaceId: 'ws-1' },
          data: expect.objectContaining({ messageTemplate: 'better copy' }),
        }),
      );
    });
  });
});
