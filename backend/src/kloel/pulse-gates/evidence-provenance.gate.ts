import { fail, Gate, GateMode, GateVerdict, pass } from './pulse-gates.types';

/**
 * UTP-PULSE-006 — `evidence-provenance` gate.
 *
 * Implements PCI.4 §3.7: every event entering the spine carries complete
 * provenance (source, processor, processorVersion, schemaVersion,
 * environment, origin).
 *
 * The check operates on a single event candidate. Persistence layer
 * SHOULD call this gate before INSERT and refuse on FAIL when in hard_fail.
 *
 * Detection surface (PCI.4 §3.7 + PCI.5 §2):
 *  - provenance object missing
 *  - provenance.origin missing (non-empty string)
 *  - provenance.source invalid or mixing synthetic/production without flag
 *  - provenance.processor AND workerId both missing
 *  - provenance.processorVersion not semver
 *  - provenance.schemaVersion not semver
 *  - provenance.environment invalid
 *  - inferred/projected events without proof anchor (causedBy/upstreamRef)
 *
 * Mode: hard_fail since Onda 2.
 */
const MEASURED_BY = 'evidence-provenance.gate' as const;

const ALLOWED_SOURCES = new Set(['synthetic', 'production']);
const ALLOWED_ENVIRONMENTS = new Set(['dev', 'staging', 'prod']);
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export interface ProvenanceLike {
  readonly source?: string;
  readonly processor?: string;
  readonly processorVersion?: string;
  readonly schemaVersion?: string;
  readonly environment?: string;
  readonly origin?: string;
  readonly workerId?: string;
  readonly upstreamRef?: string;
  readonly syntheticOverride?: boolean;
}

export interface EvidenceProvenanceInput {
  readonly eventId: string;
  readonly eventName: string;
  readonly provenance?: ProvenanceLike;
  readonly truthMode?: 'observed' | 'inferred' | 'projected';
  readonly causedBy?: readonly string[];
  readonly pipelineMode?: 'synthetic' | 'production';
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function nonEmptyString(v: unknown, minLength = 1): v is string {
  return typeof v === 'string' && v.length >= minLength;
}

function isSemverLike(v: unknown): v is string {
  return typeof v === 'string' && SEMVER_RE.test(v);
}

export function makeEvidenceProvenanceGate(
  mode: GateMode = 'hard_fail',
): Gate<EvidenceProvenanceInput> {
  return {
    name: 'evidence-provenance',
    mode,
    check: (input): GateVerdict => {
      const issues: { path: string; detail: string }[] = [];
      const prov = input.provenance;

      if (!prov || !isObject(prov)) {
        issues.push({ path: '$.provenance', detail: 'provenance object missing' });
      } else {
        if (!nonEmptyString(prov.origin)) {
          issues.push({
            path: '$.provenance.origin',
            detail: 'origin must be a non-empty string describing the evidence origin system',
          });
        }

        const source = prov.source;
        if (typeof source !== 'string' || !ALLOWED_SOURCES.has(source)) {
          issues.push({
            path: '$.provenance.source',
            detail: `source must be one of ${[...ALLOWED_SOURCES].join('|')}`,
          });
        }

        if (
          input.pipelineMode === 'production' &&
          prov.source === 'synthetic' &&
          prov.syntheticOverride !== true
        ) {
          issues.push({
            path: '$.provenance.source',
            detail:
              'synthetic evidence in production pipeline requires explicit syntheticOverride flag',
          });
        }

        const hasProcessor = nonEmptyString(prov.processor);
        const hasWorkerId = nonEmptyString(prov.workerId);

        if (!hasProcessor && !hasWorkerId) {
          issues.push({
            path: '$.provenance.processor',
            detail: 'at least one of processor or workerId must be a non-empty string',
          });
        }

        if (!isSemverLike(prov.processorVersion)) {
          issues.push({
            path: '$.provenance.processorVersion',
            detail: 'processorVersion must be semver "x.y.z"',
          });
        }

        if (!isSemverLike(prov.schemaVersion)) {
          issues.push({
            path: '$.provenance.schemaVersion',
            detail: 'schemaVersion must be semver "x.y.z"',
          });
        }

        const env = prov.environment;
        if (typeof env !== 'string' || !ALLOWED_ENVIRONMENTS.has(env)) {
          issues.push({
            path: '$.provenance.environment',
            detail: `environment must be one of ${[...ALLOWED_ENVIRONMENTS].join('|')}`,
          });
        }
      }

      if (
        input.truthMode === 'inferred' ||
        input.truthMode === 'projected'
      ) {
        const hasCausedBy =
          Array.isArray(input.causedBy) && input.causedBy.length > 0;
        const hasUpstreamRef =
          prov && isObject(prov) && nonEmptyString(prov.upstreamRef);

        if (!hasCausedBy && !hasUpstreamRef) {
          issues.push({
            path: '$.causedBy',
            detail: `event with truthMode "${input.truthMode}" must have causedBy or provenance.upstreamRef as proof anchor to the spine`,
          });
        }
      }

      if (issues.length === 0) {
        return pass('evidence-provenance', mode, MEASURED_BY);
      }
      return fail(
        'evidence-provenance',
        mode,
        MEASURED_BY,
        `event ${input.eventName} (${input.eventId}) has incomplete provenance`,
        issues.map((i) => ({ path: i.path, detail: i.detail })),
      );
    },
  };
}
