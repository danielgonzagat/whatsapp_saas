import { Prisma } from '@prisma/client';
import { sanitizeAgentRuntimeText } from './agent-runtime.sanitizer';
import type {
  AgentRuntimeHygieneState,
  AgentRuntimeSessionRecallGroup,
  AgentRuntimeSourceProvenance,
  AgentRuntimeSourceStamp,
  AgentRuntimeTurnRecord,
} from './agent-runtime.types';

export const SEARCH_CATEGORIES = [
  'agent_event',
  'agent_skill',
  'agent_curated',
  'product',
  'objection',
] as const;

const SNIPPET_RADIUS = 120;
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TTL_BY_CATEGORY: Record<string, number> = {
  agent_curated: 365 * 24 * 60 * 60 * 1000,
  agent_skill: 180 * 24 * 60 * 60 * 1000,
  agent_event: 90 * 24 * 60 * 60 * 1000,
  product: 30 * 24 * 60 * 60 * 1000,
  objection: 60 * 24 * 60 * 60 * 1000,
  compressed_context: 30 * 24 * 60 * 60 * 1000,
};

export const PROVENANCE_WEIGHT: Record<AgentRuntimeSourceProvenance, number> = {
  agent_curated: 1.0,
  agent_skill: 0.92,
  compressed_context: 0.85,
  agent_event: 0.78,
  product: 0.65,
  objection: 0.65,
  kloel_memory: 0.5,
};

export function tokenizeAgentRuntimeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9\u00C0-\u024F]/gi, ''))
    .filter((t) => t.length >= 2);
}

export function extractAgentRuntimeSnippet(content: string, tokens: string[]): string {
  if (!content) {
    return '';
  }
  const lower = content.toLowerCase();
  let bestStart = 0;
  for (const token of tokens) {
    const idx = lower.indexOf(token.toLowerCase());
    if (idx !== -1) {
      const start = Math.max(0, idx - SNIPPET_RADIUS);
      if (bestStart === 0 || start < bestStart) {
        bestStart = start;
      }
    }
  }
  const end = Math.min(content.length, bestStart + SNIPPET_RADIUS * 2);
  return `${bestStart > 0 ? '…' : ''}${content.slice(bestStart, end)}${
    end < content.length ? '…' : ''
  }`;
}

export function extractAgentRuntimeMatchWindow(
  content: string,
  query: string,
  tokens: string[],
  maxChars: number,
): string {
  if (!content || content.length <= maxChars) {
    return content;
  }
  const lower = content.toLowerCase();
  const positions = collectMatchPositions(lower, query.toLowerCase(), tokens);
  if (positions.length === 0) {
    return `${content.slice(0, maxChars)}…`;
  }
  positions.sort((a, b) => a - b);
  let bestStart = 0;
  let bestCount = 0;
  for (const position of positions) {
    const start = Math.max(0, position - Math.floor(maxChars / 4));
    const end = Math.min(content.length, start + maxChars);
    const covered = positions.filter((candidate) => candidate >= start && candidate < end).length;
    if (covered > bestCount) {
      bestCount = covered;
      bestStart = Math.max(0, Math.min(start, content.length - maxChars));
    }
  }
  const end = Math.min(content.length, bestStart + maxChars);
  return `${bestStart > 0 ? '…' : ''}${content.slice(bestStart, end)}${
    end < content.length ? '…' : ''
  }`;
}

export function agentRuntimeSessionGroupKey(
  metadata: Prisma.JsonValue | null,
  key: string,
): { id: string; source: AgentRuntimeSessionRecallGroup['source'] } {
  const record = asRecord(metadata);
  const threadId = asString(record.threadId);
  if (threadId) {
    return { id: threadId, source: 'thread' };
  }
  const sessionId = asString(record.sessionId);
  if (sessionId) {
    return { id: sessionId, source: 'session' };
  }
  const contactId = asString(record.contactId);
  return contactId ? { id: contactId, source: 'contact' } : { id: key, source: 'memory' };
}

export function finalizeAgentRuntimeSessionRecallGroup(
  group: AgentRuntimeSessionRecallGroup,
  query: string,
  tokens: string[],
): AgentRuntimeSessionRecallGroup {
  const orderedMessages = [...group.messages]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8);
  const transcript = orderedMessages
    .map((message) => `[${message.category}] ${message.snippet || message.content}`)
    .join('\n\n');
  const transcriptWindow = extractAgentRuntimeMatchWindow(transcript, query, tokens, 2000);
  return {
    ...group,
    messages: orderedMessages,
    transcriptWindow,
    summary: sanitizeAgentRuntimeText(
      `session=${group.sessionId}; source=${group.source}; matches=${group.matchCount}; latest=${group.updatedAt}; focus=${query}; evidence=${transcriptWindow}`,
      2400,
    ),
  };
}

