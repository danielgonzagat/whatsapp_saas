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
        } as Awaited<ReturnType<typeof decisionOutcome.findAllClosedSince>>[number]);

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
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([
        row({}) as never,
      ]);

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
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([
        row({}) as never,
        row({ id: 'do-2', outcomeKey: 'k2' }) as never,
      ]);

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
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([row({}) as never]);
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
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([row as never]);
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
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([row({}) as never]);
      const report = await service.aggregate();
      const r = report.rows[0]!;
      expect(r.successCount).toBe(1);
      expect(r.wonCount).toBe(0);
      expect(r.wonRate).toBe(0);
    });
  });

  describe('generateMarkdownReport', () => {
    let tmpDir: string;

    beforeEach(() => {
      // Isolate every run's report file via env override.
      const { tmpdir } = require('node:os');
      const { resolve } = require('node:path');
      tmpDir = resolve(tmpdir(), `mind-reports-spec-${Date.now()}-${Math.random()}`);
      process.env.MIND_REPORTS_DIR = tmpDir;
    });

    afterEach(() => {
      delete process.env.MIND_REPORTS_DIR;
      const { rmSync } = require('node:fs');
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

      const { existsSync, readdirSync } = require('node:fs');
      expect(existsSync(tmpDir)).toBe(true);
      const files = readdirSync(tmpDir).filter((f: string) => f.endsWith('.md'));
      expect(files.length).toBe(1);
    });

    it('creates the reports dir even if it does not exist yet (mkdir recursive)', async () => {
      jest.spyOn(decisionOutcome, 'findAllClosedSince').mockResolvedValue([]);
      const { existsSync } = require('node:fs');
      expect(existsSync(tmpDir)).toBe(false);
      await expect(service.generateMarkdownReport(14)).resolves.toBeDefined();
      expect(existsSync(tmpDir)).toBe(true);
    });
  });
});
