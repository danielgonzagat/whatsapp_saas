import { Injectable, Logger } from '@nestjs/common';

import { StripeService } from '../../billing/stripe.service';
import { PrismaService } from '../../prisma/prisma.service';
import { forEachSequential } from '../../common/async-sequence';
import { LedgerService } from '../ledger/ledger.service';
import type { SplitRole } from '../split/split.types';

import { ConnectService } from './connect.service';

interface PersistedManualTransfer {
  role: SplitRole;
  accountId: string;
  amountCents: string;
  stripeTransferId: string;
}

interface ReversalSnapshot {
  buyerPaidCents: bigint;
  transferGroup: string | null;
  sellerStripeAccountId: string | null;
  sellerDestinationAmountCents: bigint;
  manualTransfers: PersistedManualTransfer[];
}

export interface ProcessRefundReversalInput {
  paymentIntentId: string;
  refundId: string;
  amountCents: bigint;
}

export interface ProcessDisputeReversalInput {
  paymentIntentId: string;
  disputeId: string;
  amountCents: bigint;
}

export interface ProcessReversalResult {
  paymentIntentId: string;
  triggerId: string;
  reversedTransfers: number;
  ledgerDebits: number;
  reversedAmountCents: bigint;
}

type PlannedReversal = {
  role: SplitRole;
  accountId: string;
  amountCents: bigint;
  stripeTransferId: string;
};

const ROLE_PRIORITY: Record<SplitRole, number> = {
  supplier: 1,
  affiliate: 2,
  coproducer: 3,
  manager: 4,
  seller: 5,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseBigIntString(value: unknown): bigint {
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return BigInt(value);
  }
  return 0n;
}

function parseManualTransfers(value: unknown): PersistedManualTransfer[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is PersistedManualTransfer => {
    const row = asRecord(item);
    return (
      row !== null &&
      typeof row.role === 'string' &&
      typeof row.accountId === 'string' &&
      typeof row.amountCents === 'string' &&
      typeof row.stripeTransferId === 'string'
    );
  });
}

function buildSnapshot(webhookData: unknown): ReversalSnapshot | null {
  const root = asRecord(webhookData);
  if (!root) {
    return null;
  }

  const splitInput = asRecord(root.splitInput);
  const connectPostSale = asRecord(root.connectPostSale);
  if (!splitInput || !connectPostSale) {
    return null;
  }

  return {
    buyerPaidCents: parseBigIntString(splitInput.buyerPaidCents),
    transferGroup: asString(connectPostSale.transferGroup),
    sellerStripeAccountId: asString(connectPostSale.sellerStripeAccountId),
    sellerDestinationAmountCents: parseBigIntString(connectPostSale.sellerDestinationAmountCents),
    manualTransfers: parseManualTransfers(connectPostSale.transfers),
  };
}

function planProportionalReversals(
  lines: Array<{
    role: SplitRole;
    accountId: string;
    amountCents: bigint;
    stripeTransferId: string;
  }>,
  requestedAmountCents: bigint,
  buyerPaidCents: bigint,
): PlannedReversal[] {
  if (requestedAmountCents <= 0n || buyerPaidCents <= 0n || lines.length === 0) {
    return [];
  }

  const totalEligible = lines.reduce((sum, line) => sum + line.amountCents, 0n);
  const totalTarget = (totalEligible * requestedAmountCents) / buyerPaidCents;
  const withFractions = lines.map((line) => {
    const numerator = line.amountCents * requestedAmountCents;
    return {
      ...line,
      floorAmount: numerator / buyerPaidCents,
      remainder: numerator % buyerPaidCents,
    };
  });
  const sumFloors = withFractions.reduce((sum, line) => sum + line.floorAmount, 0n);
  let remainderToDistribute = totalTarget - sumFloors;

  const sorted = [...withFractions].sort((a, b) => {
    if (a.remainder === b.remainder) {
      if (ROLE_PRIORITY[a.role] === ROLE_PRIORITY[b.role]) {
        return a.stripeTransferId.localeCompare(b.stripeTransferId);
      }
      return ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role];
    }
    return a.remainder > b.remainder ? -1 : 1;
  });

  const bonus = new Map<string, bigint>();
  for (const line of sorted) {
    if (remainderToDistribute <= 0n) {
      break;
    }
    if (line.floorAmount >= line.amountCents) {
      continue;
    }
    bonus.set(line.stripeTransferId, (bonus.get(line.stripeTransferId) ?? 0n) + 1n);
    remainderToDistribute -= 1n;
  }

  return withFractions
    .map((line) => ({
      role: line.role,
      accountId: line.accountId,
      stripeTransferId: line.stripeTransferId,
      amountCents: line.floorAmount + (bonus.get(line.stripeTransferId) ?? 0n),
    }))
    .filter((line) => line.amountCents > 0n);
}

@Injectable()
export class ConnectReversalService {
  private readonly logger = new Logger(ConnectReversalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly connectService: ConnectService,
    private readonly ledgerService: LedgerService,
  ) {}

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
