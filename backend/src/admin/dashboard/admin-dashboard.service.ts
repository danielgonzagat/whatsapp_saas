import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { queryGmvInCents } from './queries/gmv.query';
import { queryRevenueKloelInCents } from './queries/revenue.query';
import { queryTransactionCounts, type TransactionCounts } from './queries/transactions.query';
import { queryProducers, type ProducerCounts } from './queries/producers.query';
import {
  queryGatewayBreakdown,
  queryMethodBreakdown,
  type GatewayBreakdownRow,
  type MethodBreakdownRow,
} from './queries/breakdowns.query';
import {
  queryGmvDailySeries,
  queryRevenueKloelDailySeries,
  type GmvDailyPoint,
  type RevenueDailyPoint,
} from './queries/series.query';
import {
  resolveAdminHomeRange,
  type AdminHomeCompare,
  type AdminHomePeriod,
  type ResolvedAdminHomeRange,
} from './range.util';

export interface KpiMoneyValue {
  value: number;
  previous: number | null;
  deltaPct: number | null;
}

export interface KpiNumberValue {
  value: number;
  previous: number | null;
  deltaPct: number | null;
}

export interface KpiRateValue {
  value: number | null;
  previous: number | null;
  deltaPct: number | null;
}

export interface KpiUnavailable {
  value: null;
  unavailableReason: string;
}

export interface HomeResponse {
  range: {
    from: string;
    to: string;
    label: string;
    period: AdminHomePeriod;
    compare: AdminHomeCompare;
  };
  compare: { from: string; to: string } | null;
  kpis: {
    gmv: KpiMoneyValue;
    approvedCount: KpiNumberValue;
    declinedCount: KpiNumberValue;
    pendingCount: KpiNumberValue;
    approvalRate: KpiRateValue;
    refundCount: KpiNumberValue;
    refundAmount: KpiMoneyValue;
    chargebackCount: KpiNumberValue;
    chargebackAmount: KpiMoneyValue;
    averageTicket: KpiMoneyValue;
    activeProducers: { value: number; windowDays: 30 };
    newProducers: KpiNumberValue;
    totalProducers: { value: number };
    revenueKloel: KpiMoneyValue;
    revenueKloelRate: KpiRateValue;
    mrrProjected: KpiUnavailable;
    churnRate: KpiUnavailable;
  };
  breakdowns: {
    byGateway: GatewayBreakdownRow[];
    byMethod: MethodBreakdownRow[];
  };
  series: {
    gmvDaily: GmvDailyPoint[];
    previousGmvDaily: GmvDailyPoint[];
    revenueKloelDaily: RevenueDailyPoint[];
    previousRevenueKloelDaily: RevenueDailyPoint[];
  };
}

interface Snapshot {
  gmvInCents: number;
  revenueKloelInCents: number;
  approvedCount: number;
  tx: TransactionCounts;
  producers: ProducerCounts;
}

function deltaPct(curr: number, prev: number | null): number | null {
  if (prev === null) return null;
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / prev) * 100;
}

function makeMoneyKpi(curr: number, prev: number | null): KpiMoneyValue {
  return { value: curr, previous: prev, deltaPct: deltaPct(curr, prev) };
}

function makeNumberKpi(curr: number, prev: number | null): KpiNumberValue {
  return { value: curr, previous: prev, deltaPct: deltaPct(curr, prev) };
}

function computeApprovalRate(approved: number, declined: number): number | null {
  const denom = approved + declined;
  if (denom === 0) return null;
  return approved / denom;
}

