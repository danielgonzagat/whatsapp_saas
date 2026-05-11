import { KloelRuleEngineService } from './kloel-rule-engine.service';

describe('KloelRuleEngineService', () => {
  let engine: KloelRuleEngineService;

  beforeEach(() => {
    engine = new KloelRuleEngineService();
  });

  describe('evaluate', () => {
    it('returns full trace with all verdicts', () => {
      const trace = engine.evaluate({
        action: 'send_message',
      });

      expect(trace.verdicts.length).toBeGreaterThanOrEqual(14);
      expect(trace.blocked).toBe(false);
      expect(trace.blockedBy).toBeNull();
      expect(trace.durationMs).toBeGreaterThanOrEqual(0);

      const allPassed = trace.verdicts.every((v) => v.passed);
      expect(allPassed).toBe(true);
    });

    it('blocks on opt_out when contactOptOut is true', () => {
      const trace = engine.evaluate({
        action: 'send_message',
        contactOptOut: true,
      });

      expect(trace.blocked).toBe(true);
      expect(trace.blockedBy).toBe('opt_out');
      expect(trace.blockedReason).toContain('opt-out');
    });

    it('blocks on compliance_window when outside window and no template', () => {
      const trace = engine.evaluate({
        action: 'send_message',
        withinComplianceWindow: false,
        templateApproved: false,
      });

      expect(trace.blocked).toBe(true);
      expect(trace.blockedBy).toBe('compliance_window');
      expect(trace.blockedReason).toContain('template');
    });

    it('passes compliance_window when template is approved even outside window', () => {
      const trace = engine.evaluate({
        action: 'send_message',
        withinComplianceWindow: false,
        templateApproved: true,
      });

      const compliance = trace.verdicts.find((v) => v.ruleId === 'compliance_window');
      expect(compliance?.passed).toBe(true);
      expect(trace.blocked).toBe(false);
    });

    it('blocks on daily_contact_limit when messages >= 20', () => {
      const trace = engine.evaluate({
        action: 'send_message',
        contactMessagesToday: 20,
      });

      expect(trace.blocked).toBe(true);
      expect(trace.blockedBy).toBe('daily_contact_limit');
    });

    it('passes daily_contact_limit when messages < 20', () => {
      const trace = engine.evaluate({
        action: 'send_message',
        contactMessagesToday: 19,
      });

      const limit = trace.verdicts.find((v) => v.ruleId === 'daily_contact_limit');
      expect(limit?.passed).toBe(true);
    });
  });

  describe('payment rules', () => {
    it('blocks duplicate_payment when paymentProcessed is true', () => {
      const trace = engine.evaluate({
        action: 'process_payment',
        paymentProcessed: true,
      });

      expect(trace.blocked).toBe(true);
      expect(trace.blockedBy).toBe('duplicate_payment');
    });

    it('blocks payment_amount_exceeded when amount exceeds max', () => {
      const trace = engine.evaluate({
        action: 'process_payment',
        paymentAmount: 5000,
        maxPaymentAmount: 1000,
      });

      expect(trace.blocked).toBe(true);
      expect(trace.blockedBy).toBe('payment_amount_exceeded');
      expect(trace.blockedReason).toContain('5000');
      expect(trace.blockedReason).toContain('1000');
    });

    it('allows payment when amount is within limit and not duplicate', () => {
      const trace = engine.evaluate({
        action: 'process_payment',
        paymentAmount: 500,
        maxPaymentAmount: 1000,
        paymentProcessed: false,
      });

      expect(trace.blocked).toBe(false);
    });
  });

  describe('coupon rules', () => {
    it('blocks max_discount when discount exceeds cap', () => {
      const trace = engine.evaluate({
        action: 'apply_coupon',
        discountPercent: 30,
        maxDiscountPercent: 20,
      });

      expect(trace.blocked).toBe(true);
      expect(trace.blockedBy).toBe('max_discount');
    });

    it('passes max_discount when within cap', () => {
      const trace = engine.evaluate({
        action: 'apply_coupon',
        discountPercent: 15,
        maxDiscountPercent: 20,
      });

      const verdict = trace.verdicts.find((v) => v.ruleId === 'max_discount');
      expect(verdict?.passed).toBe(true);
    });

    it('blocks minimum_margin when margin goes negative', () => {
      const trace = engine.evaluate({
        action: 'apply_coupon',
        minMarginPercent: -5,
      });

      expect(trace.blocked).toBe(true);
      expect(trace.blockedBy).toBe('minimum_margin');
    });

    it('passes minimum_margin when margin is non-negative', () => {
      const trace = engine.evaluate({
        action: 'apply_coupon',
        minMarginPercent: 0,
      });

      const verdict = trace.verdicts.find((v) => v.ruleId === 'minimum_margin');
      expect(verdict?.passed).toBe(true);
    });
  });

  describe('transfer rules', () => {
    it('blocks escalation_in_progress when escalation is active', () => {
      const trace = engine.evaluate({
        action: 'request_escalation',
        escalationInProgress: true,
      });

      expect(trace.blocked).toBe(true);
      expect(trace.blockedBy).toBe('escalation_in_progress');
    });

    it('blocks no_human_available when no operator is available', () => {
      const trace = engine.evaluate({
        action: 'request_escalation',
        humanAvailable: false,
      });

      expect(trace.blocked).toBe(true);
      expect(trace.blockedBy).toBe('no_human_available');
    });

    it('allows escalation when human is available and not in progress', () => {
      const trace = engine.evaluate({
        action: 'request_escalation',
        escalationInProgress: false,
        humanAvailable: true,
      });

      expect(trace.blocked).toBe(false);
    });
  });

  describe('limits rules', () => {
    it('blocks campaign_budget_exhausted for campaign actions', () => {
      const trace = engine.evaluate({
        action: 'launch_campaign',
        campaignBudgetExhausted: true,
      });

      expect(trace.blocked).toBe(true);
      expect(trace.blockedBy).toBe('campaign_budget_exhausted');
    });

    it('blocks campaign_inactive for campaign actions', () => {
      const trace = engine.evaluate({
        action: 'launch_campaign',
        campaignActive: false,
      });

      expect(trace.blocked).toBe(true);
      expect(trace.blockedBy).toBe('campaign_inactive');
    });

    it('allows campaign when active and budget available', () => {
      const trace = engine.evaluate({
        action: 'launch_campaign',
        campaignBudgetExhausted: false,
        campaignActive: true,
      });

      expect(trace.blocked).toBe(false);
    });

    it('blocks checkout_product_required when no product', () => {
      const trace = engine.evaluate({
        action: 'create_checkout',
        productId: undefined,
      });

      expect(trace.blocked).toBe(true);
      expect(trace.blockedBy).toBe('checkout_product_required');
    });

    it('passes checkout_product_required when product is set', () => {
      const trace = engine.evaluate({
        action: 'create_checkout',
        productId: 'prod-1',
      });

      const verdict = trace.verdicts.find((v) => v.ruleId === 'checkout_product_required');
      expect(verdict?.passed).toBe(true);
    });

    it('blocks unsupported_audio when channel does not support audio', () => {
      const trace = engine.evaluate({
        action: 'send_audio_message',
        supportsAudio: false,
      });

      expect(trace.blocked).toBe(true);
      expect(trace.blockedBy).toBe('unsupported_audio');
    });

    it('blocks unsupported_document when channel does not support docs', () => {
      const trace = engine.evaluate({
        action: 'send_document',
        supportsDocument: false,
      });

      expect(trace.blocked).toBe(true);
      expect(trace.blockedBy).toBe('unsupported_document');
    });
  });

  describe('evaluateCategory', () => {
    it('evaluates only rules from the specified category', () => {
      const trace = engine.evaluateCategory(
        { action: 'process_payment', paymentProcessed: true },
        'payment',
      );

      expect(trace.verdicts.length).toBe(2);
      expect(trace.verdicts.every((v) => v.category === 'payment')).toBe(true);
      expect(trace.blocked).toBe(true);
      expect(trace.blockedBy).toBe('duplicate_payment');
    });

    it('returns empty verdicts for unknown category', () => {
      const trace = engine.evaluateCategory({ action: 'send_message' }, 'nonexistent');

      expect(trace.verdicts.length).toBe(0);
      expect(trace.blocked).toBe(false);
    });
  });

  describe('first-blocker ordering', () => {
    it('reports opt_out as blocker even when other rules would also block', () => {
      const trace = engine.evaluate({
        action: 'process_payment',
        contactOptOut: true,
        paymentProcessed: true,
        paymentAmount: 5000,
        maxPaymentAmount: 1000,
      });

      expect(trace.blocked).toBe(true);
      expect(trace.blockedBy).toBe('opt_out');

      const failed = trace.verdicts.filter((v) => !v.passed);
      expect(failed.length).toBeGreaterThanOrEqual(1);
    });
  });
});
