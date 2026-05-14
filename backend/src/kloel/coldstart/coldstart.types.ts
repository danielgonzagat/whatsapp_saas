/**
 * UTP-COLDSTART-001..008 — Camada XVII (Cold-Start Discovery).
 *
 * Empresa sem historico chega a primeira verdade comercial em <=30 dias.
 * Implements B0.5 (funcionar sem historico, conducao da descoberta).
 *
 * Types: NoHistoryMode, FirstTruthRoadmap, HypothesisTemplate,
 * GuidedQuestion, MicroTest, ProgressSnapshot.
 */
import type { AbiTruthMode } from '../abi/abi-schema';
import type { SpineEventRef } from '../mind/mind.types';

export const MIN_EVENTS_FOR_NO_HISTORY_MODE = 5;
export const DEFAULT_OBSERVATION_WINDOW_DAYS = 30;
export const COLDSTART_ROADMAP_DURATION_DAYS = 30;

export const ROADMAP_MILESTONE_DAYS = [1, 3, 7, 14, 21, 30] as const;

export type MilestoneDay = (typeof ROADMAP_MILESTONE_DAYS)[number];

export const MILESTONE_LABELS: Readonly<Record<MilestoneDay, string>> = {
  1: 'registro de hipotese',
  3: 'primeira pergunta guiada respondida',
  7: 'primeiro micro-teste desenhado',
  14: 'primeiro micro-teste executado',
  21: 'primeira observacao de verdade',
  30: 'primeira verdade comercial validada',
};

export interface NoHistoryMode {
  readonly workspaceId: string;
  readonly isNoHistory: boolean;
  readonly totalEventsInWindow: number;
  readonly observationWindowDays: number;
  readonly activatedAt: string;
  readonly reason?: string | undefined;
}

export interface HypothesisTemplate {
  readonly templateId: string;
  readonly label: string;
  readonly description: string;
  readonly category: HypothesisCategory;
  readonly suggestedMicroTests: readonly string[];
}

export type HypothesisCategory =
  | 'audience'
  | 'offer'
  | 'objection'
  | 'channel'
  | 'pricing'
  | 'messaging';

export const HYPOTHESIS_CATEGORIES: readonly HypothesisCategory[] = [
  'audience',
  'offer',
  'objection',
  'channel',
  'pricing',
  'messaging',
];

export interface GuidedQuestion {
  readonly questionId: string;
  readonly workspaceId: string;
  readonly templateId: string;
  readonly question: string;
  readonly context: string;
  readonly expectedAnswerKind: 'single_choice' | 'free_text' | 'yes_no' | 'scale';
  readonly options?: readonly string[] | undefined;
  readonly generatedAt: string;
}

export interface MicroTest {
  readonly testId: string;
  readonly workspaceId: string;
  readonly hypothesisTemplateId: string;
  readonly description: string;
  readonly actionSteps: readonly string[];
  readonly estimatedDurationHours: number;
  readonly successMetric: string;
  readonly measurementMethod: string;
  readonly minimumSampleSize: number;
  readonly truthMode: AbiTruthMode;
  readonly designedAt: string;
}

export interface ProgressSnapshot {
  readonly workspaceId: string;
  readonly roadmapId: string;
  readonly currentDay: number;
  readonly totalDays: number;
  readonly completedMilestones: readonly MilestoneDay[];
  readonly pendingMilestones: readonly MilestoneDay[];
  readonly completedPct: number;
  readonly microTestCount: number;
  readonly executedTestCount: number;
  readonly hasFirstTruth: boolean;
  readonly readyForGraduation: boolean;
  readonly snapshotAt: string;
}

export interface FirstTruthRoadmap {
  readonly roadmapId: string;
  readonly workspaceId: string;
  readonly createdAt: string;
  readonly durationDays: number;
  readonly milestones: readonly RoadmapMilestone[];
}

export interface RoadmapMilestone {
  readonly day: MilestoneDay;
  readonly label: string;
  readonly completed: boolean;
  readonly completedAt?: string | undefined;
}

export function isColdstartEvent(eventName: string): boolean {
  return COLDSTART_EVENT_NAMES.has(eventName);
}

export const COLDSTART_EVENT_NAMES: ReadonlySet<string> = new Set([
  'commerce.lead.created',
  'commerce.lead.contacted',
  'commerce.lead.replied',
  'commerce.lead.converted',
  'commerce.payment.approved',
  'commerce.payment.declined',
  'commerce.crm.deal_won',
  'commerce.crm.deal_lost',
  'commerce.whatsapp.message_received',
  'commerce.whatsapp.message_replied',
  'commerce.campaign.clicked',
  'commerce.campaign.conversion_associated',
]);

export function countUniqueEntities(events: readonly SpineEventRef[], entityType: string): number {
  const ids = new Set<string>();
  for (const e of events) {
    if (e.entityRef?.entityType === entityType && e.entityRef.entityId) {
      ids.add(e.entityRef.entityId);
    }
  }
  return ids.size;
}

export function withinWindowDays(iso: string, nowMs: number, windowDays: number): boolean {
  const cutoff = nowMs - windowDays * 24 * 60 * 60 * 1000;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) && ts >= cutoff;
}
