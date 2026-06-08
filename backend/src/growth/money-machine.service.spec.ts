import { Test, TestingModule } from '@nestjs/testing';
import { CampaignsService } from '../campaigns/campaigns.service';
import { PrismaService } from '../prisma/prisma.service';
import { MoneyMachineService } from './money-machine.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';
import { castMock } from '../../test/helpers/cast-mock';

describe('MoneyMachineService', () => {
  let service: MoneyMachineService;
  let prisma: ReturnType<typeof createPartialPrismaMock>;
  let campaigns: { create: jest.Mock };

  beforeEach(async () => {
    prisma = createPartialPrismaMock({
      contact: ['count'],
      flow: ['create'],
      message: ['count'],
      mindOutboxEvent: ['upsert'],
    });
    prisma.flow.create.mockResolvedValue({ id: 'flow-1' });
    prisma.mindOutboxEvent.upsert.mockResolvedValue(undefined);
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
      expect(result.actions[0]).toContain('Created Campaign');

      expect(prisma.flow.create).toHaveBeenCalledTimes(1);
      expect(campaigns.create).toHaveBeenCalledTimes(1);

      const flowCall = castMock<[{ data: { name: string; nodes: { type: string }[] } }]>(
        prisma.flow.create.mock.calls[0],
      )[0];
      expect(flowCall.data.name).toContain('MoneyMachine');
      expect(flowCall.data.nodes).toHaveLength(1);
      expect(flowCall.data.nodes[0].type).toBe('messageNode');

      const campaignCall = castMock<[string, { name: string; filters: unknown }]>(
        campaigns.create.mock.calls[0],
      );
      expect(campaignCall[0]).toBe('ws-1');
      expect(campaignCall[1].name).toContain('MoneyMachine');
      expect(campaignCall[1].filters).toEqual({ lastActive: '30d' });
    });

    it('scans contacts inactive for more than 30 days', async () => {
      prisma.contact.count.mockResolvedValue(0);

      await service.activate('ws-1');

      const countCall = castMock<
        [{ where: { conversations: { some: { lastMessageAt: { lt: unknown } } } } }]
      >(prisma.contact.count.mock.calls[0])[0];
      expect(countCall.where.conversations.some.lastMessageAt.lt).toBeInstanceOf(Date);
    });
  });

  describe('Money Machine -> Mind percept loop (KLOEL_MONEY_PERCEPT_ENABLED)', () => {
    const FLAG = 'KLOEL_MONEY_PERCEPT_ENABLED';
    const prevFlag = process.env[FLAG];

    afterEach(() => {
      if (prevFlag === undefined) {
        delete process.env[FLAG];
      } else {
        process.env[FLAG] = prevFlag;
      }
    });

    it('flag OFF (explicit =false): activate generates a campaign but emits NO percept (byte-identical to today)', async () => {
      process.env[FLAG] = 'false';
      prisma.contact.count.mockResolvedValue(42);

      const result = await service.activate('ws-1');

      // The legacy campaign-generation path is unchanged.
      expect(result.status).toBe('ACTIVE');
      expect(prisma.flow.create).toHaveBeenCalledTimes(1);
      expect(campaigns.create).toHaveBeenCalledTimes(1);
      // No cognition feedback reaches the Mind when the flag is OFF.
      expect(prisma.mindOutboxEvent.upsert).not.toHaveBeenCalled();
    });

    it('flag OFF (explicit =false) + IDLE scan: emits NO percept', async () => {
      process.env[FLAG] = 'false';
      prisma.contact.count.mockResolvedValue(0);

      const result = await service.activate('ws-1');

      expect(result.status).toBe('IDLE');
      expect(prisma.mindOutboxEvent.upsert).not.toHaveBeenCalled();
    });

    it('flag ON: the loop closes — activate emits BOTH the lead-scan and the campaign-generated percept', async () => {
      process.env[FLAG] = 'true';
      prisma.contact.count.mockResolvedValue(42);

      const result = await service.activate('ws-1');

      expect(result.status).toBe('ACTIVE');
      // Two percepts feed the Mind: the scan + the campaign-generation decision.
      expect(prisma.mindOutboxEvent.upsert).toHaveBeenCalledTimes(2);

      const eventTypes = (prisma.mindOutboxEvent.upsert.mock.calls as unknown[][]).map(
        (call) => (call[0] as { create: { eventType: string } }).create.eventType,
      );
      expect(eventTypes).toContain('cognition.money.lead_scan');
      expect(eventTypes).toContain('cognition.money.campaign_generated');
    });

    it('flag ON but IDLE scan: emits ONLY the lead-scan percept (no campaign decision)', async () => {
      process.env[FLAG] = 'true';
      prisma.contact.count.mockResolvedValue(0);

      const result = await service.activate('ws-1');

      expect(result.status).toBe('IDLE');
      expect(prisma.mindOutboxEvent.upsert).toHaveBeenCalledTimes(1);
      const onlyCall = (prisma.mindOutboxEvent.upsert.mock.calls[0] as unknown[])[0] as {
        create: { eventType: string };
      };
      expect(onlyCall.create.eventType).toBe('cognition.money.lead_scan');
    });

    it('flag ON + outbox throws: the campaign-generation path still succeeds (best-effort, never breaks the engine)', async () => {
      process.env[FLAG] = 'true';
      prisma.contact.count.mockResolvedValue(42);
      prisma.mindOutboxEvent.upsert.mockRejectedValue(new Error('db down'));

      const result = await service.activate('ws-1');

      expect(result.status).toBe('ACTIVE');
      expect(campaigns.create).toHaveBeenCalledTimes(1);
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

      const outboundCall = castMock<
        [{ where: { createdAt: { gte: unknown }; direction: string } }]
      >(prisma.message.count.mock.calls[0])[0];
      expect(outboundCall.where.createdAt.gte).toBeInstanceOf(Date);
      expect(outboundCall.where.direction).toBe('OUTBOUND');

      const inboundCall = castMock<[{ where: { createdAt: { gte: unknown }; direction: string } }]>(
        prisma.message.count.mock.calls[1],
      )[0];
      expect(inboundCall.where.createdAt.gte).toBeInstanceOf(Date);
      expect(inboundCall.where.direction).toBe('INBOUND');
    });
  });
});
