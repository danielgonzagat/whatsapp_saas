import { fail, Gate, GateEvidence, GateMode, GateVerdict, pass } from './pulse-gates.types';
import { isObject } from '../../common/types';

export interface SiblingClientDescriptor {
  readonly clientId: string;
  readonly name: string;
  readonly identifiers: ReadonlyArray<string>;
}

export interface InternalKnowledgeLeakInput {
  readonly targetClientId: string;
  readonly agencyWorkspaceId: string;
  readonly contextPayload: unknown;
  readonly siblingClients: ReadonlyArray<SiblingClientDescriptor>;
}

/**
 * UTP-AGENCY-007 — `internal-knowledge-leak-guard` gate.
 *
 * Implements PCI.4 §3.12: the context being constructed for a target client
 * inside an agency workspace must not contain data from any sibling client
 * belonging to the same agency.
 *
 * Detection categories:
 *   1. Sibling client NAME found anywhere in the target's context payload.
 *   2. Sibling client ID (uuid, slug, numeric) found in the target's context.
 *   3. Sibling client IDENTIFIERS (email, phone, document number) found in
 *      the target's context.
 *   4. Cross-referenced sibling data structures: a sibling's clientId or
 *      identifiers appear nested within arrays or objects in the context.
 *
 * Scans every string leaf in the context payload recursively (objects,
 * arrays, primitives). Matching is case-insensitive and whole-word anchored
 * for names (to avoid false positives on short name fragments).
 *
 * Promoted from `log_only` to `hard_fail` per Camada XXV (Agency Intelligence)
 * mandate — zero leakage between clients of the same agency.
 *
 * Failure policy (hard_fail): blocks context delivery, forces isolation.
 */
const MEASURED_BY = 'internal-knowledge-leak-guard.gate' as const;


function normalizeIdentifier(value: string): string {
  return value.replace(/[\s\-_.()]/g, '').toLowerCase();
}

function buildNameWordPattern(name: string): RegExp {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (words.length === 0) return /(?!)/;
  const joined = words.join('\\s+');
  return new RegExp(`\\b${joined}\\b`, 'i');
}

function buildIdLookup(sibling: SiblingClientDescriptor): string[] {
  const tokens: string[] = [];
  tokens.push(normalizeIdentifier(sibling.clientId));
  const idParts = sibling.clientId.split(/[-_\s]+/);
  for (const part of idParts) {
    if (part.length >= 6) {
      tokens.push(normalizeIdentifier(part));
    }
  }
  return tokens;
}

function buildIdentifierLookup(identifiers: ReadonlyArray<string>): string[] {
  return identifiers.map((id) => normalizeIdentifier(id));
}

function hasKeywordMatch(candidate: string, keywords: ReadonlySet<string>): boolean {
  const norm = normalizeIdentifier(candidate);
  for (const kw of keywords) {
    if (norm.includes(kw)) {
      return true;
    }
  }
  return false;
}

interface LeakScanState {
  readonly namePatterns: ReadonlyMap<string, RegExp>;
  readonly idTokens: ReadonlyMap<string, ReadonlySet<string>>;
  readonly identifierTokens: ReadonlyMap<string, ReadonlySet<string>>;
}

function buildScanState(siblings: ReadonlyArray<SiblingClientDescriptor>): LeakScanState {
  const namePatterns = new Map<string, RegExp>();
  const idTokens = new Map<string, ReadonlySet<string>>();
  const identifierTokens = new Map<string, ReadonlySet<string>>();

  for (const sib of siblings) {
    const nameRe = buildNameWordPattern(sib.name);
    if (nameRe.source !== '(?!)') {
      namePatterns.set(sib.clientId, nameRe);
    }
    const idSet = new Set(buildIdLookup(sib));
    if (idSet.size > 0) {
      idTokens.set(sib.clientId, idSet);
    }
    const identSet = new Set(buildIdentifierLookup(sib.identifiers));
    if (identSet.size > 0) {
      identifierTokens.set(sib.clientId, identSet);
    }
  }

  return { namePatterns, idTokens, identifierTokens };
}

function scanString(
  value: string,
  path: string,
  state: LeakScanState,
  evidence: GateEvidence[],
): void {
  for (const [siblingId, pattern] of state.namePatterns) {
    if (pattern.test(value)) {
      evidence.push({
        path,
        detail: `sibling client name leaked (clientId=${siblingId}, detected via name pattern in target context)`,
      });
    }
  }

  for (const [siblingId, tokens] of state.idTokens) {
    if (hasKeywordMatch(value, tokens)) {
      evidence.push({
        path,
        detail: `sibling client ID token leaked (clientId=${siblingId}, detected in target context)`,
      });
    }
  }

  for (const [siblingId, tokens] of state.identifierTokens) {
    if (hasKeywordMatch(value, tokens)) {
      evidence.push({
        path,
        detail: `sibling client identifier leaked (clientId=${siblingId}, detected in target context)`,
      });
    }
  }
}

function walkPayload(
  node: unknown,
  pathPrefix: string,
  state: LeakScanState,
  evidence: GateEvidence[],
): void {
  if (typeof node === 'string') {
    scanString(node, pathPrefix, state, evidence);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, idx) => {
      walkPayload(item, `${pathPrefix}[${idx}]`, state, evidence);
    });
    return;
  }
  if (isObject(node)) {
    for (const [k, v] of Object.entries(node)) {
      walkPayload(v, `${pathPrefix}.${k}`, state, evidence);
    }
  }
}

export function makeInternalKnowledgeLeakGuardGate(
  mode: GateMode = 'hard_fail',
): Gate<InternalKnowledgeLeakInput> {
  return {
    name: 'internal-knowledge-leak-guard',
    mode,
    check: (input: InternalKnowledgeLeakInput): GateVerdict => {
      const evidence: GateEvidence[] = [];

      if (!input.siblingClients || input.siblingClients.length === 0) {
        return pass('internal-knowledge-leak-guard', mode, MEASURED_BY);
      }

      const state = buildScanState(input.siblingClients);
      walkPayload(input.contextPayload, '$', state, evidence);

      if (evidence.length === 0) {
        return pass('internal-knowledge-leak-guard', mode, MEASURED_BY);
      }

      return fail(
        'internal-knowledge-leak-guard',
        mode,
        MEASURED_BY,
        `${evidence.length} internal knowledge leak(s) detected in context payload for targetClientId=${input.targetClientId}`,
        evidence,
      );
    },
  };
}
