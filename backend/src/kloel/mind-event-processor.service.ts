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
            channel: toStableString(event.payload.channel) || 'unknown',
            hour: event.occurredAt.getHours(),
            template: messageTemplate(event.payload),
          },
        },
        24 * 3600,
      );
      predicted += 1;
    }

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
      resolved += await this.policy.resolveOpenForSubject({
        workspaceId: event.workspaceId,
        subject: event.subject,
        decisionType: 'followup_timing',
        outcome: 1,
      });
    }

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
      predicted += 1;
    }

    if (event.kind === 'checkout.paid' || event.kind === 'sale.completed') {
      const surprise = await this.resolveConversion(event, 1);
      if (surprise > 0) {
        resolved += 1;
        beliefsUpdated += 1;
        surpriseTotal += surprise;
      }
    }

    if (event.kind.startsWith('checkout.') && event.kind !== 'checkout.paid') {
      const status = toStableString(event.payload.status).toUpperCase();
      if (['CANCELED', 'CANCELLED', 'EXPIRED', 'FAILED', 'REFUNDED'].includes(status)) {
        const surprise = await this.resolveConversion(event, 0);
        if (surprise > 0) {
          resolved += 1;
          beliefsUpdated += 1;
          surpriseTotal += surprise;
        }
      }
    }

    if (event.kind.startsWith('autopilot.')) {
      const intent = toStableString(event.payload.intent) || 'unknown';
      if (['lead_qualified', 'meeting_booked', 'purchase_intent'].includes(intent)) {
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
        if (surprise > 0) {
          resolved += 1;
          beliefsUpdated += 1;
          surpriseTotal += surprise;
        }
      }
    }

    return { predicted, resolved, surpriseTotal, beliefsUpdated };
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
