/**
 * UTP-DELEG-001 — Delegation State Tracker.
 *
 * Maintains per-workspace per-area delegation state in memory.
 * Tracks current level, confidence score, gate pass rate, error rate,
 * and graduation/demotion history.
 *
 * Service class (stateful: maintains delegation state per workspace per area).
 */

import { Injectable } from '@nestjs/common';
import type {
  AreaDelegationState,
  DelegationArea,
  DelegationLevel,
  DelegationSnapshotInput,
} from './delegation.types';
import { ALL_DELEGATION_AREAS, DELEGATION_COOLDOWN_DAYS } from './delegation.types';

interface DelegationRecord {
  area: DelegationArea;
  workspaceId: string;
  currentLevel: DelegationLevel;
  proposedLevel: DelegationLevel;
  confidenceScore: number;
  evidenceCount: number;
  lastGraduatedAt: string | null;
  lastDemotedAt: string | null;
  cyclesAtCurrentLevel: number;
  gatePassRate: number;
  errorRate: number;
  updatedAt: string;
}

const DEFAULT_CONFIDENCE = 0.5;
const COOLDOWN_MS = DELEGATION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

function makeKey(workspaceId: string, area: DelegationArea): string {
  return `${workspaceId}::${area}`;
}

@Injectable()
export class DelegationStateTracker {
  private readonly states = new Map<string, DelegationRecord>();

  public getState(workspaceId: string, area: DelegationArea): AreaDelegationState {
    const record = this.ensureRecord(workspaceId, area);
    return this.toImmutable(record);
  }

  public getAllStates(workspaceId: string): readonly AreaDelegationState[] {
    return ALL_DELEGATION_AREAS.map((area) => this.getState(workspaceId, area));
  }

  public applySnapshot(input: DelegationSnapshotInput): AreaDelegationState {
    const record = this.ensureRecord(input.workspaceId, input.area);

    const totalGates = input.gatePassCount + input.gateFailCount;
    const gatePassRate = totalGates > 0 ? input.gatePassCount / totalGates : record.gatePassRate;

    const totalAttempts = input.totalEvents;
    const errorRate = totalAttempts > 0 ? input.errorCount / totalAttempts : record.errorRate;

    const effectiveConfidence = gatePassRate * (1 - errorRate) * input.trustScore;

    record.gatePassRate = Math.round(gatePassRate * 100) / 100;
    record.errorRate = Math.round(errorRate * 100) / 100;
    record.confidenceScore = Math.round(effectiveConfidence * 100) / 100;
    record.evidenceCount = input.totalEvents;
    record.cyclesAtCurrentLevel = input.consecutiveCyclesOk;
    record.updatedAt = new Date(input.nowMs).toISOString();

    return this.toImmutable(record);
  }

  public setLevel(
    workspaceId: string,
    area: DelegationArea,
    level: DelegationLevel,
    nowMs: number,
  ): AreaDelegationState {
    const record = this.ensureRecord(workspaceId, area);
    const previous = record.currentLevel;

    record.currentLevel = level;
    record.proposedLevel = level;
    record.cyclesAtCurrentLevel = 0;
    record.updatedAt = new Date(nowMs).toISOString();

    if (previous !== level) {
      record.lastGraduatedAt = new Date(nowMs).toISOString();
    }

    if (level === 'manual') {
      record.lastDemotedAt = new Date(nowMs).toISOString();
    }

    return this.toImmutable(record);
  }

  public proposeLevel(
    workspaceId: string,
    area: DelegationArea,
    proposed: DelegationLevel,
    nowMs: number,
  ): AreaDelegationState {
    const record = this.ensureRecord(workspaceId, area);
    record.proposedLevel = proposed;
    record.updatedAt = new Date(nowMs).toISOString();
    return this.toImmutable(record);
  }

  public isGraduationCooldownActive(
    workspaceId: string,
    area: DelegationArea,
    nowMs: number,
  ): boolean {
    const record = this.states.get(makeKey(workspaceId, area));
    if (!record) {
      return false;
    }

    const lastAction = record.lastGraduatedAt ?? record.lastDemotedAt;
    if (!lastAction) {
      return false;
    }

    const elapsed = nowMs - new Date(lastAction).getTime();
    return elapsed < COOLDOWN_MS;
  }

  public cooldownRemainingMs(workspaceId: string, area: DelegationArea, nowMs: number): number {
    const record = this.states.get(makeKey(workspaceId, area));
    if (!record) {
      return 0;
    }

    const lastAction = record.lastGraduatedAt ?? record.lastDemotedAt;
    if (!lastAction) {
      return 0;
    }

    const elapsed = nowMs - new Date(lastAction).getTime();
    const remaining = COOLDOWN_MS - elapsed;
    return Math.max(0, remaining);
  }

  public workspaceIds(): readonly string[] {
    const ids = new Set<string>();
    for (const key of this.states.keys()) {
      const ws = key.split('::')[0];
      if (ws) {
        ids.add(ws);
      }
    }
    return [...ids];
  }

  public areaCount(): number {
    return this.states.size;
  }

  public clear(): void {
    this.states.clear();
  }

  private ensureRecord(workspaceId: string, area: DelegationArea): DelegationRecord {
    const key = makeKey(workspaceId, area);
    let record = this.states.get(key);
    if (!record) {
      record = {
        area,
        workspaceId,
        currentLevel: 'manual',
        proposedLevel: 'manual',
        confidenceScore: DEFAULT_CONFIDENCE,
        evidenceCount: 0,
        lastGraduatedAt: null,
        lastDemotedAt: null,
        cyclesAtCurrentLevel: 0,
        gatePassRate: 0,
        errorRate: 0,
        updatedAt: new Date().toISOString(),
      };
      this.states.set(key, record);
    }
    return record;
  }

  private toImmutable(record: DelegationRecord): AreaDelegationState {
    return {
      area: record.area,
      workspaceId: record.workspaceId,
      currentLevel: record.currentLevel,
      proposedLevel: record.proposedLevel,
      confidenceScore: record.confidenceScore,
      evidenceCount: record.evidenceCount,
      lastGraduatedAt: record.lastGraduatedAt,
      lastDemotedAt: record.lastDemotedAt,
      cyclesAtCurrentLevel: record.cyclesAtCurrentLevel,
      gatePassRate: record.gatePassRate,
      errorRate: record.errorRate,
      updatedAt: record.updatedAt,
    };
  }
}
