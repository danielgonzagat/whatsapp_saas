import { Injectable, Logger } from '@nestjs/common';
import { MindBeliefService } from './mind-belief.service';
import { MindPerceptionService } from './mind-perception.service';
import { MindPolicyService } from './mind-policy.service';
import { MindPredictorService } from './mind-predictor.service';
import { MindSurpriseService } from './mind-surprise.service';
import type { MindPerceptEvent, MindTick } from './mind.types';

const KNOWN_DECISION_TYPES = [
  'followup_timing',
  'send_window',
  'offer_discount',
  'cia_aggressiveness',
] as const;

function resolveAggressivenessBaseline(
  soldRate: number,
  repliedRate: number,
  revenuePerSignal: number,
): string {
  if (soldRate >= 0.3 || revenuePerSignal >= 150) return 'HIGH';
  if (soldRate >= 0.15 || repliedRate >= 0.4) return 'MEDIUM';
  return 'LOW';
}

@Injectable()
export class MindService {
  private readonly logger = new Logger(MindService.name);
  private readonly watermarks = new Map<string, Date>();
  private readonly activeTicks = new Set<string>();

  constructor(
    private readonly perception: MindPerceptionService,
    private readonly predictor: MindPredictorService,
    private readonly surprise: MindSurpriseService,
    private readonly beliefs: MindBeliefService,
    private readonly policy: MindPolicyService,
  ) {}

  async tick(workspaceId: string): Promise<MindTick> {
    const empty: MindTick = {
      workspaceId,
      perceived: 0,
      predicted: 0,
      resolved: 0,
      surpriseTotal: 0,
      beliefsUpdated: 0,
      decisionsMade: 0,
      durationMs: 0,
    };

    if (this.activeTicks.has(workspaceId)) {
      return empty;
    }
    this.activeTicks.add(workspaceId);

    try {
      const startedAt = Date.now();
      const watermark = this.watermarks.get(workspaceId) ?? new Date(Date.now() - 24 * 3600 * 1000);
      const events = await this.perception.since(workspaceId, watermark);

      let predicted = 0;
      let resolved = 0;
      let surpriseTotal = 0;
      let beliefsUpdated = 0;

      for (const event of events) {
        const result = await this.processEvent(event);
        predicted += result.predicted;
        resolved += result.resolved;
        surpriseTotal += result.surpriseTotal;
        beliefsUpdated += result.beliefsUpdated;
      }

      const expiredSurprise = await this.surprise.sweepExpired(workspaceId);
      if (expiredSurprise > 0) {
        surpriseTotal += expiredSurprise;
        beliefsUpdated += 1;
      }

      let decisionsMade = 0;
      for (const decisionType of KNOWN_DECISION_TYPES) {
        decisionsMade += await this.policy.sweepExpiredOutcomes({
          workspaceId,
          decisionType,
          maxAgeHours: 48,
          outcome: 0,
        });
      }

      this.watermarks.set(
        workspaceId,
        events.length ? events[events.length - 1].occurredAt : new Date(),
      );

      const tick: MindTick = {
        workspaceId,
        perceived: events.length,
        predicted,
        resolved,
        surpriseTotal,
        beliefsUpdated,
        decisionsMade,
        durationMs: Date.now() - startedAt,
      };

      if (events.length > 0 || expiredSurprise > 0 || decisionsMade > 0) {
        this.logger.log(
          `tick workspace=${workspaceId} perceived=${tick.perceived} predicted=${predicted} resolved=${resolved} surprise=${surpriseTotal.toFixed(3)} decisions=${decisionsMade} ms=${tick.durationMs}`,
        );
      }

      return tick;
    } finally {
      this.activeTicks.delete(workspaceId);
    }
  }

  query(workspaceId: string, predicate: string, subject?: string) {
    return this.beliefs.list(workspaceId, predicate, subject);
  }

  lift(workspaceId: string, decisionType: string, sinceDays = 14) {
    return this.policy.harness(workspaceId, decisionType, sinceDays);
  }

