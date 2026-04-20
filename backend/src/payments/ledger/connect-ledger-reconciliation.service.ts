import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { FinancialAlertService } from '../../common/financial-alert.service';
import { PrismaService } from '../../prisma/prisma.service';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

type ConnectBalanceSnapshot = {
  pendingCents: bigint;
  availableCents: bigint;
  lifetimeReceivedCents: bigint;
  lifetimePaidOutCents: bigint;
  lifetimeChargebacksCents: bigint;
};

type ConnectLedgerEntryRow = {
  id: string;
  type: string;
  amountCents: bigint;
  metadata: unknown;
  balanceAfterPendingCents: bigint;
  balanceAfterAvailableCents: bigint;
};

export interface ConnectLedgerReconciliationDrift {
  accountBalanceId: string;
  workspaceId: string;
  stripeAccountId: string;
  accountType: string;
  kind: 'connect_balance_ledger_mismatch';
  details: {
    pending: { stored: string; ledger: string };
    available: { stored: string; ledger: string };
    lifetimeReceived: { stored: string; ledger: string };
    lifetimePaidOut: { stored: string; ledger: string };
    lifetimeChargebacks: { stored: string; ledger: string };
    entryCount: number;
  };
}

export interface ConnectLedgerReconciliationResult {
  scannedAccounts: number;
  drifts: ConnectLedgerReconciliationDrift[];
  scannedAt: string;
}

export interface ConnectLedgerReconciliationInput {
  workspaceId?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  return 0n;
}

@Injectable()
export class ConnectLedgerReconciliationService {
  private readonly logger = new Logger(ConnectLedgerReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialAlert?: FinancialAlertService,
  ) {}

