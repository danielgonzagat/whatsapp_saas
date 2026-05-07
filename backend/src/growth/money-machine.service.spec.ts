import { Test, TestingModule } from '@nestjs/testing';
import { CampaignsService } from '../campaigns/campaigns.service';
import { PrismaService } from '../prisma/prisma.service';
import { MoneyMachineService } from './money-machine.service';

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValueOnce('flow-id-1').mockReturnValueOnce('node-id-1'),
}));

describe('MoneyMachineService', () => {
  let service: MoneyMachineService;
  let prisma: {
    contact: { count: jest.Mock };
    flow: { create: jest.Mock };
    message: { count: jest.Mock };
  };
  let campaigns: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      contact: { count: jest.fn() },
      flow: { create: jest.fn().mockResolvedValue({ id: 'flow-1' }) },
      message: { count: jest.fn() },
    };
    campaigns = {
      create: jest.fn().mockResolvedValue({ id: 'campaign-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoneyMachineService,
        { provide: PrismaService, useValue: prisma },
        { provide: CampaignsService, useValue: campaigns },
      ],
    }).compile();

    service = module.get<MoneyMachineService>(MoneyMachineService);
  });

  describe('activateMachine', () => {
    it('delegates to activate method', async () => {
      prisma.contact.count.mockResolvedValue(0);

      const result = await service.activateMachine('ws-1');

      expect(result.status).toBe('IDLE');
      expect(result.reason).toBe('No opportunities found');
    });
  });

  describe('activate', () => {
    it('returns IDLE when no inactive leads found', async () => {
      prisma.contact.count.mockResolvedValue(0);

      const result = await service.activate('ws-1');

      expect(result).toEqual({
        status: 'IDLE',
        reason: 'No opportunities found',
      });
    });

    it('creates campaign and flow when inactive leads exist', async () => {
      prisma.contact.count.mockResolvedValue(42);

      const result = await service.activate('ws-1');

      expect(result.status).toBe('ACTIVE');
      expect(result.found).toEqual({ inactiveLeads: 42 });
      expect(result.actions).toHaveLength(1);
      expect(result.actions![0]).toContain('Created Campaign');

      expect(prisma.flow.create).toHaveBeenCalledTimes(1);
      expect(campaigns.create).toHaveBeenCalledTimes(1);

      const flowCall = prisma.flow.create.mock.calls[0][0];
      expect(flowCall.data.name).toContain('MoneyMachine');
      expect(flowCall.data.nodes).toHaveLength(1);
      expect(flowCall.data.nodes[0].type).toBe('messageNode');

      const campaignCall = campaigns.create.mock.calls[0];
      expect(campaignCall[0]).toBe('ws-1');
      expect(campaignCall[1].name).toContain('MoneyMachine');
      expect(campaignCall[1].filters).toEqual({ lastActive: '30d' });
    });

    it('scans contacts inactive for more than 30 days', async () => {
      prisma.contact.count.mockResolvedValue(0);

      await service.activate('ws-1');

      const countCall = prisma.contact.count.mock.calls[0][0];
      expect(countCall.where.conversations.some.lastMessageAt.lt).toBeInstanceOf(Date);
    });
  });

  describe('getDailyReport', () => {
    it('returns daily report with sent and inbound counts', async () => {
      prisma.message.count
        .mockResolvedValueOnce(25) // sent (OUTBOUND)
        .mockResolvedValueOnce(10); // inbound (INBOUND)

      const result = await service.getDailyReport('ws-1');

      expect(result).toHaveProperty('workspaceId', 'ws-1');
      expect(result).toHaveProperty('date');
      expect(result.sent).toBe(25);
      expect(result.inbound).toBe(10);
      expect(result.note).toContain('sintético');
    });

    it('returns zero counts when no messages today', async () => {
      prisma.message.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      const result = await service.getDailyReport('ws-1');

      expect(result.sent).toBe(0);
      expect(result.inbound).toBe(0);
    });

    it('filters messages by today only', async () => {
      prisma.message.count.mockResolvedValue(0);

      await service.getDailyReport('ws-1');

      const outboundCall = prisma.message.count.mock.calls[0][0];
      expect(outboundCall.where.createdAt.gte).toBeInstanceOf(Date);
      expect(outboundCall.where.direction).toBe('OUTBOUND');

      const inboundCall = prisma.message.count.mock.calls[1][0];
      expect(inboundCall.where.createdAt.gte).toBeInstanceOf(Date);
      expect(inboundCall.where.direction).toBe('INBOUND');
    });
  });
});
