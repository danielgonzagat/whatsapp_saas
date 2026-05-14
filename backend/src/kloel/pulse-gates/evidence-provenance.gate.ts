import { fail, Gate, GateMode, GateVerdict, pass } from './pulse-gates.types';

/**
 * UTP-PULSE-006 — `evidence-provenance` gate.
 *
 * Implements PCI.4 §3.7: every event entering the spine carries complete
 * provenance (source, processor, processorVersion, schemaVersion,
 * environment).
 *
 * The check operates on a single event candidate. Persistence layer
 * SHOULD call this gate before INSERT and refuse on FAIL when in hard_fail.
 *
 * Default mode: log_only. Hard-fail at Onda 2.
 */
const MEASURED_BY = 'evidence-provenance.gate' as const;

const ALLOWED_SOURCES = new Set(['synthetic', 'production']);
const ALLOWED_ENVIRONMENTS = new Set(['dev', 'staging', 'prod']);

export interface ProvenanceLike {
  readonly source?: string;
  readonly processor?: string;
  readonly processorVersion?: string;
  readonly schemaVersion?: string;
  readonly environment?: string;
}

export interface EvidenceProvenanceInput {
  readonly eventId: string;
  readonly eventName: string;
  readonly provenance?: ProvenanceLike;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function makeEvidenceProvenanceGate(
  mode: GateMode = 'log_only',
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
        const source = prov.source;
        if (typeof source !== 'string' || !ALLOWED_SOURCES.has(source)) {
          issues.push({
            path: '$.provenance.source',
            detail: `source must be one of ${[...ALLOWED_SOURCES].join('|')}`,
          });
        }
        if (typeof prov.processor !== 'string' || prov.processor.length === 0) {
          issues.push({
            path: '$.provenance.processor',
            detail: 'processor must be non-empty string',
          });
        }
        if (
          typeof prov.processorVersion !== 'string' ||
          !/^\d+\.\d+\.\d+$/.test(prov.processorVersion)
        ) {
          issues.push({
            path: '$.provenance.processorVersion',
            detail: 'processorVersion must be semver "x.y.z"',
          });
        }
        if (
          typeof prov.schemaVersion !== 'string' ||
          !/^\d+\.\d+\.\d+$/.test(prov.schemaVersion)
        ) {
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
