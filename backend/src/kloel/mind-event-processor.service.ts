import { Injectable } from '@nestjs/common';
import { MindCaseMemoryService } from './mind-case-memory.service';
import { MindConceptService } from './mind-concepts.service';
import { messageTemplate, toStableString } from './mind-decision-baselines';
import { MindPolicyService } from './mind-policy.service';
import { MindPredictorService } from './mind-predictor.service';
import { MindSurpriseService } from './mind-surprise.service';
import type { MindPerceptEvent } from './mind.types';

interface MindEventProcessResult {
  beliefsUpdated: number;
  predicted: number;
  resolved: number;
  surpriseTotal: number;
}

type MindEventProcessAccumulator = MindEventProcessResult;

const CONVERSION_CLOSED_STATUSES = new Set([
  'CANCELED',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
  'REFUNDED',
]);
const AUTOPILOT_SUCCESS_INTENTS = new Set(['lead_qualified', 'meeting_booked', 'purchase_intent']);

@Injectable()
export class MindEventProcessorService {
  constructor(
    private readonly predictor: MindPredictorService,
    private readonly surprise: MindSurpriseService,
    private readonly policy: MindPolicyService,
    private readonly cases: MindCaseMemoryService,
    private readonly concepts: MindConceptService,
  ) {}

  async process(event: MindPerceptEvent): Promise<MindEventProcessResult> {
    const result: MindEventProcessAccumulator = {
      predicted: 0,
      resolved: 0,
      surpriseTotal: 0,
      beliefsUpdated: 0,
    };

    await this.processMessageSent(event, result);
    await this.processMessageReceived(event, result);
    await this.processCheckoutStarted(event, result);
    await this.processCheckoutClosed(event, result);
    await this.processAutopilotOutcome(event, result);

    return result;
  }

  private async processMessageSent(
    event: MindPerceptEvent,
    result: MindEventProcessAccumulator,
  ): Promise<void> {
    if (event.kind === 'message.sent' && event.subject.startsWith('contact:')) {
      await this.predictor.predictReply(
        {
          workspaceId: event.workspaceId,
          subject: event.subject,
          features: {
            channel: toStableString(event.payload.channel) || 'unknown',
            hour: event.occurredAt.getHours(),
            template: messageTemplate(event.payload),
          },
        },
        24 * 3600,
      );
      result.predicted += 1;
    }
  }

  private async processMessageReceived(
    event: MindPerceptEvent,
    result: MindEventProcessAccumulator,
  ): Promise<void> {
    if (event.kind === 'message.received' && event.subject.startsWith('contact:')) {
      const text = toStableString(event.payload.content ?? event.payload.message ?? '');
      if (text) {
        const features = { channel: event.payload.channel ?? 'unknown' };
        await this.concepts.detect({
          workspaceId: event.workspaceId,
          subject: event.subject,
          text,
          occurredAt: event.occurredAt,
          features,
        });
        await this.cases.recordCase({
          workspaceId: event.workspaceId,
          subject: event.subject,
          caseType: 'message.received',
          text,
          action: 'inbound',
          occurredAt: event.occurredAt,
          features,
        });
      }
      await this.addResolvedSurprise(
        result,
        this.surprise.resolveBinary(
          event.workspaceId,
          event.subject,
          'P(reply|template,hour,channel)',
          1,
        ),
      );
      result.resolved += await this.policy.resolveOpenForSubject({
        workspaceId: event.workspaceId,
        subject: event.subject,
        decisionType: 'followup_timing',
        outcome: 1,
        baselineOutcome: 1,
      });
      await this.resolveWorkspacePolicies(
        event,
        result,
        ['audio_vs_text', 'message_format', 'tom', 'channel_choice'],
        1,
      );
    }
  }

  private async processCheckoutStarted(
    event: MindPerceptEvent,
    result: MindEventProcessAccumulator,
  ): Promise<void> {
    if (event.kind === 'checkout.start' || event.kind === 'checkout.pending') {
      await this.predictor.predictConversion(
        {
          workspaceId: event.workspaceId,
          subject: event.subject,
          features: {
            channel: 'checkout',
            hour: event.occurredAt.getHours(),
            price_band: toStableString(event.payload.priceBand) || 'under_100',
            segment: toStableString(event.payload.utmSource) || 'direct',
          },
        },
        48 * 3600,
      );
      result.predicted += 1;
    }
  }