export function mapCategoryToProvenance(category: string): AgentRuntimeSourceProvenance {
  const mapping: Record<string, AgentRuntimeSourceProvenance> = {
    agent_event: 'agent_event',
    agent_skill: 'agent_skill',
    agent_curated: 'agent_curated',
    product: 'product',
    objection: 'objection',
  };
  return mapping[category] ?? 'kloel_memory';
}

export function ttlForCategory(category: string): number {
  return TTL_BY_CATEGORY[category] ?? DEFAULT_TTL_MS;
}

export function computeFreshnessDecay(ageMs: number, ttlMs: number): number {
  if (ttlMs <= 0) {
    return 1;
  }
  return 1 - Math.pow(Math.min(1, ageMs / ttlMs), 0.45);
}

export function computeSourceConfidence(
  matched: number,
  total: number,
  provenanceWeight: number,
  freshnessDecay: number,
): number {
  if (total === 0) {
    return 0;
  }
  const matchRatio = matched / total;
  const baseConfidence =
    matchRatio >= 1 ? 0.92 : matchRatio >= 0.66 ? 0.78 : matchRatio >= 0.33 ? 0.55 : 0.35;
  return Math.round((baseConfidence * 0.45 + provenanceWeight * 0.35 + freshnessDecay * 0.2) * 100) / 100;
}

export function buildAgentRuntimeSourceStamp(
  row: { category: string; createdAt: Date },
  matchCount: number,
  provenance: AgentRuntimeSourceProvenance,
  ttlMs: number,
  ageMs: number,
  freshnessDecay: number,
  confidence: number,
): AgentRuntimeSourceStamp {
  const hygieneState = computeHygieneState(ageMs, ttlMs);
  const retentionScore = computeRetentionScore(
    PROVENANCE_WEIGHT[provenance],
    freshnessDecay,
    matchCount,
  );
  return {
    source: provenance,
    confidence,
    freshness: hygieneState === 'fresh' || hygieneState === 'aging' ? 'fresh' : 'stale',
    truthMode: 'observed',
    observedAt: row.createdAt.toISOString(),
    provenance,
    ttlMs,
    expiresAt: new Date(row.createdAt.getTime() + ttlMs).toISOString(),
    retentionScore,
  };
}

export function buildAgentRuntimeTurnContent(turn: AgentRuntimeTurnRecord): string {
  return [
    `channel=${sanitizeAgentRuntimeText(turn.channel, 80)}`,
    turn.contactId ? `contact=${sanitizeAgentRuntimeText(turn.contactId, 80)}` : '',
    turn.threadId ? `thread=${sanitizeAgentRuntimeText(turn.threadId, 80)}` : '',
    `user: ${sanitizeAgentRuntimeText(turn.userMessage, 2000)}`,
    turn.assistantMessage ? `assistant: ${sanitizeAgentRuntimeText(turn.assistantMessage, 2000)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function collectMatchPositions(lower: string, queryLower: string, tokens: string[]): number[] {
  const positions: number[] = [];
  let phraseIndex = lower.indexOf(queryLower);
  while (phraseIndex !== -1) {
    positions.push(phraseIndex);
    phraseIndex = lower.indexOf(queryLower, phraseIndex + queryLower.length);
  }
  if (positions.length === 0 && tokens.length > 1) {
    collectClusteredTokenPositions(lower, tokens, positions);
  }
  if (positions.length === 0) {
    for (const token of tokens) {
      positions.push(...matchPositions(lower, token.toLowerCase()));
    }
  }
  return positions;
}

function collectClusteredTokenPositions(lower: string, tokens: string[], positions: number[]): void {
  const termPositions = tokens.map((token) => ({
    token,
    positions: matchPositions(lower, token.toLowerCase()),
  }));
  const rarest = [...termPositions].sort((a, b) => a.positions.length - b.positions.length)[0];
  for (const position of rarest?.positions ?? []) {
    if (
      termPositions.every((entry) =>
        entry.positions.some((candidate) => Math.abs(candidate - position) < 200),
      )
    ) {
      positions.push(position);
    }
  }
}

function matchPositions(contentLower: string, tokenLower: string): number[] {
  const positions: number[] = [];
  let index = contentLower.indexOf(tokenLower);
  while (index !== -1) {
    positions.push(index);
    index = contentLower.indexOf(tokenLower, index + tokenLower.length);
  }
  return positions;
}

function computeRetentionScore(
  provenanceWeight: number,
  freshnessDecay: number,
  matchCount: number,
): number {
  const score = provenanceWeight * 0.4 + freshnessDecay * 0.35 + Math.min(matchCount, 5) * 0.05;
  return Math.round(score * 100) / 100;
}

function computeHygieneState(ageMs: number, ttlMs: number): AgentRuntimeHygieneState {
  if (ttlMs <= 0) {
    return 'fresh';
  }
  const ratio = ageMs / ttlMs;
  if (ratio < 0.3) return 'fresh';
  if (ratio < 0.6) return 'aging';
  if (ratio < 0.9) return 'stale';
  if (ratio < 1.0) return 'expired';
  return 'retired';
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
