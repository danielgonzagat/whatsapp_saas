import { ReactiveStore } from '../reactive/index.js';
import type { FeatureFlag, FlagRule, FlagContext } from './types.js';

type FlagsState = {
  flags: Record<string, FeatureFlag>;
};

export class FeatureFlagStore extends ReactiveStore<FlagsState> {
  constructor() {
    super({ initial: { flags: {} } });
  }

  setFlag(name: string, enabled: boolean, rules: FlagRule[] = []): void {
    this.setState((prev) => ({
      flags: {
        ...prev.flags,
        [name]: { name, enabled, rules },
      },
    }));
  }

  isEnabled(name: string, context?: FlagContext): boolean {
    const flag = this.getState().flags[name];
    if (!flag) return false;
    if (!flag.enabled) return false;

    if (flag.rules.length === 0) return true;

    for (const rule of flag.rules) {
      if (this.#evaluateRule(rule, context)) return true;
    }

    return false;
  }

  getAllFlags(): FeatureFlag[] {
    return Object.values(this.getState().flags);
  }

  removeFlag(name: string): void {
    this.setState((prev) => {
      const { [name]: _, ...rest } = prev.flags;
      return { flags: rest };
    });
  }

  #evaluateRule(rule: FlagRule, context?: FlagContext): boolean {
    switch (rule.type) {
      case 'boolean':
        return rule.config.value ?? false;
      case 'percentage':
        return this.#evaluatePercentage(rule, context);
      case 'user_target':
        return this.#evaluateUserTarget(rule, context);
      default:
        return false;
    }
  }

  #evaluatePercentage(rule: FlagRule, context?: FlagContext): boolean {
    const percentage = rule.config.percentage ?? 0;
    if (percentage <= 0) return false;
    if (percentage >= 100) return true;

    const userId = context?.userId ?? '';
    const hash = this.#hashString(userId);
    return (hash % 100) < percentage;
  }

  #evaluateUserTarget(rule: FlagRule, context?: FlagContext): boolean {
    if (rule.config.userIds && context?.userId) {
      if (rule.config.userIds.includes(context.userId)) return true;
    }

    if (rule.config.attributes) {
      if (!context?.attributes) return false;
      for (const [key, value] of Object.entries(rule.config.attributes)) {
        if (context.attributes[key] !== value) return false;
      }
      return Object.keys(rule.config.attributes).length > 0;
    }

    return false;
  }

  #hashString(s: string): number {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      const char = s.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash);
  }
}
