import { Injectable } from '@nestjs/common';
import type { WisdomPattern } from './wisdom.types';

/**
 * WISDOM-009 — Pattern Store.
 *
 * Minimal in-memory holder for cross-workspace wisdom patterns.
 * Patterns are loaded by extractor pipeline (WISDOM-001..008)
 * and consumed by MindPolicyService at choose-time for
 * Beta prior nudges (CIA Gap 9).
 *
 * NOT persisted — future UTPs will add Prisma backing.
 */
@Injectable()
export class WisdomPatternStore {
  private patterns: readonly WisdomPattern[] = [];

  /** Replace the entire pattern set (e.g., after extraction pipeline runs). */
  setPatterns(patterns: readonly WisdomPattern[]): void {
    this.patterns = [...patterns];
  }

  /** Get the current snapshot of wisdom patterns. */
  getPatterns(): readonly WisdomPattern[] {
    return this.patterns;
  }

  /** Number of patterns currently held. */
  get count(): number {
    return this.patterns.length;
  }
}
