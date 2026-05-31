import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';

import { StripeService } from '../../billing/stripe.service';
import { PrismaService } from '../../prisma/prisma.service';
import { forEachSequential } from '../../common/async-sequence';
import { LedgerService } from '../ledger/ledger.service';

import { ConnectService } from './connect.service';
import {
  buildSnapshot,
  planProportionalReversals,
  type PlannedReversal,
  type ReversalSnapshot,
} from './connect-reversal.service.helpers';

/** Process refund reversal input shape. */
export interface ProcessRefundReversalInput {
  /** Payment intent id property. */
  paymentIntentId: string;
  /** Refund id property. */
  refundId: string;
  /** Amount cents property. */
  amountCents: bigint;
}

/** Process dispute reversal input shape. */
export interface ProcessDisputeReversalInput {
  /** Payment intent id property. */
  paymentIntentId: string;
  /** Dispute id property. */
  disputeId: string;
  /** Amount cents property. */
  amountCents: bigint;
}

/** Process reversal result shape. */
export interface ProcessReversalResult {
  /** Payment intent id property. */
  paymentIntentId: string;
  /** Trigger id property. */
  triggerId: string;
  /** Reversed transfers property. */
  reversedTransfers: number;
  /** Ledger debits property. */
  ledgerDebits: number;
  /** Reversed amount cents property. */
  reversedAmountCents: bigint;
}

/** Connect reversal service. */
@Injectable()
export class ConnectReversalService {
  private readonly logger = StructuredLogger.from(ConnectReversalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly connectService: ConnectService,
    private readonly ledgerService: LedgerService,
  ) {}

  /** Process refund. */
  async processRefund(input: ProcessRefundReversalInput): Promise<ProcessReversalResult> {
    const snapshot = await this.loadSnapshot(input.paymentIntentId);
    if (!snapshot) {
      this.logger.error(
        `Missing connectPostSale reversal snapshot for refund paymentIntent=${input.paymentIntentId} refund=${input.refundId}`,
      );
      throw new Error(
        `Missing connectPostSale reversal snapshot for paymentIntent=${input.paymentIntentId}`,
      );
    }

    const sellerTransfer = await this.findSellerTransfer(snapshot);
    const sellerLines =
      sellerTransfer && snapshot.sellerStripeAccountId && snapshot.sellerDestinationAmountCents > 0n
        ? [
            {
              role: 'seller' as const,
              accountId: snapshot.sellerStripeAccountId,
              amountCents: snapshot.sellerDestinationAmountCents,
              stripeTransferId: sellerTransfer.id,
            },
          ]
        : [];
    const manualLines = snapshot.manualTransfers.map((line) => ({
      role: line.role,
      accountId: line.accountId,
      amountCents: BigInt(line.amountCents),
      stripeTransferId: line.stripeTransferId,
    }));
    const planned = planProportionalReversals(
      [...sellerLines, ...manualLines],
      input.amountCents,
      snapshot.buyerPaidCents,
    );

    return this.applyReversals({
      paymentIntentId: input.paymentIntentId,
      triggerType: 'refund',
      triggerId: input.refundId,
      planned,
    });
  }

  /** Process dispute. */
  async processDispute(input: ProcessDisputeReversalInput): Promise<ProcessReversalResult> {
    const snapshot = await this.loadSnapshot(input.paymentIntentId);
    if (!snapshot) {
      this.logger.error(
        `Missing connectPostSale reversal snapshot for dispute paymentIntent=${input.paymentIntentId} dispute=${input.disputeId}`,
      );
      throw new Error(
        `Missing connectPostSale reversal snapshot for paymentIntent=${input.paymentIntentId}`,
      );
    }

    const sellerTransfer = await this.findSellerTransfer(snapshot);
    const sellerLines =
      sellerTransfer && snapshot.sellerStripeAccountId && snapshot.sellerDestinationAmountCents > 0n
        ? [
            {
              role: 'seller' as const,
              accountId: snapshot.sellerStripeAccountId,
              amountCents: snapshot.sellerDestinationAmountCents,
              stripeTransferId: sellerTransfer.id,
            },
          ]
        : [];
    const manualLines = snapshot.manualTransfers.map((line) => ({
      role: line.role,
      accountId: line.accountId,
      amountCents: BigInt(line.amountCents),
      stripeTransferId: line.stripeTransferId,
    }));
    const planned = planProportionalReversals(
      [...sellerLines, ...manualLines],
      input.amountCents,
      snapshot.buyerPaidCents,
    );

    return this.applyReversals({
      paymentIntentId: input.paymentIntentId,
      triggerType: 'dispute',
      triggerId: input.disputeId,
      planned,
    });
  }