  async resolveAggressiveness(
    workspaceId: string,
    domain: string,
    soldRate: number,
    repliedRate: number,
    revenuePerSignal: number,
  ): Promise<{ aggressiveness: string; confidence: number; fallback: boolean }> {
    const baseline = resolveAggressivenessBaseline(soldRate, repliedRate, revenuePerSignal);

    const options = [
      {
        action: 'LOW',
        predicate: 'P(outcome|aggressiveness)',
        context: { domain, aggressiveness: 'LOW' },
      },
      {
        action: 'MEDIUM',
        predicate: 'P(outcome|aggressiveness)',
        context: { domain, aggressiveness: 'MEDIUM' },
      },
      {
        action: 'HIGH',
        predicate: 'P(outcome|aggressiveness)',
        context: { domain, aggressiveness: 'HIGH' },
      },
    ];

    const outcomeKey = `cia_aggressiveness:${workspaceId}:${Date.now()}`;

    const result = await this.policy.choose({
      workspaceId,
      subject: `workspace:${workspaceId}`,
      decisionType: 'cia_aggressiveness',
      context: { domain, soldRate, repliedRate, revenuePerSignal },
      options,
      baseline: baseline,
      outcomeKey,
    });

    return {
      aggressiveness: result.chosen,
      confidence: result.decision.candidates[0]?.beliefMean ?? 0,
      fallback: result.decision.fallbackActive,
    };
  }

  private async processEvent(event: MindPerceptEvent): Promise<{
    beliefsUpdated: number;
    predicted: number;
    resolved: number;
    surpriseTotal: number;
  }> {
    let predicted = 0;
    let resolved = 0;
    let surpriseTotal = 0;
    let beliefsUpdated = 0;

    if (event.kind === 'message.sent' && event.subject.startsWith('contact:')) {
      await this.predictor.predictReply(
        {
          workspaceId: event.workspaceId,
          subject: event.subject,
          features: {
            channel: 'whatsapp',
            hour: event.occurredAt.getHours(),
            template: this.messageTemplate(event.payload),
          },
        },
        24 * 3600,
      );
      predicted += 1;
    }

    if (event.kind === 'message.received' && event.subject.startsWith('contact:')) {
      const surprise = await this.surprise.resolveBinary(
        event.workspaceId,
        event.subject,
        'P(reply|template,hour,channel)',
        1,
      );
      if (surprise > 0) {
        resolved += 1;
        beliefsUpdated += 1;
        surpriseTotal += surprise;
      }
      const policyResolved = await this.policy.resolveOpenForSubject({
        workspaceId: event.workspaceId,
        subject: event.subject,
        decisionType: 'followup_timing',
        outcome: 1,
      });
      resolved += policyResolved;
    }

    if (event.kind === 'checkout.start' || event.kind === 'checkout.pending') {
      await this.predictor.predictConversion(
        {
          workspaceId: event.workspaceId,
          subject: event.subject,
          features: {
            channel: 'checkout',
            hour: event.occurredAt.getHours(),
            price_band: this.toStableString(event.payload.priceBand) || 'under_100',
            segment: this.toStableString(event.payload.utmSource) || 'direct',
          },
        },
        48 * 3600,
      );
      predicted += 1;
    }

    if (event.kind === 'checkout.paid' || event.kind === 'sale.completed') {
      const surprise = await this.surprise.resolveBinary(
        event.workspaceId,
        event.subject,
        'P(conversion|segment,price_band,channel,hour)',
        1,
      );
      if (surprise > 0) {
        resolved += 1;
        beliefsUpdated += 1;
        surpriseTotal += surprise;
      }
    }

    if (event.kind.startsWith('checkout.') && event.kind !== 'checkout.paid') {
      const status = this.toStableString(event.payload.status).toUpperCase();
      if (['CANCELED', 'CANCELLED', 'EXPIRED', 'FAILED', 'REFUNDED'].includes(status)) {
        const surprise = await this.surprise.resolveBinary(
          event.workspaceId,
          event.subject,
          'P(conversion|segment,price_band,channel,hour)',
          0,
        );
        if (surprise > 0) {
          resolved += 1;
          beliefsUpdated += 1;
          surpriseTotal += surprise;
        }
      }
    }

    if (event.kind.startsWith('autopilot.')) {
      const intent = this.toStableString(event.payload.intent) || 'unknown';
      if (['lead_qualified', 'meeting_booked', 'purchase_intent'].includes(intent)) {
        const outcome = intent === 'purchase_intent' ? 1 : 0;
        const surprise = await this.surprise.resolveBinary(
          event.workspaceId,
          event.subject,
          'P(reply|template,hour,channel)',
          outcome,
        );
        if (surprise > 0) {
          resolved += 1;
          beliefsUpdated += 1;
          surpriseTotal += surprise;
        }
      }
    }

    return { predicted, resolved, surpriseTotal, beliefsUpdated };
  }

  private messageTemplate(payload: Record<string, unknown>): string {
    const type = this.toStableString(payload.messageType ?? 'TEXT').toLowerCase();
    if (type.includes('audio') || type.includes('voice')) return 'audio';
    if (type.includes('template')) return 'template';
    return 'text';
  }

  private toStableString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return value.toString();
    }
    if (value === null || value === undefined) return '';
    return JSON.stringify(value);
  }
}
