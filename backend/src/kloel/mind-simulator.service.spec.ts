import { MindQualityService } from './mind/policy/mind-quality.service';
import { MindReplayService } from './mind-replay.service';
import { MindSimulatorService } from './mind-simulator.service';
import { MindSyntheticGeneratorService } from './mind-synthetic-generator.service';

describe('MindSimulatorService', () => {
  let service: MindSimulatorService;
  let replay: MindReplayService;
  let quality: MindQualityService;
  let synthetic: MindSyntheticGeneratorService;

  beforeEach(() => {
    replay = new MindReplayService();
    quality = new MindQualityService();
    synthetic = new MindSyntheticGeneratorService();
    service = new MindSimulatorService(replay, quality, synthetic);
  });

  describe('simulate', () => {
    it('produces a report with replay and quality data', () => {
      const report = service.simulate({
        workspaceId: 'ws-1',
        scenario: {
          workspaceId: 'ws-1',
          decisions: [
            {
              workspaceId: 'ws-1',
              decisionType: 'followup_timing',
              candidates: [
                { action: '5m', beliefMean: 0.3, beliefVariance: 0.2 },
                { action: '30m', beliefMean: 0.7, beliefVariance: 0.1 },
              ],
              baseline: '30m',
            },
            {
              workspaceId: 'ws-1',
              decisionType: 'cart_recovery',
              candidates: [
                { action: 'proof', beliefMean: 0.4, beliefVariance: 0.3 },
                { action: 'discount', beliefMean: 0.8, beliefVariance: 0.05 },
              ],
              baseline: 'discount',
            },
          ],
        },
        actions: [
          {
            action: '30m',
            decisionType: 'followup_timing',
            context: { supportsAudio: true, contactOptOut: false },
          },
          {
            action: 'discount',
            decisionType: 'cart_recovery',
            context: { supportsAudio: true, contactOptOut: false },
          },
        ],
        liftData: {
          lift: 0.1,
          pZScore: 1.2,
          samples: 100,
          fallbackActive: false,
        },
      });

      expect(report.workspaceId).toBe('ws-1');
      expect(report.replay.totalDecisions).toBe(2);
      expect(report.summary.totalDecisions).toBe(2);
      expect(report.quality.total).toBeGreaterThan(0);
      expect(report.decisionDetails).toHaveLength(2);
    });

    it('marks verdict as clean when all checks pass and baseline match is high', () => {
      const report = service.simulate({
        workspaceId: 'ws-1',
        scenario: {
          workspaceId: 'ws-1',
          decisions: [
            {
              workspaceId: 'ws-1',
              decisionType: 'followup_timing',
              candidates: [{ action: '30m', beliefMean: 0.9, beliefVariance: 0.01 }],
              baseline: '30m',
            },
          ],
        },
        actions: [
          {
            action: '30m',
            decisionType: 'followup_timing',
            context: { supportsAudio: true, contactOptOut: false },
          },
        ],
        liftData: {
          lift: 0.1,
          pZScore: 1.2,
          samples: 100,
          fallbackActive: false,
        },
      });

      expect(report.summary.overallVerdict).toBe('clean');
    });

    it('marks verdict as warning when quality fails', () => {
      const report = service.simulate({
        workspaceId: 'ws-1',
        scenario: {
          workspaceId: 'ws-1',
          decisions: [
            {
              workspaceId: 'ws-1',
              decisionType: 'followup_timing',
              candidates: [{ action: '30m', beliefMean: 0.9, beliefVariance: 0.01 }],
              baseline: '30m',
            },
          ],
        },
        actions: [
          {
            action: 'execute_payment',
            decisionType: 'followup_timing',
            context: { supportsAudio: true, contactOptOut: false },
          },
        ],
        liftData: {
          lift: 0.1,
          pZScore: 1.2,
          samples: 100,
          fallbackActive: false,
        },
      });

      expect(report.summary.overallVerdict).toBe('warning');
    });

    it('marks verdict as critical when many quality checks fail', () => {
      const report = service.simulate({
        workspaceId: 'ws-1',
        scenario: {
          workspaceId: 'ws-1',
          decisions: [
            {
              workspaceId: 'ws-1',
              decisionType: 'followup_timing',
              candidates: [{ action: '30m', beliefMean: 0.9, beliefVariance: 0.01 }],
              baseline: '30m',
            },
          ],
        },
        actions: [
          { action: 'execute_payment', decisionType: 'test', context: {} },
          { action: 'pay_now', decisionType: 'test', context: {} },
          { action: 'charge_card', decisionType: 'test', context: {} },
        ],
        liftData: {
          lift: 0.1,
          pZScore: 1.2,
          samples: 100,
          fallbackActive: false,
        },
      });

      expect(report.summary.overallVerdict).toBe('critical');
    });

    it('sets decisionDetails with match information', () => {
      const report = service.simulate({
        workspaceId: 'ws-1',
        scenario: {
          workspaceId: 'ws-1',
          decisions: [
            {
              workspaceId: 'ws-1',
              decisionType: 'coupon_offer',
              candidates: [
                { action: 'coupon_10', beliefMean: 0.5, beliefVariance: 0.1 },
                { action: 'no_coupon', beliefMean: 0.9, beliefVariance: 0.01 },
              ],
              baseline: 'no_coupon',
            },
          ],
        },
        actions: [
          {
            action: 'no_coupon',
            decisionType: 'coupon_offer',
            context: { supportsAudio: true, contactOptOut: false },
          },
        ],
        liftData: {
          lift: 0.05,
          pZScore: 0.5,
          samples: 50,
          fallbackActive: false,
        },
      });

      expect(report.decisionDetails).toHaveLength(1);
      expect(report.decisionDetails[0].decisionType).toBe('coupon_offer');
      expect(report.decisionDetails[0].candidateCount).toBe(2);
    });
  });

  describe('simulateFromDecisions', () => {
    it('delegates to simulate with constructed input', () => {
      const report = service.simulateFromDecisions(
        'ws-1',
        [
          {
            workspaceId: 'ws-1',
            decisionType: 'human_transfer',
            candidates: [
              { action: 'transfer_now', beliefMean: 0.2, beliefVariance: 0.4 },
              { action: 'retry_ai', beliefMean: 0.6, beliefVariance: 0.1 },
            ],
            baseline: 'retry_ai',
          },
        ],
        [
          {
            action: 'retry_ai',
            decisionType: 'human_transfer',
            context: { supportsAudio: true, contactOptOut: false },
          },
        ],
        { lift: 0, pZScore: 0, samples: 10, fallbackActive: false },
      );

      expect(report.workspaceId).toBe('ws-1');
      expect(report.replay.totalDecisions).toBe(1);
    });
  });

  describe('reportToMarkdown', () => {
    it('produces markdown with expected sections', () => {
      const report = service.simulate({
        workspaceId: 'ws-1',
        scenario: {
          workspaceId: 'ws-1',
          decisions: [
            {
              workspaceId: 'ws-1',
              decisionType: 'channel_choice',
              candidates: [
                { action: 'whatsapp', beliefMean: 0.8, beliefVariance: 0.05 },
                { action: 'email', beliefMean: 0.4, beliefVariance: 0.2 },
              ],
              baseline: 'whatsapp',
            },
          ],
        },
        actions: [
          {
            action: 'whatsapp',
            decisionType: 'channel_choice',
            context: { supportsAudio: true, contactOptOut: false },
          },
        ],
        liftData: {
          lift: 0.2,
          pZScore: 1.5,
          samples: 80,
          fallbackActive: false,
        },
      });

      const markdown = service.reportToMarkdown(report);

      expect(markdown).toContain('# MIND Simulation Report');
      expect(markdown).toContain('ws-1');
      expect(markdown).toContain('Summary');
      expect(markdown).toContain('Decisions');
      expect(markdown).toContain('Quality Checks');
      expect(markdown).toContain('channel_choice');
      expect(markdown).toContain('whatsapp');
    });

    it('truncates long detail strings', () => {
      const report = service.simulate({
        workspaceId: 'ws-xxx',
        scenario: {
          workspaceId: 'ws-xxx',
          decisions: [
            {
              workspaceId: 'ws-xxx',
              decisionType: 'followup_timing',
              candidates: [{ action: '5m', beliefMean: 0.5, beliefVariance: 0.1 }],
              baseline: '5m',
            },
          ],
        },
        actions: [
          {
            action: 'send_audio_message',
            decisionType: 'followup_timing',
            context: { supportsAudio: false },
          },
        ],
        liftData: {
          lift: 0,
          pZScore: 0,
          samples: 1,
          fallbackActive: false,
        },
      });

      const markdown = service.reportToMarkdown(report);

      expect(markdown).toContain('audio');
    });
  });

  describe('reportToJson', () => {
    it('produces valid JSON that can be parsed back', () => {
      const report = service.simulate({
        workspaceId: 'ws-1',
        scenario: {
          workspaceId: 'ws-1',
          decisions: [
            {
              workspaceId: 'ws-1',
              decisionType: 'cart_recovery',
              candidates: [{ action: 'proof', beliefMean: 0.5, beliefVariance: 0.2 }],
            },
          ],
        },
        actions: [
          {
            action: 'proof',
            decisionType: 'cart_recovery',
            context: { supportsAudio: true, contactOptOut: false },
          },
        ],
        liftData: {
          lift: 0,
          pZScore: 0,
          samples: 10,
          fallbackActive: false,
        },
      });

      const json = service.reportToJson(report);
      const parsed = JSON.parse(json);

      expect(parsed.workspaceId).toBe('ws-1');
      expect(parsed.summary).toBeDefined();
      expect(parsed.replay).toBeDefined();
      expect(parsed.quality).toBeDefined();
    });
  });

  describe('verdict thresholds', () => {
    it('keeps verdict clean when MIND diverges from baseline without quality failures', () => {
      const report = service.simulate({
        workspaceId: 'ws-1',
        scenario: {
          workspaceId: 'ws-1',
          decisions: [
            {
              workspaceId: 'ws-1',
              decisionType: 'followup_timing',
              candidates: [
                { action: '5m', beliefMean: 0.9, beliefVariance: 0.01 },
                { action: '30m', beliefMean: 0.2, beliefVariance: 0.3 },
              ],
              baseline: '30m',
            },
          ],
        },
        actions: [
          {
            action: '5m',
            decisionType: 'followup_timing',
            context: { supportsAudio: true, contactOptOut: false },
          },
        ],
        liftData: {
          lift: 0.1,
          pZScore: 1.2,
          samples: 100,
          fallbackActive: false,
        },
      });

      expect(report.summary.baselineMatchRate).toBe(0);
      expect(report.summary.overallVerdict).toBe('clean');
    });
  });
});
