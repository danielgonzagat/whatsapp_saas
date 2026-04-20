import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { ConnectAccountType } from '@prisma/client';

import type { StripePaymentIntent } from '../src/billing/stripe-types';
import { StripeService } from '../src/billing/stripe.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConnectService } from '../src/payments/connect/connect.service';
import { ConnectReversalService } from '../src/payments/connect/connect-reversal.service';
import { LedgerService } from '../src/payments/ledger/ledger.service';
import { StripeChargeService } from '../src/payments/stripe/stripe-charge.service';
import type { ConnectPostSaleSnapshot } from '../src/payments/stripe/stripe-webhook.processor';
import { StripeWebhookProcessor } from '../src/payments/stripe/stripe-webhook.processor';
import type { SplitRole } from '../src/payments/split/split.types';

type CreatedAccount = {
  role: SplitRole | 'seller';
  accountType: ConnectAccountType;
  balanceId: string;
  stripeAccountId: string;
};

type SnapshotWebhookData = {
  splitInput: {
    buyerPaidCents: string;
  };
  connectPostSale: {
    transferGroup: string;
    sellerStripeAccountId: string;
    sellerDestinationAmountCents: string;
    transfers: Array<{
      role: SplitRole;
      accountId: string;
      amountCents: string;
      stripeTransferId: string;
    }>;
  };
};

type AccountStatusSummary = {
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
  requirementsDisabledReason: string | null;
  capabilities: Record<string, string>;
};

type LiveProofTrigger = 'refund' | 'dispute';

const BUYER_PAID_CENTS = 13_990n;
const SALE_VALUE_CENTS = 10_000n;
const INTEREST_CENTS = 3_990n;
const PLATFORM_FEE_CENTS = 990n;

const DISPLAY_NAMES: Record<CreatedAccount['role'], string> = {
  seller: 'Live Proof Seller',
  supplier: 'Live Proof Supplier',
  affiliate: 'Live Proof Affiliate',
  coproducer: 'Live Proof Coproducer',
  manager: 'Live Proof Manager',
};

const ACCOUNT_TYPES: Array<{ role: CreatedAccount['role']; accountType: ConnectAccountType }> = [
  { role: 'seller', accountType: 'SELLER' },
  { role: 'supplier', accountType: 'SUPPLIER' },
  { role: 'affiliate', accountType: 'AFFILIATE' },
  { role: 'coproducer', accountType: 'COPRODUCER' },
  { role: 'manager', accountType: 'MANAGER' },
];

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

function assert<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}

function resolveRefundAmountCents(): bigint {
  const raw = process.env.LIVE_PROOF_REFUND_CENTS?.trim();
  if (!raw) {
    return BUYER_PAID_CENTS;
  }
  if (!/^\d+$/.test(raw)) {
    throw new Error(`LIVE_PROOF_REFUND_CENTS must be an integer cent value, got ${raw}`);
  }
  const parsed = BigInt(raw);
  if (parsed <= 0n || parsed > BUYER_PAID_CENTS) {
    throw new Error(
      `LIVE_PROOF_REFUND_CENTS must be between 1 and ${BUYER_PAID_CENTS.toString()}, got ${parsed.toString()}`,
    );
  }
  return parsed;
}

function resolveTrigger(): LiveProofTrigger {
  const raw = process.env.LIVE_PROOF_TRIGGER?.trim().toLowerCase();
  if (!raw) {
    return 'refund';
  }
  if (raw === 'refund' || raw === 'dispute') {
    return raw;
  }
  throw new Error(`LIVE_PROOF_TRIGGER must be "refund" or "dispute", got ${raw}`);
}

function resolvePaymentMethod(trigger: LiveProofTrigger): string {
  const raw = process.env.LIVE_PROOF_PAYMENT_METHOD?.trim();
  if (raw) {
    return raw;
  }
  return trigger === 'dispute' ? 'pm_card_createDispute' : 'pm_card_visa';
}

