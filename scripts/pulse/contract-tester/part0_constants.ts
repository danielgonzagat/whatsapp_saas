/**
 * Part 0: Shared constants and type catalogs.
 * Foundation layer — no dependencies on other parts.
 */

import type {
  ContractStatus,
  ProviderContract,
  SchemaDiffSeverity,
} from '../types.contract-tester';
import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel/type-contract-labels';
import {
  discoverAllObservedArtifactFilenames,
} from '../dynamic-reality-kernel/token-evidence';
import { discoverNestjsDecoratorNamesFromTypeEvidence } from '../dynamic-reality-kernel/evidence-domain';
import { discoverStructuralNodeKindLabels } from '../dynamic-reality-kernel/type-contract-engines';

// ── Artifact filenames ──────────────────────────────────────────────────────

export const CONTRACT_EVIDENCE_FILENAME =
  discoverAllObservedArtifactFilenames().contractEvidence ?? 'PULSE_CONTRACT_EVIDENCE.json';

export const MIGRATIONS_DIRS = ['backend/prisma/migrations', 'prisma/migrations'];

export const HTTP_METHOD_PATTERN = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/;

// ── Kernel-derived type-union catalogs ──────────────────────────────────────

export const CONTRACT_STATUS_LABELS = deriveStringUnionMembersFromTypeContract(
  'scripts/pulse/types.contract-tester.ts',
  'ContractStatus',
);

export const DIFF_SEVERITY_LABELS = deriveStringUnionMembersFromTypeContract(
  'scripts/pulse/types.contract-tester.ts',
  'SchemaDiffSeverity',
);

export const AUTH_TYPE_LABELS = deriveStringUnionMembersFromTypeContract(
  'scripts/pulse/types.contract-tester.ts',
  'authType',
);

export const NODE_KIND_LABELS = discoverStructuralNodeKindLabels();

export const NESTJS_DECORATOR_NAMES = discoverNestjsDecoratorNamesFromTypeEvidence();

// ── SQL parsing matchers ────────────────────────────────────────────────────

export const DROP_TABLE_RE = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[`"]?(\w+)[`"]?/gi;
export const DROP_COLUMN_RE = /DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?[`"]?(\w+)[`"]?/gi;
export const ALTER_COLUMN_TYPE_RE =
  /ALTER\s+COLUMN\s+[`"]?(\w+)[`"]?\s+(?:SET\s+DATA\s+)?TYPE\s+(\w+(?:\s*\(\s*\d+\s*(?:,\s*\d+\s*)?\))?)/gi;

// ── Type-catalog predicates ─────────────────────────────────────────────────

export function isContractStatus(s: string, label: string): boolean {
  return CONTRACT_STATUS_LABELS.has(s) && s === label;
}

export function isDiffSeverity(s: string, label: string): boolean {
  return DIFF_SEVERITY_LABELS.has(s) && s === label;
}

export function isAuthType(s: string, label: string): boolean {
  return AUTH_TYPE_LABELS.has(s) && s === label;
}

export function isNodeKind(s: string, label: string): boolean {
  return NODE_KIND_LABELS.has(s) && s === label;
}

// ── Label resolvers ─────────────────────────────────────────────────────────

export function resolveAuthLabel(predicate: (s: string) => boolean): ProviderContract['authType'] {
  const found = [...AUTH_TYPE_LABELS].find(predicate);
  if (found) return found as ProviderContract['authType'];
  const fallback = [...AUTH_TYPE_LABELS][0];
  if (!fallback)
    throw new Error('resolveAuthLabel: no auth type labels available from type contract');
  return fallback as ProviderContract['authType'];
}

export function resolveSeverityLabel(predicate: (s: string) => boolean): SchemaDiffSeverity {
  const found = [...DIFF_SEVERITY_LABELS].find(predicate);
  if (found) return found as SchemaDiffSeverity;
  const fallback = [...DIFF_SEVERITY_LABELS][0];
  if (!fallback)
    throw new Error('resolveSeverityLabel: no severity labels available from type contract');
  return fallback as SchemaDiffSeverity;
}

export function resolveStatusLabel(predicate: (s: string) => boolean): ContractStatus {
  const found = [...CONTRACT_STATUS_LABELS].find(predicate);
  if (found) return found as ContractStatus;
  const fallback = [...CONTRACT_STATUS_LABELS][0];
  if (!fallback)
    throw new Error('resolveStatusLabel: no status labels available from type contract');
  return fallback as ContractStatus;
}
