import { Injectable } from '@nestjs/common';
import type { TrackedCashEvent, CashPositionSummary, RunwayResult } from './cash-position.types';

@Injectable()
export class CashPositionTrackerService {
  private readonly events = new Map<string, TrackedCashEvent[]>();

  public recordEvent(
    workspaceId: string,
    eventName: string,
    occurredAt: string,
    amountCents: bigint,
  ): void {
    const list = this.events.get(workspaceId) ?? [];
    list.push({ workspaceId, eventName, occurredAt, amountCents });
    this.events.set(workspaceId, list);
  }

  public getPosition(
    workspaceId: string,
    windowDays: number,
    asOf?: number,
  ): CashPositionSummary {
    const now = asOf ?? Date.now();
    const windowStartMs = now - windowDays * 24 * 60 * 60 * 1000;

    const list = this.events.get(workspaceId) ?? [];
    const windowEvents = list.filter((e) => {
      const ts = Date.parse(e.occurredAt);
      return Number.isFinite(ts) && ts >= windowStartMs && ts <= now;
    });

    let inflow = 0n;
    let outflow = 0n;

    for (const e of windowEvents) {
      if (e.eventName === 'commerce.payment.approved') {
        inflow += e.amountCents;
      } else if (e.eventName === 'commerce.payment.refunded') {
        outflow += e.amountCents;
      }
    }

    return {
      inflow,
      outflow,
      net: inflow - outflow,
      eventCount: windowEvents.length,
      windowStart: new Date(windowStartMs).toISOString(),
      windowEnd: new Date(now).toISOString(),
    };
  }

  public computeRunwayDays(
    workspaceId: string,
    monthlyBurnCents: bigint,
  ): RunwayResult {
    const list = this.events.get(workspaceId) ?? [];
    let net = 0n;

    for (const e of list) {
      if (e.eventName === 'commerce.payment.approved') {
        net += e.amountCents;
      } else if (e.eventName === 'commerce.payment.refunded') {
        net -= e.amountCents;
      }
    }

    const burnRateDaily = Number(monthlyBurnCents) / 30;

    let runwayDays: number;
    if (net <= 0n) {
      runwayDays = 0;
    } else if (burnRateDaily > 0) {
      runwayDays = Number(net) / burnRateDaily;
    } else {
      runwayDays = Number.POSITIVE_INFINITY;
    }

    return {
      runwayDays,
      netPositionCents: net,
      burnRateDailyCents: burnRateDaily,
    };
  }

  public clear(): void {
    this.events.clear();
  }
}
