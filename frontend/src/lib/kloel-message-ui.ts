'use client';

import type { KloelStreamEvent, KloelStreamPhase } from './kloel-stream-events';

const WHITESPACE_G_RE = /\s+/g;
const SEPARATOR_G_RE = /[_-]+/g;
const TRAILING_DOTS_RE = /[.]+$/;

function createMessageUiId(prefix: string) {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

/** Assistant response version shape. */
export interface AssistantResponseVersion {
  /** Id property. */
  id: string;
  /** Content property. */
  content: string;
  /** Created at property. */
  createdAt?: string;
  /** Source property. */
  source: 'initial' | 'regenerated';
}

/** Assistant processing trace entry shape. */
export interface AssistantProcessingTraceEntry {
  /** Id property. */
  id: string;
  /** Kind property. */
  kind: 'status' | 'tool_call' | 'tool_result' | 'system';
  /** Phase property. */
  phase: KloelStreamPhase;
  /** Label property. */
  label: string;
  /** Created at property. */
  createdAt?: string;
  /** Tool property. */
  tool?: string;
  /** Success property. */
  success?: boolean;
}

/** Normalize assistant message metadata. */
export function normalizeAssistantMessageMetadata(
  metadata: unknown,
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }

  return metadata as Record<string, unknown>;
}

/** Get assistant response versions. */
export function getAssistantResponseVersions(
  metadata: unknown,
  fallbackContent: string,
  fallbackId: string,
): AssistantResponseVersion[] {
  const normalizedMetadata = normalizeAssistantMessageMetadata(metadata);
  const rawVersions = Array.isArray(normalizedMetadata?.responseVersions)
    ? normalizedMetadata.responseVersions
    : [];

  const versions = rawVersions
    .map((entry) => normalizeResponseVersion(entry))
    .filter((entry): entry is AssistantResponseVersion => !!entry);

  if (versions.length > 0) {
    return versions;
  }

  if (!String(fallbackContent || '').trim()) {
    return [];
  }

  return [
    {
      id: fallbackId,
      content: fallbackContent,
      source: 'initial',
    },
  ];
}

/** Get assistant processing trace. */
export function getAssistantProcessingTrace(metadata: unknown): AssistantProcessingTraceEntry[] {
  const normalizedMetadata = normalizeAssistantMessageMetadata(metadata);
  const rawEntries = Array.isArray(normalizedMetadata?.processingTrace)
    ? normalizedMetadata.processingTrace
    : [];

  return rawEntries
    .map((entry) => normalizeProcessingTraceEntry(entry))
    .filter((entry): entry is AssistantProcessingTraceEntry => !!entry);
}

/** Summarize assistant processing trace. */
export function summarizeAssistantProcessingTrace(
  entries: AssistantProcessingTraceEntry[],
  fallbackSummary?: string,
): string {
  const fallback = String(fallbackSummary || '').trim();
  if (fallback) {
    return fallback;
  }

  const labels = Array.from(
    new Set(
      entries
        .map((entry) =>
          entry.label.replace(WHITESPACE_G_RE, ' ').trim().replace(TRAILING_DOTS_RE, ''),
        )
        .filter(Boolean),
    ),
  );

  if (labels.length === 0) {
    return '';
  }

  if (labels.length === 1) {
    return `${labels[0]}.`;
  }

  if (labels.length === 2) {
    return `${labels[0]} e ${lowercaseLeadingCharacter(labels[1])}.`;
  }

  return `${labels[0]}, ${lowercaseLeadingCharacter(labels[1])} e ${lowercaseLeadingCharacter(labels[labels.length - 1])}.`;
}

