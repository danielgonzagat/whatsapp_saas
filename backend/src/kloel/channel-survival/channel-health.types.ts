export type HealthStatus = 'healthy' | 'degraded' | 'at_risk' | 'critical';

export interface ChannelHealthEvent {
  readonly workspaceId: string;
  readonly channel: string;
  readonly eventName: string;
  readonly occurredAt: string;
  readonly success: boolean;
}

export interface ChannelHealth {
  readonly totalSent: number;
  readonly deliveryRate: number;
  readonly errorRate: number;
  readonly banRiskScore: number;
  readonly policyViolationCount: number;
  readonly recentFailureBurst: boolean;
  readonly healthStatus: HealthStatus;
}

export const POLICY_VIOLATION_EVENTS: ReadonlySet<string> = new Set([
  'commerce.whatsapp.session_lifecycle',
]);

export const RECENT_WINDOW_SIZE = 10;
export const FAILURE_BURST_THRESHOLD = 0.5;
export const CONCENTRATION_THRESHOLD = 0.7;
export const HEALTHY_THRESHOLD = 0.95;
export const DEGRADED_THRESHOLD = 0.85;
export const AT_RISK_THRESHOLD = 0.7;
export const MAX_BAN_RISK = 1;
export const ERROR_RATE_WEIGHT = 0.4;
export const POLICY_VIOLATION_WEIGHT = 0.3;
export const FAILURE_BURST_WEIGHT = 0.2;
export const CONCENTRATION_WEIGHT = 0.2;
export const POLICY_VIOLATION_CAP = 5;
