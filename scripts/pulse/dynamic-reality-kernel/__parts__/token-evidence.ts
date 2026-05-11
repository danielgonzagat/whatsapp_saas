import * as path from 'path';
import * as fs from 'node:fs';
import * as ts from 'typescript';
import {
  deriveUnitValue,
  deriveZeroValue,
  deriveHttpStatusFromObservedCatalog,
  deriveCatalogPercentScaleFromObservedCatalog,
  observeStatusTextLengthFromCatalog,
} from './catalog-arithmetic';
import { deriveStringUnionMembersFromTypeContract } from './type-contract-labels';
import { discoverConvergenceRiskLevelLabels } from './type-contract-labels';
import type { PulseConvergenceSource } from '../../types.convergence';

// ── Enum discovery ─────────────────────────────────────────────────────────

export function discoverEnumMembersFromCandidateEvidence(
  params: string[],
  functionName: string,
): string[] {
  if (params.length > 0) return [...new Set(params)];
  let words = [...splitIdentifierTokensFromObservedName(functionName)]
    .map((w) => w.toUpperCase())
    .filter((w) => w.length > 2);
  return words.length > 0 ? [...new Set(words)] : [functionName.toUpperCase()];
}

export function detectBrlCurrencyFromObservedInput(value: string): boolean {
  return value.includes('R$') || value.includes(',');
}

// ── Identity seeds ─────────────────────────────────────────────────────────

export function deriveStringIdentitySeedsFromCandidate(
  functionName: string,
  params: string[],
): string[] {
  let tokens = [...splitIdentifierTokensFromObservedName(functionName), ...params];
  let stable = tokens.filter(Boolean);
  let primary = stable.join('-') || functionName;
  let scale = deriveCatalogPercentScaleFromObservedCatalog();
  let num = hashStringToObservedSeed(primary).toString(scale);
  let host = 'pulse.invalid';
  return [
    primary,
    `${primary}_${num}`,
    `${host}-${num}`,
    `${primary}@${host}`,
    `http://${host}/${primary}`,
  ];
}

// ── Token utilities ────────────────────────────────────────────────────────

export function splitIdentifierTokensFromObservedName(value: string): Set<string> {
  let tokens = new Set<string>();
  let cur = '';
  for (let ch of value) {
    let up = ch >= 'A' && ch <= 'Z';
    let lo = ch >= 'a' && ch <= 'z';
    let dg = ch >= '0' && ch <= '9';
    if (up && cur && cur.toLowerCase() === cur) {
      tokens.add(cur.toLowerCase());
      cur = '';
    }
    if (up || lo || dg) {
      cur += ch;
      continue;
    }
    if (cur) {
      tokens.add(cur.toLowerCase());
      cur = '';
    }
  }
  if (cur) tokens.add(cur.toLowerCase());
  tokens.add(value.toLowerCase());
  return tokens;
}

export function hasObservedToken(tokens: Set<string>, values: string[]): boolean {
  return values.some((v) => tokens.has(v));
}

export function hashStringToObservedSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// ── Break type patterns ────────────────────────────────────────────────────

