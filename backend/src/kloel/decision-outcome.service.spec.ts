import { Test, TestingModule } from '@nestjs/testing';
import { DecisionOutcomeService } from './decision-outcome.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DecisionOutcomeService', () => {
  let service: DecisionOutcomeService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DecisionOutcomeService,
        {
          provide: PrismaService,
          useValue: {
            decisionOutcome: {
              create: jest.fn().mockResolvedValue({ id: 'do-1' }),
              findFirst: jest.fn().mockResolvedValue(null),
              findMany: jest.fn().mockResolvedValue([]),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            decisionOutcomeEvent: {
              create: jest.fn().mockResolvedValue({ id: 'ev-1' }),
            },
          },
        },
      ],
    }).compile();

    service = module.get(DecisionOutcomeService);
    prisma = module.get(PrismaService);
  });

  describe('recordDecision', () => {
    it('persists a decision outcome record', async () => {
      await service.recordDecision({
        workspaceId: 'ws-1',
        decisionType: 'followup_timing',
        chosenAction: 'send_now',
        baselineAction: 'delay_24h',
        outcomeKey: 'followup:ws-1:c1:123',
        expectedWindow: 48,
        contextSnapshot: { channel: 'whatsapp' },
      });

      expect(prisma.decisionOutcome.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws-1',
            decisionType: 'followup_timing',
            chosenAction: 'send_now',
            baselineAction: 'delay_24h',
            outcomeKey: 'followup:ws-1:c1:123',
            expectedWindow: 48,
          }),
        }),
      );
    });
  });

  describe('closeOutcome', () => {
    it('closes an open decision by outcomeKey', async () => {
      await service.closeOutcome({
        outcomeKey: 'followup:ws-1:c1:123',
        outcomeName: 'inbound.received',
        economicValue: 99.9,
        wonVsBaseline: true,
      });

      expect(prisma.decisionOutcome.updateMany).toHaveBeenCalledWith({
        where: { outcomeKey: 'followup:ws-1:c1:123', outcomeAt: null },
        data: expect.objectContaining({
          outcomeName: 'inbound.received',
          economicValue: 99.9,
          wonVsBaseline: true,
        }),
      });
    });
  });

  describe('recordDecision (additional paths)', () => {
    it('persists baselineAction=null when not provided', async () => {
      await service.recordDecision({
        workspaceId: 'ws-2',
        decisionType: 'audio_vs_text',
        chosenAction: 'audio',
        outcomeKey: 'k:b',
        expectedWindow: 24,
        contextSnapshot: { channel: 'whatsapp' },
      });
      expect(prisma.decisionOutcome.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ baselineAction: null }),
        }),
      );
    });

    it('serializes contextSnapshot through JSON.stringify (Prisma JSON safety)', async () => {
      const symbol = Symbol('not-serializable');
      // The service should NOT throw — JSON.stringify drops symbols silently.
      await expect(
        service.recordDecision({
          workspaceId: 'ws-3',
          decisionType: 'product_offer',
          chosenAction: 'top_seller',
          outcomeKey: 'k:c',
          expectedWindow: 48,
          contextSnapshot: { channel: 'instagram', token: symbol },
        }),
      ).resolves.toBeUndefined();
      const lastCall = (prisma.decisionOutcome.create as jest.Mock).mock.calls.at(-1);
      const ctx = (lastCall![0].data as { contextSnapshot: Record<string, unknown> })
        .contextSnapshot;
      expect(ctx.token).toBeUndefined();
      expect(ctx.channel).toBe('instagram');
    });
  });

  describe('closeOutcome (additional paths)', () => {
    it('preserves outcomeValue when provided', async () => {
      await service.closeOutcome({
        outcomeKey: 'k1',
        outcomeName: 'payment.succeeded',
        outcomeValue: { amount: 99.9, currency: 'BRL' },
      });
      const data = (prisma.decisionOutcome.updateMany as jest.Mock).mock.calls.at(-1)![0].data as {
        outcomeValue?: { amount: number };
      };
      expect(data.outcomeValue).toEqual({ amount: 99.9, currency: 'BRL' });
    });

    it('defaults economicValue to null when not provided', async () => {
      await service.closeOutcome({ outcomeKey: 'k1', outcomeName: 'inbound.received' });
      const data = (prisma.decisionOutcome.updateMany as jest.Mock).mock.calls.at(-1)![0].data as {
        economicValue: number | null;
        wonVsBaseline: boolean | null;
      };
      expect(data.economicValue).toBeNull();
      expect(data.wonVsBaseline).toBeNull();
    });

    it('only updates rows still open (outcomeAt: null) — closed rows untouched', async () => {
      await service.closeOutcome({
        outcomeKey: 'k-already-closed',
        outcomeName: 'payment.succeeded',
      });
      const call = (prisma.decisionOutcome.updateMany as jest.Mock).mock.calls.at(-1);
      expect(call![0].where).toEqual({ outcomeKey: 'k-already-closed', outcomeAt: null });
    });
  });

  describe('findOpenByWorkspace', () => {
    it('queries with outcomeAt: null and orders by createdAt desc', async () => {
      await service.findOpenByWorkspace('ws-1');
      expect(prisma.decisionOutcome.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', outcomeAt: null },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findClosedByDecisionType', () => {
    it('filters by workspace, decisionType, and outcomeAt >= since', async () => {
      const since = new Date('2026-05-01T00:00:00Z');
      await service.findClosedByDecisionType('ws-1', 'followup_timing', since);
      expect(prisma.decisionOutcome.findMany).toHaveBeenCalledWith({
        where: {
          workspaceId: 'ws-1',
          decisionType: 'followup_timing',
          outcomeAt: { not: null, gte: since },
        },
        orderBy: { outcomeAt: 'desc' },
      });
    });
  });

  describe('findAllClosedSince', () => {
    it('returns all closed rows across workspaces since the given date', async () => {
      const since = new Date('2026-05-01T00:00:00Z');
      await service.findAllClosedSince(since);
      expect(prisma.decisionOutcome.findMany).toHaveBeenCalledWith({
        where: { outcomeAt: { not: null, gte: since } },
        orderBy: { outcomeAt: 'desc' },
      });
    });
  });

  describe('recordEvent', () => {
    it('persists a raw outcome event', async () => {
      await service.recordEvent({
        workspaceId: 'ws-1',
        eventType: 'payment.succeeded',
        eventKey: 'pay_123',
      });

      expect(prisma.decisionOutcomeEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws-1',
            eventType: 'payment.succeeded',
            eventKey: 'pay_123',
          }),
        }),
      );
    });
  });

  describe('sweepExpired', () => {
    it('closes expired open decisions', async () => {
      jest.spyOn(prisma.decisionOutcome, 'findMany').mockResolvedValue([
        {
          id: 'do-1',
          outcomeKey: 'expired-key-1',
          workspaceId: 'ws-1',
          decisionType: 'followup_timing',
          chosenAction: 'send_now',
          baselineAction: null,
          expectedWindow: 48,
          contextSnapshot: {},
          outcomeAt: null,
          outcomeName: null,
          outcomeValue: null,
          economicValue: null,
          wonVsBaseline: false,
          createdAt: new Date(),
        },
        {
          id: 'do-2',
          outcomeKey: 'expired-key-2',
          workspaceId: 'ws-1',
          decisionType: 'coupon_offer',
          chosenAction: 'coupon_10',
          baselineAction: null,
          expectedWindow: 24,
          contextSnapshot: {},
          outcomeAt: null,
          outcomeName: null,
          outcomeValue: null,
          economicValue: null,
          wonVsBaseline: false,
          createdAt: new Date(),
        },
      ]);

      const count = await service.sweepExpired('ws-1', 24);

      expect(count).toBe(2);
      expect(prisma.decisionOutcome.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['do-1', 'do-2'] } },
        data: expect.objectContaining({
          outcomeName: 'inbound.silent_24h',
          wonVsBaseline: false,
          outcomeValue: expect.objectContaining({
            reason: 'expired_without_reply',
            maxAgeHours: 24,
            outcomeKeys: ['expired-key-1', 'expired-key-2'],
          }),
        }),
      });
    });
  });
});
