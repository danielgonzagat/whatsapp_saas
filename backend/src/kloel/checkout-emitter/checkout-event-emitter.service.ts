import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';

const PROCESSOR = 'checkout-event-emitter';
const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

@Injectable()
export class CheckoutEventEmitterService {
  private readonly logger = new Logger(CheckoutEventEmitterService.name);

  constructor(private readonly spine: SpineEmitterService) {}

  async cartCreated(params: {
    workspaceId: string;
    orderId: string;
    planId: string;
    correlationId?: string | undefined;
    totalInCents: number;
  }): Promise<void> {
    try {
      await this.spine.emit({
        eventName: 'commerce.cart.created',
        workspaceId: params.workspaceId,
        entityRef: { entityType: 'order', entityId: params.orderId },
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: PROCESSOR,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: {
          orderId: params.orderId,
          planId: params.planId,
          totalInCents: params.totalInCents,
        },
        correlationId: params.correlationId,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `commerce.cart.created emission failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async cartAbandoned(params: {
    workspaceId: string;
    orderId: string;
    planId: string;
    correlationId?: string | undefined;
    minutesSinceCreation: number;
  }): Promise<void> {
    try {
      await this.spine.emit({
        eventName: 'commerce.cart.abandoned',
        workspaceId: params.workspaceId,
        entityRef: { entityType: 'order', entityId: params.orderId },
        truthMode: 'inferred',
        provenance: {
          source: 'production',
          processor: PROCESSOR,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: {
          orderId: params.orderId,
          planId: params.planId,
          minutesSinceCreation: params.minutesSinceCreation,
        },
        correlationId: params.correlationId,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `commerce.cart.abandoned emission failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async checkoutInitiated(params: {
    workspaceId: string;
    orderId: string;
    planId: string;
    correlationId?: string | undefined;
    paymentMethod: string;
    totalInCents: number;
  }): Promise<void> {
    try {
      await this.spine.emit({
        eventName: 'commerce.cart.checkout_initiated',
        workspaceId: params.workspaceId,
        entityRef: { entityType: 'order', entityId: params.orderId },
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: PROCESSOR,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: {
          orderId: params.orderId,
          planId: params.planId,
          paymentMethod: params.paymentMethod,
          totalInCents: params.totalInCents,
        },
        correlationId: params.correlationId,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `commerce.cart.checkout_initiated emission failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async paymentInitiated(params: {
    workspaceId: string;
    orderId: string;
    paymentIntentId: string;
    paymentMethod: string;
    amountInCents: number;
    correlationId?: string | undefined;
  }): Promise<void> {
    try {
      await this.spine.emit({
        eventName: 'commerce.payment.initiated',
        workspaceId: params.workspaceId,
        entityRef: { entityType: 'order', entityId: params.orderId },
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: PROCESSOR,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: {
          orderId: params.orderId,
          paymentIntentId: params.paymentIntentId,
          paymentMethod: params.paymentMethod,
          amountInCents: params.amountInCents,
        },
        correlationId: params.correlationId,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `commerce.payment.initiated emission failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async paymentApproved(params: {
    workspaceId: string;
    orderId: string;
    paymentIntentId: string;
    amountInCents: number;
    correlationId?: string | undefined;
  }): Promise<void> {
    try {
      await this.spine.emit({
        eventName: 'commerce.payment.approved',
        workspaceId: params.workspaceId,
        entityRef: { entityType: 'order', entityId: params.orderId },
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: PROCESSOR,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        valence: 'positive',
        payload: {
          orderId: params.orderId,
          paymentIntentId: params.paymentIntentId,
          amountInCents: params.amountInCents,
        },
        correlationId: params.correlationId,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `commerce.payment.approved emission failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async paymentDeclined(params: {
    workspaceId: string;
    orderId: string;
    paymentIntentId?: string | undefined;
    correlationId?: string | undefined;
    reason?: string;
  }): Promise<void> {
    try {
      await this.spine.emit({
        eventName: 'commerce.payment.declined',
        workspaceId: params.workspaceId,
        entityRef: { entityType: 'order', entityId: params.orderId },
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: PROCESSOR,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        valence: 'negative',
        payload: {
          orderId: params.orderId,
          paymentIntentId: params.paymentIntentId,
          reason: params.reason,
        },
        correlationId: params.correlationId,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `commerce.payment.declined emission failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async paymentRefunded(params: {
    workspaceId: string;
    orderId: string;
    paymentIntentId: string;
    refundId: string;
    amountInCents: bigint;
    correlationId?: string | undefined;
  }): Promise<void> {
    try {
      const amountNumber =
        typeof params.amountInCents === 'bigint'
          ? Number(params.amountInCents)
          : params.amountInCents;
      await this.spine.emit({
        eventName: 'commerce.payment.refunded',
        workspaceId: params.workspaceId,
        entityRef: { entityType: 'order', entityId: params.orderId },
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: PROCESSOR,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        valence: 'negative',
        payload: {
          orderId: params.orderId,
          paymentIntentId: params.paymentIntentId,
          refundId: params.refundId,
          amountInCents: amountNumber,
        },
        correlationId: params.correlationId,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `commerce.payment.refunded emission failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async paymentChargedBack(params: {
    workspaceId: string;
    orderId: string;
    paymentIntentId: string;
    disputeId: string;
    amountInCents: bigint;
    correlationId?: string | undefined;
  }): Promise<void> {
    try {
      const amountNumber =
        typeof params.amountInCents === 'bigint'
          ? Number(params.amountInCents)
          : params.amountInCents;
      await this.spine.emit({
        eventName: 'commerce.payment.charged_back',
        workspaceId: params.workspaceId,
        entityRef: { entityType: 'order', entityId: params.orderId },
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: PROCESSOR,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        valence: 'negative',
        payload: {
          orderId: params.orderId,
          paymentIntentId: params.paymentIntentId,
          disputeId: params.disputeId,
          amountInCents: amountNumber,
        },
        correlationId: params.correlationId,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `commerce.payment.charged_back emission failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async leadConverted(params: {
    workspaceId: string;
    orderId: string;
    leadId: string;
    customerEmail?: string | null | undefined;
    correlationId?: string | undefined;
  }): Promise<void> {
    try {
      await this.spine.emit({
        eventName: 'commerce.lead.converted',
        workspaceId: params.workspaceId,
        entityRef: { entityType: 'lead', entityId: params.leadId },
        truthMode: 'observed',
        provenance: {
          source: 'production',
          processor: PROCESSOR,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        valence: 'positive',
        payload: {
          orderId: params.orderId,
          leadId: params.leadId,
          customerEmail: params.customerEmail,
        },
        correlationId: params.correlationId,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `commerce.lead.converted emission failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
