import type { RuleCategory, RuleVerdict } from './kloel-rules.types';

export function block(ruleId: string, category: RuleCategory, reason: string): RuleVerdict {
  return { ruleId, category, passed: false, reason };
}

export function pass(ruleId: string, category: RuleCategory): RuleVerdict {
  return {
    ruleId,
    category,
    passed: true,
    reason: 'Regra satisfeita — sem bloqueio.',
  };
}
