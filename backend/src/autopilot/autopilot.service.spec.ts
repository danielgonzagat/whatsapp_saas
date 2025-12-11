import { Test, TestingModule } from '@nestjs/testing';
import { AutopilotService } from './autopilot.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';

describe('AutopilotService', () => {
  let service: AutopilotService;
  let prisma: jest.Mocked<PrismaService>;

  const mockPrisma = {
    workspace: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    contact: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    autopilotConfig: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        OPENAI_API_KEY: 'test-key',
        AUTOPILOT_CONTACT_DAILY_LIMIT: 5,
        AUTOPILOT_WORKSPACE_DAILY_LIMIT: 1000,
        AUTOPILOT_SILENCE_HOURS: 24,
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutopilotService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: getQueueToken('autopilot-jobs'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<AutopilotService>(AutopilotService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isAutopilotEnabled', () => {
    it('should return false for suspended workspace', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { billingSuspended: true },
      });

      const result = await service.isAutopilotEnabled('ws-1');
      expect(result).toBe(false);
    });

    it('should return true for active workspace with autopilot enabled', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { autopilotEnabled: true },
      });
      mockPrisma.autopilotConfig.findUnique.mockResolvedValue({
        enabled: true,
        workspaceId: 'ws-1',
      });

      const result = await service.isAutopilotEnabled('ws-1');
      expect(result).toBe(true);
    });
  });

  describe('getAutopilotConfig', () => {
    it('should return default config if none exists', async () => {
      mockPrisma.autopilotConfig.findUnique.mockResolvedValue(null);

      const result = await service.getAutopilotConfig('ws-1');
      expect(result).toHaveProperty('enabled', false);
      expect(result).toHaveProperty('dailyContactLimit', 5);
    });

    it('should return stored config', async () => {
      const storedConfig = {
        enabled: true,
        dailyContactLimit: 10,
        silenceHours: 12,
        personality: 'friendly',
      };
      mockPrisma.autopilotConfig.findUnique.mockResolvedValue(storedConfig);

      const result = await service.getAutopilotConfig('ws-1');
      expect(result).toEqual(storedConfig);
    });
  });

  describe('toggleAutopilot', () => {
    it('should enable autopilot for workspace', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: {},
      });
      mockPrisma.autopilotConfig.update.mockResolvedValue({
        enabled: true,
        workspaceId: 'ws-1',
      });

      const result = await service.toggleAutopilot('ws-1', true);
      expect(result.enabled).toBe(true);
    });

    it('should fail if workspace is suspended', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { billingSuspended: true },
      });

      await expect(service.toggleAutopilot('ws-1', true))
        .rejects.toThrow('Workspace está suspenso');
    });
  });

  describe('processIncomingMessage', () => {
    it('should add job to queue for autopilot-enabled workspace', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { autopilotEnabled: true },
      });
      mockPrisma.autopilotConfig.findUnique.mockResolvedValue({
        enabled: true,
        workspaceId: 'ws-1',
      });
      mockPrisma.contact.findFirst.mockResolvedValue({
        id: 'contact-1',
        phone: '5511999999999',
        dailyMessageCount: 2,
      });

      await service.processIncomingMessage('ws-1', {
        from: '5511999999999',
        body: 'Olá',
        conversationId: 'conv-1',
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'analyze-intent',
        expect.objectContaining({
          workspaceId: 'ws-1',
          contactPhone: '5511999999999',
        }),
      );
    });

    it('should skip if daily limit reached', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { autopilotEnabled: true },
      });
      mockPrisma.autopilotConfig.findUnique.mockResolvedValue({
        enabled: true,
        dailyContactLimit: 5,
        workspaceId: 'ws-1',
      });
      mockPrisma.contact.findFirst.mockResolvedValue({
        id: 'contact-1',
        phone: '5511999999999',
        dailyMessageCount: 5,
      });

      await service.processIncomingMessage('ws-1', {
        from: '5511999999999',
        body: 'Olá',
        conversationId: 'conv-1',
      });

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('Rate Limiting', () => {
    it('should respect workspace daily limit', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { autopilotEnabled: true },
        _count: { autopilotMessages: 1000 },
      });

      const result = await service.checkWorkspaceDailyLimit('ws-1');
      expect(result.limitReached).toBe(true);
    });

    it('should allow messages within limit', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        providerSettings: { autopilotEnabled: true },
        _count: { autopilotMessages: 50 },
      });

      const result = await service.checkWorkspaceDailyLimit('ws-1');
      expect(result.limitReached).toBe(false);
    });
  });
});