/** Append assistant trace from event. */
export function appendAssistantTraceFromEvent(
  metadata: unknown,
  event: KloelStreamEvent,
): Record<string, unknown> | undefined {
  const normalizedMetadata = normalizeAssistantMessageMetadata(metadata) || {};
  const nextEntry = createAssistantTraceEntryFromStreamEvent(event);

  if (!nextEntry) {
    return Object.keys(normalizedMetadata).length > 0 ? normalizedMetadata : undefined;
  }

  const currentEntries = getAssistantProcessingTrace(normalizedMetadata);
  const previousEntry = currentEntries[currentEntries.length - 1];

  if (
    previousEntry &&
    previousEntry.phase === nextEntry.phase &&
    previousEntry.label === nextEntry.label &&
    previousEntry.kind === nextEntry.kind
  ) {
    return {
      ...normalizedMetadata,
      processingSummary: summarizeAssistantProcessingTrace(
        currentEntries,
        typeof normalizedMetadata.processingSummary === 'string'
          ? normalizedMetadata.processingSummary
          : undefined,
      ),
    };
  }

  const nextEntries = [...currentEntries, nextEntry].slice(-16);

  return {
    ...normalizedMetadata,
    processingTrace: nextEntries,
    processingSummary: summarizeAssistantProcessingTrace(nextEntries),
  };
}

/** Create assistant system trace entry. */
export function createAssistantSystemTraceEntry(
  phase: KloelStreamPhase,
  label: string,
): AssistantProcessingTraceEntry {
  return {
    id: createMessageUiId(`trace_${phase}`),
    kind: 'system',
    phase,
    label: String(label || '').trim(),
    createdAt: new Date().toISOString(),
  };
}

function createAssistantTraceEntryFromStreamEvent(
  event: KloelStreamEvent,
): AssistantProcessingTraceEntry | null {
  if (event.type === 'status') {
    const label = String(event.label || '').trim();
    if (!label) {
      return null;
    }

    return createAssistantSystemTraceEntry(event.phase, label);
  }

  if (event.type === 'tool_call') {
    return {
      id: event.callId || `trace_tool_call_${Date.now()}`,
      kind: 'tool_call',
      phase: 'tool_calling',
      label: `Executando ${formatTraceToolLabel(event.tool)}.`,
      createdAt: new Date().toISOString(),
      tool: event.tool,
    };
  }

  if (event.type === 'tool_result') {
    return {
      id: event.callId || `trace_tool_result_${Date.now()}`,
      kind: 'tool_result',
      phase: 'tool_result',
      label: event.success
        ? `Concluiu ${formatTraceToolLabel(event.tool)}.`
        : `Falhou ao executar ${formatTraceToolLabel(event.tool)}.`,
      createdAt: new Date().toISOString(),
      tool: event.tool,
      success: event.success,
    };
  }

  return null;
}

function normalizeResponseVersion(value: unknown): AssistantResponseVersion | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const content = typeof candidate.content === 'string' ? candidate.content : '';
  if (!content.trim()) {
    return null;
  }

  return {
    id:
      typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id
        : createMessageUiId('resp'),
    content,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : undefined,
    source: candidate.source === 'regenerated' ? 'regenerated' : 'initial',
  };
}

function normalizeProcessingTraceEntry(value: unknown): AssistantProcessingTraceEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const label = typeof candidate.label === 'string' ? candidate.label : '';
  if (!label.trim()) {
    return null;
  }

  const rawPhase =
    candidate.phase === 'tool_calling' ||
    candidate.phase === 'tool_result' ||
    candidate.phase === 'streaming'
      ? candidate.phase
      : 'thinking';

  return {
    id:
      typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id
        : createMessageUiId(`trace_${rawPhase}`),
    kind:
      candidate.kind === 'tool_call' ||
      candidate.kind === 'tool_result' ||
      candidate.kind === 'system'
        ? candidate.kind
        : 'status',
    phase: rawPhase,
    label,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : undefined,
    tool: typeof candidate.tool === 'string' ? candidate.tool : undefined,
    success: typeof candidate.success === 'boolean' ? candidate.success : undefined,
  };
}

function formatTraceToolLabel(toolName?: string | null) {
  const normalized = String(toolName || 'ferramenta')
    .trim()
    .replace(SEPARATOR_G_RE, ' ')
    .replace(WHITESPACE_G_RE, ' ')
    .toLowerCase();

  return normalized || 'ferramenta';
}

function lowercaseLeadingCharacter(value: string) {
  if (!value) {
    return value;
  }
  return value.charAt(0).toLowerCase() + value.slice(1);
}