  @Cron('0 */15 * * * *')
  async runCron(): Promise<void> {
    try {
      await this.reconcile();
    } catch (error) {
      this.logger.error(
        `connect_ledger_reconciliation_cron_failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.financialAlert?.reconciliationAlert('connect ledger reconciliation cron failed', {
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  async reconcile(
    input: ConnectLedgerReconciliationInput = {},
  ): Promise<ConnectLedgerReconciliationResult> {
    const balances = await this.prisma.connectAccountBalance.findMany({
      where: input.workspaceId ? { workspaceId: input.workspaceId } : undefined,
      orderBy: [{ workspaceId: 'asc' }, { accountType: 'asc' }, { createdAt: 'asc' }],
      take: 5000,
    });

    const drifts: ConnectLedgerReconciliationDrift[] = [];

    for (const balance of balances) {
      const entries = (await this.prisma.connectLedgerEntry.findMany({
        where: { accountBalanceId: balance.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          type: true,
          amountCents: true,
          metadata: true,
          balanceAfterPendingCents: true,
          balanceAfterAvailableCents: true,
        },
      })) as ConnectLedgerEntryRow[];

      const derived = this.replay(entries);
      const drift = this.buildDrift({
        balance: {
          id: balance.id,
          workspaceId: balance.workspaceId,
          stripeAccountId: balance.stripeAccountId,
          accountType: String(balance.accountType),
          pendingBalanceCents: balance.pendingBalanceCents,
          availableBalanceCents: balance.availableBalanceCents,
          lifetimeReceivedCents: balance.lifetimeReceivedCents,
          lifetimePaidOutCents: balance.lifetimePaidOutCents,
          lifetimeChargebacksCents: balance.lifetimeChargebacksCents,
        },
        derived,
        entryCount: entries.length,
      });
      if (drift) drifts.push(drift);
    }

    const result: ConnectLedgerReconciliationResult = {
      scannedAccounts: balances.length,
      drifts,
      scannedAt: new Date().toISOString(),
    };

    if (drifts.length > 0) {
      this.financialAlert?.reconciliationAlert('connect ledger reconciliation drift detected', {
        details: {
          scannedAccounts: result.scannedAccounts,
          driftCount: drifts.length,
        },
      });
      await this.appendAuditSummary({
        scannedAccounts: result.scannedAccounts,
        driftCount: drifts.length,
        sampleDrifts: drifts.slice(0, 25),
      });
      this.logger.warn(
        `connect_ledger_drift_detected: ${JSON.stringify({
          scannedAccounts: result.scannedAccounts,
          driftCount: drifts.length,
        })}`,
      );
    } else {
      this.logger.log(
        `connect_ledger_reconciliation_clean: ${JSON.stringify({
          scannedAccounts: result.scannedAccounts,
          workspaceId: input.workspaceId ?? null,
        })}`,
      );
    }

    return result;
  }

  private replay(entries: ConnectLedgerEntryRow[]): ConnectBalanceSnapshot {
    const snapshot: ConnectBalanceSnapshot = {
      pendingCents: 0n,
      availableCents: 0n,
      lifetimeReceivedCents: 0n,
      lifetimePaidOutCents: 0n,
      lifetimeChargebacksCents: 0n,
    };

    for (const entry of entries) {
      switch (entry.type) {
        case 'CREDIT_PENDING':
          snapshot.pendingCents += entry.amountCents;
          snapshot.lifetimeReceivedCents += entry.amountCents;
          break;
        case 'MATURE':
          snapshot.pendingCents -= entry.amountCents;
          snapshot.availableCents += entry.amountCents;
          break;
        case 'DEBIT_PAYOUT':
          snapshot.availableCents -= entry.amountCents;
          snapshot.lifetimePaidOutCents += entry.amountCents;
          break;
        case 'DEBIT_CHARGEBACK': {
          const metadata = asRecord(entry.metadata);
          snapshot.pendingCents -= toBigInt(metadata?.absorbedFromPendingCents);
          snapshot.availableCents -= toBigInt(metadata?.absorbedFromAvailableCents);
          snapshot.lifetimeChargebacksCents += entry.amountCents;
          break;
        }
        case 'DEBIT_REFUND': {
          const metadata = asRecord(entry.metadata);
          snapshot.pendingCents -= toBigInt(metadata?.absorbedFromPendingCents);
          snapshot.availableCents -= toBigInt(metadata?.absorbedFromAvailableCents);
          break;
        }
        case 'ADJUSTMENT':
          snapshot.availableCents += entry.amountCents;
          snapshot.lifetimePaidOutCents =
            snapshot.lifetimePaidOutCents >= entry.amountCents
              ? snapshot.lifetimePaidOutCents - entry.amountCents
              : 0n;
          break;
        default:
          this.logger.warn(`connect_ledger_reconcile_unknown_entry_type id=${entry.id} type=${entry.type}`);
      }
    }

    return snapshot;
  }

  private buildDrift(input: {
    balance: {
      id: string;
      workspaceId: string;
      stripeAccountId: string;
      accountType: string;
      pendingBalanceCents: bigint;
      availableBalanceCents: bigint;
      lifetimeReceivedCents: bigint;
      lifetimePaidOutCents: bigint;
      lifetimeChargebacksCents: bigint;
    };
    derived: ConnectBalanceSnapshot;
    entryCount: number;
  }): ConnectLedgerReconciliationDrift | null {
    const { balance, derived } = input;

    const same =
      balance.pendingBalanceCents === derived.pendingCents &&
      balance.availableBalanceCents === derived.availableCents &&
      balance.lifetimeReceivedCents === derived.lifetimeReceivedCents &&
      balance.lifetimePaidOutCents === derived.lifetimePaidOutCents &&
      balance.lifetimeChargebacksCents === derived.lifetimeChargebacksCents;

    if (same) return null;

    return {
      accountBalanceId: balance.id,
      workspaceId: balance.workspaceId,
      stripeAccountId: balance.stripeAccountId,
      accountType: balance.accountType,
      kind: 'connect_balance_ledger_mismatch',
      details: {
        pending: {
          stored: balance.pendingBalanceCents.toString(),
          ledger: derived.pendingCents.toString(),
        },
        available: {
          stored: balance.availableBalanceCents.toString(),
          ledger: derived.availableCents.toString(),
        },
        lifetimeReceived: {
          stored: balance.lifetimeReceivedCents.toString(),
          ledger: derived.lifetimeReceivedCents.toString(),
        },
        lifetimePaidOut: {
          stored: balance.lifetimePaidOutCents.toString(),
          ledger: derived.lifetimePaidOutCents.toString(),
        },
        lifetimeChargebacks: {
          stored: balance.lifetimeChargebacksCents.toString(),
          ledger: derived.lifetimeChargebacksCents.toString(),
        },
        entryCount: input.entryCount,
      },
    };
  }

  private async appendAuditSummary(details: {
    scannedAccounts: number;
    driftCount: number;
    sampleDrifts: ConnectLedgerReconciliationDrift[];
  }): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          action: 'system.connect.reconcile_drift',
          entityType: 'connect_account_balance',
          details: JSON.parse(JSON.stringify(details)) as JsonObject,
        },
      });
    } catch (error) {
      this.logger.warn(
        `connect_ledger_reconcile_audit_failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
