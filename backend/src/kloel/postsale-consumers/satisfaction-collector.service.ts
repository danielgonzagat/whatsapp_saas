import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type { SpineEventRef } from '../mind/mind.types';
import type {
  SatisfactionSignal,
  SatisfactionMethod,
  DetectionInput,
} from './postsale-consumers.types';
import { daysSince, filterByWorkspace } from './postsale-consumers.types';

const PROCESSOR_NAME = 'satisfaction-collector';
const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

const NPS_PROMOTER_THRESHOLD = 9;
const NPS_DETRACTOR_THRESHOLD = 6;

@Injectable()
export class SatisfactionCollectorService {
  private readonly logger = new Logger(SatisfactionCollectorService.name);

  public constructor(private readonly spine: SpineEmitterService) {}

  public collect(
    input: DetectionInput,
    method: SatisfactionMethod,
    score?: number,
    freeText?: string,
    sourceEventId?: string,
  ): SatisfactionSignal {
    const nowMs = input.nowMs ?? Date.now();
    const entityRef = input.entityRef ?? { entityType: 'customer', entityId: 'unknown' };

    const sentimentLabel = this.deriveSentiment(
      method,
      score,
      input.events,
      input.workspaceId,
      nowMs,
    );

    const signal: SatisfactionSignal = {
      workspaceId: input.workspaceId,
      entityRef,
      method,
      score,
      sentimentLabel,
      freeText,
      observedAt: new Date(nowMs).toISOString(),
      sourceEventId,
    };

    this.emitSignal(signal).catch((err: unknown) => {
      this.logger.error(
        `failed to emit satisfaction_signal_observed for ws ${input.workspaceId}: ${(err as Error)?.message ?? String(err)}`,
      );
    });

    return signal;
  }

  public aggregate(
    events: readonly SpineEventRef[],
    workspaceId: string,
  ): { readonly npsScore: number; readonly averageScore: number; readonly signalCount: number } {
    const wsEvents = filterByWorkspace(events, workspaceId);
    const satisfactionEvents = wsEvents.filter(
      (e) => e.eventName === 'commerce.post_sale.satisfaction_signal_observed',
    );

    const scores: number[] = [];
    for (const e of satisfactionEvents) {
      const s = e.payload?.['score'];
      if (typeof s === 'number' && Number.isFinite(s)) {
        scores.push(s);
      }
    }

    if (scores.length === 0) {
      return { npsScore: 0, averageScore: 0, signalCount: 0 };
    }

    const promoters = scores.filter((s) => s >= NPS_PROMOTER_THRESHOLD).length;
    const detractors = scores.filter((s) => s <= NPS_DETRACTOR_THRESHOLD).length;
    const npsScore = Math.round(((promoters - detractors) / scores.length) * 100);

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    return {
      npsScore,
      averageScore: Math.round(avg * 100) / 100,
      signalCount: scores.length,
    };
  }

  private deriveSentiment(
    method: SatisfactionMethod,
    score: number | undefined,
    events: readonly SpineEventRef[],
    workspaceId: string,
    nowMs: number,
  ): SatisfactionSignal['sentimentLabel'] {
    if (method === 'behavioral') {
      return this.deriveBehavioralSentiment(events, workspaceId, nowMs);
    }

    if (score === undefined) {
      return 'neutral';
    }
    if (score >= NPS_PROMOTER_THRESHOLD) {
      return 'positive';
    }
    if (score <= 4) {
      return 'negative';
    }
    if (score <= NPS_DETRACTOR_THRESHOLD) {
      return 'mixed';
    }
    return 'neutral';
  }

  private deriveBehavioralSentiment(
    events: readonly SpineEventRef[],
    workspaceId: string,
    nowMs: number,
  ): SatisfactionSignal['sentimentLabel'] {
    const wsEvents = filterByWorkspace(events, workspaceId);
    let positiveSignals = 0;
    let negativeSignals = 0;

    for (const e of wsEvents) {
      if (daysSince(e.occurredAt, nowMs) > 30) {
        continue;
      }

      if (
        e.eventName === 'commerce.member_area.progressed' ||
        e.eventName === 'commerce.member_area.enrolled' ||
        e.eventName === 'commerce.crm.deal_won'
      ) {
        positiveSignals++;
      }

      if (
        e.eventName === 'commerce.payment.refunded' ||
        e.eventName === 'commerce.member_area.dropped_out' ||
        e.eventName === 'commerce.whatsapp.handoff_to_human'
      ) {
        negativeSignals++;
      }
    }

    const total = positiveSignals + negativeSignals;
    if (total === 0) {
      return 'neutral';
    }
    if (positiveSignals >= negativeSignals * 2) {
      return 'positive';
    }
    if (negativeSignals >= positiveSignals * 2) {
      return 'negative';
    }
    return 'mixed';
  }

  private async emitSignal(signal: SatisfactionSignal): Promise<void> {
    await this.spine.emit({
      eventName: 'commerce.post_sale.satisfaction_signal_observed',
      workspaceId: signal.workspaceId,
      entityRef: signal.entityRef,
      truthMode: signal.method === 'behavioral' ? 'inferred' : 'observed',
      provenance: {
        source: 'production',
        processor: PROCESSOR_NAME,
        processorVersion: PROCESSOR_VERSION,
        schemaVersion: SCHEMA_VERSION,
      },
      payload: {
        method: signal.method,
        score: signal.score,
        sentimentLabel: signal.sentimentLabel,
      },
    });
  }
}
