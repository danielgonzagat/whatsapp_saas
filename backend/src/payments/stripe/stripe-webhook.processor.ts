import { Injectable, Logger } from '@nestjs/common';

import { StripeService } from '../../billing/stripe.service';
import type { StripePaymentIntent } from '../../billing/stripe-types';
import { forEachSequential } from '../../common/async-sequence';
import { ConnectService } from '../connect/connect.service';
import { LedgerService } from '../ledger/ledger.service';
import type { SplitRole } from '../split/split.types';

interface PersistedSplitLine {
  role: SplitRole;
  accountId: string;
  amountCents: string;
}

interface PersistedTransferSnapshot {
  role: SplitRole;
  accountId: string;
  amountCents: bigint;
  stripeTransferId: string;
}

/** Connect post sale snapshot shape. */
export interface ConnectPostSaleSnapshot {
  transferGroup: string;
  sellerStripeAccountId: string;
  sellerDestinationAmountCents: bigint;
  transfers: PersistedTransferSnapshot[];
}

/** Process sale succeeded result shape. */
export interface ProcessSaleSucceededResult {
  paymentIntentId: string;
  transfersDispatched: number;
  ledgerEntriesCreated: number;
  connectPostSale?: ConnectPostSaleSnapshot;
  skippedReason?: 'no_metadata' | 'already_processed' | 'no_lines';
}

function parseLines(json: string): PersistedSplitLine[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return [];
    }
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

function asId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (value && typeof value === 'object' && 'id' in value) {
    const nested = (value as { id?: unknown }).id;
    return typeof nested === 'string' && nested.length > 0 ? nested : null;
  }
  return null;
}

/**
 * Webhook-side counterpart to StripeChargeService. When a sale-side
 * `payment_intent.succeeded` event arrives, this processor:
 *
 *   1. Reads the split breakdown from PaymentIntent.metadata.split_lines
 *      (serialized at charge-creation time).
 *   2. For every non-seller line, dispatches a separate
 *      `stripe.transfers.create()` from the platform balance to the
 *      stakeholder's connected account, tying each transfer to the original
 *      charge via `source_transaction`.
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

    const sourceChargeId = asId(paymentIntent.latest_charge);
    if (!sourceChargeId) {
      this.logger.error(
        `processSaleSucceeded missing latest_charge: pi=${paymentIntent.id} — cannot dispatch platform fan-out transfers`,
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
    const transferGroup = paymentIntent.transfer_group ?? `sale:${paymentIntent.id}`;
    const transfers: PersistedTransferSnapshot[] = [];
    let sellerDestinationAmountCents = 0n;
    const sellerStripeAccountId =
      lines.find((line) => line.role === 'seller')?.accountId ?? asId(paymentIntent.on_behalf_of);
    if (!sellerStripeAccountId) {
      this.logger.error(
        `processSaleSucceeded missing seller account context: pi=${paymentIntent.id} — cannot persist reversal snapshot`,
      );
      return {
        paymentIntentId: paymentIntent.id,
        transfersDispatched: 0,
        ledgerEntriesCreated: 0,
        skippedReason: 'no_metadata',
      };
    }

    await forEachSequential(lines, async (line) => {
      const amountCents = BigInt(line.amountCents);
      if (amountCents <= 0n) {
        return;
      }

      const balance = await this.connectService.findBalanceByStripeAccountId(line.accountId);
      if (!balance) {
        throw new Error(
          `Missing local ConnectAccountBalance for stripeAccountId=${line.accountId} role=${line.role} paymentIntent=${paymentIntent.id}`,
        );
      }

      // Seller already received the residue via transfer_data.amount on the
      // destination charge. Other roles need explicit platform-side fan-out.
      if (line.role !== 'seller') {
        const stripeTransferId = await this.dispatchTransfer({
          paymentIntentId: paymentIntent.id,
          sourceChargeId,
          line,
          amountCents,
          currency: paymentIntent.currency,
          transferGroup,
        });
        transfers.push({
          role: line.role,
          accountId: line.accountId,
          amountCents,
          stripeTransferId,
        });
        transfersDispatched += 1;
      } else {
        sellerDestinationAmountCents = amountCents;
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
    });

    this.logger.log(
      `processSaleSucceeded pi=${paymentIntent.id}: transfers=${transfersDispatched} ledger=${ledgerEntriesCreated}`,
    );

    return {
      paymentIntentId: paymentIntent.id,
      transfersDispatched,
      ledgerEntriesCreated,
      connectPostSale: {
        transferGroup,
        sellerStripeAccountId,
        sellerDestinationAmountCents,
        transfers,
      },
    };
  }

  private async dispatchTransfer(args: {
    paymentIntentId: string;
    sourceChargeId: string;
    line: PersistedSplitLine;
    amountCents: bigint;
    currency: string;
    transferGroup: string;
  }): Promise<string> {
    const { paymentIntentId, sourceChargeId, line, amountCents, currency, transferGroup } = args;

    try {
      const transfer = await this.stripeService.stripe.transfers.create(
        {
          amount: Number(amountCents),
          currency,
          destination: line.accountId,
          source_transaction: sourceChargeId,
          transfer_group: transferGroup,
          metadata: {
            paymentIntentId,
            role: line.role,
          },
        },
        {
          idempotencyKey: `${paymentIntentId}:${line.role}`,
        },
      );
      return transfer.id;
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
