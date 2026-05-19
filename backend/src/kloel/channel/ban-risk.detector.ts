import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type {
  BanRisk,
  BanRiskLevel,
  ChannelKind,
  DetectionInput,
} from './types';
import { clamp, filterByWorkspace } from './types';

const HIGH_COMPLAINT_THRESHOLD = 0.05;

const PROCESSOR_NAME = 'ban-risk-detector';
const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

@Injectable()
export class BanRiskDetector {
  private readonly logger = new Logger(BanRiskDetector.name);

  public constructor(private readonly spine: SpineEmitterService) {}

  public assess(input: DetectionInput, channel: ChannelKind): BanRisk {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);
    const channelEvents = wsEvents.filter((e) => this.isChannelEvent(e, channel));

    let riskProbability = 0;
    const contributingFactors: string[] = [];
    let policyViolationCount = 0;
    let complaintCount = 0;
    let unusualActivityDetected = false;

    for (const e of channelEvents) {
      if (e.eventName.includes('policy_violation') || e.eventName.includes('restriction')) {
        policyViolationCount++;
        riskProbability += 0.25;
        contributingFactors.push('policy_violation_recorded');
      }
      if (e.eventName.includes('complaint') || e.eventName.includes('report')) {
        complaintCount++;
        riskProbability += 0.15;
        contributingFactors.push('user_complaints');
      }
      if (e.eventName.includes('rate_limit') || e.eventName.includes('throttle')) {
        riskProbability += 0.1;
        contributingFactors.push('rate_limit_hit');
      }
    }

    const totalEvents = channelEvents.length;
    if (totalEvents > 0) {
      const complaintRate = complaintCount / totalEvents;
      if (complaintRate > HIGH_COMPLAINT_THRESHOLD) {
        riskProbability += 0.2;
        contributingFactors.push('high_complaint_rate');
      }
    }

    const burstDetected = this.detectBurst(channelEvents, nowMs);
    if (burstDetected) {
      riskProbability += 0.15;
      unusualActivityDetected = true;
      contributingFactors.push('unusual_send_burst');
    }

    const spikeDetected = this.detectSenderSpike(channelEvents);
    if (spikeDetected) {
      riskProbability += 0.1;
      unusualActivityDetected = true;
      contributingFactors.push('sender_volume_spike');
    }

    riskProbability = clamp(riskProbability, 0, 1);

    const riskLevel: BanRiskLevel =
      riskProbability >= 0.8
        ? 'imminent'
        : riskProbability >= 0.6
          ? 'high'
          : riskProbability >= 0.35
            ? 'moderate'
            : riskProbability >= 0.15
              ? 'low'
              : 'none';

    if (riskLevel === 'high' || riskLevel === 'imminent') {
      this.emitBanRisk(input.workspaceId, channel, riskProbability, contributingFactors);
    }

    return {
      workspaceId: input.workspaceId,
      channel,
      riskLevel,
      riskProbability: Math.round(riskProbability * 100) / 100,
      policyViolationCount,
      complaintRate: channelEvents.length > 0
        ? Math.round((complaintCount / channelEvents.length) * 1000) / 1000
        : 0,
      unusualActivityDetected,
      contributingFactors,
      assessedAt: new Date(nowMs).toISOString(),
    };
  }

  private isChannelEvent(
    e: { eventName: string; payload?: Readonly<Record<string, unknown>> },
    channel: ChannelKind,
  ): boolean {
    const ch = e.payload?.['channel'] as string | undefined;
    if (ch && ch !== channel) {
      return false;
    }
    return true;
  }

  private detectBurst(
    events: readonly { occurredAt: string }[],
    nowMs: number,
  ): boolean {
    const oneHourMs = 60 * 60 * 1000;
    const recent = events.filter((e) => {
      const ts = Date.parse(e.occurredAt);
      return Number.isFinite(ts) && nowMs - ts < oneHourMs;
    });
    return recent.length > 100;
  }

  private detectSenderSpike(
    events: readonly { payload?: Readonly<Record<string, unknown>> }[],
  ): boolean {
    const senders = new Set<string>();
    for (const e of events) {
      const sender = e.payload?.['sender'] as string | undefined;
      if (sender) {
        senders.add(sender);
      }
    }
    return senders.size > 50;
  }

  private async emitBanRisk(
    workspaceId: string,
    channel: ChannelKind,
    probability: number,
    factors: readonly string[],
  ): Promise<void> {
    try {
      await this.spine.emit({
        eventName: 'commerce.post_sale.churn_risk_detected',
        workspaceId,
        truthMode: 'inferred',
        provenance: {
          source: 'production',
          processor: PROCESSOR_NAME,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: {
          riskType: 'channel_ban',
          channel,
          probability,
          factors,
        },
      });
    } catch (err: unknown) {
      this.logger.error(
        `failed to emit ban_risk for ws ${workspaceId}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }
}
