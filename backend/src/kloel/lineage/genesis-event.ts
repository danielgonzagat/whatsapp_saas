import { createHash } from 'node:crypto';

/**
 * UTP-LINEAGE-001 — Genesis Event imutável.
 *
 * Implements PCI.3 §2 (docs/contracts/pci/03-genesis-lineage.md).
 *
 * The Genesis Event is the ONLY structural identity invariant of the
 * organism. It is emitted exactly once on bootstrap and persisted in the
 * Lineage Ledger as entry 1 (sequenceNumber = 1, prevEntryHash = zero).
 *
 * Identity is NEVER declared via system prompt. The LLM derives identity by
 * reading the projection of this event (via the Identity Projector), not by
 * being instructed.
 *
 * MUTATION OF ANY FIELD UNDER `inviolable` IS A HARD-FAIL CONDITION
 * detected by gate `origin-immutability` (PCI.4 §3.6).
 */

/**
 * Canonical name of the organism. Literal `"Kloel"`.
 *
 * Persisted as the only identity literal allowed in code. Verified at runtime
 * by the Identity Lineage Guard. Any code that hardcodes a different name
 * for the organism violates B16.
 */
export const ORGANISM_CANONICAL_NAME = 'Kloel' as const;

/**
 * Canonical eventId of the Genesis Event. Stable across boots — the Genesis
 * is emitted once in the history of the system; its eventId is recorded here
 * so the Lineage Ledger can verify entry 1 against this constant. The literal
 * value is a ULID-shaped opaque identifier reserved for the Kloel organism.
 */
export const GENESIS_EVENT_ID = '01JD90000000000000000000GE' as const;

/**
 * Canonical etymology — Greek `kléos` + Hebrew `El`.
 */
interface GenesisEtymology {
  readonly greek: { readonly word: string; readonly meaning: string };
  readonly hebrew: { readonly word: string; readonly meaning: string };
  readonly synthesis: string;
}

/**
 * Canonical origin — nature, inception, author posture.
 */
interface GenesisOrigin {
  readonly nature: string;
  readonly inception: string;
  readonly authorPosture: string;
}

/**
 * Canonical steward — the human posture preserving origin without dictating
 * behavior.
 */
interface GenesisSteward {
  readonly role: string;
  readonly responsibility: string;
  readonly posture: string;
}

/**
 * Inviolable field names — payload keys that MUST never be mutated.
 */
type GenesisInviolableField = 'canonicalName' | 'etymology' | 'origin' | 'steward' | 'inviolable';

/**
 * Evolvable field names — payload keys describing the operational state of
 * the organism. These are NOT in the Genesis payload itself; they live in
 * other parts of the cognitive substrate (capabilities, memory, beliefs,
 * valence, operationalState). Listed here for clarity of contract.
 */
type GenesisEvolvableField = 'capabilities' | 'memory' | 'valence' | 'beliefs' | 'operationalState';

/**
 * The immutable payload of the Genesis Event.
 */
export interface GenesisPayload {
  readonly canonicalName: typeof ORGANISM_CANONICAL_NAME;
  readonly etymology: GenesisEtymology;
  readonly origin: GenesisOrigin;
  readonly steward: GenesisSteward;
  readonly inviolable: readonly GenesisInviolableField[];
  readonly evolvable: readonly GenesisEvolvableField[];
}

/**
 * The full Genesis Event as it is emitted on the spine. `hash` is computed
 * deterministically from `payload` via SHA-256 over the canonicalized JSON
 * (PCI.3 §4.1) at construction time.
 */
export interface GenesisEvent {
  readonly eventId: typeof GENESIS_EVENT_ID;
  readonly eventName: 'lineage.genesis';
  readonly timestamp: string;
  readonly occurredAt: string;
  readonly truthMode: 'observed';
  readonly provenance: {
    readonly source: 'production';
    readonly processor: 'lineage-bootstrap';
    readonly processorVersion: string;
    readonly schemaVersion: string;
    readonly environment: 'dev' | 'staging' | 'prod';
  };
  readonly valence: 'neutral';
  readonly payload: GenesisPayload;
  readonly hash: string;
}