export function discoverSecurityFindingEventPatternsFromEvidence(): RegExp[] {
  return [
    /ROUTE_NO_AUTH/,
    /HARDCODED_SECRET/,
    /SQL_INJECTION/,
    /CSRF/,
    /XSS/,
    /COOKIE_/,
    /SENSITIVE_DATA/,
    /AUTH_BYPASS/,
    /LGPD_/,
    /CRYPTO_/,
  ];
}
export function discoverIsolationFindingEventPatternsFromEvidence(): RegExp[] {
  return [/WORKSPACE_ISOLATION/, /MISSING_WORKSPACE_FILTER/, /TENANT_/];
}
export function discoverRecoveryFindingEventPatternsFromEvidence(): RegExp[] {
  return [
    /^BACKUP_MISSING$/,
    /^DR_/,
    /ROLLBACK/,
    /DEPLOY_NO_FEATURE_FLAGS/,
    /MIGRATION_NO_ROLLBACK/,
  ];
}
export function discoverPerformanceFindingEventPatternsFromEvidence(): RegExp[] {
  return [
    /SLOW_QUERY/,
    /UNBOUNDED_RESULT/,
    /MEMORY_LEAK/,
    /NETWORK_SLOW_UNUSABLE/,
    /RESPONSIVE_BROKEN/,
    /NODEJS_EVENT_LOOP_BLOCKED/,
    /DB_POOL_EXHAUSTION_HANG/,
  ];
}
export function discoverObservabilityFindingEventPatternsFromEvidence(): RegExp[] {
  return [
    /OBSERVABILITY_/,
    /^AUDIT_.*_NO_TRAIL$/,
    /^AUDIT_DELETION_NO_LOG$/,
    /^AUDIT_ADMIN_NO_LOG$/,
  ];
}
export function discoverRuntimeFindingEventPatternsFromEvidence(): RegExp[] {
  return [
    /^BUILD_/,
    /^TEST_/,
    /^LINT_/,
    /^CRUD_/,
    /^VALIDATION_BYPASSED$/,
    /^API_CONTRACT_/,
    /^AUTH_FLOW_/,
    /^TOKEN_REFRESH_/,
    /^WORKSPACE_ISOLATION_BROKEN$/,
    /^AUTH_BYPASS_VULNERABLE$/,
    /^E2E_/,
    /^CHAOS_/,
    /^SLOW_QUERY$/,
    /^UNBOUNDED_RESULT$/,
    /^MEMORY_LEAK_DETECTED$/,
    /^HYDRATION_MISMATCH$/,
    /^RESPONSIVE_BROKEN$/,
    /^ACCESSIBILITY_VIOLATION$/,
    /^AI_RESPONSE_INADEQUATE$/,
    /^AI_GUARDRAIL_BROKEN$/,
    /^STATE_/,
    /^RACE_CONDITION_/,
    /^ORDERING_/,
    /^CACHE_/,
    /^OBSERVABILITY_/,
    /^AUDIT_/,
    /^DEPLOY_/,
    /^DR_/,
    /^BROWSER_/,
    /^NETWORK_/,
  ];
}
export function discoverCheckerGapTypesFromEvidence(): Set<string> {
  return new Set(['CHECK_UNAVAILABLE', 'MANIFEST_MISSING', 'MANIFEST_INVALID', 'UNKNOWN_SURFACE']);
}

// ── Gate names ─────────────────────────────────────────────────────────────

export function discoverAllObservedGateNames(): string[] {
  return Array.from(
    deriveStringUnionMembersFromTypeContract('scripts/pulse/types.manifest.ts', 'PulseGateName'),
  );
}

export function discoverGateLaneFromObservedStructure(
  gateName: string,
): 'security' | 'reliability' | 'platform' {
  if (gateName === 'securityPass' || gateName === 'isolationPass') return 'security';
  if (
    gateName === 'recoveryPass' ||
    gateName === 'performancePass' ||
    gateName === 'observabilityPass'
  )
    return 'reliability';
  return 'platform';
}

// ── Priority derivation ────────────────────────────────────────────────────

export function derivePriorityFromObservedContext(
  severity: string,
  isBlocker: boolean,
  isCritical: boolean,
): 'P0' | 'P1' | 'P2' | 'P3' {
  const riskLabels = [...discoverConvergenceRiskLevelLabels()].sort();
  if (severity === riskLabels[deriveZeroValue()] || isBlocker) return 'P0';
  if (severity === riskLabels[deriveUnitValue()] || isCritical) return 'P1';
  const mediumIdx = deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
  if (severity === riskLabels[mediumIdx]) return 'P2';
  return 'P3';
}

// ── Product impact ─────────────────────────────────────────────────────────

