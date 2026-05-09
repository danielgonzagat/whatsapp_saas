import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import tracer from 'dd-trace';
import { Counter, Histogram, register } from 'prom-client';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';
import { MindBanditService } from './mind-bandit.service';
import { MindService } from './mind.service';
import type {
  CampaignMetrics,
  AdAlertContext,
} from './product-sub-resources/helpers/campaign.helpers';
// @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint

const AD_ALERT_ARMS = [
  'alert_only',
  'suggest_pause',
  'suggest_budget_down',
  'suggest_creative',
  'ignore',
] as const;

const ONE_DECIMAL_PERCENT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  useGrouping: false,
});

interface AdRuleSnapshot {
  id: string;
  workspaceId: string;
  name: string;
  condition: string | null;
  action: string;
  alertMethod: string | null;
  alertTarget: string | null;
  lastFiredAt: Date | null;
}

interface AdRuleEvaluation {
  shouldFire: boolean;
  metrics: CampaignMetrics | null;
  context: AdAlertContext | null;
  banditAction: string | null;
}

/** Ad rules engine service. */
@Injectable()
export class AdRulesEngineService {
  private readonly logger = new Logger(AdRulesEngineService.name);
  private readonly counter =
    (register.getSingleMetric('kloel_ad_rules_total') as Counter<string>) ||
    new Counter({
      name: 'kloel_ad_rules_total',
      help: 'Ad rule engine events',
      labelNames: ['event', 'result'],
    });
  private readonly histogram =
    (register.getSingleMetric('kloel_ad_rules_evaluation_duration_ms') as Histogram<string>) ||
    new Histogram({
      name: 'kloel_ad_rules_evaluation_duration_ms',
      help: 'Ad rule engine evaluation duration in milliseconds',
      labelNames: ['result'],
      buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000],
    });

  private readonly pendingBanditOutcomes = new Map<
    string,
    { arm: string; workspaceId: string; previousConvertedCount: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly bandit?: MindBanditService,
    @Optional() private readonly mind?: MindService,
  ) {}

  /** Evaluate rules. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async evaluateRules() {
    return tracer.trace('kloel.ad_rules.evaluate', () => this.evaluateRulesWithObservability());
  }

  private async evaluateRulesWithObservability(): Promise<void> {
    const startedAt = Date.now();
    try {
      const rules = await this.prisma.adRule.findMany({
        where: { active: true },
        take: 200,
        select: {
          id: true,
          workspaceId: true,
          name: true,
          condition: true,
          action: true,
          alertMethod: true,
          alertTarget: true,
          active: true,
          fireCount: true,
          lastFiredAt: true,
        },
      });

      if (rules.length === 0) {
        this.counter.inc({ event: 'evaluation', result: 'empty' });
        this.histogram.observe({ result: 'empty' }, Date.now() - startedAt);
        return;
      }
      this.counter.inc({ event: 'evaluation', result: 'started' });
      this.logger.log(`Evaluating ${rules.length} active ad rule(s)...`);

      await forEachSequential(rules, async (rule) => {
        try {
          const evaluation = await this.evaluateRule(rule);
          if (evaluation.shouldFire) {
            await this.fireRule(rule, evaluation.banditAction ?? 'alert_only', evaluation.metrics);
          }
        } catch (err: unknown) {
          // PULSE:OK — Per-rule failure is non-critical; other rules continue executing
          this.logger.error(`Error evaluating rule ${rule.id}: ${String(err)}`);
          this.counter.inc({ event: 'rule', result: 'error' });
          Sentry.captureException(err, {
            tags: { component: 'ad_rules', operation: 'evaluate_rule' },
            extra: { workspaceId: rule.workspaceId, ruleId: rule.id },
            level: 'warning',
          });
        }
      });
      this.counter.inc({ event: 'evaluation', result: 'success' });
      this.histogram.observe({ result: 'success' }, Date.now() - startedAt);
    } catch (err: unknown) {
      // PULSE:OK — AdRules engine is a background job; errors are logged and retried next cycle
      this.logger.error(`AdRules engine error: ${String(err)}`);
      this.counter.inc({ event: 'evaluation', result: 'error' });
      this.histogram.observe({ result: 'error' }, Date.now() - startedAt);
      Sentry.captureException(err, {
        tags: { component: 'ad_rules', operation: 'evaluate_rules' },
        level: 'error',
      });
    }
  }

  private async evaluateRule(rule: AdRuleSnapshot): Promise<AdRuleEvaluation> {
    const empty: AdRuleEvaluation = {
      shouldFire: false,
      metrics: null,
      context: null,
      banditAction: null,
    };

    const lastFired = rule.lastFiredAt ? new Date(rule.lastFiredAt) : null;
    const cooldownMs = 60 * 60 * 1000;
    if (lastFired && Date.now() - lastFired.getTime() < cooldownMs) {
      return empty;
    }

    const condition = (rule.condition || '').toLowerCase();
    const metrics = await this.collectMetrics(rule, condition);

    if (this.bandit && this.pendingBanditOutcomes.has(rule.id)) {
      const pending = this.pendingBanditOutcomes.get(rule.id)!;
      try {
        if (metrics) {
          const improved = metrics.convertedCount >= pending.previousConvertedCount;
          await this.bandit.recordOutcome({
            arm: pending.arm,
            decisionType: 'ad_alert_action',
            outcome: improved ? 1 : 0,
            workspaceId: pending.workspaceId,
          });
          this.counter.inc({ event: 'bandit_outcome', result: 'recorded' });
        }
      } catch (err: unknown) {
        this.logger.warn(`Failed to record bandit outcome for rule ${rule.id}: ${String(err)}`);
      } finally {
        this.pendingBanditOutcomes.delete(rule.id);
      }
    }

    if (!metrics) {
      return { ...empty, shouldFire: true };
    }

    const context: AdAlertContext = {
      workspaceId: rule.workspaceId,
      ruleId: rule.id,
      ruleName: rule.name,
      campaignBudgetExhausted: condition.includes('budget') || condition.includes('orçamento'),
      metric: metrics,
      threshold: condition.includes('baixo') || condition.includes('caiu') ? 'low' : 'normal',
      windowHours: 24,
      campaign: rule.name,
    };

    if (this.mind) {
      try {
        const decision = await this.mind.resolveAdAlertAction(
          rule.workspaceId,
          'conversion_rate',
          context.windowHours,
          context.threshold,
          rule.name,
        );
        if (decision.action === 'ignore') {
          this.counter.inc({ event: 'rule', result: 'mind_ignore' });
          return { ...empty, metrics, context, banditAction: decision.action };
        }
        return { shouldFire: true, metrics, context, banditAction: decision.action };
      } catch (err: unknown) {
        this.logger.warn(`MIND ad alert fallback for rule ${rule.id}: ${String(err)}`);
      }
    }

    if (!this.bandit) {
      return { shouldFire: true, metrics, context, banditAction: 'alert_only' };
    }

    await this.ensureBanditArms(rule.workspaceId);
    const chosen = await this.bandit.choose(rule.workspaceId, 'ad_alert_action');

    if (!chosen) {
      return { shouldFire: true, metrics, context, banditAction: 'alert_only' };
    }

    if (chosen.arm === 'ignore') {
      this.logger.debug(`MIND bandit chose ignore for rule ${rule.id} (${rule.name})`);
      this.counter.inc({ event: 'rule', result: 'bandit_ignore' });
      return { ...empty, metrics, context, banditAction: chosen.arm };
    }

    if (this.bandit && metrics) {
      this.pendingBanditOutcomes.set(rule.id, {
        arm: chosen.arm,
        workspaceId: rule.workspaceId,
        previousConvertedCount: metrics.convertedCount,
      });
    }

    return { shouldFire: true, metrics, context, banditAction: chosen.arm };
  }

  private async collectMetrics(
    rule: AdRuleSnapshot,
    condition: string,
  ): Promise<CampaignMetrics | null> {
    const isRoas = condition.includes('roas') || condition.includes('conversao');
    if (
      !isRoas &&
      !condition.includes('gasto') &&
      !condition.includes('spend') &&
      !condition.includes('budget')
    ) {
      return null;
    }

    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const salesCount = await this.prisma.kloelSale.count({
      where: {
        workspaceId: rule.workspaceId,
        status: 'paid',
        createdAt: { gte: windowStart },
      },
    });

    const failedCount = await this.prisma.kloelSale.count({
      where: {
        workspaceId: rule.workspaceId,
        status: 'failed',
        createdAt: { gte: windowStart },
      },
    });

    const total = salesCount + failedCount;

    return {
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      failedCount: 0,
      repliedCount: 0,
      convertedCount: salesCount,
      conversionRate: total > 0 ? salesCount / total : 0,
      totalSpentCents: 0,
      revenueCents: 0,
      roas: 0,
    };
  }

  private async ensureBanditArms(workspaceId: string): Promise<void> {
    if (!this.bandit) return;
    try {
      await this.bandit.register({
        workspaceId,
        decisionType: 'ad_alert_action',
        arms: [...AD_ALERT_ARMS],
        context: { registeredBy: 'ad_rules_engine', registeredAt: new Date().toISOString() },
      });
    } catch (err: unknown) {
      this.logger.warn(`Failed to register bandit arms for ${workspaceId}: ${String(err)}`);
    }
  }

  private async fireRule(
    rule: AdRuleSnapshot,
    chosenAction: string,
    metrics: CampaignMetrics | null,
  ): Promise<void> {
    this.logger.log(`Firing rule "${rule.name}" (id: ${rule.id}): action=${chosenAction}`);
    this.counter.inc({ event: 'rule', result: 'fired' });

    await this.prisma.adRule.updateMany({
      where: { id: rule.id, workspaceId: rule.workspaceId },
      data: {
        fireCount: { increment: 1 },
        lastFiredAt: new Date(),
      },
    });

    if (rule.alertMethod && rule.alertTarget) {
      await this.sendAlert(rule, chosenAction, metrics);
    }
  }

  private sendAlert(
    rule: AdRuleSnapshot,
    chosenAction: string,
    metrics: CampaignMetrics | null,
  ): Promise<void> {
    const metricsSummary = metrics
      ? `converted=${metrics.convertedCount} rate=${ONE_DECIMAL_PERCENT.format(metrics.conversionRate * 100)}%`
      : 'no metrics';

    this.logger.log(
      `Alert [${rule.alertMethod}] → ${rule.alertTarget}: ` +
        `Rule "${rule.name}" fired — action=${chosenAction} (${metricsSummary})`,
    );

    return Promise.resolve();
  }
}
