import { MIND_GUARD_REASON_TAGS } from '../mind-code-native.types';
import { MindQualityService } from '../mind-quality.service';
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
});