function computeAverageTicket(gmvInCents: number, approvedCount: number): number {
  if (approvedCount === 0) return 0;
  return Math.round(gmvInCents / approvedCount);
}

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getHome(
    period: AdminHomePeriod,
    compare: AdminHomeCompare,
    from?: Date,
    to?: Date,
  ): Promise<HomeResponse> {
    const range = resolveAdminHomeRange({ period, compare, from, to });
    const current = await this.snapshot(range.from, range.to);
    const previousSnap = range.previous
      ? await this.snapshot(range.previous.from, range.previous.to)
      : null;

    const [byGateway, byMethod, gmvDaily, previousGmvDaily, revenueKloelDaily, previousRevenueKloelDaily] =
      await Promise.all([
      queryGatewayBreakdown(this.prisma, range.from, range.to),
      queryMethodBreakdown(this.prisma, range.from, range.to),
      queryGmvDailySeries(this.prisma, range.from, range.to),
      range.previous
        ? queryGmvDailySeries(this.prisma, range.previous.from, range.previous.to)
        : Promise.resolve([]),
      queryRevenueKloelDailySeries(this.prisma, range.from, range.to),
      range.previous
        ? queryRevenueKloelDailySeries(this.prisma, range.previous.from, range.previous.to)
        : Promise.resolve([]),
    ]);

    return this.shape(
      range,
      current,
      previousSnap,
      byGateway,
      byMethod,
      gmvDaily,
      previousGmvDaily,
      revenueKloelDaily,
      previousRevenueKloelDaily,
    );
  }

  private async snapshot(from: Date, to: Date): Promise<Snapshot> {
    const [{ gmvInCents, approvedCount }, revenueKloelInCents, tx, producers] = await Promise.all([
      queryGmvInCents(this.prisma, from, to),
      queryRevenueKloelInCents(this.prisma, from, to),
      queryTransactionCounts(this.prisma, from, to),
      queryProducers(this.prisma, from, to),
    ]);
    return { gmvInCents, revenueKloelInCents, approvedCount, tx, producers };
  }

  private shape(
    range: ResolvedAdminHomeRange,
    current: Snapshot,
    previous: Snapshot | null,
    byGateway: GatewayBreakdownRow[],
    byMethod: MethodBreakdownRow[],
    gmvDaily: GmvDailyPoint[],
    previousGmvDaily: GmvDailyPoint[],
    revenueKloelDaily: RevenueDailyPoint[],
    previousRevenueKloelDaily: RevenueDailyPoint[],
  ): HomeResponse {
    const prevApprovalRate = previous
      ? computeApprovalRate(previous.tx.approved, previous.tx.declined)
      : null;
    const currApprovalRate = computeApprovalRate(current.tx.approved, current.tx.declined);
    const prevAvgTicket = previous
      ? computeAverageTicket(previous.gmvInCents, previous.tx.approved)
      : null;
    const currAvgTicket = computeAverageTicket(current.gmvInCents, current.tx.approved);
    const prevRevenueRate =
      previous && previous.gmvInCents > 0
        ? previous.revenueKloelInCents / previous.gmvInCents
        : null;
    const currRevenueRate =
      current.gmvInCents > 0 ? current.revenueKloelInCents / current.gmvInCents : null;

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        label: range.label,
        period: range.period,
        compare: range.compare,
      },
      compare: range.previous
        ? {
            from: range.previous.from.toISOString(),
            to: range.previous.to.toISOString(),
          }
        : null,
      kpis: {
        gmv: makeMoneyKpi(current.gmvInCents, previous?.gmvInCents ?? null),
        approvedCount: makeNumberKpi(current.tx.approved, previous?.tx.approved ?? null),
        declinedCount: makeNumberKpi(current.tx.declined, previous?.tx.declined ?? null),
        pendingCount: makeNumberKpi(current.tx.pending, previous?.tx.pending ?? null),
        approvalRate: {
          value: currApprovalRate,
          previous: prevApprovalRate,
          deltaPct:
            currApprovalRate === null || prevApprovalRate === null
              ? null
              : deltaPct(currApprovalRate, prevApprovalRate),
        },
        refundCount: makeNumberKpi(current.tx.refundCount, previous?.tx.refundCount ?? null),
        refundAmount: makeMoneyKpi(
          current.tx.refundAmountInCents,
          previous?.tx.refundAmountInCents ?? null,
        ),
        chargebackCount: makeNumberKpi(
          current.tx.chargebackCount,
          previous?.tx.chargebackCount ?? null,
        ),
        chargebackAmount: makeMoneyKpi(
          current.tx.chargebackAmountInCents,
          previous?.tx.chargebackAmountInCents ?? null,
        ),
        averageTicket: makeMoneyKpi(currAvgTicket, prevAvgTicket),
        activeProducers: {
          value: current.producers.activeLast30Days,
          windowDays: 30,
        },
        newProducers: makeNumberKpi(
          current.producers.newInRange,
          previous?.producers.newInRange ?? null,
        ),
        totalProducers: { value: current.producers.total },
        revenueKloel: makeMoneyKpi(
          current.revenueKloelInCents,
          previous?.revenueKloelInCents ?? null,
        ),
        revenueKloelRate: {
          value: currRevenueRate,
          previous: prevRevenueRate,
          deltaPct:
            currRevenueRate === null || prevRevenueRate === null
              ? null
              : deltaPct(currRevenueRate, prevRevenueRate),
        },
        mrrProjected: {
          value: null,
          unavailableReason: 'subscription_aggregation_not_ready',
        },
        churnRate: { value: null, unavailableReason: 'cohort_definition_pending' },
      },
      breakdowns: { byGateway, byMethod },
      series: {
        gmvDaily,
        previousGmvDaily,
        revenueKloelDaily,
        previousRevenueKloelDaily,
      },
    };
  }
}
