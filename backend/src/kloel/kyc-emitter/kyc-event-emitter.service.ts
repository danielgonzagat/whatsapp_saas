import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type { SpineEventInput } from '../spine/spine-event.types';

const EMITTER_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

export interface KycDocumentSubmittedParams {
  readonly agentId: string;
  readonly workspaceId: string;
  readonly correlationId?: string;
}

export interface KycApprovedParams {
  readonly agentId: string;
  readonly workspaceId: string;
  readonly autoApproved?: boolean;
  readonly correlationId?: string;
}

export interface KycRejectedParams {
  readonly agentId: string;
  readonly workspaceId: string;
  readonly reason: string;
  readonly correlationId?: string;
}

@Injectable()
export class KycEventEmitterService {
  private readonly logger = new Logger(KycEventEmitterService.name);

  constructor(private readonly spine: SpineEmitterService) {}

  emitDocumentSubmitted(params: KycDocumentSubmittedParams): void {
    try {
      const input: SpineEventInput = {
        eventName: 'commerce.kyc.document_submitted',
        workspaceId: params.workspaceId,
        entityRef: { entityType: 'agent', entityId: params.agentId },
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: 'kyc-event-emitter',
          processorVersion: EMITTER_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: { agentId: params.agentId },
        ...(params.correlationId !== undefined ? { correlationId: params.correlationId } : {}),
      };
      this.spine.emit(input);
      this.logger.debug(
        `emitted commerce.kyc.document_submitted for agent=${params.agentId} workspace=${params.workspaceId}`,
      );
    } catch (err) {
      this.logger.error(
        `failed to emit commerce.kyc.document_submitted — ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  emitApproved(params: KycApprovedParams): void {
    try {
      const input: SpineEventInput = {
        eventName: 'commerce.kyc.approved',
        workspaceId: params.workspaceId,
        entityRef: { entityType: 'agent', entityId: params.agentId },
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: 'kyc-event-emitter',
          processorVersion: EMITTER_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: {
          agentId: params.agentId,
          mode: params.autoApproved === true ? 'auto' : 'admin',
        },
        ...(params.correlationId !== undefined ? { correlationId: params.correlationId } : {}),
      };
      this.spine.emit(input);
      this.logger.debug(
        `emitted commerce.kyc.approved for agent=${params.agentId} workspace=${params.workspaceId}`,
      );
    } catch (err) {
      this.logger.error(
        `failed to emit commerce.kyc.approved — ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  emitRejected(params: KycRejectedParams): void {
    try {
      const input: SpineEventInput = {
        eventName: 'commerce.kyc.rejected',
        workspaceId: params.workspaceId,
        entityRef: { entityType: 'agent', entityId: params.agentId },
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: 'kyc-event-emitter',
          processorVersion: EMITTER_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: {
          agentId: params.agentId,
          reason: params.reason,
        },
        ...(params.correlationId !== undefined ? { correlationId: params.correlationId } : {}),
      };
      this.spine.emit(input);
      this.logger.debug(
        `emitted commerce.kyc.rejected for agent=${params.agentId} workspace=${params.workspaceId}`,
      );
    } catch (err) {
      this.logger.error(
        `failed to emit commerce.kyc.rejected — ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
