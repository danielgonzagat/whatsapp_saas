import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type { SpineEventInput } from '../spine/spine-event.types';

const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

export interface CampaignClickedInput {
  workspaceId: string;
  campaignId: string;
  creativeId?: string;
  utm?: Readonly<Record<string, string>>;
}

export interface CampaignConversionAssociatedInput {
  workspaceId: string;
  campaignId: string;
  conversionId: string;
  attributionModel: string;
}

export interface CampaignAudienceReachedInput {
  workspaceId: string;
  campaignId: string;
  metric: string;
  value: number;
}

export interface CampaignCreativeSwappedInput {
  workspaceId: string;
  campaignId: string;
  fromCreativeId: string;
  toCreativeId: string;
  swappedBy: string;
}

export interface CampaignPerformanceDropDetectedInput {
  workspaceId: string;
  campaignId: string;
  dropPct: number;
  threshold: number;
}

@Injectable()
export class CampaignEventEmitterService {
  private readonly logger = new Logger(CampaignEventEmitterService.name);

  constructor(private readonly spine: SpineEmitterService) {}

  emitClicked(input: CampaignClickedInput): void {
    this.safeEmit({
      eventName: 'commerce.campaign.clicked',
      workspaceId: input.workspaceId,
      entityRef: { entityType: 'campaign', entityId: input.campaignId },
      truthMode: 'observed',
      provenance: {
        source: 'production',
        processor: 'campaign-event-emitter',
        processorVersion: PROCESSOR_VERSION,
        schemaVersion: SCHEMA_VERSION,
      },
      payload: {
        campaignId: input.campaignId,
        ...(input.creativeId ? { creativeId: input.creativeId } : {}),
        ...(input.utm ? { utm: input.utm } : {}),
      },
    });
  }

  emitConversionAssociated(input: CampaignConversionAssociatedInput): void {
    this.safeEmit({
      eventName: 'commerce.campaign.conversion_associated',
      workspaceId: input.workspaceId,
      entityRef: { entityType: 'campaign', entityId: input.campaignId },
      truthMode: 'observed',
      provenance: {
        source: 'production',
        processor: 'campaign-event-emitter',
        processorVersion: PROCESSOR_VERSION,
        schemaVersion: SCHEMA_VERSION,
      },
      payload: {
        campaignId: input.campaignId,
        conversionId: input.conversionId,
        attributionModel: input.attributionModel,
      },
    });
  }

  emitAudienceReached(input: CampaignAudienceReachedInput): void {
    this.safeEmit({
      eventName: 'commerce.campaign.audience_reached',
      workspaceId: input.workspaceId,
      entityRef: { entityType: 'campaign', entityId: input.campaignId },
      truthMode: 'observed',
      provenance: {
        source: 'production',
        processor: 'campaign-event-emitter',
        processorVersion: PROCESSOR_VERSION,
        schemaVersion: SCHEMA_VERSION,
      },
      payload: {
        campaignId: input.campaignId,
        metric: input.metric,
        value: input.value,
      },
    });
  }

  emitCreativeSwapped(input: CampaignCreativeSwappedInput): void {
    this.safeEmit({
      eventName: 'commerce.campaign.creative_swapped',
      workspaceId: input.workspaceId,
      entityRef: { entityType: 'campaign', entityId: input.campaignId },
      truthMode: 'observed',
      provenance: {
        source: 'production',
        processor: 'campaign-event-emitter',
        processorVersion: PROCESSOR_VERSION,
        schemaVersion: SCHEMA_VERSION,
      },
      payload: {
        campaignId: input.campaignId,
        fromCreativeId: input.fromCreativeId,
        toCreativeId: input.toCreativeId,
        swappedBy: input.swappedBy,
      },
    });
  }

  emitPerformanceDropDetected(input: CampaignPerformanceDropDetectedInput): void {
    this.safeEmit({
      eventName: 'commerce.campaign.performance_drop_detected',
      workspaceId: input.workspaceId,
      entityRef: { entityType: 'campaign', entityId: input.campaignId },
      truthMode: 'inferred',
      provenance: {
        source: 'production',
        processor: 'campaign-event-emitter',
        processorVersion: PROCESSOR_VERSION,
        schemaVersion: SCHEMA_VERSION,
      },
      payload: {
        campaignId: input.campaignId,
        dropPct: input.dropPct,
        threshold: input.threshold,
      },
    });
  }

  private safeEmit(input: SpineEventInput): void {
    try {
      this.spine.emit(input);
    } catch (err: unknown) {
      this.logger.error(
        `Failed to emit ${input.eventName} for workspace ${input.workspaceId ?? 'global'}: ${(err as Error).message}`,
      );
    }
  }
}