  private async applyReversals(args: {
    paymentIntentId: string;
    triggerType: 'refund' | 'dispute';
    triggerId: string;
    planned: PlannedReversal[];
  }): Promise<ProcessReversalResult> {
    let reversedTransfers = 0;
    let ledgerDebits = 0;
    let reversedAmountCents = 0n;

    await forEachSequential(args.planned, async (reversal) => {
      // Apply Stripe reversal first (idempotent externally)
      await this.stripeService.stripe.transfers.createReversal(
        reversal.stripeTransferId,
        {
          amount: Number(reversal.amountCents),
          metadata: {
            paymentIntentId: args.paymentIntentId,
            triggerType: args.triggerType,
            triggerId: args.triggerId,
            role: reversal.role,
          },
        },
        {
          idempotencyKey: `${args.triggerType}:${args.triggerId}:${reversal.stripeTransferId}`,
        },
      );
      reversedTransfers += 1;
      reversedAmountCents += reversal.amountCents;

      const balance = await this.connectService.findBalanceByStripeAccountId(reversal.accountId);
      if (!balance) {
        this.logger.warn(
          `No local ConnectAccountBalance for reversal paymentIntent=${args.paymentIntentId} role=${reversal.role} account=${reversal.accountId}`,
        );
        return;
      }

      // Wrap ledger debit in transaction to prevent race conditions on balance
      await this.prisma.$transaction(
        async (tx) => {
          if (args.triggerType === 'refund') {
            await this.ledgerService.debitForRefund({
              accountBalanceId: balance.id,
              amountCents: reversal.amountCents,
              reference: { type: 'refund', id: `${args.triggerId}:${reversal.role}` },
              metadata: {
                paymentIntentId: args.paymentIntentId,
                stripeTransferId: reversal.stripeTransferId,
                role: reversal.role,
              },
            });
          } else {
            await this.ledgerService.debitForChargeback({
              accountBalanceId: balance.id,
              amountCents: reversal.amountCents,
              reference: { type: 'dispute', id: `${args.triggerId}:${reversal.role}` },
              metadata: {
                paymentIntentId: args.paymentIntentId,
                stripeTransferId: reversal.stripeTransferId,
                role: reversal.role,
              },
            });
          }

          // Record audit trail
          await tx.adminAuditLog.create({
            data: {
              action: `REVERSAL_${args.triggerType.toUpperCase()}`,
              entityType: 'connect_reversal',
              entityId: `${args.triggerId}:${reversal.role}`,
              details: {
                triggerId: args.triggerId,
                triggerType: args.triggerType,
                paymentIntentId: args.paymentIntentId,
                role: reversal.role,
                amountCents: reversal.amountCents.toString(),
                accountId: reversal.accountId,
                stripeTransferId: reversal.stripeTransferId,
              },
            },
          });
        },
        { isolationLevel: 'ReadCommitted' },
      );

      ledgerDebits += 1;
    });

    return {
      paymentIntentId: args.paymentIntentId,
      triggerId: args.triggerId,
      reversedTransfers,
      ledgerDebits,
      reversedAmountCents,
    };
  }

  private async loadSnapshot(paymentIntentId: string): Promise<ReversalSnapshot | null> {
    const payment = await this.prisma.checkoutPayment.findFirst({
      where: { externalId: paymentIntentId },
      select: { id: true, webhookData: true },
    });
    if (!payment) {
      return null;
    }
    return buildSnapshot(payment.webhookData);
  }

  private async findSellerTransfer(snapshot: ReversalSnapshot): Promise<{ id: string } | null> {
    if (!snapshot.transferGroup || !snapshot.sellerStripeAccountId) {
      return null;
    }

    const listed = await this.stripeService.stripe.transfers.list({
      transfer_group: snapshot.transferGroup,
      limit: 100,
    });
    const match =
      listed.data.find(
        (transfer) =>
          transfer.destination === snapshot.sellerStripeAccountId &&
          BigInt(transfer.amount) === snapshot.sellerDestinationAmountCents,
      ) ??
      listed.data.find((transfer) => transfer.destination === snapshot.sellerStripeAccountId) ??
      null;

    if (!match && snapshot.sellerDestinationAmountCents > 0n) {
      throw new Error(
        `Seller transfer not found for transferGroup=${snapshot.transferGroup} seller=${snapshot.sellerStripeAccountId} amount=${snapshot.sellerDestinationAmountCents.toString()}`,
      );
    }

    return match ? { id: match.id } : null;
  }
}
