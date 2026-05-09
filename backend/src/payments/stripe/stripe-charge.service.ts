import { Injectable, Logger } from '@nestjs/common';

import { StripeService } from '../../billing/stripe.service';
import type { StripePaymentIntent } from '../../billing/stripe-types';
import { calculateSplit } from '../split/split.engine';
import type { SplitInput } from '../split/split.types';

import type { CreateSaleChargeInput, CreateSaleChargeResult } from './stripe-charge.types';

/**
 * Marketplace sale creator.
 *
 * Creates a marketplace-owned PaymentIntent, snapshots the canonical SplitEngine
 * output into metadata, and leaves downstream stakeholder transfers to the
 * webhook-side settlement processor after the charge succeeds.
 */
@Injectable()
export class StripeChargeService {
  private readonly logger = new Logger(StripeChargeService.name);

  constructor(private readonly stripeService: StripeService) {}

  /** Create sale charge. */
  async createSaleCharge(input: CreateSaleChargeInput): Promise<CreateSaleChargeResult> {
    const splitInput: SplitInput = {
      buyerPaidCents: input.buyerPaidCents,
      saleValueCents: input.saleValueCents,
      interestCents: input.interestCents,
      marketplaceFeeCents: input.marketplaceFeeCents,
      supplier: input.splitConfig?.supplier,
      affiliate: input.splitConfig?.affiliate,
      coproducer: input.splitConfig?.coproducer,
      manager: input.splitConfig?.manager,
      // Seller residue is keyed by the destination connected account id so the
      // downstream marketplace settlement processor can map the seller line
      // without depending on provider-side merchant context like on_behalf_of.
      seller: { accountId: input.sellerStripeAccountId },
    };

    const split = calculateSplit(splitInput);
    const transferGroup = `sale:${input.idempotencyKey}`;
    const paymentMethodTypes = input.paymentMethodTypes ?? ['card', 'boleto'];
    const amount = Number(input.buyerPaidCents);
    const sellerLine = split.splits.find((line) => line.role === 'seller');
    if (!sellerLine) {
      throw new Error(
        `SplitEngine did not return a seller residue line for ${input.idempotencyKey}`,
      );
    }

    const intent = (await this.stripeService.stripe.paymentIntents.create(
      {
        amount,
        currency: input.currency.toLowerCase(),
        payment_method_types: paymentMethodTypes,
        ...(input.confirm ? { confirm: true } : {}),
        ...(input.paymentMethodData ? { payment_method_data: input.paymentMethodData } : {}),
        ...(input.paymentMethodOptions
          ? { payment_method_options: input.paymentMethodOptions }
          : {}),
        transfer_group: transferGroup,
        receipt_email: input.buyerEmail,
        metadata: {
          ...(input.metadata ?? {}),
          type: 'sale',
          workspace_id: input.workspaceId,
          kloel_order_id: input.idempotencyKey,
          split_kloel_cents: split.kloelTotalCents.toString(),
          split_seller_cents: sellerLine.amountCents.toString(),
          split_residue_cents: split.residueCents.toString(),
          split_lines: JSON.stringify(
            split.splits.map((line) => ({
              role: line.role,
              accountId: line.accountId,
              amountCents: line.amountCents.toString(),
            })),
          ),
        },
      },
      {
        idempotencyKey: `sale:${input.idempotencyKey}`,
      },
    )) as StripePaymentIntent;

    this.logger.log(
      `Created sale PaymentIntent ${intent.id} for workspace=${input.workspaceId} kloel_order=${input.idempotencyKey} amount=${amount}`,
    );

    return {
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret ?? null,
      amountCents: input.buyerPaidCents,
      marketplaceRetainedCents: split.kloelTotalCents,
      transferGroup,
      split,
      splitInput,
      stripePaymentIntent: intent,
    };
  }
}
