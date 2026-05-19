import { Injectable } from '@nestjs/common';
import type { CrossRolePattern, Role } from './ecosys.types';

interface WorkspaceRoleSignal {
  readonly workspaceFingerprint: string;
  readonly role: Role;
  readonly tokens: readonly string[];
}

const MIN_WORKSPACES_FOR_PATTERN = 3;
const MIN_ROLES_FOR_CROSS = 2;

/**
 * UTP-ECOSYS-001 — Detects abstract patterns that recur across multiple
 * roles AND workspaces. Pure: same input -> same output. Privacy-safe:
 * input is anonymized fingerprints + tokenized signals (PII never enters).
 */
@Injectable()
export class CrossRolePatternDetectorService {
  public detect(signals: readonly WorkspaceRoleSignal[]): readonly CrossRolePattern[] {
    if (signals.length === 0) return [];
    const tokenIndex = new Map<
      string,
      { roles: Set<Role>; workspaces: Set<string> }
    >();
    for (const sig of signals) {
      for (const token of sig.tokens) {
        const cur = tokenIndex.get(token) ?? { roles: new Set(), workspaces: new Set() };
        cur.roles.add(sig.role);
        cur.workspaces.add(sig.workspaceFingerprint);
        tokenIndex.set(token, cur);
      }
    }
    const out: CrossRolePattern[] = [];
    for (const [token, agg] of tokenIndex) {
      if (agg.workspaces.size < MIN_WORKSPACES_FOR_PATTERN) continue;
      if (agg.roles.size < MIN_ROLES_FOR_CROSS) continue;
      const sortedRoles = [...agg.roles].sort();
      const confidence = Math.min(
        1,
        agg.workspaces.size / 10 + (agg.roles.size - 1) * 0.1,
      );
      out.push({
        patternId: `pattern_${token}_${sortedRoles.join('_')}`,
        description: `Pattern "${token}" observed across roles [${sortedRoles.join(', ')}]`,
        observedAcrossRoles: sortedRoles,
        evidenceWorkspacesCount: agg.workspaces.size,
        confidence,
      });
    }
    return out.sort((a, b) => b.confidence - a.confidence);
  }
}

export type { WorkspaceRoleSignal };
