import {  Injectable, Logger } from '@nestjs/common';
import { KLOEL_RULE_CATALOG } from './kloel-rules.catalog';
import type { RuleContext, RuleTrace, RuleVerdict } from './kloel-rules.types';

@Injectable()
export class KloelRuleEngineService {
  private readonly logger = new Logger(KloelRuleEngineService.name);

  constructor() {
    this.logger.debug?.(`KloelRuleEngineService initialized`);
  }


  private readonly catalog = KLOEL_RULE_CATALOG;

  evaluate(ctx: RuleContext): RuleTrace {
    const start = performance.now();

    const verdicts: RuleVerdict[] = this.catalog.map((rule) => rule.evaluate(ctx));

    const firstBlocker = verdicts.find((v) => !v.passed);

    const durationMs = Math.round(performance.now() - start);

    const trace: RuleTrace = {
      verdicts,
      blocked: firstBlocker !== undefined,
      blockedBy: firstBlocker?.ruleId ?? null,
      blockedReason: firstBlocker?.reason ?? null,
      durationMs,
    };

    return trace;
  }

  evaluateCategory(ctx: RuleContext, category: string): RuleTrace {
    const start = performance.now();

    const relevant = this.catalog.filter((rule) => rule.category === category);
    const verdicts: RuleVerdict[] = relevant.map((rule) => rule.evaluate(ctx));

    const firstBlocker = verdicts.find((v) => !v.passed);

    const durationMs = Math.round(performance.now() - start);

    return {
      verdicts,
      blocked: firstBlocker !== undefined,
      blockedBy: firstBlocker?.ruleId ?? null,
      blockedReason: firstBlocker?.reason ?? null,
      durationMs,
    };
  }
}
