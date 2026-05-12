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
        }),
      });
    });
  });
});
