/**
 * UTP-CHANNEL-001..008 — Camada XXVIII (Channel Survival Intelligence).
 *
 * Types for channel resilience: concentration detection, health monitoring,
 * ban-risk assessment, policy-change tracking, contingency planning,
 * owned-audience pushing, migration orchestration, and diversification
 * recommendations.
 *
 * Implements B0.7 (channel independence — don't die when a channel falls),
 * PCI.1 canonical event domains, and PCI.5 conventions.
 */

import type { SpineEventRef } from '../mind/mind.types';

export type ChannelKind =
  | 'whatsapp'
  | 'email'
  | 'instagram'
  | 'messenger'
  | 'tiktok'
  | 'sms'
  | 'push'
  | 'owned_site';

export type ConcentrationLevel = 'low' | 'moderate' | 'high' | 'critical';

export type ChannelHealthStatus = 'healthy' | 'degraded' | 'unstable' | 'down';

export type BanRiskLevel = 'none' | 'low' | 'moderate' | 'high' | 'imminent';

export type PolicySeverity = 'informational' | 'minor' | 'major' | 'existential';

export type MigrationReadiness = 'not_ready' | 'partial' | 'ready';

export type DiversificationUrgency = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface ChannelRevenueShare {
  readonly channel: ChannelKind;
  readonly revenueCents: number;
  readonly sharePercent: number;
}

export interface ChannelConcentration {
  readonly workspaceId: string;
  readonly channels: readonly ChannelRevenueShare[];
  readonly primaryChannel: ChannelKind | undefined;
  readonly primarySharePercent: number;
  readonly concentrationLevel: ConcentrationLevel;
  readonly herfindahlIndex: number;
  readonly assessedAt: string;
}

export interface ChannelHealth {
  readonly workspaceId: string;
  readonly channel: ChannelKind;
  readonly status: ChannelHealthStatus;
  readonly deliveryRate: number;
  readonly engagementRate: number;
  readonly errorRate: number;
  readonly daysSinceLastActivity: number;
  readonly degradationScore: number;
  readonly signals: readonly string[];
  readonly assessedAt: string;
}

export interface BanRisk {
  readonly workspaceId: string;
  readonly channel: ChannelKind;
  readonly riskLevel: BanRiskLevel;
  readonly riskProbability: number;
  readonly policyViolationCount: number;
  readonly complaintRate: number;
  readonly unusualActivityDetected: boolean;
  readonly contributingFactors: readonly string[];
  readonly assessedAt: string;
}

export interface PolicyChange {
  readonly workspaceId: string;
  readonly channel: ChannelKind;
  readonly changeDescription: string;
  readonly severity: PolicySeverity;
  readonly affectedFeatures: readonly string[];
  readonly estimatedImpactPercent: number;
  readonly detectedAt: string;
  readonly requiresAction: boolean;
}

export interface ContingencyPlan {
  readonly workspaceId: string;
  readonly failingChannel: ChannelKind;
  readonly targetChannels: readonly ChannelKind[];
  readonly migrationReadiness: MigrationReadiness;
  readonly estimatedMigrationDays: number;
  readonly audienceSize: number;
  readonly migrationablePercent: number;
  readonly steps: readonly string[];
  readonly preparedAt: string;
}

export interface OwnedAudience {
  readonly workspaceId: string;
  readonly fromChannel: ChannelKind;
  readonly toOwnedChannel: ChannelKind;
  readonly totalContacts: number;
  readonly migratedContacts: number;
  readonly migrationPercent: number;
  readonly lastPushAt: string | undefined;
  readonly assessedAt: string;
}

export interface MigrationPlan {
  readonly workspaceId: string;
  readonly fromChannel: ChannelKind;
  readonly toChannel: ChannelKind;
  readonly audienceSize: number;
  readonly phasedSteps: number;
  readonly estimatedDays: number;
  readonly riskLevel: 'low' | 'medium' | 'high';
  readonly preparedAt: string;
}

export interface DiversificationRecommendation {
  readonly workspaceId: string;
  readonly currentConcentration: ConcentrationLevel;
  readonly urgency: DiversificationUrgency;
  readonly recommendedChannels: readonly ChannelKind[];
  readonly reasons: readonly string[];
  readonly estimatedTimeToDiversifyDays: number;
  readonly assessedAt: string;
}

export interface DetectionInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly entityRef?: { readonly entityType: string; readonly entityId: string };
  readonly nowMs?: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function daysSince(iso: string, nowMs: number): number {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) {
    return 0;
  }
  return Math.max(0, (nowMs - ts) / (1000 * 60 * 60 * 24));
}

export function filterByWorkspace(
  events: readonly SpineEventRef[],
  workspaceId: string,
): readonly SpineEventRef[] {
  return events.filter((e) => e.workspaceId === workspaceId);
}
