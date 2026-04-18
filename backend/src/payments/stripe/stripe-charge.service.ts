import { Injectable, Logger } from '@nestjs/common';

import { StripeService } from '../../billing/stripe.service';
import type { StripePaymentIntent } from '../../billing/stripe-types';
import { calculateSplit } from '../split/split.engine';
import type { SplitInput } from '../split/split.types';

import type { CreateSaleChargeInput, CreateSaleChargeResult } from './stripe-charge.types';

/**
 * Single canonical entry point for creating a sale-side charge in Stripe.
 *
 * Per ADR 0003: KLOEL operates as a Connect Platform with Direct Charges.
 * The buyer is technically buying from the seller — the PaymentIntent is
 * created with `on_behalf_of: sellerStripeAccountId` so the merchant of
 * record on the buyer's statement is the seller. Kloel takes its cut via
 * `application_fee_amount` (platform fee + interest). Splits to other
 * stakeholders (affiliate, supplier, coproducer, manager) are dispatched
 * AFTER `payment_intent.succeeded` via separate `stripe.transfers.create()`
 * calls — that fan-out lives in the webhook processor (added in a follow-up
 * commit).
 *
 * SplitEngine runs synchronously here so we can:
 *   1. Compute the application_fee_amount = kloelTotalCents.
 *   2. Snapshot the split breakdown into PaymentIntent metadata for audit.
 *   3. Hand the SplitOutput back to the caller — the webhook processor
 *      will use it (re-derived from metadata) when the charge succeeds.
 *
 * No DB writes happen here. The caller is responsible for persisting the
 * sale row and binding the PaymentIntent id to it. Idempotency key is
 * set on the Stripe request so duplicate calls with the same kloel order
 * id collapse server-side.
 */
@Injectable()
export class StripeChargeService {
  private readonly logger = new Logger(StripeChargeService.name);

  constructor(private readonly stripeService: StripeService) {}

  async createSaleCharge(input: CreateSaleChargeInput): Promise<CreateSaleChargeResult> {
    const splitInput: SplitInput = {
      buyerPaidCents: input.buyerPaidCents,
      saleValueCents: input.saleValueCents,
      interestCents: input.interestCents,
      platformFeeCents: input.platformFeeCents,
      supplier: input.splitConfig?.supplier,
      affiliate: input.splitConfig?.affiliate,
      coproducer: input.splitConfig?.coproducer,
      manager: input.splitConfig?.manager,
      // The seller's account is provided via on_behalf_of at the Stripe
      // level; SplitEngine still needs an accountId to reconcile the
      // residue line. Pass the connected account id so the residue line
      // is keyed against the same identifier downstream code uses.
      seller: { accountId: input.sellerStripeAccountId },
    };

    const split = calculateSplit(splitInput);
    const transferGroup = `sale:${input.idempotencyKey}`;
    const paymentMethodTypes = input.paymentMethodTypes ?? ['card', 'boleto'];
    const amount = Number(input.buyerPaidCents);
    const applicationFee = Number(split.kloelTotalCents);

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
        on_behalf_of: input.sellerStripeAccountId,
        application_fee_amount: applicationFee,
        transfer_data: { destination: input.sellerStripeAccountId },
        transfer_group: transferGroup,
        receipt_email: input.buyerEmail,
        metadata: {
          ...(input.metadata ?? {}),
          type: 'sale',
          workspace_id: input.workspaceId,
          kloel_order_id: input.idempotencyKey,
          split_kloel_cents: split.kloelTotalCents.toString(),
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
      applicationFeeCents: split.kloelTotalCents,
      transferGroup,
      split,
      splitInput,
      stripePaymentIntent: intent,
    };
  }
}
