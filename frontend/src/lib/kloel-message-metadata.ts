'use client';

import type { KloelStreamPhase } from './kloel-stream-events';
import { sanitizeAssistantVisibleContent } from './kloel-message-sanitize';

const WHITESPACE_G_RE = /\s+/g;
const TRAILING_DOTS_RE = /[.]+$/;

const PRIVATE_CREDENTIAL_TOOL_RE =
  /(?:sk-[a-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|api[_ -]?key\s*[:=]|authorization\s*[:=]|bearer\s+[a-z0-9._-]{20,}|password\s*[:=]|secret\s*[:=])/i;

export function formatAssistantTraceToolLabel(toolName?: string | null): string | undefined {
  const raw = String(toolName || '').trim();
  if (!raw) {
    return undefined;
  }
  if (PRIVATE_CREDENTIAL_TOOL_RE.test(raw)) {
    return 'ferramenta protegida';
  }

  return raw.replace(WHITESPACE_G_RE, ' ').trim() || undefined;
}

export function sanitizeAssistantTraceLabel(value: string): string {
  return sanitizeAssistantVisibleContent(value)
    .replace(
      /\bAção enviada para [^.]+\.?/gi,
      'Consultei contexto operacional relevante antes de responder.',
    )
    .replace(
      /\bObservação recebida de [^.]+\.?/gi,
      'Incorporei as observações encontradas antes de responder.',
    )
    .replace(
      /\bFalha observada em [^.]+\.?/gi,
      'Registrei uma limitação operacional antes de responder.',
    )
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function createMessageUiId(prefix: string) {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

/** Assistant response version shape. */
export interface AssistantResponseVersion {
  /** Id property. */
  id: string;
  /** Content property. */
  content: string;
  /** Created at property. */
  createdAt?: string | undefined;
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
  createdAt?: string | undefined;
  /** Tool property. */
  tool?: string | undefined;
  /** Span id property. */
  spanId?: string | undefined;
  /** Artifact id property. */
  artifactId?: string | undefined;
  /** Duration ms property. */
  durationMs?: number | undefined;
  /** Success property. */
  success?: boolean | undefined;
  /** Public-facing risk label for controlled tool actions. */
  riskLabel?: string | undefined;
  /** Public risk tier for controlled tool actions. */
  riskLevel?: 'low' | 'medium' | 'high' | undefined;
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
    .filter((entry): entry is AssistantResponseVersion => !!entry)
    .map((entry) => ({ ...entry, content: sanitizeAssistantVisibleContent(entry.content) }));

  if (versions.length > 0) {
    return versions;
  }

  if (!String(fallbackContent || '').trim()) {
    return [];
  }

  return [
    {
      id: fallbackId,
      content: sanitizeAssistantVisibleContent(fallbackContent),
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
  const fallback = sanitizeAssistantTraceLabel(String(fallbackSummary || ''));
  if (fallback) {
    return fallback;
  }

  const labels = Array.from(
    new Set(
      entries
        .map((entry) =>
          sanitizeAssistantTraceLabel(entry.label)
            .replace(WHITESPACE_G_RE, ' ')
            .trim()
            .replace(TRAILING_DOTS_RE, ''),
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
  const kind =
    candidate.kind === 'tool_call' ||
    candidate.kind === 'tool_result' ||
    candidate.kind === 'system'
      ? candidate.kind
      : 'status';
  const tool =
    typeof candidate.tool === 'string' ? formatAssistantTraceToolLabel(candidate.tool) : undefined;
  const success = typeof candidate.success === 'boolean' ? candidate.success : undefined;
  const riskLabel =
    typeof candidate.riskLabel === 'string'
      ? sanitizeAssistantTraceLabel(candidate.riskLabel)
      : undefined;
  const riskLevel =
    candidate.riskLevel === 'low' || candidate.riskLevel === 'medium' || candidate.riskLevel === 'high'
      ? candidate.riskLevel
      : undefined;
  const normalizedLabel = sanitizeAssistantTraceLabel(label);

  return {
    id:
      typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id
        : createMessageUiId(`trace_${rawPhase}`),
    kind,
    phase: rawPhase,
    label: normalizedLabel,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : undefined,
    tool,
    spanId: typeof candidate.spanId === 'string' ? candidate.spanId : undefined,
    artifactId: typeof candidate.artifactId === 'string' ? candidate.artifactId : undefined,
    durationMs: typeof candidate.durationMs === 'number' ? candidate.durationMs : undefined,
    success,
    riskLabel,
    riskLevel,
  };
}

function lowercaseLeadingCharacter(value: string) {
  if (!value) {
    return value;
  }
  return value.charAt(0).toLowerCase() + value.slice(1);
}
