import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdRulesEngineService {
  private readonly logger = new Logger(AdRulesEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async evaluateRules() {
    try {
      const rules = await this.prisma.adRule.findMany({
        where: { active: true },
      });

      if (rules.length === 0) return;
      this.logger.log(`Evaluating ${rules.length} active ad rule(s)...`);

      for (const rule of rules) {
        try {
          const shouldFire = await this.shouldFireRule(rule);
          if (shouldFire) {
            await this.fireRule(rule);
          }
        } catch (err) {
          this.logger.error(`Error evaluating rule ${rule.id}: ${err}`);
        }
      }
    } catch (err) {
      this.logger.error(`AdRules engine error: ${err}`);
    }
  }

  private async shouldFireRule(rule: any): Promise<boolean> {
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

  private async fireRule(rule: any): Promise<void> {
    this.logger.log(
      `Firing rule "${rule.name}" (id: ${rule.id}): ${rule.action}`,
    );

    await this.prisma.adRule.update({
      where: { id: rule.id },
      data: {
        fireCount: { increment: 1 },
        lastFiredAt: new Date(),
      },
    });

    if (rule.alertMethod && rule.alertTarget) {
      await this.sendAlert(rule);
    }
  }

  private async sendAlert(rule: any): Promise<void> {
    this.logger.log(
      `Alert [${rule.alertMethod}] → ${rule.alertTarget}: Rule "${rule.name}" fired — ${rule.action}`,
    );

    // TODO: When WhatsApp integration is wired up:
    // if (rule.alertMethod === 'whatsapp') {
    //   await this.whatsappService.sendText(rule.alertTarget, `⚡ Alerta KLOEL: ${rule.name}\n${rule.action}`);
    // }
    // if (rule.alertMethod === 'email') {
    //   await this.emailService.send(rule.alertTarget, `Alerta: ${rule.name}`, rule.action);
    // }
  }
}
