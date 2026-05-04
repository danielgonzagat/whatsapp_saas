// ─── Signal Semantics & Classification ──────────────────────────────────────

import { tokenize } from '../../signal-normalizers';
import {
  bound01,
  average,
  positiveObservedFloor,
  observedMeanOrSelf,
  observedSpread,
  positiveSignal,
  trendSignal,
} from './math-helpers';
import { flattenPayloadTokens, tokenizeEvidenceTerm } from './json-parsing';
import type { CanonicalExternalSignal } from './json-parsing';
import type {
  RuntimeSignal,
  SignalType,
  SignalSeverity,
  SignalAction,
  OperationalEvidenceKind,
} from '../../types.runtime-fusion';

export function mapSeverity(value: number): SignalSeverity {
  if (value >= 0.9) return 'critical';
  if (value >= 0.7) return 'high';
  if (value >= 0.4) return 'medium';
  if (value >= 0.2) return 'low';
  return 'info';
}

export function isCriticalSignal(signal: RuntimeSignal): boolean {
  return signal.severity === mapSeverity(Number.POSITIVE_INFINITY);
}

export function isHighSignal(signal: RuntimeSignal): boolean {
  return signal.severity === 'high';
}

export function deriveAction(severity: SignalSeverity, type: SignalType): SignalAction {
  if (severity === 'critical') return 'block_deploy';
  if (severity === 'high') return 'block_merge';
  if (type === 'deploy_failure' || type === 'test_failure') return 'block_merge';
  if (type === 'graph_staleness') return 'prioritize_fix';
  if (severity === 'medium') return 'create_issue';
  return 'log_only';
}

function evidenceTokens(signal: CanonicalExternalSignal, scope: 'all' | 'payload'): Set<string> {
  return new Set(
    scope === 'payload'
      ? flattenPayloadTokens(signal.observedPayload)
      : [
          ...tokenize(signal.source),
          ...tokenize(signal.type),
          ...tokenize(signal.summary),
          ...signal.relatedFiles.flatMap(tokenize),
          ...flattenPayloadTokens(signal.observedPayload),
        ],
  );
}

function tokenDensity(tokens: Set<string>, pattern: RegExp): number {
  let hits = [...tokens].filter((token) => pattern.test(token)).length;
  if (hits === 0) return 0;
  return bound01(hits / Math.max(1, Math.sqrt(tokens.size)));
}

export function evidenceMass(
  kind: OperationalEvidenceKind,
  signal: CanonicalExternalSignal,
  scope: 'all' | 'payload',
): number {
  let tokens = evidenceTokens(signal, scope);
  let lexicalMass =
    kind === 'runtime'
      ? tokenDensity(
          tokens,
          /^(trace|span|status|exception|error|crash|timeout|duration|latency|runtime|response|p\d+)$/,
        )
      : kind === 'change'
        ? tokenDensity(
            tokens,
            /^(commit|sha|pull|request|branch|workflow|deployment|deploy|build|diff|changed|coverage|test|regression|flaky)$/,
          )
        : kind === 'static'
          ? tokenDensity(
              tokens,
              /^(rule|finding|complexity|duplication|lint|graph|file|hotspot|quality|smell|stale|index)$/,
            )
          : kind === 'dependency'
            ? tokenDensity(
                tokens,
                /^(package|dependency|version|lockfile|manifest|cve|vulnerability|vuln|advisory|supply)$/,
              )
            : 0;
  let provenanceMass = scope === 'payload' ? 0 : positiveSignal(signal.relatedFiles.length);
  let runtimeMass =
    kind === 'runtime'
      ? Math.max(
          signal.baselineValue,
          positiveSignal(signal.affectedUsers),
          trendSignal(signal.trend),
        )
      : 0;
  return bound01((lexicalMass + provenanceMass + runtimeMass) / 2);
}

export function deriveOperationalEvidenceKind(
  signal: CanonicalExternalSignal,
): OperationalEvidenceKind {
  let candidates: OperationalEvidenceKind[] = ['runtime', 'change', 'static', 'dependency'];
  let ranked = candidates
    .map((kind) => ({
      kind,
      score: evidenceMass(kind, signal, 'all') + evidenceMass(kind, signal, 'payload'),
    }))
    .sort((a, b) => b.score - a.score);

  let best = ranked[0];
  let positiveScores = ranked.map((candidate) => candidate.score).filter((score) => score > 0);
  let dynamicFloor = positiveObservedFloor(positiveScores);
  let dynamicSeparation =
    observedSpread(positiveScores) / Math.max(1, Math.sqrt(positiveScores.length));
  let minimumEvidence = Math.min(
    observedMeanOrSelf(positiveScores, 0),
    dynamicFloor + dynamicSeparation,
  );
  return best && best.score >= minimumEvidence ? best.kind : 'external';
}

export function deriveSignalType(
  evidenceKind: OperationalEvidenceKind,
  signal: CanonicalExternalSignal,
): SignalType {
  let tokens = new Set([
    ...tokenize(signal.type),
    ...tokenize(signal.summary),
    ...flattenPayloadTokens(signal.observedPayload),
  ]);
  let hasAny = (...keys: string[]): boolean => keys.some((key) => tokens.has(key));

  if (evidenceKind === 'runtime') {
    if (hasAny('error', 'exception', 'crash', 'timeout', 'statuscode500', 'statuscode')) {
      return 'error';
    }
    if (hasAny('latency', 'duration', 'response', 'p95', 'p99')) return 'latency';
    if (hasAny('throughput', 'rps')) return 'throughput';
    if (hasAny('saturation', 'cpu', 'memory', 'disk')) return 'saturation';
    return 'runtime';
  }

  if (evidenceKind === 'change') {
    if (hasAny('deploy', 'deployment', 'ci', 'build', 'workflow')) return 'deploy_failure';
    if (hasAny('test', 'coverage', 'regression', 'flaky')) return 'test_failure';
    return 'change';
  }

  if (evidenceKind === 'static') {
    if (hasAny('stale', 'graph', 'index')) return 'graph_staleness';
    if (hasAny('quality', 'codacy', 'lint', 'complexity', 'duplication', 'smell', 'rule')) {
      return 'code_quality';
    }
    return 'static';
  }

  if (evidenceKind === 'dependency') return 'dependency';
  return 'external';
}
