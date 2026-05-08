import { MindQualityService } from './mind-quality.service';

describe('MindQualityService', () => {
  let service: MindQualityService;

  beforeEach(() => {
    service = new MindQualityService();
  });

  describe('checkCrossWorkspaceReads', () => {
    it('passes when all records belong to the same workspace', () => {
      const result = service.checkCrossWorkspaceReads('ws-1', [
        { workspaceId: 'ws-1' },
        { workspaceId: 'ws-1' },
        { workspaceId: 'ws-1' },
      ]);

      expect(result.passed).toBe(true);
      expect(result.invariant).toBe('no_cross_workspace_reads');
    });

    it('fails when any record belongs to a foreign workspace', () => {
      const result = service.checkCrossWorkspaceReads('ws-1', [
        { workspaceId: 'ws-1' },
        { workspaceId: 'ws-2' },
      ]);

      expect(result.passed).toBe(false);
      expect(result.detail).toContain('foreign workspace');
    });

    it('passes with empty records', () => {
      const result = service.checkCrossWorkspaceReads('ws-1', []);

      expect(result.passed).toBe(true);
    });
  });

  describe('checkNegativeLiftFallback', () => {
    it('fails when negative lift with significance should trigger fallback but does not', () => {
      const result = service.checkNegativeLiftFallback({
        lift: -0.3,
        pZScore: -2.5,
        samples: 50,
        fallbackActive: false,
      });

      expect(result.passed).toBe(false);
      expect(result.invariant).toBe('negative_lift_fallback');
    });

    it('passes when negative lift correctly triggers fallback', () => {
      const result = service.checkNegativeLiftFallback({
        lift: -0.3,
        pZScore: -2.5,
        samples: 50,
        fallbackActive: true,
      });

      expect(result.passed).toBe(true);
    });

    it('passes when lift is positive (no fallback needed)', () => {
      const result = service.checkNegativeLiftFallback({
        lift: 0.2,
        pZScore: 1.0,
        samples: 50,
        fallbackActive: false,
      });

      expect(result.passed).toBe(true);
    });

    it('passes when samples are below minimum threshold', () => {
      const result = service.checkNegativeLiftFallback({
        lift: -0.3,
        pZScore: -2.5,
        samples: 10,
        fallbackActive: false,
        minSamples: 30,
      });

      expect(result.passed).toBe(true);
    });
  });

  describe('checkUnsupportedTransportGuard', () => {
    it('fails when action uses audio but channel does not support it', () => {
      const result = service.checkUnsupportedTransportGuard('send_audio_message', {
        supportsAudio: false,
      });

      expect(result.passed).toBe(false);
      expect(result.detail).toContain('audio');
    });

    it('fails when action uses document but channel does not support it', () => {
      const result = service.checkUnsupportedTransportGuard('send_document_proposal', {
        supportsDocument: false,
      });

      expect(result.passed).toBe(false);
      expect(result.detail).toContain('document');
    });

    it('passes when action does not use restricted transport', () => {
      const result = service.checkUnsupportedTransportGuard('send_text_message', {
        supportsAudio: false,
        supportsDocument: false,
      });

      expect(result.passed).toBe(true);
    });

    it('passes when channel supports the requested transport', () => {
      const result = service.checkUnsupportedTransportGuard('send_audio_clip', {
        supportsAudio: true,
      });

      expect(result.passed).toBe(true);
    });
  });

  describe('checkOptOutGuard', () => {
    it('fails when contact has opted out', () => {
      const result = service.checkOptOutGuard({
        contactOptOut: true,
      });

      expect(result.passed).toBe(false);
      expect(result.invariant).toBe('opt_out_guard');
    });

    it('passes when contact has not opted out', () => {
      const result = service.checkOptOutGuard({
        contactOptOut: false,
      });

      expect(result.passed).toBe(true);
    });

    it('passes when context has no optOut property', () => {
      const result = service.checkOptOutGuard({});

      expect(result.passed).toBe(true);
    });
  });

  describe('checkNoPaymentExecution', () => {
    it('fails for execute_payment action', () => {
      const result = service.checkNoPaymentExecution('execute_payment_123');

      expect(result.passed).toBe(false);
    });

    it('fails for process_payment action', () => {
      const result = service.checkNoPaymentExecution('process_payment_now');

      expect(result.passed).toBe(false);
    });

    it('fails for charge_card action', () => {
      const result = service.checkNoPaymentExecution('charge_card');

      expect(result.passed).toBe(false);
    });

    it('fails for pay_now action', () => {
      const result = service.checkNoPaymentExecution('pay_now');

      expect(result.passed).toBe(false);
    });

    it('passes for safe actions like send_message', () => {
      const result = service.checkNoPaymentExecution('send_message');

      expect(result.passed).toBe(true);
    });

    it('passes for safe actions like followup_timing', () => {
      const result = service.checkNoPaymentExecution('choose_followup_timing');

      expect(result.passed).toBe(true);
    });
  });

  describe('runAllChecks', () => {
    it('aggregates all invariants into a single report', () => {
      const report = service.runAllChecks({
        workspaceId: 'ws-1',
        records: [{ workspaceId: 'ws-1' }, { workspaceId: 'ws-2' }],
        liftData: {
          lift: -0.3,
          pZScore: -2.5,
          samples: 50,
          fallbackActive: false,
        },
        actions: [
          { action: 'send_audio', context: { supportsAudio: false } },
          { action: 'send_text', context: { contactOptOut: true } },
          { action: 'execute_payment', context: {} },
        ],
      });

      expect(report.total).toBeGreaterThan(0);
      expect(report.failed).toBeGreaterThan(0);
      expect(report.passed + report.failed).toBe(report.total);

      const violations = report.checks.filter((c) => !c.passed);
      const violationNames = violations.map((v) => v.invariant);

      expect(violationNames).toContain('no_cross_workspace_reads');
      expect(violationNames).toContain('negative_lift_fallback');
      expect(violationNames).toContain('unsupported_transport_guard');
      expect(violationNames).toContain('opt_out_guard');
      expect(violationNames).toContain('no_payment_execution');
    });

    it('reports all passed when invariants are satisfied', () => {
      const report = service.runAllChecks({
        workspaceId: 'ws-1',
        records: [{ workspaceId: 'ws-1' }],
        liftData: {
          lift: -0.3,
          pZScore: -2.5,
          samples: 50,
          fallbackActive: true,
        },
        actions: [{ action: 'send_text', context: { supportsAudio: true, contactOptOut: false } }],
      });

      expect(report.failed).toBe(0);
      expect(report.passed).toBe(report.total);
    });
  });
});
