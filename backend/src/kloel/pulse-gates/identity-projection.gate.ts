import { validateAbiPayload } from '../abi/abi-validator';
import {
  fail,
  Gate,
  GateEvidence,
  GateMode,
  GateVerdict,
  pass,
} from './pulse-gates.types';

/**
 * UTP-PULSE-003 — `identity-projection` gate.
 *
 * Implements PCI.4 §3.3: projection in the ABI must match audience.
 *
 * Detection categories:
 *   1. `audience === 'public'` with spiritual origin (`etymology`/`origin`)
 *      exposed in `lineage` (E.10 violation).
 *   2. Invalid `audience` value (not in canonical set).
 *   3. `canonicalName !== 'Kloel'` in `lineage`.
 *   4. `identityProjection` absent or not an object.
 *   5. `truthMode` inconsistent between `lineage` and `identityProjection`.
 *
 * Default mode: `hard_fail`. Promoted at Onda 2 (PCI.4 §7).
 */
const MEASURED_BY = 'identity-projection.gate' as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hasNonEmptyString(
  obj: Record<string, unknown>,
  key: string,
): boolean {
  const val = obj[key];
  return typeof val === 'string' && val.length > 0;
}

export function makeIdentityProjectionGate(
  mode: GateMode = 'hard_fail',
): Gate<unknown> {
  return {
    name: 'identity-projection',
    mode,
    check: (payload: unknown): GateVerdict => {
      const evidence: GateEvidence[] = [];

      const verdict = validateAbiPayload(payload);
      for (const issue of verdict.issues) {
        if (
          issue.code === 'INVALID_AUDIENCE' ||
          issue.code === 'LINEAGE_NAME_MISMATCH' ||
          issue.code === 'INVALID_TRUTH_MODE' ||
          (issue.code === 'MISSING_REQUIRED' &&
            issue.path === '$.identityProjection')
        ) {
          evidence.push({ path: issue.path, detail: issue.message });
        }
      }

      if (!isObject(payload)) {
        if (evidence.length === 0) {
          evidence.push({ path: '$', detail: 'payload is not an object' });
        }
        return fail(
          'identity-projection',
          mode,
          MEASURED_BY,
          `${evidence.length} identity-projection issue(s)`,
          evidence,
        );
      }

      const idProj = payload['identityProjection'];
      const lineage = payload['lineage'];

      if (idProj !== undefined && !isObject(idProj)) {
        evidence.push({
          path: '$.identityProjection',
          detail: 'identityProjection must be an object',
        });
      }

      if (isObject(idProj) && isObject(lineage)) {
        const audience = idProj['audience'];

        if (audience === 'public') {
          if (hasNonEmptyString(lineage, 'etymology')) {
            evidence.push({
              path: '$.lineage.etymology',
              detail:
                'spiritual etymology exposed to public audience (E.10 violation)',
            });
          }
          if (hasNonEmptyString(lineage, 'origin')) {
            evidence.push({
              path: '$.lineage.origin',
              detail:
                'spiritual origin exposed to public audience (E.10 violation)',
            });
          }
        }

        const idProjTruthMode = idProj['truthMode'];
        const lineageTruthMode = lineage['truthMode'];
        if (
          typeof lineageTruthMode === 'string' &&
          typeof idProjTruthMode === 'string' &&
          lineageTruthMode !== idProjTruthMode
        ) {
          evidence.push({
            path: '$.identityProjection.truthMode',
            detail: `truthMode mismatch: lineage declares "${lineageTruthMode}" but identityProjection declares "${idProjTruthMode}"`,
          });
        }
      }

      if (evidence.length === 0) {
        return pass('identity-projection', mode, MEASURED_BY);
      }
      return fail(
        'identity-projection',
        mode,
        MEASURED_BY,
        `${evidence.length} identity-projection issue(s)`,
        evidence,
      );
    },
  };
}
