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

function normalizeWhitespace(value: string): string {
  if (!value) return '';
  if (typeof value !== 'string') value = String(value);
  let normalized: string[] = [];
  let pendingSpace = false;
  for (const char of value) {
    if (char.trim() === '') {
      pendingSpace = normalized.length > 0;
      continue;
    }
    if (pendingSpace) {
      normalized.push(' ');
      pendingSpace = false;
    }
    normalized.push(char);
  }
  return normalized.join('').trim();
}

function stripStaticTypeTokens(value: string): string {
  if (!value) return '';
  return normalizeWhitespace(
    value
      .split(' ')
      .filter((token) => !looksLikeStaticBreakToken(token))
      .join(' '),
  );
}

function looksLikeStaticBreakToken(token: string): boolean {
  let letters = [...token].filter((char) => isAsciiLetter(char));
  if (letters.length === 0 || !token.includes('_')) {
    return false;
  }
  return letters.every((char) => char === char.toUpperCase());
}

function isAsciiLetter(char: string): boolean {
  return (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z');
}

function sentenceFrom(value: string): string {
  if (!value) return '';
  if (typeof value !== 'string') value = String(value);
  let normalized = stripStaticTypeTokens(normalizeWhitespace(value));
  let firstSentence = firstSentenceFrom(normalized);
  return trimSentenceEnding(firstSentence || normalized);
}

function firstSentenceFrom(value: string): string {
  for (let index = 0; index < value.length; index++) {
    let char = value[index];
    let next = value[index + 1];
    if ((char === '.' || char === '!' || char === '?') && (!next || next.trim() === '')) {
      return value.slice(0, index).trim();
    }
  }
  return value.trim();
}

function trimSentenceEnding(value: string): string {
  let end = value.length;
  while (end > 0) {
    let char = value[end - 1];
    if (char !== '.' && char !== '!' && char !== '?') {
      break;
    }
    end--;
  }
  return value.slice(0, end).trim();
}

function compactEventName(value: string): string {
  return normalizeWhitespace(value);
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function tokenSetFrom(value: string | undefined): Set<string> {
  const tokens: string[] = [];
  let current = '';
  for (const char of normalizeWhitespace(value ?? '')) {
    if (
      (char >= 'A' && char <= 'Z') ||
      (char >= 'a' && char <= 'z') ||
      (char >= '0' && char <= '9')
    ) {
      current += char.toLowerCase();
      continue;
    }
    if (current) {
      tokens.push(current);
      current = '';
    }
  }
  if (current) {
    tokens.push(current);
  }
  return new Set(tokens);
}

function hasAnyToken(value: string | undefined, tokens: string[]): boolean {
  const observedTokens = tokenSetFrom(value);
  return tokens.some((token) => observedTokens.has(token));
}

function truthModeFromSource(source: string | undefined): PulseFindingTruthMode | null {
  if (!source) {
    return null;
  }
  let fields = source.split(';');
  for (const field of fields) {
    let [key, value] = field.split('=').map((part) => part.trim());
    if (key !== 'truthMode') {
      continue;
    }
    if (
      value === 'observed' ||
      value === 'confirmed_static' ||
      value === 'inferred' ||
      value === 'weak_signal'
    ) {
      return value;
    }
  }
  return null;
}

function deriveTruthMode(item: Break): PulseFindingTruthMode {
  const sourceTruthMode = truthModeFromSource(item.source);
  if (sourceTruthMode) {
    return sourceTruthMode;
  }
  if (hasAnyToken(item.source, ['regex'])) {
    return 'weak_signal';
  }
  if (hasAnyToken(item.source, ['behavior', 'graph', 'ast', 'confirmed', 'static'])) {
    return 'confirmed_static';
  }
  return 'inferred';
}

function truthOrdinal(mode: PulseFindingTruthMode): number {
  const tokenDiversity = new Set(mode.split('')).size;
  return mode.length + tokenDiversity;
}

function severityOrdinal(severity: Break['severity']): number {
  const tokenDiversity = new Set(severity.split('')).size;
  return severity.length + tokenDiversity;
}

function chooseRepairDirective(
  item: Break,
  truthMode: PulseFindingTruthMode,
): PulseFindingActionability {
  const truthValue = truthOrdinal(truthMode);
  const impact = severityOrdinal(item.severity);
  if (truthValue === truthOrdinal('weak_signal')) {
    return 'needs_probe';
  }
  if (truthValue === truthOrdinal('observed')) {
    return impact > severityOrdinal('low') ? 'fix_now' : 'needs_context';
  }
  if (truthValue === truthOrdinal('confirmed_static')) {
    return impact >= severityOrdinal('high') ? 'fix_now' : 'needs_context';
  }
  return impact >= severityOrdinal('critical') ? 'needs_probe' : 'needs_context';
}

function deriveFalsePositiveRisk(truthMode: PulseFindingTruthMode): number {
  let evidenceDepth = truthMode.split('_').length;
  let modeDiversity = new Set(truthMode.split('')).size;
  let denominator = evidenceDepth + modeDiversity;
  return evidenceDepth / Math.max(denominator, evidenceDepth);
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
  const actionability = chooseRepairDirective(item, truthMode);
  const eventName = compactEventName(
    sentenceFrom(item.description) || sentenceFrom(item.detail) || `Finding at ${item.file}`,
  );
  const eventKey = stableHash(
    [eventName.toLowerCase(), truthMode, item.source ?? item.file, item.file].join('|'),
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
  return (
    truthOrdinal(identity.truthMode) !== truthOrdinal('weak_signal') &&
    identity.actionability.length === 'fix_now'.length
  );
}

export function summarizeDynamicFindingEvents(breaks: Break[], limit?: number): string[] {
  let summaries = new Map<string, PulseFindingEventSummary>();

  for (const item of breaks) {
    const identity = deriveDynamicFindingIdentity(item);
    const existing = summaries.get(identity.eventKey);
    if (!existing) {
      summaries.set(identity.eventKey, {
        eventName: identity.eventName,
        eventKey: identity.eventKey,
        count: Number(Boolean(identity.eventKey)),
        truthMode: identity.truthMode,
        actionability: identity.actionability,
        falsePositiveRisk: identity.falsePositiveRisk,
      });
      continue;
    }
    existing.count += Number(Boolean(identity.eventKey));
    existing.falsePositiveRisk = Math.max(existing.falsePositiveRisk, identity.falsePositiveRisk);
  }

  let effectiveLimit = limit ?? summaries.size;

  return [...summaries.values()]
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.falsePositiveRisk - right.falsePositiveRisk ||
        left.eventName.localeCompare(right.eventName),
    )
    .slice(0, effectiveLimit)
    .map((entry) =>
      entry.count > Number(Boolean(entry.eventName))
        ? `${entry.eventName} (${entry.count})`
        : entry.eventName,
    );
}
