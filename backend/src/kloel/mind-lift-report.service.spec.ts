import { existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { MindLiftReportService } from './mind-lift-report.service';
import { DecisionOutcomeService } from './decision-outcome.service';

describe('MindLiftReportService', () => {
  let service: MindLiftReportService;
  let decisionOutcome: DecisionOutcomeService;

  type ClosedOutcomeRow = Awaited<
    ReturnType<DecisionOutcomeService['findAllClosedSince']>
  >[number];

  const outcomeRow = (
    overrides: Partial<ClosedOutcomeRow> = {},
  ): ClosedOutcomeRow =>
    ({
      id: 'do-1',
      workspaceId: 'ws-1',
      decisionType: 'followup_timing',
      chosenAction: 'send_now',
      baselineAction: 'delay_24h',
      outcomeKey: 'k1',
      expectedWindow: 24,
      contextSnapshot: { channel: 'whatsapp' },
      outcomeAt: new Date(),
      outcomeName: 'payment.succeeded',
      outcomeValue: null,
      economicValue: 99.9,
      wonVsBaseline: true,
      createdAt: new Date(),
      ...overrides,
    }) as ClosedOutcomeRow;

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

    it('groups by decisionType and channel — confirms sorting by successRate desc', async () => {
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
        }) as Awaited<ReturnType<typeof decisionOutcome.findAllClosedSince>>[number];

      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([
        row({}),
        row({
          id: 'do-2',
          outcomeKey: 'k2',
          chosenAction: 'delay_24h',
          outcomeName: 'inbound.silent_24h',
          economicValue: 0,
          wonVsBaseline: false,
        }),
        row({
          id: 'do-3',
          outcomeKey: 'k3',
          decisionType: 'coupon_offer',
          chosenAction: 'coupon_10',
          baselineAction: 'no_coupon',
          expectedWindow: 24,
          contextSnapshot: { channel: 'email' },
          outcomeName: 'coupon.redeemed',
          economicValue: 50,
          wonVsBaseline: true,
        }),
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

      // Sort invariant: emailRow (1/1 = 100%) comes before whatsappRow (1/2 = 50%)
      const emailIdx = report.rows.findIndex(
        (r) => r.decisionType === 'coupon_offer' && r.channel === 'email',
      );
      const whatsappIdx = report.rows.findIndex(
        (r) => r.decisionType === 'followup_timing' && r.channel === 'whatsapp',
      );
      expect(emailIdx).toBeLessThan(whatsappIdx);
    });

    it('computes Wilson 95% CI bounds within [0,1] for sparse data', async () => {
      const row = (overrides: object) => ({
        id: 'do-1',
        workspaceId: 'ws-1',
        decisionType: 'audio_vs_text',
        chosenAction: 'audio',
        baselineAction: 'text',
        outcomeKey: 'k',
        expectedWindow: 24,
        contextSnapshot: { channel: 'whatsapp' },
        outcomeAt: new Date(),
        outcomeName: 'payment.succeeded',
        outcomeValue: null,
        economicValue: 50,
        wonVsBaseline: true,
        createdAt: new Date(),
        ...overrides,
      });
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([row({})]);

      const report = await service.aggregate();
      const r = report.rows[0]!;
      expect(r.successRate).toBe(1);
      // For 1/1 trial, Wilson lower bound must be > 0 but < 1 (not arrogant 100% claim)
      expect(r.lowerCI).toBeGreaterThan(0);
      expect(r.lowerCI).toBeLessThan(1);
      expect(r.upperCI).toBeLessThanOrEqual(1);
      expect(r.upperCI).toBeGreaterThanOrEqual(r.lowerCI);
    });

    it('Wilson CI lower bound is 0 when there are zero successes', async () => {
      const row = (overrides: object) => ({
        id: 'do-1',
        workspaceId: 'ws-1',
        decisionType: 'audio_vs_text',
        chosenAction: 'audio',
        baselineAction: 'text',
        outcomeKey: 'k',
        expectedWindow: 24,
        contextSnapshot: { channel: 'whatsapp' },
        outcomeAt: new Date(),
        outcomeName: 'inbound.silent_24h', // weight 0 → not a success
        outcomeValue: null,
        economicValue: 0,
        wonVsBaseline: false,
        createdAt: new Date(),
        ...overrides,
      });
      jest
        .spyOn(decisionOutcome, 'findAllClosedSince')
        .mockResolvedValue([row({}), row({ id: 'do-2', outcomeKey: 'k2' })]);

      const report = await service.aggregate();
      const r = report.rows[0]!;
      expect(r.successCount).toBe(0);
      expect(r.successRate).toBe(0);
      expect(r.lowerCI).toBe(0);
      expect(r.upperCI).toBeLessThan(1);
    });

    it('extractChannel: falls back to "source" key when channel is absent', async () => {
      const row = (overrides: object) => ({
        id: 'do-1',
        workspaceId: 'ws-1',
        decisionType: 'product_offer',
        chosenAction: 'top_seller',
        baselineAction: null,
        outcomeKey: 'k',
        expectedWindow: 24,
        contextSnapshot: { source: 'inbound' },
        outcomeAt: new Date(),
        outcomeName: 'payment.succeeded',
        outcomeValue: null,
        economicValue: 100,
        wonVsBaseline: true,
        createdAt: new Date(),
        ...overrides,
      });
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([row({})]);
      const report = await service.aggregate();
      expect(report.rows[0]!.channel).toBe('inbound');
    });

    it('extractChannel: returns "unknown" when both channel and source are missing', async () => {
      const row = {
        id: 'do-1',
        workspaceId: 'ws-1',
        decisionType: 'product_offer',
        chosenAction: 'top_seller',
        baselineAction: null,
        outcomeKey: 'k',
        expectedWindow: 24,
        contextSnapshot: {},
        outcomeAt: new Date(),
        outcomeName: 'payment.succeeded',
        outcomeValue: null,
        economicValue: 100,
        wonVsBaseline: true,
        createdAt: new Date(),
      };
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([row]);
      const report = await service.aggregate();
      expect(report.rows[0]!.channel).toBe('unknown');
    });

    it('distinguishes successCount (outcome weight ≥ 0.3) from wonCount (wonVsBaseline=true)', async () => {
      const row = (overrides: object) => ({
        id: 'do-1',
        workspaceId: 'ws-1',
        decisionType: 'audio_vs_text',
        chosenAction: 'audio',
        baselineAction: 'text',
        outcomeKey: 'k',
        expectedWindow: 24,
        contextSnapshot: { channel: 'whatsapp' },
        outcomeAt: new Date(),
        outcomeName: 'inbound.received', // weight 0.5 ≥ 0.3 → success
        outcomeValue: null,
        economicValue: 0,
        wonVsBaseline: false, // …but did NOT beat baseline
        createdAt: new Date(),
        ...overrides,
      });
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([row({})]);
      const report = await service.aggregate();
      const r = report.rows[0]!;
      expect(r.successCount).toBe(1);
      expect(r.wonCount).toBe(0);
      expect(r.wonRate).toBe(0);
    });

    it('aggregates failureReasonCounts from outcomeValue for inbound.silent_24h outcomes with expired_without_reply reason', async () => {
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([
        outcomeRow({
          outcomeName: 'inbound.silent_24h',
          economicValue: 0,
          wonVsBaseline: false,
          outcomeValue: {
            reason: 'expired_without_reply',
            maxAgeHours: 24,
            outcomeKeys: ['k1', 'k2', 'k3'],
          },
        }),
        outcomeRow({
          id: 'do-2',
          outcomeKey: 'k4',
          outcomeName: 'inbound.silent_24h',
          economicValue: 0,
          wonVsBaseline: false,
          outcomeValue: {
            reason: 'expired_without_reply',
            maxAgeHours: 24,
            outcomeKeys: ['k4'],
          },
        }),
      ]);

      const report = await service.aggregate();
      const r = report.rows[0]!;

      expect(r.successCount).toBe(0);
      expect(r.successRate).toBe(0);
      expect(r.failureReasonCounts).toHaveLength(1);
      expect(r.failureReasonCounts[0]!.reason).toBe('expired_without_reply');
      expect(r.failureReasonCounts[0]!.chosenAction).toBe('send_now');
      expect(r.failureReasonCounts[0]!.baselineAction).toBe('delay_24h');
      expect(r.failureReasonCounts[0]!.count).toBe(2);
      expect(r.failureReasonCounts[0]!.totalOutcomeKeys).toBe(4);
    });

    it('does not merge the same failure reason across different chosen actions', async () => {
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([
        outcomeRow({
          chosenAction: 'send_now',
          baselineAction: 'delay_24h',
          outcomeName: 'inbound.silent_24h',
          economicValue: 0,
          wonVsBaseline: false,
          outcomeValue: {
            reason: 'expired_without_reply',
            outcomeKeys: ['k1'],
          },
        }),
        outcomeRow({
          id: 'do-2',
          outcomeKey: 'k2',
          chosenAction: 'wait_for_signal',
          baselineAction: 'delay_24h',
          outcomeName: 'inbound.silent_24h',
          economicValue: 0,
          wonVsBaseline: false,
          outcomeValue: {
            reason: 'expired_without_reply',
            outcomeKeys: ['k2', 'k3'],
          },
        }),
      ]);

      const report = await service.aggregate();
      const reasons = report.rows[0]!.failureReasonCounts;

      expect(reasons).toHaveLength(2);
      expect(reasons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reason: 'expired_without_reply',
            chosenAction: 'send_now',
            baselineAction: 'delay_24h',
            count: 1,
            totalOutcomeKeys: 1,
          }),
          expect.objectContaining({
            reason: 'expired_without_reply',
            chosenAction: 'wait_for_signal',
            baselineAction: 'delay_24h',
            count: 1,
            totalOutcomeKeys: 2,
          }),
        ]),
      );
    });

    it('uses safe fallback labels when action context is absent or unsafe', async () => {
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([
        outcomeRow({
          chosenAction: null,
          baselineAction: 'manual note | private',
          outcomeName: 'inbound.silent_24h',
          outcomeValue: {
            reason: 'expired_without_reply',
            outcomeKeys: ['k1'],
          },
        }),
      ]);

      const report = await service.aggregate();
      const failure = report.rows[0]!.failureReasonCounts[0]!;

      expect(failure.chosenAction).toBe('unknown_action');
      expect(failure.baselineAction).toBe('unknown_baseline');
    });

    it('builds empty failureReasonCounts when outcomeValue has no reason field', async () => {
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([
        outcomeRow({ outcomeValue: { total: 100, currency: 'BRL' } }),
      ]);

      const report = await service.aggregate();
      expect(report.rows[0]!.failureReasonCounts).toEqual([]);
    });

    it('builds empty failureReasonCounts when outcomeValue is null', async () => {
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([
        outcomeRow(),
      ]);

      const report = await service.aggregate();
      expect(report.rows[0]!.failureReasonCounts).toEqual([]);
    });

    it('does not expose arbitrary failure reason text in reports', async () => {
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([
        outcomeRow({
          outcomeName: 'inbound.silent_24h',
          outcomeValue: {
            reason: 'customer said | private objection',
            outcomeKeys: ['k1'],
          },
        }),
      ]);

      const report = await service.aggregate();
      expect(report.rows[0]!.failureReasonCounts[0]!.reason).toBe(
        'unclassified_reason',
      );
      expect(report.rows[0]!.failureReasonCounts[0]!.chosenAction).toBe(
        'send_now',
      );
    });
  });

  describe('generateMarkdownReport', () => {
    let tmpDir: string;

    beforeEach(() => {
      // Isolate every run's report file via env override.
      tmpDir = resolve(tmpdir(), `mind-reports-spec-${Date.now()}-${Math.random()}`);
      process.env.MIND_REPORTS_DIR = tmpDir;
    });

    afterEach(() => {
      delete process.env.MIND_REPORTS_DIR;
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    });

    it('produces a markdown table with proper headers and writes to the override dir', async () => {
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([]);
      const md = await service.generateMarkdownReport(7);
      expect(md).toMatch(/^# MIND Lift Report/);
      expect(md).toContain('| Decision Type | Channel | Total | Closed |');
      expect(md).toContain('Window: 7 days');
      expect(md).toContain('Total decision-channel pairs: 0');

      expect(existsSync(tmpDir)).toBe(true);
      const files = readdirSync(tmpDir).filter((f: string) => f.endsWith('.md'));
      expect(files.length).toBe(1);
    });

    it('includes failure reason summary section in markdown when outcomes have reasons', async () => {
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([
        outcomeRow({
          outcomeName: 'inbound.silent_24h',
          economicValue: 0,
          wonVsBaseline: false,
          outcomeValue: {
            reason: 'expired_without_reply',
            maxAgeHours: 24,
            outcomeKeys: ['k1', 'k2'],
          },
        }),
        outcomeRow({
          id: 'do-2',
          outcomeKey: 'k2',
          decisionType: 'coupon_offer',
          chosenAction: 'coupon_10',
          contextSnapshot: { channel: 'email' },
          outcomeName: 'inbound.silent_24h',
          economicValue: 0,
          wonVsBaseline: false,
          outcomeValue: {
            reason: 'expired_without_reply',
            maxAgeHours: 12,
            outcomeKeys: ['k2', 'k3', 'k4'],
          },
        }),
      ]);

      const md = await service.generateMarkdownReport(7);

      expect(md).toContain('## Failure Reason Summary');
      expect(md).toContain(
        '| Decision Type | Channel | Chosen Action | Baseline Action | Reason | Count | Outcome Keys Total |',
      );
      expect(md).toContain(
        '| followup_timing | whatsapp | send_now | delay_24h | expired_without_reply | 1 | 2 |',
      );
      expect(md).toContain(
        '| coupon_offer | email | coupon_10 | delay_24h | expired_without_reply | 1 | 3 |',
      );
    });

    it('omits failure reason summary section when no outcomes have reasons', async () => {
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([
        outcomeRow(),
      ]);

      const md = await service.generateMarkdownReport(7);
      expect(md).not.toContain('## Failure Reason Summary');
    });

    it('creates the reports dir even if it does not exist yet (mkdir recursive)', async () => {
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([]);
      expect(existsSync(tmpDir)).toBe(false);
      await expect(service.generateMarkdownReport(14)).resolves.toBeDefined();
      expect(existsSync(tmpDir)).toBe(true);
    });
  });
});
