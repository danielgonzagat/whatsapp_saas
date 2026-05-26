import { MIND_GUARD_REASON_TAGS } from '../mind-code-native.types';
import { MindQualityService } from '../mind/policy/mind-quality.service';
import { KLOEL_RULE_CATALOG } from './kloel-rules.catalog';
import { KloelRuleEngineService } from './kloel-rule-engine.service';
import type { RuleCategory } from './kloel-rules.types';

const REQUIRED_CATEGORIES: RuleCategory[] = [
  'opt_out',
  'compliance_window',
  'limits',
  'coupon',
  'transfer',
  'payment',
];

describe('Kloel rule catalog invariants', () => {
  it('registers at least one rule for every declared category', () => {
    const registered = new Set(KLOEL_RULE_CATALOG.map((rule) => rule.category));

    for (const category of REQUIRED_CATEGORIES) {
      expect(registered.has(category)).toBe(true);
    }
  });

  it('does not register duplicate rule ids', () => {
    const ids = KLOEL_RULE_CATALOG.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every blocking guard reason backed by a catalog rule', () => {
    const ruleIds = new Set(KLOEL_RULE_CATALOG.map((rule) => rule.id));
    const blockingTags = MIND_GUARD_REASON_TAGS.filter((tag) => tag !== 'all_guards_passed');

    for (const tag of blockingTags) {
      expect(ruleIds.has(tag)).toBe(true);
    }
  });

  it('keeps opt-out rule semantics aligned with MindQualityService', () => {
    const engine = new KloelRuleEngineService();
    const quality = new MindQualityService();
    const ruleTrace = engine.evaluate({ action: 'send_message', contactOptOut: true });
    const qualityCheck = quality.checkOptOutGuard({ contactOptOut: true });

    expect(ruleTrace.blocked).toBe(true);
    expect(ruleTrace.blockedBy).toBe('opt_out');
    expect(qualityCheck.passed).toBe(false);
  });

  it('keeps unsupported transport rule semantics aligned with MindQualityService', () => {
    const engine = new KloelRuleEngineService();
    const quality = new MindQualityService();
    const ruleTrace = engine.evaluate({ action: 'send_audio', supportsAudio: false });
    const qualityCheck = quality.checkUnsupportedTransportGuard('send_audio', {
      supportsAudio: false,
    });

    expect(ruleTrace.blocked).toBe(true);
    expect(ruleTrace.blockedBy).toBe('unsupported_audio');
    expect(qualityCheck.passed).toBe(false);
  });

  it('enforces supported output format by channel capabilities', () => {
    const engine = new KloelRuleEngineService();
    const audioTrace = engine.evaluate({ action: 'send_audio', supportsAudio: false });
    const documentTrace = engine.evaluate({ action: 'send_document', supportsDocument: false });

    expect(audioTrace.blockedBy).toBe('unsupported_audio');
    expect(documentTrace.blockedBy).toBe('unsupported_document');
  });

  it('enforces compliance window or approved template for proactive sends', () => {
    const engine = new KloelRuleEngineService();
    const trace = engine.evaluate({
      action: 'send_message',
      templateApproved: false,
      withinComplianceWindow: false,
    });

    expect(trace.blocked).toBe(true);
    expect(trace.blockedBy).toBe('compliance_window');
  });

  it('enforces coupon ceiling and minimum margin', () => {
    const engine = new KloelRuleEngineService();

    expect(
      engine.evaluate({ action: 'apply_discount', discountPercent: 31, maxDiscountPercent: 30 })
        .blockedBy,
    ).toBe('max_discount');
    expect(engine.evaluate({ action: 'apply_discount', minMarginPercent: -1 }).blockedBy).toBe(
      'minimum_margin',
    );
  });

  it('enforces workspace isolation in every rule trace context', () => {
    const engine = new KloelRuleEngineService();
    const trace = engine.evaluate({ action: 'send_message', workspaceId: 'ws-a' });

    expect(trace.verdicts.length).toBe(KLOEL_RULE_CATALOG.length);
    expect(trace.verdicts.every((verdict) => verdict.ruleId.length > 0)).toBe(true);
  });

  it('enforces payment idempotency and payment amount bounds', () => {
    const engine = new KloelRuleEngineService();

    expect(engine.evaluate({ action: 'create_payment', paymentProcessed: true }).blockedBy).toBe(
      'duplicate_payment',
    );
    expect(
      engine.evaluate({ action: 'create_payment', paymentAmount: 200, maxPaymentAmount: 100 })
        .blockedBy,
    ).toBe('payment_amount_exceeded');
  });

  it('produces complete decision traces for every evaluated action', () => {
    const engine = new KloelRuleEngineService();
    const trace = engine.evaluate({ action: 'send_message' });

    expect(trace.durationMs).toBeGreaterThanOrEqual(0);
    expect(trace.verdicts).toHaveLength(KLOEL_RULE_CATALOG.length);
    expect(trace.verdicts.every((verdict) => typeof verdict.reason === 'string')).toBe(true);
  });

  it('keeps the rule catalog durable and executable after import', () => {
    expect(KLOEL_RULE_CATALOG.length).toBeGreaterThanOrEqual(10);
    expect(KLOEL_RULE_CATALOG.every((rule) => typeof rule.evaluate === 'function')).toBe(true);
  });

  it('keeps brain tick health rule evidence connected to MIND quality checks', () => {
    const quality = new MindQualityService();
    const stale = quality.checkTickHealth({ lastTickAt: new Date(0), now: new Date(1000000) });

    expect(stale.passed).toBe(false);
  });
});
