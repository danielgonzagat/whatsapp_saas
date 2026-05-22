import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type { SpineEventInput } from '../spine/spine-event.types';

@Injectable()
export class CrmEventEmitterService {
  private readonly logger = new Logger(CrmEventEmitterService.name);

  constructor(private readonly spine: SpineEmitterService) {}

  async emitStageChanged(
    workspaceId: string,
    dealId: string,
    fromStage: string,
    toStage: string,
    contactId?: string,
  ): Promise<void> {
    await this.safeEmit({
      eventName: 'commerce.crm.stage_changed',
      workspaceId,
      entityRef: { entityType: 'deal', entityId: dealId },
      truthMode: 'observed',
      provenance: {
        source: 'production',
        processor: 'crm-event-emitter',
        processorVersion: '1.0.0',
        schemaVersion: '1.0.0',
      },
      payload: { dealId, fromStage, toStage, ...(contactId ? { contactId } : {}) },
    });
  }

  async emitOwnerAssigned(
    workspaceId: string,
    dealId: string,
    ownerId: string,
    ownerType: 'human' | 'autopilot',
  ): Promise<void> {
    await this.safeEmit({
      eventName: 'commerce.crm.owner_assigned',
      workspaceId,
      entityRef: { entityType: 'deal', entityId: dealId },
      truthMode: 'observed',
      provenance: {
        source: 'production',
        processor: 'crm-event-emitter',
        processorVersion: '1.0.0',
        schemaVersion: '1.0.0',
      },
      payload: { dealId, ownerId, ownerType },
    });
  }

  async emitNextStepDefined(
    workspaceId: string,
    dealId: string,
    action: string,
    dueAt?: string,
  ): Promise<void> {
    await this.safeEmit({
      eventName: 'commerce.crm.next_step_defined',
      workspaceId,
      entityRef: { entityType: 'deal', entityId: dealId },
      truthMode: 'observed',
      provenance: {
        source: 'production',
        processor: 'crm-event-emitter',
        processorVersion: '1.0.0',
        schemaVersion: '1.0.0',
      },
      payload: { dealId, action, ...(dueAt ? { dueAt } : {}) },
    });
  }

  async emitDealWon(
    workspaceId: string,
    dealId: string,
    value?: number,
    contactId?: string,
  ): Promise<void> {
    await this.safeEmit({
      eventName: 'commerce.crm.deal_won',
      workspaceId,
      entityRef: { entityType: 'deal', entityId: dealId },
      truthMode: 'observed',
      provenance: {
        source: 'production',
        processor: 'crm-event-emitter',
        processorVersion: '1.0.0',
        schemaVersion: '1.0.0',
      },
      payload: { dealId, ...(value !== undefined ? { value } : {}), ...(contactId ? { contactId } : {}) },
    });
  }

  async emitDealLost(
    workspaceId: string,
    dealId: string,
    lossReason?: string,
    contactId?: string,
  ): Promise<void> {
    await this.safeEmit({
      eventName: 'commerce.crm.deal_lost',
      workspaceId,
      entityRef: { entityType: 'deal', entityId: dealId },
      truthMode: 'observed',
      provenance: {
        source: 'production',
        processor: 'crm-event-emitter',
        processorVersion: '1.0.0',
        schemaVersion: '1.0.0',
      },
      payload: { dealId, ...(lossReason ? { lossReason } : {}), ...(contactId ? { contactId } : {}) },
    });
  }

  async emitObjectionRaised(
    workspaceId: string,
    leadId: string,
    objectionKind: string,
    confidence?: number,
  ): Promise<void> {
    await this.safeEmit({
      eventName: 'commerce.lead.objection_raised',
      workspaceId,
      entityRef: { entityType: 'lead', entityId: leadId },
      truthMode: 'inferred',
      provenance: {
        source: 'production',
        processor: 'crm-event-emitter',
        processorVersion: '1.0.0',
        schemaVersion: '1.0.0',
      },
      payload: {
        leadId,
        objectionKind,
        ...(confidence !== undefined ? { confidence } : {}),
      },
    });
  }

  private async safeEmit(input: SpineEventInput): Promise<void> {
    try {
      await this.spine.emit(input);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to emit CRM event ${input.eventName}: ${message}`);
    }
  }
}
