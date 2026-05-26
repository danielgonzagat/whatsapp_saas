/**
 * UTP-RECOVERY-007 — Trust-After-Error Tracker.
 *
 * Tracks trust trajectory after errors across workspaces.
 * Reports non-repetition rate (how often errors are not repeated)
 * and auto-detection rate (what fraction of errors are self-detected).
 * These are the V/R18 metrics demanded by B0.2.
 *
 * Service class (stateful: maintains error history per workspace).
 */

import { Injectable } from '@nestjs/common';
import type {
  DetectedError,
  ErrorFingerprint,
  TrustAfterErrorSnapshot,
} from './recovery.types';

interface WorkspaceErrorHistory {
  readonly workspaceId: string;
  errors: ErrorRecord[];
}

interface ErrorRecord {
  readonly errorId: string;
  readonly category: string;
  readonly detectedAt: string;
  readonly fingerprint: ErrorFingerprint;
  readonly recovered: boolean;
}

const DEFAULT_WINDOW_DAYS = 30;

@Injectable()
export class TrustAfterErrorTracker {
  private readonly history = new Map<string, WorkspaceErrorHistory>();

  public recordError(error: DetectedError): void {
    let entry = this.history.get(error.workspaceId);
    if (!entry) {
      entry = { workspaceId: error.workspaceId, errors: [] };
      this.history.set(error.workspaceId, entry);
    }

    entry.errors.push({
      errorId: error.errorId,
      category: error.category,
      detectedAt: error.detectedAt,
      fingerprint: error.fingerprint,
      recovered: false,
    });
  }

  public markRecovered(workspaceId: string, errorId: string): boolean {
    const entry = this.history.get(workspaceId);
    if (!entry) {return false;}

    const record = entry.errors.find((e) => e.errorId === errorId);
    if (!record) {return false;}

    (record as { recovered: boolean }).recovered = true;
    return true;
  }

  public nonRepetitionRate(workspaceId: string): number {
    const entry = this.history.get(workspaceId);
    if (!entry || entry.errors.length === 0) {return 1;}

    const uniquePatterns = new Set<string>();
    let total = 0;

    for (const err of entry.errors) {
      total++;
      uniquePatterns.add(
        `${err.category}:${err.fingerprint.eventPatternHash}`,
      );
    }

    if (total === 0) {return 1;}
    return 1 - (total - uniquePatterns.size) / total;
  }

  public autoDetectionRate(workspaceId: string): number {
    const entry = this.history.get(workspaceId);
    if (!entry || entry.errors.length === 0) {return 1;}

    const autoDetected = entry.errors.filter(
      (e) =>
        e.category !== 'unknown' &&
        e.category !== 'wrong_action' &&
        e.category !== 'inappropriate_timing',
    ).length;

    return autoDetected / entry.errors.length;
  }

  public snapshot(
    workspaceId: string,
    nowMs: number,
    windowDays: number = DEFAULT_WINDOW_DAYS,
  ): TrustAfterErrorSnapshot {
    const entry = this.history.get(workspaceId);
    const windowStart = new Date(
      nowMs - windowDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const errorsInWindow =
      entry?.errors.filter(
        (e) => new Date(e.detectedAt).getTime() >= nowMs - windowDays * 24 * 60 * 60 * 1000,
      ) ?? [];

    const totalErrors = errorsInWindow.length;
    const autoDetected = errorsInWindow.filter(
      (e) => e.category !== 'unknown',
    ).length;
    const autoDetectRate = totalErrors > 0 ? autoDetected / totalErrors : 1;

    const uniquePatterns = new Set<string>();
    for (const err of errorsInWindow) {
      uniquePatterns.add(
        `${err.category}:${err.fingerprint.eventPatternHash}`,
      );
    }
    const nonRepeat =
      totalErrors > 0
        ? 1 - (totalErrors - uniquePatterns.size) / totalErrors
        : 1;

    const r18Score = (autoDetectRate + nonRepeat) / 2;

    let trustTrend: TrustAfterErrorSnapshot['trustTrend'] = 'flat';
    if (r18Score >= 0.8) {trustTrend = 'up';}
    else if (r18Score < 0.4) {trustTrend = 'down';}

    return {
      workspaceId,
      windowStart,
      windowEnd: new Date(nowMs).toISOString(),
      totalErrors,
      autoDetectedErrors: autoDetected,
      autoDetectionRate: Math.round(autoDetectRate * 100) / 100,
      nonRepetitionRate: Math.round(nonRepeat * 100) / 100,
      trustTrend,
      r18Score: Math.round(r18Score * 100) / 100,
      generatedAt: new Date(nowMs).toISOString(),
    };
  }

  public workspaceIds(): readonly string[] {
    return [...this.history.keys()];
  }

  public clear(): void {
    this.history.clear();
  }

  public recordCount(workspaceId: string): number {
    return this.history.get(workspaceId)?.errors.length ?? 0;
  }
}
