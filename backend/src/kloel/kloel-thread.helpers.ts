import { Prisma } from '@prisma/client';
import { WHITESPACE_G_RE } from '../common/regex';
import { buildTimestampedRuntimeId } from './kloel-id.util';
import { type KloelStreamEvent } from './kloel-stream-events';

const TRAILING_DOTS_RE = /[.]+$/;
const SEPARATOR_G_RE = /[_-]+/g;

export interface StoredProcessingTraceEntry {
  id: string;
  kind: 'status' | 'tool_call' | 'tool_result';
  phase: 'thinking' | 'tool_calling' | 'tool_result' | 'streaming';
  label: string;
  createdAt: string;
  tool?: string;
  success?: boolean;
}

export interface StoredResponseVersion {
  id: string;
  content: string;
  createdAt: string;
  source: 'initial' | 'regenerated';
}

/**
 * Coerce a Prisma JSON metadata payload into a plain Record. Arrays and
 * non-object inputs become an empty object, matching the prior behaviour of
 * KloelThreadService#normalizeThreadMessageMetadataRecord.
 */
export function normalizeThreadMessageMetadataRecord(
  metadata?: Prisma.InputJsonValue | Prisma.JsonValue | null,
): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return { ...(metadata as Record<string, unknown>) };
}

/**
 * Merge a base metadata payload with extra fields, ignoring undefined values
 * in the extras. Returns undefined when no fields remain so callers can omit
 * the Prisma metadata field instead of writing an empty object.
 */
export function buildThreadMessageMetadata(
  baseMetadata?: Prisma.InputJsonValue,
  extraFields?: Record<string, unknown>,
): Prisma.InputJsonValue | undefined {
  const normalizedBase = normalizeThreadMessageMetadataRecord(baseMetadata);
  const normalizedExtra = Object.fromEntries(
    Object.entries(extraFields || {}).filter(([, v]) => v !== undefined),
  );
  const merged = { ...normalizedBase, ...normalizedExtra };
  return Object.keys(merged).length > 0 ? (merged as Prisma.InputJsonValue) : undefined;
}

/**
 * Reconstruct the list of stored response versions from a metadata payload,
 * falling back to a single synthesized entry when none are present and the
 * caller supplies fallback content.
 */
export function buildStoredResponseVersions(
  metadata: Prisma.InputJsonValue | Prisma.JsonValue | null | undefined,
  fallbackContent?: string,
  fallbackVersionId?: string,
): StoredResponseVersion[] {
  const normalized = normalizeThreadMessageMetadataRecord(metadata);
  const versions = Array.isArray(normalized.responseVersions)
    ? normalized.responseVersions
        .map((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return null;
          }
          const candidate = entry as Record<string, unknown>;
          const content = typeof candidate.content === 'string' ? candidate.content : '';
          if (!content.trim()) {
            return null;
          }
          const createdAt =
            typeof candidate.createdAt === 'string' && candidate.createdAt.trim()
              ? candidate.createdAt
              : new Date().toISOString();
          const source = candidate.source === 'regenerated' ? 'regenerated' : 'initial';
          const id =
            typeof candidate.id === 'string' && candidate.id.trim()
              ? candidate.id
              : `resp_${createdAt}`;
          return { id, content, createdAt, source } satisfies StoredResponseVersion;
        })
        .filter((e): e is StoredResponseVersion => !!e)
    : [];

  if (versions.length > 0) {
    return versions;
  }
  const normalizedFallback = String(fallbackContent || '');
  if (!normalizedFallback.trim()) {
    return [];
  }
  return [
    {
      id: fallbackVersionId || `resp_${Date.now()}`,
      content: normalizedFallback,
      createdAt: new Date().toISOString(),
      source: 'initial',
    },
  ];
}

/**
 * Convert a KloelStreamEvent into a StoredProcessingTraceEntry suitable for
 * persistence. Returns null when the event has no usable trace label.
 */
