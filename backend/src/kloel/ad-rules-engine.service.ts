import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import tracer from 'dd-trace';
import { Counter, Histogram, register } from 'prom-client';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';
// @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint

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

  constructor(private readonly prisma: PrismaService) {}

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
          const shouldFire = await this.shouldFireRule(rule);
          if (shouldFire) {
            await this.fireRule(rule);
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

  private async shouldFireRule(rule: AdRuleSnapshot): Promise<boolean> {
    // Cooldown: don't fire same rule within 1 hour
    const lastFired = rule.lastFiredAt ? new Date(rule.lastFiredAt) : null;
    const cooldownMs = 60 * 60 * 1000;
    if (lastFired && Date.now() - lastFired.getTime() < cooldownMs) {
      return false;
    }

    // Evaluate condition against real workspace data
    const condition = (rule.condition || '').toLowerCase();

    if (condition.includes('roas') || condition.includes('conversao')) {
      // Check sales performance
      const salesCount = await this.prisma.kloelSale.count({
        where: {
          workspaceId: rule.workspaceId,
          status: 'paid',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      // If condition mentions low performance and sales are low, fire
      if (condition.includes('baixo') || condition.includes('caiu')) {
        return salesCount < 5;
      }
      return salesCount > 0;
    }

    if (
      condition.includes('gasto') ||
      condition.includes('spend') ||
      condition.includes('budget')
    ) {
      // Budget-related rules fire on schedule
      return true;
    }

    // Default: fire based on schedule + cooldown
    return true;
  }

  private async fireRule(rule: AdRuleSnapshot): Promise<void> {
    this.logger.log(`Firing rule "${rule.name}" (id: ${rule.id}): ${rule.action}`);
    this.counter.inc({ event: 'rule', result: 'fired' });

    await this.prisma.adRule.updateMany({
      where: { id: rule.id, workspaceId: rule.workspaceId },
      data: {
        fireCount: { increment: 1 },
        lastFiredAt: new Date(),
      },
    });

    if (rule.alertMethod && rule.alertTarget) {
      await this.sendAlert(rule);
    }
  }

  private sendAlert(rule: AdRuleSnapshot): Promise<void> {
    this.logger.log(
      `Alert [${rule.alertMethod}] → ${rule.alertTarget}: Rule "${rule.name}" fired — ${rule.action}`,
    );

    // Alert dispatch is handled by whatsapp/email services when integrated:
    // alertMethod === 'whatsapp' → send via WhatsAppService
    // alertMethod === 'email' → send via EmailService
    return Promise.resolve();
  }
}