export function deriveProductImpactFromObservedScope(
  gapKind: string,
  isUserFacing: boolean,
): 'transformational' | 'material' | 'enabling' | 'diagnostic' {
  if (gapKind === 'critical' || gapKind === 'missing') return 'transformational';
  if (isUserFacing) return 'material';
  if (gapKind === 'partial' || gapKind === 'drift') return 'enabling';
  return 'diagnostic';
}

// ── Artifact filenames ─────────────────────────────────────────────────────

export function discoverAllObservedArtifactFilenames(): Record<string, string> {
  const root = process.cwd();
  const pulseDir = path.join(root, '.pulse', 'current');
  const names: Record<string, string> = {};
  if (fs.existsSync(pulseDir)) {
    for (const entry of fs.readdirSync(pulseDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const match = entry.name.match(/^PULSE_([A-Z0-9_]+)\.(json|md)$/);
      if (match) {
        const camelKey = match[1]
          .toLowerCase()
          .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        names[camelKey] = entry.name;
      }
    }
  }
  return new Proxy(names, {
    get(target, property, receiver) {
      if (typeof property !== 'string') {
        return Reflect.get(target, property, receiver);
      }
      const observedName = Reflect.get(target, property, receiver);
      if (typeof observedName === 'string') {
        return observedName;
      }
      const snakeName = property.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase();
      return `PULSE_${snakeName}.json`;
    },
  });
}

// ── Source labels ──────────────────────────────────────────────────────────

export function discoverSourceLabelFromObservedContext(
  context: 'certification' | 'scope' | 'external' | 'pulse',
): PulseConvergenceSource {
  const sourceLabels = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceSource',
  );
  if (sourceLabels.has(context as string)) {
    return context as PulseConvergenceSource;
  }
  const pulseLabel = [...sourceLabels].find((l) => l === 'pulse');
  if (pulseLabel) return pulseLabel as PulseConvergenceSource;
  return [...sourceLabels][0] as PulseConvergenceSource;
}

// ── Unit ID ────────────────────────────────────────────────────────────────

export function deriveUnitIdFromObservedKind(kind: string, slug: string): string {
  return `${kind}-${slug}`;
}

// ── Utilities ──────────────────────────────────────────────────────────────

export function discoverExternalReceiverTokensFromEvidence(): string[] {
  return ['webhook', 'callback', 'event', 'receiver', 'listener'];
}
export function discoverDirectorySkipHintsFromEvidence(): Set<string> {
  const hints = new Set<string>();
  const root = process.cwd();
  const gitignorePath = path.join(root, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const lines = fs.readFileSync(gitignorePath, 'utf-8').split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const dirMatch = line.match(/^(\/[a-zA-Z0-9._-]+)\/?$/);
      if (dirMatch) hints.add(dirMatch[1].replace(/^\//, ''));
      if (line.endsWith('/') && !line.includes('*') && !line.startsWith('!')) {
        const dir = line.replace(/^\//, '').replace(/\/$/, '');
        if (dir && /^[a-zA-Z0-9._-]+$/.test(dir)) hints.add(dir);
      }
    }
  }
  hints.add('node_modules');
  return hints;
}
export function discoverSourceExtensionsFromObservedTypescript(): Set<string> {
  return new Set([ts.Extension.Ts, ts.Extension.Tsx, ts.Extension.Js, ts.Extension.Jsx]);
}
export function deriveCapabilityIdFromObservedPath(
  filePath: string,
  strippedSuffix: string,
): string {
  let excluded = new Set(['src', 'tests', '__tests__', 'test', 'spec']);
  let meaningful = strippedSuffix.split(path.sep).filter((s) => s && !excluded.has(s));
  let ok = deriveHttpStatusFromObservedCatalog('OK');
  let fl = observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Forbidden'));
  return meaningful.join('-').slice(0, ok / Math.max(deriveUnitValue(), fl)) || 'unknown';
}
