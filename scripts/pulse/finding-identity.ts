import type { Break } from './types';

export type PulseFindingTruthMode = 'observed' | 'confirmed_static' | 'inferred' | 'weak_signal';
export type PulseFindingActionability = 'fix_now' | 'needs_probe' | 'needs_context' | 'ignore';

export interface PulseDynamicFindingIdentity {
  eventName: string;
  eventKey: string;
  truthMode: PulseFindingTruthMode;
  actionability: PulseFindingActionability;
  falsePositiveRisk: number;
  evidenceChain: string[];
}

export interface PulseFindingEventSummary {
  eventName: string;
  eventKey: string;
  count: number;
  truthMode: PulseFindingTruthMode;
  actionability: PulseFindingActionability;
  falsePositiveRisk: number;
}

const MAX_EVENT_NAME_LENGTH = 96;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripStaticTypeTokens(value: string): string {
  return value
    .replace(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+){1,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentenceFrom(value: string): string {
  const normalized = stripStaticTypeTokens(normalizeWhitespace(value));
  const firstSentence = normalized.split(/[.!?]\s+/)[0]?.trim() ?? '';
  return (firstSentence || normalized).replace(/[.!?]+$/g, '').trim();
}

function compactEventName(value: string): string {
  const compact = normalizeWhitespace(value);
  if (compact.length <= MAX_EVENT_NAME_LENGTH) {
    return compact;
  }
  return `${compact.slice(0, MAX_EVENT_NAME_LENGTH - 3).trim()}...`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sourceSuggestsObserved(source: string | undefined): boolean {
  return /\b(runtime|sentry|datadog|prometheus|playwright|e2e|probe|external|scenario)\b/i.test(
    source ?? '',
  );
}

function sourceSuggestsStaticConfirmation(source: string | undefined): boolean {
  return /\b(ast|dataflow|structural|graph|contract|schema|codacy|typescript|ts-morph)\b/i.test(
    source ?? '',
  );
}

function textSuggestsWeakSignal(item: Break): boolean {
  return /\b(regex|pattern|string scan|heuristic|nearby|token|word|allowlist|hardcoded list)\b/i.test(
    `${item.description} ${item.detail} ${item.source ?? ''}`,
  );
}

function deriveTruthMode(item: Break): PulseFindingTruthMode {
  if (sourceSuggestsObserved(item.source)) {
    return 'observed';
  }
  if (sourceSuggestsStaticConfirmation(item.source)) {
    return 'confirmed_static';
  }
  if (textSuggestsWeakSignal(item)) {
    return 'weak_signal';
  }
  return 'inferred';
}

function deriveActionability(
  item: Break,
  truthMode: PulseFindingTruthMode,
): PulseFindingActionability {
  if (truthMode === 'weak_signal') {
    return 'needs_probe';
  }
  if (truthMode === 'observed') {
    return item.severity === 'low' ? 'needs_context' : 'fix_now';
  }
  if (truthMode === 'confirmed_static') {
    return item.severity === 'critical' || item.severity === 'high' ? 'fix_now' : 'needs_context';
  }
  return item.severity === 'critical' ? 'needs_probe' : 'needs_context';
}

function deriveFalsePositiveRisk(truthMode: PulseFindingTruthMode): number {
  if (truthMode === 'observed') return 0.05;
  if (truthMode === 'confirmed_static') return 0.2;
  if (truthMode === 'inferred') return 0.45;
  return 0.8;
}

function evidenceChainFor(item: Break, truthMode: PulseFindingTruthMode): string[] {
  return [
    `source:${item.source ?? 'unknown'}`,
    `truth:${truthMode}`,
    `severity:${item.severity}`,
    `location:${item.file}:${item.line}`,
    `description:${sentenceFrom(item.description)}`,
  ];
}

export function deriveDynamicFindingIdentity(item: Break): PulseDynamicFindingIdentity {
  const truthMode = deriveTruthMode(item);
  const actionability = deriveActionability(item, truthMode);
  const eventName = compactEventName(
    sentenceFrom(item.description) || sentenceFrom(item.detail) || `Finding at ${item.file}`,
  );
  const eventKey = stableHash(
    [eventName.toLowerCase(), truthMode, item.source ?? 'unknown', item.file].join('|'),
  );

  return {
    eventName,
    eventKey,
    truthMode,
    actionability,
    falsePositiveRisk: deriveFalsePositiveRisk(truthMode),
    evidenceChain: evidenceChainFor(item, truthMode),
  };
}

export function isBlockingDynamicFinding(item: Break): boolean {
  const identity = deriveDynamicFindingIdentity(item);
  return identity.actionability === 'fix_now' && identity.truthMode !== 'weak_signal';
}

export function summarizeDynamicFindingEvents(breaks: Break[], limit: number = 8): string[] {
  const summaries = new Map<string, PulseFindingEventSummary>();

  for (const item of breaks) {
    const identity = deriveDynamicFindingIdentity(item);
    const existing = summaries.get(identity.eventKey);
    if (!existing) {
      summaries.set(identity.eventKey, {
        eventName: identity.eventName,
        eventKey: identity.eventKey,
        count: 1,
        truthMode: identity.truthMode,
        actionability: identity.actionability,
        falsePositiveRisk: identity.falsePositiveRisk,
      });
      continue;
    }
    existing.count += 1;
    existing.falsePositiveRisk = Math.max(existing.falsePositiveRisk, identity.falsePositiveRisk);
  }

  return [...summaries.values()]
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.falsePositiveRisk - right.falsePositiveRisk ||
        left.eventName.localeCompare(right.eventName),
    )
    .slice(0, limit)
    .map((entry) => (entry.count > 1 ? `${entry.eventName} (${entry.count})` : entry.eventName));
}