function matureAtForRole(role: SplitRole): Date {
  const dayOffsets: Record<SplitRole, number> = {
    supplier: 14,
    affiliate: 7,
    coproducer: 21,
    manager: 21,
    seller: 30,
  };
  return new Date(Date.now() + dayOffsets[role] * 24 * 60 * 60 * 1000);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSnapshotWebhookData(
  connectPostSale: ConnectPostSaleSnapshot,
): SnapshotWebhookData {
  return {
    splitInput: {
      buyerPaidCents: BUYER_PAID_CENTS.toString(),
    },
    connectPostSale: {
      transferGroup: connectPostSale.transferGroup,
      sellerStripeAccountId: connectPostSale.sellerStripeAccountId,
      sellerDestinationAmountCents: connectPostSale.sellerDestinationAmountCents.toString(),
      transfers: connectPostSale.transfers.map((transfer) => ({
        role: transfer.role,
        accountId: transfer.accountId,
        amountCents: transfer.amountCents.toString(),
        stripeTransferId: transfer.stripeTransferId,
      })),
    },
  };
}

async function fetchBalanceSummaries(prisma: PrismaService, workspaceId: string) {
  return prisma.connectAccountBalance.findMany({
    where: { workspaceId },
    orderBy: [{ accountType: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      stripeAccountId: true,
      accountType: true,
      pendingBalanceCents: true,
      availableBalanceCents: true,
      lifetimeReceivedCents: true,
      lifetimePaidOutCents: true,
      lifetimeChargebacksCents: true,
    },
  });
}

async function fetchLedgerEntries(prisma: PrismaService, balanceIds: string[]) {
  return prisma.connectLedgerEntry.findMany({
    where: { accountBalanceId: { in: balanceIds } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      accountBalanceId: true,
      type: true,
      amountCents: true,
      referenceType: true,
      referenceId: true,
      balanceAfterPendingCents: true,
      balanceAfterAvailableCents: true,
      metadata: true,
      createdAt: true,
    },
  });
}

async function waitForTransferCapability(
  connectService: ConnectService,
  stripeAccountId: string,
): Promise<AccountStatusSummary> {
  const timeoutAt = Date.now() + 120_000;
  let lastStatus = await connectService.getOnboardingStatus(stripeAccountId);

  while (Date.now() < timeoutAt) {
    const transferCapability = lastStatus.capabilities.transfers;
    if (lastStatus.detailsSubmitted && transferCapability === 'active') {
      return lastStatus;
    }
    await sleep(1_500);
    lastStatus = await connectService.getOnboardingStatus(stripeAccountId);
  }

  throw new Error(
    `Stripe transfers capability did not leave inactive state for ${stripeAccountId}: ${JSON.stringify(lastStatus)}`,
  );
}

async function waitForDispute(
  stripeService: StripeService,
  chargeId: string,
): Promise<{ id: string; amount: number; status: string | null }> {
  const timeoutAt = Date.now() + 60_000;

  while (Date.now() < timeoutAt) {
    const disputes = await stripeService.stripe.disputes.list({
      charge: chargeId,
      limit: 1,
    });
    const dispute = disputes.data[0];
    if (dispute) {
      return {
        id: dispute.id,
        amount: dispute.amount,
        status: dispute.status ?? null,
      };
    }
    await sleep(2_000);
  }

  throw new Error(`Stripe dispute was not created for charge ${chargeId} within the timeout`);
}

async function primeAccountForChargeAndTransfer(
  stripeService: StripeService,
  stripeAccountId: string,
  email: string,
) {
  const bankToken = await stripeService.stripe.tokens.create({
    bank_account: {
      country: 'BR',
      currency: 'brl',
      account_holder_name: 'Jenny Rosen',
      account_holder_type: 'individual',
      account_number: '0001234',
      routing_number: '110-0000',
    },
  });

  await stripeService.stripe.accounts.update(stripeAccountId, {
    business_type: 'individual',
    business_profile: {
      mcc: '5995',
      product_description: 'Digital products sold via Kloel marketplace',
      url: 'https://accessible.stripe.com',
    },
    individual: {
      first_name: 'Jenny',
      last_name: 'Rosen',
      email,
      phone: '0000000000',
      dob: { day: 1, month: 1, year: 1902 },
      address: {
        line1: 'address_full_match',
        city: 'Sao Paulo',
        state: 'SP',
        postal_code: '01310100',
        country: 'BR',
      },
      id_number: '222222222',
      political_exposure: 'none',
      verification: {
        document: {
          front: 'file_identity_document_success',
        },
      },
    },
    tos_acceptance: {
      date: Math.floor(Date.now() / 1000),
      ip: '127.0.0.1',
    },
    external_account: bankToken.id,
  });
}

async function createAccounts(
  stripeService: StripeService,
  connectService: ConnectService,
  workspaceId: string,
  runId: string,
): Promise<{
  created: CreatedAccount[];
  statuses: Record<string, AccountStatusSummary>;
}> {
  const created: CreatedAccount[] = [];
  const statuses: Record<string, AccountStatusSummary> = {};

  for (const { role, accountType } of ACCOUNT_TYPES) {
    const email = `live-proof+${runId}+${role}@kloel.test`;
    const account = await connectService.createCustomAccount({
      workspaceId,
      accountType,
      country: 'BR',
      email,
      displayName: DISPLAY_NAMES[role],
    });
    created.push({
      role,
      accountType,
      balanceId: account.accountBalanceId,
      stripeAccountId: account.stripeAccountId,
    });
    await primeAccountForChargeAndTransfer(stripeService, account.stripeAccountId, email);
    statuses[role] = await waitForTransferCapability(connectService, account.stripeAccountId);
  }

  return { created, statuses };
}

async function main() {
  const runId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const workspaceId = `live-proof-${runId}`;
  const trigger = resolveTrigger();
  const paymentMethod = resolvePaymentMethod(trigger);
  const refundAmountCents = resolveRefundAmountCents();
  const config = new ConfigService(process.env as Record<string, string>);
  const prisma = new PrismaService();
  const stripeService = new StripeService(config);
  const connectService = new ConnectService(stripeService, prisma);
  const ledgerService = new LedgerService(prisma);
  const chargeService = new StripeChargeService(stripeService);
  const webhookProcessor = new StripeWebhookProcessor(
    stripeService,
    connectService,
    ledgerService,
  );

  const createdAccountIds: string[] = [];

  await prisma.$connect();

  try {
    const { created, statuses } = await createAccounts(
      stripeService,
      connectService,
      workspaceId,
      runId,
    );
    createdAccountIds.push(...created.map((item) => item.balanceId));

    const seller = assert(
      created.find((item) => item.role === 'seller'),
      'seller account was not created',
    );
    const supplier = assert(
      created.find((item) => item.role === 'supplier'),
      'supplier account was not created',
    );
    const affiliate = assert(
      created.find((item) => item.role === 'affiliate'),
      'affiliate account was not created',
    );
    const coproducer = assert(
      created.find((item) => item.role === 'coproducer'),
      'coproducer account was not created',
    );
    const manager = assert(
      created.find((item) => item.role === 'manager'),
      'manager account was not created',
    );

    const charge = await chargeService.createSaleCharge({
      workspaceId,
      sellerStripeAccountId: seller.stripeAccountId,
      buyerPaidCents: BUYER_PAID_CENTS,
      saleValueCents: SALE_VALUE_CENTS,
      interestCents: INTEREST_CENTS,
      platformFeeCents: PLATFORM_FEE_CENTS,
      currency: 'BRL',
      idempotencyKey: `sale-${runId}`,
      buyerEmail: `buyer+${runId}@kloel.test`,
      splitConfig: {
        supplier: {
          accountId: supplier.stripeAccountId,
          amountCents: 4_210n,
        },
        affiliate: {
          accountId: affiliate.stripeAccountId,
          percentBp: 4_000,
        },
        coproducer: {
          accountId: coproducer.stripeAccountId,
          percentBp: 400,
        },
        manager: {
          accountId: manager.stripeAccountId,
          percentBp: 200,
        },
      },
      paymentMethodTypes: ['card'],
    });

    await stripeService.stripe.paymentIntents.confirm(charge.paymentIntentId, {
      payment_method: paymentMethod,
    });

    const confirmedIntent = (await stripeService.stripe.paymentIntents.retrieve(
      charge.paymentIntentId,
      {
        expand: ['latest_charge'],
      },
    )) as StripePaymentIntent;

    const saleProcessed = await webhookProcessor.processSaleSucceeded(
      confirmedIntent,
      matureAtForRole,
    );
    const connectPostSale = assert(
      saleProcessed.connectPostSale,
      'payment_intent succeeded but connectPostSale snapshot was not produced',
    );

    const balancesAfterSale = await fetchBalanceSummaries(prisma, workspaceId);
    const ledgerAfterSale = await fetchLedgerEntries(prisma, createdAccountIds);

    const reversalService = new ConnectReversalService(
      {
        checkoutPayment: {
          findFirst: async () => ({
            id: `cp_live_${runId}`,
            webhookData: buildSnapshotWebhookData(connectPostSale),
          }),
        },
      } as unknown as PrismaService,
      stripeService,
      connectService,
      ledgerService,
    );

    let refund:
      | {
          id: string;
          amount: number;
          status: string | null;
        }
      | undefined;
    let refundProcessed:
      | {
          paymentIntentId: string;
          triggerId: string;
          reversedTransfers: number;
          ledgerDebits: number;
          reversedAmountCents: bigint;
        }
      | undefined;
    let dispute:
      | {
          id: string;
          amount: number;
          status: string | null;
        }
      | undefined;
    let disputeProcessed:
      | {
          paymentIntentId: string;
          triggerId: string;
          reversedTransfers: number;
          ledgerDebits: number;
          reversedAmountCents: bigint;
        }
      | undefined;

    if (trigger === 'refund') {
      const createdRefund = await stripeService.stripe.refunds.create({
        payment_intent: charge.paymentIntentId,
        amount: Number(refundAmountCents),
      });
      refund = {
        id: createdRefund.id,
        amount: createdRefund.amount,
        status: createdRefund.status ?? null,
      };
      refundProcessed = await reversalService.processRefund({
        paymentIntentId: charge.paymentIntentId,
        refundId: createdRefund.id,
        amountCents: BigInt(createdRefund.amount),
      });
    } else {
      dispute = await waitForDispute(
        stripeService,
        assert(
          typeof confirmedIntent.latest_charge === 'string'
            ? confirmedIntent.latest_charge
            : confirmedIntent.latest_charge?.id,
          'latest charge id missing for dispute proof',
        ),
      );
      disputeProcessed = await reversalService.processDispute({
        paymentIntentId: charge.paymentIntentId,
        disputeId: dispute.id,
        amountCents: BigInt(dispute.amount),
      });
    }

    const balancesAfterTrigger = await fetchBalanceSummaries(prisma, workspaceId);
    const ledgerAfterTrigger = await fetchLedgerEntries(prisma, createdAccountIds);
    const transfers = await stripeService.stripe.transfers.list({
      transfer_group: charge.transferGroup,
      limit: 100,
    });

  const proof = {
      runId,
      workspaceId,
      trigger,
      paymentMethod,
      requestedRefundAmountCents: refundAmountCents,
      createdAccounts: created,
      onboardingStatuses: statuses,
      charge: {
        paymentIntentId: charge.paymentIntentId,
        transferGroup: charge.transferGroup,
        split: charge.split,
        confirmedIntent: {
          id: confirmedIntent.id,
          status: confirmedIntent.status,
          latestChargeId:
            typeof confirmedIntent.latest_charge === 'string'
              ? confirmedIntent.latest_charge
              : confirmedIntent.latest_charge?.id ?? null,
        },
      },
      saleProcessed,
      ...(refund ? { refund } : {}),
      ...(refundProcessed ? { refundProcessed } : {}),
      ...(dispute ? { dispute } : {}),
      ...(disputeProcessed ? { disputeProcessed } : {}),
      transfers: transfers.data.map((transfer) => ({
        id: transfer.id,
        destination: transfer.destination,
        amount: transfer.amount,
        amountReversed: transfer.amount_reversed,
        reversed: transfer.reversed,
      })),
      balancesAfterSale,
      balancesAfterTrigger,
      ledgerAfterSale,
      ledgerAfterTrigger,
    };

    console.log(JSON.stringify(proof, jsonReplacer, 2));
  } finally {
    if (createdAccountIds.length > 0) {
      await prisma.connectLedgerEntry.deleteMany({
        where: { accountBalanceId: { in: createdAccountIds } },
      });
      await prisma.connectAccountBalance.deleteMany({
        where: { workspaceId },
      });
    }
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
