export interface TrackedCashEvent {
  readonly workspaceId: string;
  readonly eventName: string;
  readonly occurredAt: string;
  readonly amountCents: bigint;
}

export interface CashPositionSummary {
  readonly inflow: bigint;
  readonly outflow: bigint;
  readonly net: bigint;
  readonly eventCount: number;
  readonly windowStart: string;
  readonly windowEnd: string;
}

export interface RunwayResult {
  readonly runwayDays: number;
  readonly netPositionCents: bigint;
  readonly burnRateDailyCents: number;
}
