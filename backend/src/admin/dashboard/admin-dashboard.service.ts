import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    mrrProjected: KpiMoneyValue;
    churnRate: KpiRateValue;
    conversations: KpiNumberValue;
    responseTimeMinutes: KpiNumberValue;
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
  mrrProjectedInCents: number;
  churnRate: number | null;
  conversationCount: number;
  responseTimeMinutes: number | null;
}

function deltaPctFromZeroBaseline(curr: number): number | null {
  return curr === 0 ? 0 : null;
}

function deltaPct(curr: number, prev: number | null): number | null {
  if (prev === null) return null;
  if (prev === 0) return deltaPctFromZeroBaseline(curr);
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

function normalizeRecurringAmountToMonthlyCents(amount: number, interval: string): number {
  const cents = Math.round(amount * 100);
  const normalized = interval.toUpperCase();
  if (normalized === 'YEARLY' || normalized === 'ANNUAL') return Math.round(cents / 12);
  if (normalized === 'WEEKLY') return Math.round(cents * 4.345);
  if (normalized === 'DAILY') return Math.round(cents * 30.4375);
  if (normalized === 'QUARTERLY') return Math.round(cents / 3);
  if (normalized === 'SEMIANNUAL') return Math.round(cents / 6);
  return cents;
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

    const [
      byGateway,
      byMethod,
      gmvDaily,
      previousGmvDaily,
      revenueKloelDaily,
      previousRevenueKloelDaily,
    ] = await Promise.all([
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
    const [
      { gmvInCents, approvedCount },
      revenueKloelInCents,
      tx,
      producers,
      recurring,
      messaging,
    ] = await Promise.all([
      queryGmvInCents(this.prisma, from, to),
      queryRevenueKloelInCents(this.prisma, from, to),
      queryTransactionCounts(this.prisma, from, to),
      queryProducers(this.prisma, from, to),
      this.queryRecurringMetrics(from, to),
      this.queryMessagingMetrics(from, to),
    ]);
    return {
      gmvInCents,
      revenueKloelInCents,
      approvedCount,
      tx,
      producers,
      mrrProjectedInCents: recurring.mrrProjectedInCents,
      churnRate: recurring.churnRate,
      conversationCount: messaging.conversationCount,
      responseTimeMinutes: messaging.responseTimeMinutes,
    };
  }

  private async queryRecurringMetrics(
    from: Date,
    to: Date,
  ): Promise<{ mrrProjectedInCents: number; churnRate: number | null }> {
    const subscriptions = await this.prisma.customerSubscription.findMany({
      where: { startedAt: { lte: to } },
      select: {
        amount: true,
        interval: true,
        status: true,
        startedAt: true,
        cancelledAt: true,
      },
    });

    const activeSubscriptions = subscriptions.filter((row) => {
      const status = row.status.toUpperCase();
      const activeStatus = status === 'ACTIVE' || status === 'TRIALING';
      const notCanceledYet = !row.cancelledAt || row.cancelledAt > to;
      return activeStatus && row.startedAt <= to && notCanceledYet;
    });

    const baseAtStart = subscriptions.filter((row) => {
      return row.startedAt < from && (!row.cancelledAt || row.cancelledAt > from);
    }).length;

    const canceledInRange = subscriptions.filter((row) => {
      return row.cancelledAt && row.cancelledAt >= from && row.cancelledAt <= to;
    }).length;

    return {
      mrrProjectedInCents: activeSubscriptions.reduce(
        (sum, row) => sum + normalizeRecurringAmountToMonthlyCents(row.amount, row.interval),
        0,
      ),
      churnRate: baseAtStart > 0 ? canceledInRange / baseAtStart : null,
    };
  }

  private async queryMessagingMetrics(
    from: Date,
    to: Date,
  ): Promise<{ conversationCount: number; responseTimeMinutes: number | null }> {
    const [conversationCount, responseRows] = await Promise.all([
      this.prisma.conversation.count({
        where: {
          lastMessageAt: { gte: from, lte: to },
        },
      }),
      this.prisma.$queryRaw<Array<{ avg_minutes: number | string | null }>>(Prisma.sql`
        WITH inbound AS (
          SELECT "conversationId", MIN("createdAt") AS "firstInbound"
          FROM "Message"
          WHERE "conversationId" IS NOT NULL
            AND "direction" = 'INBOUND'
            AND "createdAt" >= ${from}
            AND "createdAt" <= ${to}
          GROUP BY "conversationId"
        ),
        outbound AS (
          SELECT m."conversationId", MIN(m."createdAt") AS "firstOutbound"
          FROM "Message" m
          INNER JOIN inbound i ON i."conversationId" = m."conversationId"
          WHERE m."direction" = 'OUTBOUND'
            AND m."createdAt" >= i."firstInbound"
          GROUP BY m."conversationId"
        )
        SELECT AVG(EXTRACT(EPOCH FROM (o."firstOutbound" - i."firstInbound")) / 60.0) AS avg_minutes
        FROM inbound i
        INNER JOIN outbound o ON o."conversationId" = i."conversationId"
      `),
    ]);

    const rawAverage = responseRows[0]?.avg_minutes;
    return {
      conversationCount,
      responseTimeMinutes:
        rawAverage === null || rawAverage === undefined ? null : Math.round(Number(rawAverage)),
    };
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
        mrrProjected: makeMoneyKpi(
          current.mrrProjectedInCents,
          previous?.mrrProjectedInCents ?? null,
        ),
        churnRate: {
          value: current.churnRate,
          previous: previous?.churnRate ?? null,
          deltaPct:
            current.churnRate === null || previous?.churnRate === null
              ? null
              : deltaPct(current.churnRate, previous.churnRate),
        },
        conversations: makeNumberKpi(
          current.conversationCount,
          previous?.conversationCount ?? null,
        ),
        responseTimeMinutes: makeNumberKpi(
          current.responseTimeMinutes ?? 0,
          previous?.responseTimeMinutes ?? null,
        ),
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
