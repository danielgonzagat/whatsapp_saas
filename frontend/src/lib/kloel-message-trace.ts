'use client';

import type { KloelStreamEvent, KloelStreamPhase } from './kloel-stream-events';
import { applyReasoningStreamEventToMetadata } from './kloel-message-reasoning';
import {
  type AssistantProcessingTraceEntry,
  createMessageUiId,
  formatAssistantTraceToolLabel,
  getAssistantProcessingTrace,
  normalizeAssistantMessageMetadata,
  sanitizeAssistantTraceLabel,
  summarizeAssistantProcessingTrace,
} from './kloel-message-metadata';

export function formatLiveTraceToolLabel(toolName?: string | null): string {
  return formatAssistantTraceToolLabel(toolName) || 'ação operacional';
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
    const toolLabel = formatLiveTraceToolLabel(event.tool);
    return {
      id: event.callId ? `${event.callId}:call` : `trace_tool_call_${Date.now()}`,
      kind: 'tool_call',
      phase: 'tool_calling',
      label: sanitizeAssistantTraceLabel('Consultei contexto operacional relevante antes de responder.'),
      createdAt: new Date().toISOString(),
      tool: toolLabel,
      ...(spanId ? { spanId } : {}),
    };
  }

  if (event.type === 'tool_result') {
    const spanId = event.spanId || event.callId;
    const toolLabel = formatLiveTraceToolLabel(event.tool);
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
      tool: toolLabel,
      success: event.success,
      ...(spanId ? { spanId } : {}),
      ...(event.artifactId ? { artifactId: event.artifactId } : {}),
      ...(typeof event.durationMs === 'number' ? { durationMs: event.durationMs } : {}),
    };
  }

  return null;
}
