import { Injectable } from '@nestjs/common';
import {
  ChannelHealth,
  ChannelHealthEvent,
  HealthStatus,
  POLICY_VIOLATION_EVENTS,
  RECENT_WINDOW_SIZE,
  FAILURE_BURST_THRESHOLD,
  CONCENTRATION_THRESHOLD,
  HEALTHY_THRESHOLD,
  DEGRADED_THRESHOLD,
  AT_RISK_THRESHOLD,
  MAX_BAN_RISK,
  ERROR_RATE_WEIGHT,
  POLICY_VIOLATION_WEIGHT,
  FAILURE_BURST_WEIGHT,
  CONCENTRATION_WEIGHT,
  POLICY_VIOLATION_CAP,
} from './channel-health.types';

@Injectable()
export class ChannelHealthMonitorService {
  private events: ChannelHealthEvent[] = [];

  public recordEvent(
    workspaceId: string,
    channel: string,
    eventName: string,
    occurredAt: string,
    success: boolean,
  ): void {
    this.events.push({ workspaceId, channel, eventName, occurredAt, success });
  }

  public getChannelHealth(workspaceId: string, channel: string): ChannelHealth {
    const channelEvents = this.events.filter(
      (e) => e.workspaceId === workspaceId && e.channel === channel,
    );

    const totalSent = channelEvents.length;

    if (totalSent === 0) {
      return {
        totalSent: 0,
        deliveryRate: 1,
        errorRate: 0,
        banRiskScore: 0,
        policyViolationCount: 0,
        recentFailureBurst: false,
        healthStatus: 'healthy',
      };
    }

    const successCount = channelEvents.filter((e) => e.success).length;
    const failureCount = totalSent - successCount;
    const deliveryRate = this.round(successCount / totalSent);
    const errorRate = this.round(failureCount / totalSent);

    const policyViolationCount = channelEvents.filter(
      (e) => !e.success && POLICY_VIOLATION_EVENTS.has(e.eventName),
    ).length;

    const recentFailureBurst = this.detectFailureBurst(channelEvents);

    const banRiskScore = this.computeBanRiskScore(
      failureCount,
      totalSent,
      policyViolationCount,
      recentFailureBurst,
      workspaceId,
      totalSent,
    );

    const healthStatus = this.computeHealthStatus(deliveryRate);

    return {
      totalSent,
      deliveryRate,
      errorRate,
      banRiskScore,
      policyViolationCount,
      recentFailureBurst,
      healthStatus,
    };
  }

  private detectFailureBurst(channelEvents: ChannelHealthEvent[]): boolean {
    const sorted = [...channelEvents].sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
    const recent = sorted.slice(0, RECENT_WINDOW_SIZE);
    if (recent.length === 0) {
      return false;
    }
    const recentFailures = recent.filter((e) => !e.success).length;
    return recentFailures / recent.length > FAILURE_BURST_THRESHOLD;
  }

  private computeBanRiskScore(
    failureCount: number,
    totalSent: number,
    policyViolationCount: number,
    recentFailureBurst: boolean,
    workspaceId: string,
    channelTotal: number,
  ): number {
    let score = 0;

    score += Math.min(failureCount / (totalSent || 1), 1) * ERROR_RATE_WEIGHT;
    score += Math.min(policyViolationCount / POLICY_VIOLATION_CAP, 1) * POLICY_VIOLATION_WEIGHT;

    if (recentFailureBurst) {
      score += FAILURE_BURST_WEIGHT;
    }

    const allWorkspaceEvents = this.events.filter((e) => e.workspaceId === workspaceId);
    const workspaceTotal = allWorkspaceEvents.length;

    if (workspaceTotal > 0) {
      const concentrationRatio = channelTotal / workspaceTotal;
      if (concentrationRatio > CONCENTRATION_THRESHOLD) {
        score += CONCENTRATION_WEIGHT;
      }
    }

    return this.round(Math.min(score, MAX_BAN_RISK));
  }

  private computeHealthStatus(deliveryRate: number): HealthStatus {
    if (deliveryRate >= HEALTHY_THRESHOLD) {
      return 'healthy';
    }
    if (deliveryRate >= DEGRADED_THRESHOLD) {
      return 'degraded';
    }
    if (deliveryRate >= AT_RISK_THRESHOLD) {
      return 'at_risk';
    }
    return 'critical';
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