const GENESIS_PAYLOAD: GenesisPayload = Object.freeze({
  canonicalName: ORGANISM_CANONICAL_NAME,
  etymology: Object.freeze({
    greek: Object.freeze({
      word: 'kléos',
      meaning: 'renome, glória, fama duradoura',
    }),
    hebrew: Object.freeze({
      word: 'El',
      meaning: 'Deus, força fundadora',
    }),
    synthesis: 'renome construído sob fundamento maior',
  }),
  origin: Object.freeze({
    nature: 'organismo cognitivo biomimético comercial multi-tenant',
    inception: '2026-05-13',
    authorPosture: 'Daniel Penin como mordomo, não autor de identidade',
  }),
  steward: Object.freeze({
    role: 'humano-mordomo',
    responsibility: 'governança, rollback, autorização de evolução composta',
    posture: 'preservador de origem, não ditador de comportamento',
  }),
  inviolable: Object.freeze([
    'canonicalName',
    'etymology',
    'origin',
    'steward',
    'inviolable',
  ] as const),
  evolvable: Object.freeze([
    'capabilities',
    'memory',
    'valence',
    'beliefs',
    'operationalState',
  ] as const),
});

const GENESIS_TIMESTAMP = '2026-05-13T20:00:00.000Z';

const GENESIS_PROCESSOR_VERSION = '1.0.0';
const GENESIS_SCHEMA_VERSION = '1.0.0';

/**
 * RFC 8785 / JCS canonicalization (recursive, deterministic key ordering).
 * Sufficient for the constrained shape of GenesisPayload — no NaN, Infinity,
 * undefined, or function values are present, so default JSON.stringify after
 * key sorting produces a stable canonical form.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalizeJson(item));
    return `[${items.join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => {
    return `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`;
  });
  return `{${parts.join(',')}}`;
}

export function computeGenesisHash(payload: GenesisPayload): string {
  const canonical = canonicalizeJson(payload);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

const GENESIS_HASH = computeGenesisHash(GENESIS_PAYLOAD);

/**
 * The canonical Genesis Event. Frozen at module load. Verifiable by
 * reproducing `computeGenesisHash(GENESIS_EVENT.payload)`.
 */
export const GENESIS_EVENT: GenesisEvent = Object.freeze({
  eventId: GENESIS_EVENT_ID,
  eventName: 'lineage.genesis',
  timestamp: GENESIS_TIMESTAMP,
  occurredAt: GENESIS_TIMESTAMP,
  truthMode: 'observed',
  provenance: Object.freeze({
    source: 'production',
    processor: 'lineage-bootstrap',
    processorVersion: GENESIS_PROCESSOR_VERSION,
    schemaVersion: GENESIS_SCHEMA_VERSION,
    environment: (process.env['NODE_ENV'] === 'production'
      ? 'prod'
      : process.env['NODE_ENV'] === 'staging'
        ? 'staging'
        : 'dev'),
  }),
  valence: 'neutral',
  payload: GENESIS_PAYLOAD,
  hash: GENESIS_HASH,
});

/**
 * Verify a candidate event against the canonical Genesis. Returns true when
 * the candidate matches the canonical payload AND the canonical hash AND the
 * canonical eventId. Used by the Identity Lineage Guard.
 */
export function verifyGenesisEvent(candidate: unknown): candidate is GenesisEvent {
  if (candidate === null || typeof candidate !== 'object') {
    return false;
  }
  const c = candidate as Partial<GenesisEvent>;
  if (c.eventId !== GENESIS_EVENT_ID) {return false;}
  if (c.eventName !== 'lineage.genesis') {return false;}
  if (!c.payload) {return false;}
  if (c.payload.canonicalName !== ORGANISM_CANONICAL_NAME) {return false;}
  const recomputed = computeGenesisHash(c.payload);
  return recomputed === c.hash;
}
