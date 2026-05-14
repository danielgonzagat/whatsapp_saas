import { Injectable } from '@nestjs/common';
import type { RTierDelta, RTier } from './types';
import { tierToNumber } from './types';

/**
 * EVOL-006 — RTierDeltaMonitor.
 *
 * Tracks R-tier (production readiness) changes across modules. Each
 * module evolution step is recorded as a delta with direction and
 * metrics. Downgrades trigger automatic alerts.
 */

const MODULE_TIERS = new Map<string, RTier>();

function defaultTier(): RTier {
  return 'tier_4_shell';
}

@Injectable()
export class RTierDeltaMonitor {
  private deltas: RTierDelta[] = [];

  record(module: string, currentTier: RTier, metrics: Readonly<Record<string, number>>, reason: string): RTierDelta {
    const previousTier = MODULE_TIERS.get(module) ?? defaultTier();
    MODULE_TIERS.set(module, currentTier);

    const prevNum = tierToNumber(previousTier);
    const currNum = tierToNumber(currentTier);

    let direction: 'upgraded' | 'downgraded' | 'unchanged';
    if (currNum < prevNum) {
      direction = 'upgraded';
    } else if (currNum > prevNum) {
      direction = 'downgraded';
    } else {
      direction = 'unchanged';
    }

    const delta: RTierDelta = {
      workspaceId: 'global',
      module,
      previousTier,
      currentTier,
      metrics,
      changedAt: new Date().toISOString(),
      direction,
      reason,
    };

    this.deltas.push(delta);
    return delta;
  }

  getCurrentTier(module: string): RTier {
    return MODULE_TIERS.get(module) ?? defaultTier();
  }

  listDeltas(module?: string): readonly RTierDelta[] {
    if (module) {
      return this.deltas.filter((d) => d.module === module);
    }
    return [...this.deltas];
  }

  getDowngrades(): readonly RTierDelta[] {
    return this.deltas.filter((d) => d.direction === 'downgraded');
  }

  getRecentDeltas(sinceMs: number): readonly RTierDelta[] {
    const cutoff = Date.now() - sinceMs;
    return this.deltas.filter((d) => new Date(d.changedAt).getTime() >= cutoff);
  }

  reset(): void {
    this.deltas = [];
    MODULE_TIERS.clear();
  }
}
