'use client';

import type { KloelStreamEvent, KloelStreamPhase } from './kloel-stream-events';
import { applyReasoningStreamEventToMetadata } from './kloel-message-reasoning';
import {
  type AssistantProcessingTraceEntry,
  createMessageUiId,
  getAssistantProcessingTrace,
  normalizeAssistantMessageMetadata,
  sanitizeAssistantTraceLabel,
  summarizeAssistantProcessingTrace,
} from './kloel-message-metadata';

const WHITESPACE_G_RE = /\s+/g;

const LIVE_TOOL_DISPLAY_LABELS: Record<string, string> = {
  'code outline': 'inspeção da arquitetura interna',
  'search codebase': 'busca na arquitetura interna',
  'code detect issues': 'auditoria da arquitetura interna',
  'run backend tests': 'validação operacional',
  'search web': 'pesquisa na web',
  'refine response': 'mesa de refinamento',
  'create site': 'criação de site',
  'create image': 'criação de imagem',
  'list products': 'catálogo de produtos',
  'get settings': 'configurações da conta',
  'get billing status': 'status da assinatura',
  'request anticipation': 'antecipação de recebíveis',
  'request withdrawal': 'solicitação de saque',
  'list sales': 'consulta de vendas',
  'create product': 'criação de produto',
  'self.health': 'saúde operacional',
};

export function formatLiveTraceToolLabel(toolName?: string | null): string {
  const raw = String(toolName || 'ferramenta').trim();
  const normalized = raw.replace(/[_-]+/g, ' ').replace(WHITESPACE_G_RE, ' ').toLowerCase();
  const mapped = LIVE_TOOL_DISPLAY_LABELS[normalized] ?? LIVE_TOOL_DISPLAY_LABELS[raw];
  if (mapped) {
    return mapped;
  }
  return normalized || 'a ferramenta';
}
export function appendAssistantTraceFromEvent(
  metadata: unknown,
  event: KloelStreamEvent,
): Record<string, unknown> | undefined {
  const normalizedMetadata = normalizeAssistantMessageMetadata(metadata) || {};
  const eventMetadata =
    event.type === 'done' ? normalizeAssistantMessageMetadata(event.metadata) : undefined;
  const mergedMetadata = eventMetadata
    ? { ...normalizedMetadata, ...eventMetadata }
    : normalizedMetadata;
  const reasoningMetadata = applyReasoningStreamEventToMetadata(mergedMetadata, event);
  if (reasoningMetadata) {
    return reasoningMetadata;
  }

  const nextEntry = createAssistantTraceEntryFromStreamEvent(event);

  if (!nextEntry) {
    return Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined;
  }

  const currentEntries = getAssistantProcessingTrace(mergedMetadata);
  const previousEntry = currentEntries[currentEntries.length - 1];

  if (
    previousEntry &&
    previousEntry.phase === nextEntry.phase &&
    previousEntry.label === nextEntry.label &&
    previousEntry.kind === nextEntry.kind
  ) {
    return {
      ...mergedMetadata,
      processingSummary: summarizeAssistantProcessingTrace(
        currentEntries,
        typeof mergedMetadata.processingSummary === 'string'
          ? mergedMetadata.processingSummary
          : undefined,
      ),
    };
  }

  const nextEntries = [...currentEntries, nextEntry].slice(-16);

  return {
    ...mergedMetadata,
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
    if (event.phase === 'tool_calling' || event.phase === 'tool_result') {
      return null;
    }

    const label = String(event.label || '').trim();
    if (!label) {
      return null;
    }

    return createAssistantSystemTraceEntry(event.phase, label);
  }

  if (event.type === 'tool_call') {
    const spanId = event.spanId || event.callId;
    return {
      id: event.callId ? `${event.callId}:call` : `trace_tool_call_${Date.now()}`,
      kind: 'tool_call',
      phase: 'tool_calling',
      label: sanitizeAssistantTraceLabel(
        'Consultei contexto operacional relevante antes de responder.',
      ),
      createdAt: new Date().toISOString(),
      tool: formatLiveTraceToolLabel(event.tool),
      ...(spanId ? { spanId } : {}),
    };
  }

  if (event.type === 'tool_result') {
    const spanId = event.spanId || event.callId;
    return {
      id: event.callId ? `${event.callId}:result` : `trace_tool_result_${Date.now()}`,
      kind: 'tool_result',
      phase: 'tool_result',
      label: sanitizeAssistantTraceLabel(
        event.success
          ? 'Incorporei as observações encontradas antes de responder.'
          : 'Registrei uma limitação operacional antes de responder.',
      ),
      createdAt: new Date().toISOString(),
      tool: formatLiveTraceToolLabel(event.tool),
      success: event.success,
      ...(spanId ? { spanId } : {}),
      ...(event.artifactId ? { artifactId: event.artifactId } : {}),
      ...(typeof event.durationMs === 'number' ? { durationMs: event.durationMs } : {}),
    };
  }

  return null;
}