  private async processCheckoutClosed(
    event: MindPerceptEvent,
    result: MindEventProcessAccumulator,
  ): Promise<void> {
    if (event.kind === 'checkout.paid' || event.kind === 'sale.completed') {
      await this.addResolvedSurprise(result, this.resolveConversion(event, 1));
      await this.resolveSubjectPolicies(event, result, ['cart_recovery'], 1);
      await this.resolveWorkspacePolicies(
        event,
        result,
        ['coupon_offer', 'product_offer', 'objection_response'],
        1,
      );
      return;
    }

    if (event.kind.startsWith('checkout.') && event.kind !== 'checkout.paid') {
      const status = toStableString(event.payload.status).toUpperCase();
      if (CONVERSION_CLOSED_STATUSES.has(status)) {
        await this.addResolvedSurprise(result, this.resolveConversion(event, 0));
        await this.resolveSubjectPolicies(event, result, ['cart_recovery'], 0);
        await this.resolveWorkspacePolicies(
          event,
          result,
          ['coupon_offer', 'product_offer', 'objection_response'],
          0,
        );
      }
    }
  }

  private async processAutopilotOutcome(
    event: MindPerceptEvent,
    result: MindEventProcessAccumulator,
  ): Promise<void> {
    if (event.kind.startsWith('autopilot.')) {
      const intent = toStableString(event.payload.intent) || 'unknown';
      const action = toStableString(event.payload.action);
      if (AUTOPILOT_SUCCESS_INTENTS.has(intent)) {
        const outcome = intent === 'purchase_intent' ? 1 : 0;
        const predicate =
          intent === 'purchase_intent'
            ? 'P(conversion|segment,price_band,channel,hour)'
            : 'P(reply|template,hour,channel)';
        const surprise = await this.surprise.resolveBinary(
          event.workspaceId,
          event.subject,
          predicate,
          outcome,
        );
        this.applySurprise(result, surprise);
        if (intent === 'lead_qualified') {
          await this.resolveWorkspacePolicies(event, result, ['human_transfer'], 1);
        }
      }
      if (intent === 'lead_lifecycle' && action === 'lead.qualified') {
        await this.resolveWorkspacePolicies(event, result, ['human_transfer'], 1);
      }
      if (intent === 'campaign_lifecycle' && action === 'campaign.converted') {
        await this.resolveWorkspacePolicies(
          event,
          result,
          ['broadcast_window', 'ad_alert_action'],
          1,
        );
      }
    }
  }

  private async resolveSubjectPolicies(
    event: MindPerceptEvent,
    result: MindEventProcessAccumulator,
    decisionTypes: string[],
    outcome: 0 | 1,
  ): Promise<void> {
    await this.resolvePolicies(event, result, event.subject, decisionTypes, outcome);
  }

  private async resolveWorkspacePolicies(
    event: MindPerceptEvent,
    result: MindEventProcessAccumulator,
    decisionTypes: string[],
    outcome: 0 | 1,
  ): Promise<void> {
    await this.resolvePolicies(
      event,
      result,
      `workspace:${event.workspaceId}`,
      decisionTypes,
      outcome,
    );
  }

  private async resolvePolicies(
    event: MindPerceptEvent,
    result: MindEventProcessAccumulator,
    subject: string,
    decisionTypes: string[],
    outcome: 0 | 1,
  ): Promise<void> {
    for (const decisionType of decisionTypes) {
      result.resolved += await this.policy.resolveOpenForSubject({
        workspaceId: event.workspaceId,
        subject,
        decisionType,
        outcome,
        baselineOutcome: outcome,
      });
    }
  }

  private async addResolvedSurprise(
    result: MindEventProcessAccumulator,
    surprisePromise: Promise<number>,
  ): Promise<void> {
    this.applySurprise(result, await surprisePromise);
  }

  private applySurprise(result: MindEventProcessAccumulator, surprise: number): void {
    if (surprise > 0) {
      result.resolved += 1;
      result.beliefsUpdated += 1;
      result.surpriseTotal += surprise;
    }
  }

  private resolveConversion(event: MindPerceptEvent, outcome: 0 | 1): Promise<number> {
    return this.surprise.resolveBinary(
      event.workspaceId,
      event.subject,
      'P(conversion|segment,price_band,channel,hour)',
      outcome,
    );
  }
}
