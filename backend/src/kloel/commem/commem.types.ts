/**
 * UTP-COMMEM-001..007 — Camada XXI (Cognitive Organism — Memory Exporter).
 *
 * ComMem: tudo aprendido vira capital exportavel da empresa. Este modulo
 * agrega eventos do spine por workspace, projeta memoria por dimensao,
 * empacota capsulas exportaveis, quantifica valor, constroi narrativas
 * periodicas e garante isolamento absoluto entre workspaces.
 *
 * Implements B0.8 (knowledge capital), PCI.1 §3.1 (cognition.* taxonomy),
 * and PCI.5 conventions.
 */

import type { SpineEventRef } from '../mind/mind.types';
import type { AbiValence } from '../abi/abi-schema';

export type MemoryDimension = 'working' | 'episodic' | 'consolidated' | 'procedural' | 'semantic';

export interface LedgerEventEntry {
  readonly eventId: string;
  readonly eventName: string;
  readonly workspaceId: string;
  readonly occurredAt: string;
  readonly truthMode: 'observed' | 'inferred' | 'projected';
  readonly valence?: AbiValence;
  readonly entityRef?: { readonly entityType: string; readonly entityId: string };
  readonly correlationId?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface AggregatedLedgerEntry {
  readonly sequence: number;
  readonly workspaceId: string;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly eventCount: number;
  readonly events: readonly LedgerEventEntry[];
  readonly domainBreakdown: Readonly<Record<string, number>>;
  readonly truthModeBreakdown: Readonly<Record<string, number>>;
}

export interface MemoryProjection {
  readonly workspaceId: string;
  readonly dimension: MemoryDimension;
  readonly snapshotAtMs: number;
  readonly itemCount: number;
  readonly items: readonly ProjectedMemoryItem[];
  readonly summary: string;
  readonly confidence: number;
}

export interface ProjectedMemoryItem {
  readonly id: string;
  readonly sourceEventId: string;
  readonly sourceEventName: string;
  readonly occurredAt: string;
  readonly dimension: MemoryDimension;
  readonly weight: number;
  readonly tags: readonly string[];
}

export interface ExportedCapsule {
  readonly capsuleId: string;
  readonly workspaceId: string;
  readonly exportedAt: string;
  readonly version: number;
  readonly projections: readonly MemoryProjection[];
  readonly checksum: string;
  readonly isAuditable: boolean;
}

export interface TimeMachineQuery {
  readonly workspaceId: string;
  readonly targetTimestampMs: number;
  readonly dimensions: readonly MemoryDimension[];
}

export interface TimeMachineResult {
  readonly workspaceId: string;
  readonly queryTimestampMs: number;
  readonly targetTimestampMs: number;
  readonly projections: readonly MemoryProjection[];
  readonly reconstructedFrom: number;
}

export interface ValueQuantification {
  readonly workspaceId: string;
  readonly quantifiedAtMs: number;
  readonly totalEventCount: number;
  readonly distinctDomains: number;
  readonly commercialDensity: number;
  readonly knowledgeMaturityScore: number;
  readonly estimatedCapitalValue: bigint;
}

export interface Narrative {
  readonly workspaceId: string;
  readonly generatedAt: string;
  readonly periodStartMs: number;
  readonly periodEndMs: number;
  readonly summary: string;
  readonly keyFindings: readonly string[];
  readonly recommendations: readonly string[];
  readonly confidence: number;
}

export interface AttributionGuardResult {
  readonly workspaceId: string;
  readonly passed: boolean;
  readonly violations: readonly AttributionViolation[];
  readonly crossWorkspaceReferences: number;
}

export interface AttributionViolation {
  readonly field: string;
  readonly reason: string;
  readonly leakedWorkspaceId?: string;
}

export interface LedgerAggregationInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly minSequence?: number;
}

export interface ProjectionInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly dimensions: readonly MemoryDimension[];
}

export interface NarrativeInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly periodStartMs: number;
  readonly periodEndMs: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function workspaceFilter(
  events: readonly SpineEventRef[],
  workspaceId: string,
): readonly SpineEventRef[] {
  return events.filter((e) => e.workspaceId === workspaceId);
}

export function eventsInWindow(
  events: readonly SpineEventRef[],
  startMs: number,
  endMs: number,
): readonly SpineEventRef[] {
  return events.filter((e) => {
    const ts = new Date(e.occurredAt).getTime();
    return ts >= startMs && ts <= endMs;
  });
}

export function eventDomain(eventName: string): string {
  const parts = eventName.split('.');
  if (parts.length >= 3) {
    return `${parts[0]}.${parts[1]}`;
  }
  if (parts.length === 2) {
    return `${parts[0]}.${parts[1]}`;
  }
  return eventName;
}

export function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `0x${Math.abs(hash).toString(16).padStart(8, '0')}`;
}
