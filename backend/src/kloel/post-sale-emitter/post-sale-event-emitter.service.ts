import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type { SpineEventEnvelope, SpineEventInput } from '../spine/spine-event.types';

const PROCESSOR_NAME = 'post-sale-event-emitter';
const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

export interface PostSaleEmitParams {
  readonly workspaceId: string;
  readonly entityRef: { readonly entityType: string; readonly entityId: string };
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
  readonly occurredAt?: string;
  readonly causedBy?: readonly string[];
  readonly source?: 'synthetic' | 'production';
}

/**
 * UTP-EVENT-EMIT-POSTSALE — Canonical post-sale event emitter for the B17 spine.
 *
 * One method per canonical transition (PCI.1 §3.12 + PCI.6 §2.7). Every
 * method is a non-throwing side-effect: it calls SpineEmitterService.emit()
 * inside try/catch so a failing spine never breaks the business path.
 *
 * truthMode is set per event:
 *   'observed' — confirmed delivery, user action, or data collected.
 *   'inferred' — classifier output (risk detection, window opening).
 */
@Injectable()
export class PostSaleEventEmitterService {
  private readonly logger = new Logger(PostSaleEventEmitterService.name);

  public constructor(private readonly spine: SpineEmitterService) {}

  public async emitDeliveryCompleted(
    params: PostSaleEmitParams,
  ): Promise<SpineEventEnvelope | undefined> {
    return this.safeEmit('commerce.post_sale.delivery_completed', 'observed', params);
  }

  public async emitActivationStarted(
    params: PostSaleEmitParams,
  ): Promise<SpineEventEnvelope | undefined> {
    return this.safeEmit('commerce.post_sale.activation_started', 'observed', params);
  }

  public async emitFirstValueObtained(
    params: PostSaleEmitParams,
  ): Promise<SpineEventEnvelope | undefined> {
    return this.safeEmit('commerce.post_sale.first_value_obtained', 'observed', params);
  }

  public async emitSatisfactionSignalObserved(
    params: PostSaleEmitParams,
  ): Promise<SpineEventEnvelope | undefined> {
    return this.safeEmit('commerce.post_sale.satisfaction_signal_observed', 'observed', params);
  }

  public async emitTestimonialRequested(
    params: PostSaleEmitParams,
  ): Promise<SpineEventEnvelope | undefined> {
    return this.safeEmit('commerce.post_sale.testimonial_requested', 'observed', params);
  }

  public async emitRepurchaseWindowOpened(
    params: PostSaleEmitParams,
  ): Promise<SpineEventEnvelope | undefined> {
    return this.safeEmit('commerce.post_sale.repurchase_window_opened', 'inferred', params);
  }

  public async emitChurnRiskDetected(
    params: PostSaleEmitParams,
  ): Promise<SpineEventEnvelope | undefined> {
    return this.safeEmit('commerce.post_sale.churn_risk_detected', 'inferred', params);
  }

  public async emitWinBackWindowOpened(
    params: PostSaleEmitParams,
  ): Promise<SpineEventEnvelope | undefined> {
    return this.safeEmit('commerce.post_sale.win_back_window_opened', 'inferred', params);
  }

  private async safeEmit(
    eventName: string,
    truthMode: 'observed' | 'inferred',
    params: PostSaleEmitParams,
  ): Promise<SpineEventEnvelope | undefined> {
    try {
      const input: SpineEventInput = {
        eventName,
        workspaceId: params.workspaceId,
        entityRef: params.entityRef,
        truthMode,
        provenance: {
          source: params.source ?? 'production',
          processor: PROCESSOR_NAME,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        ...(params.payload !== undefined ? { payload: params.payload } : {}),
        ...(params.correlationId !== undefined
          ? { correlationId: params.correlationId }
          : {}),
        ...(params.occurredAt !== undefined ? { occurredAt: params.occurredAt } : {}),
        ...(params.causedBy !== undefined ? { causedBy: params.causedBy } : {}),
      };
      return await this.spine.emit(input);
    } catch (err: unknown) {
      this.logger.error(
        `failed to emit ${eventName} for ws ${params.workspaceId}: ${(err as Error)?.message ?? String(err)}`,
      );
      return undefined;
    }
  }
}