export function buildStoredProcessingTraceEntry(
  event: KloelStreamEvent,
): StoredProcessingTraceEntry | null {
  if (event.type === 'status') {
    const phase = event.phase === 'streaming_token' ? 'streaming' : event.phase;
    const label = String(event.message || '').trim();
    if (!label) {
      return null;
    }
    return {
      id: buildTimestampedRuntimeId(`trace_${phase}`),
      kind: 'status',
      phase,
      label,
      createdAt: new Date().toISOString(),
    };
  }
  if (event.type === 'tool_call') {
    return {
      id: event.callId || buildTimestampedRuntimeId('trace_tool_call'),
      kind: 'tool_call',
      phase: 'tool_calling',
      label: `Executando ${formatTraceToolLabel(event.tool)}.`,
      createdAt: new Date().toISOString(),
      tool: event.tool,
    };
  }
  if (event.type === 'tool_result') {
    return {
      id: event.callId || buildTimestampedRuntimeId('trace_tool_result'),
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

/**
 * Append a new processing-trace entry to an existing buffer, deduplicating
 * back-to-back entries with the same kind/phase/label and keeping the buffer
 * bounded at 16 entries.
 */
export function appendStoredProcessingTraceEntry(
  entries: StoredProcessingTraceEntry[],
  event: KloelStreamEvent,
): void {
  const nextEntry = buildStoredProcessingTraceEntry(event);
  if (!nextEntry) {
    return;
  }
  const prev = entries[entries.length - 1];
  if (
    prev &&
    prev.phase === nextEntry.phase &&
    prev.label === nextEntry.label &&
    prev.kind === nextEntry.kind
  ) {
    return;
  }
  entries.push(nextEntry);
  if (entries.length > 16) {
    entries.splice(0, entries.length - 16);
  }
}

/**
 * Build a single PT-BR summary sentence joining the unique trace labels in
 * order. Returns undefined when no labels are usable.
 */
export function buildProcessingTraceSummary(
  entries: StoredProcessingTraceEntry[],
): string | undefined {
  const labels = Array.from(
    new Set(
      entries
        .map((e) =>
          String(e.label || '')
            .replace(WHITESPACE_G_RE, ' ')
            .trim()
            .replace(TRAILING_DOTS_RE, ''),
        )
        .filter(Boolean),
    ),
  );
  if (labels.length === 0) {
    return undefined;
  }
  const first = labels[0];
  if (!first) {
    return undefined;
  }
  if (labels.length === 1) {
    return `${first}.`;
  }
  const second = labels[1];
  if (!second) {
    return undefined;
  }
  if (labels.length === 2) {
    return `${first} e ${lowercaseLeadingCharacter(second)}.`;
  }
  const last = labels[labels.length - 1];
  if (!last) {
    return `${first}, ${lowercaseLeadingCharacter(second)}.`;
  }
  return `${first}, ${lowercaseLeadingCharacter(second)} e ${lowercaseLeadingCharacter(last)}.`;
}

/** Lower-case only the leading character of a value; returns the input on falsy. */
export function lowercaseLeadingCharacter(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toLowerCase() + value.slice(1);
}

/**
 * Pretty-format a raw tool identifier (e.g. "send_whatsapp-message") into a
 * spaced lowercase phrase usable in PT-BR trace labels.
 */
export function formatTraceToolLabel(toolName?: string | null): string {
  const raw = String(toolName || 'ferramenta')
    .trim()
    .replace(SEPARATOR_G_RE, ' ')
    .replace(WHITESPACE_G_RE, ' ');
  if (!raw) {
    return 'a ferramenta';
  }
  return raw
    .split(' ')
    .map((s) => s.toLowerCase())
    .join(' ');
}

/**
 * Build the system-role memory message that injects a thread summary into the
 * chat completion payload, or null when the summary is blank.
 */
export function buildThreadSummarySystemMessage(
  summary?: string,
): import('openai/resources/chat').ChatCompletionMessageParam | null {
  const normalized = String(summary || '').trim();
  if (!normalized) {
    return null;
  }
  return {
    role: 'system',
    content: [
      '<conversation_memory>',
      'Resumo persistido da conversa até aqui:',
      normalized,
      'Use isso para manter continuidade sem repetir perguntas já respondidas.',
      '</conversation_memory>',
    ].join('\n'),
  };
}

/**
 * Extract a client-supplied request id from a Prisma metadata payload, or
 * undefined when missing/non-string/blank.
 */
export function resolveClientRequestId(metadata?: Prisma.InputJsonValue): string | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const raw = (metadata as Record<string, unknown>).clientRequestId;
  const id = typeof raw === 'string' ? raw.trim() : '';
  return id || undefined;
}
