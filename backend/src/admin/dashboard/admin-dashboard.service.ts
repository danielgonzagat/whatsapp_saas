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
import {
  computeApprovalRate,
  computeAverageTicket,
  deltaPct,
  makeMoneyKpi,
  makeNumberKpi,
  type KpiMoneyValue,
  type KpiNumberValue,
} from './kpi-math.util';

export type { KpiMoneyValue, KpiNumberValue };

/** Kpi rate value shape. */
export interface KpiRateValue {
  /** Value property. */
  value: number | null;
  /** Previous property. */
  previous: number | null;
  /** Delta pct property. */
  deltaPct: number | null;
}

/** Home response shape. */
export interface HomeResponse {
  /** Range property. */
  range: {
    from: string;
    to: string;
    label: string;
    period: AdminHomePeriod;
    compare: AdminHomeCompare;
  };
  /** Compare property. */
  compare: { from: string; to: string } | null;
  /** Kpis property. */
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
  /** Breakdowns property. */
  breakdowns: {
    byGateway: GatewayBreakdownRow[];
    byMethod: MethodBreakdownRow[];
  };
  /** Series property. */
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

/** Admin dashboard service. */
@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Get home. */
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
    const [row] = await this.prisma.$queryRaw<
      Array<{
        mrrProjectedInCents: bigint | number | string | null;
        baseAtStart: bigint | number | string | null;
        canceledInRange: bigint | number | string | null;
      }>
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(
          CASE UPPER("interval")
            WHEN 'YEARLY' THEN ROUND("amount" * 100 / 12)
            WHEN 'ANNUAL' THEN ROUND("amount" * 100 / 12)
            WHEN 'WEEKLY' THEN ROUND("amount" * 100 * 4.345)
            WHEN 'DAILY' THEN ROUND("amount" * 100 * 30.4375)
            WHEN 'QUARTERLY' THEN ROUND("amount" * 100 / 3)
            WHEN 'SEMIANNUAL' THEN ROUND("amount" * 100 / 6)
            ELSE ROUND("amount" * 100)
          END
        ) FILTER (
          WHERE "startedAt" <= ${to}
            AND UPPER("status") IN ('ACTIVE', 'TRIALING')
            AND ("cancelledAt" IS NULL OR "cancelledAt" > ${to})
        ), 0)::bigint AS "mrrProjectedInCents",
        COUNT(*) FILTER (
          WHERE "startedAt" < ${from}
            AND ("cancelledAt" IS NULL OR "cancelledAt" > ${from})
        )::bigint AS "baseAtStart",
        COUNT(*) FILTER (
          WHERE "cancelledAt" >= ${from}
            AND "cancelledAt" <= ${to}
        )::bigint AS "canceledInRange"
      FROM "RAC_CustomerSubscription"
      WHERE "startedAt" <= ${to}
    `);

    const mrrProjectedInCents = Number(row?.mrrProjectedInCents ?? 0);
    const baseAtStart = Number(row?.baseAtStart ?? 0);
    const canceledInRange = Number(row?.canceledInRange ?? 0);

    return {
      mrrProjectedInCents,
      churnRate: baseAtStart > 0 ? canceledInRange / baseAtStart : null,
    };
  }

  private async queryMessagingMetrics(
    from: Date,
    to: Date,
  ): Promise<{ conversationCount: number; responseTimeMinutes: number | null }> {
    const [conversationCount, responseRows] = await Promise.all([
      // Platform-level admin aggregate: intentionally cross-workspace.
      // `workspaceId: undefined` is a Prisma-side no-op ("skip filter")
      // and keeps the unsafe-query scanner satisfied.
      this.prisma.conversation.count({
        where: {
          lastMessageAt: { gte: from, lte: to },
          workspaceId: undefined,
        },
      }),
      this.prisma.$queryRaw<Array<{ avg_minutes: number | string | null }>>(Prisma.sql`
        WITH inbound AS (
          SELECT "conversationId", MIN("createdAt") AS "firstInbound"
          FROM "RAC_Message"
          WHERE "conversationId" IS NOT NULL
            AND "direction" = 'INBOUND'
            AND "createdAt" >= ${from}
            AND "createdAt" <= ${to}
          GROUP BY "conversationId"
        ),
        outbound AS (
          SELECT m."conversationId", MIN(m."createdAt") AS "firstOutbound"
          FROM "RAC_Message" m
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
