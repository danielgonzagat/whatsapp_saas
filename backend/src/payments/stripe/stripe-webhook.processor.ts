import { Injectable, Logger } from '@nestjs/common';

import { StripeService } from '../../billing/stripe.service';
import type { StripePaymentIntent } from '../../billing/stripe-types';
import { ConnectService } from '../connect/connect.service';
import { LedgerService } from '../ledger/ledger.service';
import type { SplitRole } from '../split/split.types';

interface PersistedSplitLine {
  role: SplitRole;
  accountId: string;
  amountCents: string;
}

export interface ProcessSaleSucceededResult {
  paymentIntentId: string;
  transfersDispatched: number;
  ledgerEntriesCreated: number;
  skippedReason?: 'no_metadata' | 'already_processed' | 'no_lines';
}

/**
 * Webhook-side counterpart to StripeChargeService. When a sale-side
 * `payment_intent.succeeded` event arrives, this processor:
 *
 *   1. Reads the split breakdown from PaymentIntent.metadata.split_lines
 *      (serialized at charge-creation time).
 *   2. For every non-seller line, dispatches a separate
 *      `stripe.transfers.create()` from the seller's connected account to
 *      the stakeholder's connected account, using the same transfer_group
 *      as the original PaymentIntent.
 *   3. For every line that maps to a known ConnectAccountBalance, credits
 *      the local ledger as PENDING with maturation date taken from the
 *      caller-supplied helper. The seller line is also credited so the
 *      Kloel dashboard shows the full picture.
 *
 * Idempotent end-to-end:
 *   - LedgerService.creditPending is idempotent on
 *     (reference_type='sale', reference_id=`${paymentIntentId}:${role}`,
 *     CREDIT_PENDING) so re-delivered webhooks don't double-credit.
 *   - Stripe transfers use idempotency_key=`${paymentIntentId}:${role}`
 *     so re-delivery doesn't double-transfer.
 */
@Injectable()
export class StripeWebhookProcessor {
  private readonly logger = new Logger(StripeWebhookProcessor.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly connectService: ConnectService,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * @param matureAtForRole returns the maturation Date for a given role.
   *        Caller injects this so per-product ConnectMaturationRule
   *        overrides can be honored without coupling the processor to
   *        the maturation lookup.
   */
  async processSaleSucceeded(
    paymentIntent: StripePaymentIntent,
    matureAtForRole: (role: SplitRole) => Date,
  ): Promise<ProcessSaleSucceededResult> {
    if (paymentIntent.metadata?.type !== 'sale') {
      this.logger.debug(
        `processSaleSucceeded skip: pi=${paymentIntent.id} not a sale (type=${String(paymentIntent.metadata?.type ?? 'undefined')})`,
      );
      return {
        paymentIntentId: paymentIntent.id,
        transfersDispatched: 0,
        ledgerEntriesCreated: 0,
        skippedReason: 'no_metadata',
      };
    }

    const linesJson = paymentIntent.metadata.split_lines;
    if (!linesJson) {
      this.logger.error(
        `processSaleSucceeded missing split_lines metadata: pi=${paymentIntent.id}`,
      );
      return {
        paymentIntentId: paymentIntent.id,
        transfersDispatched: 0,
        ledgerEntriesCreated: 0,
        skippedReason: 'no_lines',
      };
    }

    const lines = parseLines(linesJson);
    if (lines.length === 0) {
      return {
        paymentIntentId: paymentIntent.id,
        transfersDispatched: 0,
        ledgerEntriesCreated: 0,
        skippedReason: 'no_lines',
      };
    }

    const sellerStripeAccountId = paymentIntent.on_behalf_of;
    if (!sellerStripeAccountId || typeof sellerStripeAccountId !== 'string') {
      this.logger.error(
        `processSaleSucceeded missing on_behalf_of: pi=${paymentIntent.id} — cannot dispatch transfers`,
      );
      return {
        paymentIntentId: paymentIntent.id,
        transfersDispatched: 0,
        ledgerEntriesCreated: 0,
        skippedReason: 'no_metadata',
      };
    }

    let transfersDispatched = 0;
    let ledgerEntriesCreated = 0;

    for (const line of lines) {
      const amountCents = BigInt(line.amountCents);
      if (amountCents <= 0n) continue;

      // Seller already received the funds via the Direct Charge — no
      // separate transfer needed. Other roles need one.
      if (line.role !== 'seller') {
        await this.dispatchTransfer({
          paymentIntentId: paymentIntent.id,
          sellerStripeAccountId,
          line,
          amountCents,
          currency: paymentIntent.currency,
          transferGroup: paymentIntent.transfer_group ?? `sale:${paymentIntent.id}`,
        });
        transfersDispatched += 1;
      }

      const balance = await this.connectService.findBalanceByStripeAccountId(line.accountId);
      if (!balance) {
        this.logger.warn(
          `processSaleSucceeded: no local ConnectAccountBalance for accountId=${line.accountId} role=${line.role}; transfer dispatched but ledger not credited`,
        );
        continue;
      }

      await this.ledgerService.creditPending({
        accountBalanceId: balance.id,
        amountCents,
        matureAt: matureAtForRole(line.role),
        reference: { type: 'sale', id: `${paymentIntent.id}:${line.role}` },
        metadata: {
          paymentIntentId: paymentIntent.id,
          stripeAccountId: line.accountId,
          role: line.role,
        },
      });
      ledgerEntriesCreated += 1;
    }

    this.logger.log(
      `processSaleSucceeded pi=${paymentIntent.id}: transfers=${transfersDispatched} ledger=${ledgerEntriesCreated}`,
    );

    return {
      paymentIntentId: paymentIntent.id,
      transfersDispatched,
      ledgerEntriesCreated,
    };
  }

  private async dispatchTransfer(args: {
    paymentIntentId: string;
    sellerStripeAccountId: string;
    line: PersistedSplitLine;
    amountCents: bigint;
    currency: string;
    transferGroup: string;
  }): Promise<void> {
    const { paymentIntentId, sellerStripeAccountId, line, amountCents, currency, transferGroup } =
      args;

    try {
      await this.stripeService.stripe.transfers.create(
        {
          amount: Number(amountCents),
          currency,
          destination: line.accountId,
          transfer_group: transferGroup,
          metadata: {
            paymentIntentId,
            role: line.role,
          },
        },
        {
          stripeAccount: sellerStripeAccountId,
          idempotencyKey: `${paymentIntentId}:${line.role}`,
        },
      );
    } catch (err) {
      // Re-throw so the webhook handler returns non-2xx and Stripe retries.
      // Stripe's idempotencyKey ensures retries don't duplicate transfers.
      this.logger.error(
        `dispatchTransfer failed pi=${paymentIntentId} role=${line.role} dest=${line.accountId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }
}

function parseLines(json: string): PersistedSplitLine[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (line): line is PersistedSplitLine =>
          typeof line === 'object' &&
          line !== null &&
          typeof (line as PersistedSplitLine).role === 'string' &&
          typeof (line as PersistedSplitLine).accountId === 'string' &&
          typeof (line as PersistedSplitLine).amountCents === 'string',
      )
      .map((line) => ({
        role: line.role,
        accountId: line.accountId,
        amountCents: line.amountCents,
      }));
  } catch {
    return [];
  }
}
