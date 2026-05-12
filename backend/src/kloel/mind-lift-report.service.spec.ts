import { Test, TestingModule } from '@nestjs/testing';
import { MindLiftReportService } from './mind-lift-report.service';
import { DecisionOutcomeService } from './decision-outcome.service';

describe('MindLiftReportService', () => {
  let service: MindLiftReportService;
  let decisionOutcome: DecisionOutcomeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MindLiftReportService,
        {
          provide: DecisionOutcomeService,
          useValue: {
            findAllClosedSince: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get(MindLiftReportService);
    decisionOutcome = module.get(DecisionOutcomeService);
  });

  describe('aggregate', () => {
    it('returns empty rows when no data', async () => {
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([]);

      const report = await service.aggregate();

      expect(report.rows).toHaveLength(0);
      expect(report.sinceDays).toBe(14);
    });

    it('groups by decisionType and channel', async () => {
      const row = (overrides: object) =>
        ({
          id: 'do-1',
          workspaceId: 'ws-1',
          decisionType: 'followup_timing',
          chosenAction: 'send_now',
          baselineAction: 'delay_24h',
          outcomeKey: 'k1',
          expectedWindow: 48,
          contextSnapshot: { channel: 'whatsapp' },
          outcomeAt: new Date(),
          outcomeName: 'payment.succeeded',
          outcomeValue: null,
          economicValue: 99.9,
          wonVsBaseline: true,
          createdAt: new Date(),
          ...overrides,
        } as unknown as Awaited<ReturnType<typeof decisionOutcome.findAllClosedSince>>[number]);

      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([
        row({}),
        row({ id: 'do-2', outcomeKey: 'k2', chosenAction: 'delay_24h', outcomeName: 'inbound.silent_24h', economicValue: 0, wonVsBaseline: false }),
        row({ id: 'do-3', outcomeKey: 'k3', decisionType: 'coupon_offer', chosenAction: 'coupon_10', baselineAction: 'no_coupon', expectedWindow: 24, contextSnapshot: { channel: 'email' }, outcomeName: 'coupon.redeemed', economicValue: 50, wonVsBaseline: true }),
      ]);

      const report = await service.aggregate();

      expect(report.rows.length).toBe(2);

      const whatsappRow = report.rows.find(
        (r) => r.decisionType === 'followup_timing' && r.channel === 'whatsapp',
      );
      expect(whatsappRow).toBeDefined();
      expect(whatsappRow!.total).toBe(2);
      expect(whatsappRow!.closed).toBe(2);

      const emailRow = report.rows.find(
        (r) => r.decisionType === 'coupon_offer' && r.channel === 'email',
      );
      expect(emailRow).toBeDefined();
      expect(emailRow!.total).toBe(1);
    });
  });
});
