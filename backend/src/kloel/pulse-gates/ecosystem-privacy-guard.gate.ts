import { fail, Gate, GateEvidence, GateMode, GateVerdict, pass } from './pulse-gates.types';

/**
 * UTP-ECOSYS — `ecosystem-privacy-guard` gate.
 *
 * Implements PCI.4 S3.11: no identifiable workspace data crosses workspace
 * boundaries. Detects cross-workspace leaks in wisdomContext payloads and
 * cross-workspace recommendations.
 *
 * Detection surface:
 *  1. Foreign workspace identifier in wisdomPayload (any string or field
 *     matching a workspaceId different from targetWorkspaceId).
 *  2. Recommendation items carrying sourceWorkspaceId or workspaceId
 *     different from the targetWorkspaceId.
 *  3. Cross-suggestion issued with k-anonymity below 5 workspaces.
 *  4. Opt-out workspace present in the recommendation cohort.
 *  5. Diff-privacy noise missing (epsilon absent or zero) on a
 *     cross-workspace recommendation.
 *
 * Mode: hard_fail since Onda 7 (promoted via GATE_DEFAULT_MODE).
 */
const MEASURED_BY = 'ecosystem-privacy-guard.gate' as const;

const WORKSPACE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const K_ANONYMITY_MIN = 5;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export interface EcosystemRecommendationInput {
  readonly recommendationId: string;
  readonly sourceWorkspaceIds?: readonly string[];
  readonly contextWorkspaces?: readonly string[];
  readonly items?: readonly Record<string, unknown>[];
}

export interface EcosystemCohortInput {
  readonly cohortSize: number;
  readonly workspaceIds: readonly string[];
  readonly optOutWorkspaces?: readonly string[];
  readonly diffPrivacyEpsilon?: number;
}

export interface EcosystemPrivacyGuardInput {
  readonly targetWorkspaceId: string;
  readonly wisdomPayload?: unknown;
  readonly recommendation?: EcosystemRecommendationInput;
  readonly cohort?: EcosystemCohortInput;
}

function workspaceFieldKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower === 'workspaceid' || lower === 'workspace_id' || lower === 'workspace-id';
}

function isForeignWorkspaceId(
  value: string,
  targetWorkspaceId: string,
): boolean {
  return (
    value !== targetWorkspaceId &&
    WORKSPACE_UUID_RE.test(value)
  );
}

function scanWisdomForForeignWorkspaceIds(
  payload: unknown,
  targetWorkspaceId: string,
  pathPrefix = '$',
  out: GateEvidence[] = [],
): GateEvidence[] {
  if (typeof payload === 'string') {
    if (isForeignWorkspaceId(payload, targetWorkspaceId)) {
      out.push({
        path: pathPrefix,
        detail: `foreign workspaceId "${payload}" found in wisdom payload`,
      });
    }
    return out;
  }
  if (Array.isArray(payload)) {
    payload.forEach((item, idx) => {
      scanWisdomForForeignWorkspaceIds(item, targetWorkspaceId, `${pathPrefix}[${idx}]`, out);
    });
    return out;
  }
  if (isObject(payload)) {
    for (const [k, v] of Object.entries(payload)) {
      if (
        workspaceFieldKey(k) &&
        typeof v === 'string' &&
        isForeignWorkspaceId(v, targetWorkspaceId)
      ) {
        out.push({
          path: `${pathPrefix}.${k}`,
          detail: `cross-workspace identifier leak at "${k}" with value "${v}"`,
        });
        continue;
      }
      scanWisdomForForeignWorkspaceIds(v, targetWorkspaceId, `${pathPrefix}.${k}`, out);
    }
  }
  return out;
}

function scanRecommendationItemsForForeignWorkspaceIds(
  items: readonly Record<string, unknown>[],
  targetWorkspaceId: string,
  out: GateEvidence[] = [],
): GateEvidence[] {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    for (const [k, v] of Object.entries(item)) {
      if (
        workspaceFieldKey(k) &&
        typeof v === 'string' &&
        isForeignWorkspaceId(v, targetWorkspaceId)
      ) {
        out.push({
          path: `$.recommendation.items[${i}].${k}`,
          detail: `item carries foreign workspaceId "${v}"`,
        });
      }
    }
  }
  return out;
}

function hasCrossWorkspaceContent(
  input: EcosystemPrivacyGuardInput,
): boolean {
  const r = input.recommendation;
  if (!r) return false;
  const src = r.sourceWorkspaceIds ?? [];
  const ctx = r.contextWorkspaces ?? [];
  const allForeign = [...src, ...ctx].filter(
    (id) => id !== input.targetWorkspaceId,
  );
  const itemsCount = r.items?.length ?? 0;
  return allForeign.length > 0 || itemsCount > 0;
}

export function makeEcosystemPrivacyGuard(
  mode: GateMode = 'hard_fail',
): Gate<EcosystemPrivacyGuardInput> {
  return {
    name: 'ecosystem-privacy-guard',
    mode,
    check: (input): GateVerdict => {
      const issues: { path: string; detail: string }[] = [];

      // 1. Scan wisdomPayload for foreign workspace identifiers
      if (input.wisdomPayload !== undefined) {
        scanWisdomForForeignWorkspaceIds(
          input.wisdomPayload,
          input.targetWorkspaceId,
          '$',
          issues,
        );
      }

      // 2. Scan recommendation items for foreign workspace identifiers
      const rec = input.recommendation;
      if (rec !== undefined) {
        const items = rec.items ?? [];
        if (items.length > 0) {
          scanRecommendationItemsForForeignWorkspaceIds(
            items,
            input.targetWorkspaceId,
            issues,
          );
        }
      }

      // 3. Check k-anonymity on cross-workspace content
      if (hasCrossWorkspaceContent(input)) {
        const cohort = input.cohort;
        if (!cohort || cohort.cohortSize < K_ANONYMITY_MIN) {
          issues.push({
            path: '$.cohort.cohortSize',
            detail: `cross-workspace recommendation requires k-anonymity of at least ${K_ANONYMITY_MIN} (cohort=${cohort?.cohortSize ?? 0})`,
          });
        }

        // 4. Check opt-out enforcement
        if (cohort) {
          const optOut = new Set(cohort.optOutWorkspaces ?? []);
          const violators = cohort.workspaceIds.filter((id) => optOut.has(id));
          if (violators.length > 0) {
            issues.push({
              path: '$.cohort.workspaceIds',
              detail: `opt-out workspace(s) present in cohort: ${violators.join(', ')}`,
            });
          }
        }

        // 5. Check diff-privacy noise on cross-workspace recommendation
        if (cohort && (cohort.diffPrivacyEpsilon === undefined || cohort.diffPrivacyEpsilon <= 0)) {
          issues.push({
            path: '$.cohort.diffPrivacyEpsilon',
            detail: 'cross-workspace recommendation requires diff-privacy noise (epsilon > 0)',
          });
        }
      }

      if (issues.length === 0) {
        return pass('ecosystem-privacy-guard', mode, MEASURED_BY);
      }
      return fail(
        'ecosystem-privacy-guard',
        mode,
        MEASURED_BY,
        `${issues.length} ecosystem privacy violation(s) detected for target workspace ${input.targetWorkspaceId}`,
        issues.map((i) => ({ path: i.path, detail: i.detail })),
      );
    },
  };
}
