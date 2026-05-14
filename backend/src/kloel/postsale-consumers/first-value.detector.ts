import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type { FirstValueDetection, DetectionInput } from './postsale-consumers.types';
import { clamp, daysSince, filterByWorkspace, latestEvent } from './postsale-consumers.types';

const DETECTION_WINDOW_DAYS = 30;
const VALUE_THRESHOLD_CONFIDENCE = 0.7;

const PROCESSOR_NAME = 'first-value-detector';
const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

@Injectable()
export class FirstValueDetector {
  private readonly logger = new Logger(FirstValueDetector.name);

  public constructor(private readonly spine: SpineEmitterService) {}

  public async detect(input: DetectionInput): Promise<FirstValueDetection> {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);
    const entityRef = input.entityRef ?? { entityType: 'customer', entityId: 'unknown' };

    const evidenceEventIds: string[] = [];
    let confidence = 0;
    let kind: string | undefined;
    let valueObtained = false;

    const conversion = latestEvent(wsEvents, 'commerce.lead.converted');
    if (conversion && daysSince(conversion.occurredAt, nowMs) < DETECTION_WINDOW_DAYS) {
      confidence += 0.3;
      evidenceEventIds.push(conversion.eventId);
      if (!kind) kind = 'conversion';
    }

    const payment = latestEvent(wsEvents, 'commerce.payment.approved');
    if (payment && daysSince(payment.occurredAt, nowMs) < DETECTION_WINDOW_DAYS) {
      confidence += 0.25;
      evidenceEventIds.push(payment.eventId);
    }

    const memberEnrolled = latestEvent(wsEvents, 'commerce.member_area.enrolled');
    if (memberEnrolled && daysSince(memberEnrolled.occurredAt, nowMs) < DETECTION_WINDOW_DAYS) {
      confidence += 0.2;
      evidenceEventIds.push(memberEnrolled.eventId);
      kind = 'member_enrollment';
    }

    const memberProgressed = latestEvent(wsEvents, 'commerce.member_area.progressed');
    if (memberProgressed && daysSince(memberProgressed.occurredAt, nowMs) < DETECTION_WINDOW_DAYS) {
      confidence += 0.15;
      evidenceEventIds.push(memberProgressed.eventId);
      if (!kind) kind = 'course_progress';
    }

    const dealWon = latestEvent(wsEvents, 'commerce.crm.deal_won');
    if (dealWon && daysSince(dealWon.occurredAt, nowMs) < DETECTION_WINDOW_DAYS) {
      confidence += 0.2;
      evidenceEventIds.push(dealWon.eventId);
      if (!kind) kind = 'deal_closed';
    }

    confidence = clamp(confidence, 0, 1);
    valueObtained = confidence >= VALUE_THRESHOLD_CONFIDENCE;

    if (valueObtained) {
      await this.emitFirstValue(input.workspaceId, entityRef, kind ?? 'multi_signal');
    }

    return {
      workspaceId: input.workspaceId,
      entityRef,
      valueObtained,
      kind: valueObtained ? kind ?? 'multi_signal' : undefined,
      evidenceEventIds,
      confidence: Math.round(confidence * 100) / 100,
      assessedAt: new Date(nowMs).toISOString(),
    };
  }

  private async emitFirstValue(
    workspaceId: string,
    entityRef: { readonly entityType: string; readonly entityId: string },
    kind: string,
  ): Promise<void> {
    try {
      await this.spine.emit({
        eventName: 'commerce.post_sale.first_value_obtained',
        workspaceId,
        entityRef,
        truthMode: 'inferred',
        provenance: {
          source: 'production',
          processor: PROCESSOR_NAME,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: { valueKind: kind },
      });
    } catch (err: unknown) {
      this.logger.error(
        `failed to emit first_value_obtained for ws ${workspaceId}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }
}
