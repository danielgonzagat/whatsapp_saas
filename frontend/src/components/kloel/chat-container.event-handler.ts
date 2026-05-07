// Agent event processing extracted from chat-container.tsx.
// Pure functions — no React, no JSX.

import type { AgentActivity, AgentStats } from './AgentConsole';
import type { AgentStreamEvent, AgentTraceEntry, AgentCursorTarget } from './chat-container.types';

/* ── Regex constants (module-level, not per-render) ── */
const SEPARATOR_G_RE = /[_-]+/g;
const WHITESPACE_G_RE = /\s+/g;
const WORD_BOUNDARY_RE = /\b\w/g;
const SENTENCE_END_RE = /[.!?]/;

const SINCRONIZANDO_CONVERSA_RE = /^Sincronizando conversa \d+ de \d+\.$/i;
const COME_ANDO_A_SINCRONIZA_RE = /^Começando a sincronização de \d+ conversas\.$/i;
const ACESSANDO_SEU_WHATS_APP_RE =
  /^(Acessando seu WhatsApp|Consegui acessar seu WhatsApp|Sincronizando suas conversas)$/i;

export function formatAgentPhaseLabel(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw === 'streaming_token') return '';
  return raw
    .replace(SEPARATOR_G_RE, ' ')
    .replace(WHITESPACE_G_RE, ' ')
    .trim()
    .replace(WORD_BOUNDARY_RE, (char) => char.toUpperCase());
}

export function deriveActivityTitle(event: AgentStreamEvent): string {
  return (
    formatAgentPhaseLabel(event.phase) ||
    String(event.message || '')
      .split(SENTENCE_END_RE)[0]
      .trim()
      .slice(0, 72) ||
    'Atividade'
  );
}

export function isStreamingAgentEvent(
  event: Pick<AgentStreamEvent, 'streaming' | 'phase' | 'meta'>,
): boolean {
  return (
    event.streaming === true || event.phase === 'streaming_token' || event.meta?.streaming === true
  );
}

export function isLowSignalSyncEvent(event: AgentStreamEvent): boolean {
  const message = String(event.message || '').trim();
  if (!message) return true;
  if (SINCRONIZANDO_CONVERSA_RE.test(message) || COME_ANDO_A_SINCRONIZA_RE.test(message)) {
    return true;
  }
  if (event.type === 'thought' && ACESSANDO_SEU_WHATS_APP_RE.test(message)) {
    return true;
  }
  return false;
}

export function isHighSignalAgentEvent(event: AgentStreamEvent): boolean {
  return ['thought', 'typing', 'action', 'proof', 'account', 'contact', 'sale', 'error'].includes(
    event.type,
  );
}

export function createAgentEventKey(event: AgentStreamEvent): string {
  return [
    event.ts || '',
    event.type || '',
    event.phase || '',
    event.runId || '',
    event.message || '',
  ].join('::');
}

export function resolveActivityType(event: AgentStreamEvent): AgentActivity['type'] {
  if (event.type === 'thought' || event.type === 'typing') return 'agent_thinking';
  if (event.type === 'action' || event.type === 'proof' || event.type === 'account')
    return 'action_executed';
  if (event.type === 'contact') return 'message_sent';
  if (event.type === 'error') return 'error';
  if (event.type === 'sale') return 'lead_qualified';
  if (event.type === 'status' && (event.phase || '').includes('session'))
    return 'connection_status';
  return 'action_executed';
}

export function resolveActivityStatus(event: AgentStreamEvent): AgentActivity['status'] {
  if (event.type === 'error') return 'error';
  if (event.type === 'thought' || event.type === 'typing') return 'pending';
  return 'success';
}

function readMetaString(
  meta: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = meta?.[key];
  return typeof value === 'string' ? value : undefined;
}

function readMetaNumber(
  meta: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = meta?.[key];
  return typeof value === 'number' ? value : undefined;
}

export function createAgentActivity(event: AgentStreamEvent): AgentActivity {
  const meta = event.meta;
  return {
    id: createAgentEventKey(event),
    type: resolveActivityType(event),
    title: deriveActivityTitle(event),
    description: event.message,
    timestamp: new Date(event.ts || Date.now()),
    status: resolveActivityStatus(event),
    metadata: {
      contactName: readMetaString(meta, 'contactName'),
      contactPhone: readMetaString(meta, 'phone'),
      messagePreview: event.message,
      actionType:
        readMetaString(meta, 'action') ||
        readMetaString(meta, 'actionType') ||
        readMetaString(meta, 'capabilityCode'),
      capabilityCode: readMetaString(meta, 'capabilityCode'),
      tacticCode: readMetaString(meta, 'tacticCode') || readMetaString(meta, 'selectedTactic'),
      conversationId: readMetaString(meta, 'conversationId'),
      workItemId: readMetaString(meta, 'workItemId'),
      conversationProofId: readMetaString(meta, 'conversationProofId'),
      accountProofId: readMetaString(meta, 'accountProofId'),
      cycleProofId: readMetaString(meta, 'cycleProofId'),
      selectedActionUtility: readMetaNumber(meta, 'selectedActionUtility'),
      selectedActionRank: readMetaNumber(meta, 'selectedActionRank'),
      betterActionCount: readMetaNumber(meta, 'betterActionCount'),
      betterExecutableActionCount: readMetaNumber(meta, 'betterExecutableActionCount'),
      nextBestActionType: readMetaString(meta, 'nextBestActionType'),
      nextBestActionUtility: readMetaNumber(meta, 'nextBestActionUtility'),
      selectedTactic: readMetaString(meta, 'selectedTactic'),
      selectedTacticUtility: readMetaNumber(meta, 'selectedTacticUtility'),
      selectedTacticRank: readMetaNumber(meta, 'selectedTacticRank'),
      betterTacticCount: readMetaNumber(meta, 'betterTacticCount'),
      nextBestTactic: readMetaString(meta, 'nextBestTactic'),
      nextBestTacticUtility: readMetaNumber(meta, 'nextBestTacticUtility'),
      utility: readMetaNumber(meta, 'utility'),
      state: readMetaString(meta, 'state'),
      errorMessage: event.type === 'error' ? event.message : undefined,
    },
  };
}

export function currentTraceDayKey(): string {
  return new Date().toLocaleDateString('sv-SE');
}

export interface AgentEventDispatch {
  setIsAgentStreamConnected: (v: boolean) => void;
  setAgentTraceEntries: React.Dispatch<React.SetStateAction<AgentTraceEntry[]>>;
  setCurrentThought: (v: string) => void;
  setAgentThoughts: React.Dispatch<React.SetStateAction<string[]>>;
  setIsAgentThinking: (v: boolean) => void;
  setAgentActivities: React.Dispatch<React.SetStateAction<AgentActivity[]>>;
  setCursorTarget: React.Dispatch<React.SetStateAction<AgentCursorTarget | null>>;
  updateAgentStats: (event: AgentStreamEvent) => void;
  agentTraceEntriesRef: React.MutableRefObject<AgentTraceEntry[]>;
  seenAgentEventsRef: React.MutableRefObject<Set<string>>;
  traceDayRef: React.MutableRefObject<string>;
  thoughtTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

export function processAgentEvent(event: AgentStreamEvent, dispatch: AgentEventDispatch): void {
  if (!event?.type || !event?.message) {
    return;
  }
  const {
    setIsAgentStreamConnected,
    setAgentTraceEntries,
    setCurrentThought,
    setAgentThoughts,
    setIsAgentThinking,
    setAgentActivities,
    setCursorTarget,
    updateAgentStats,
    agentTraceEntriesRef,
    seenAgentEventsRef,
    traceDayRef,
    thoughtTimerRef,
  } = dispatch;

  const eventTimestamp = new Date(event.ts || Date.now());

  if (
    event.type === 'heartbeat' ||
    event.phase === 'stream_ready' ||
    event.phase === 'live_stream_ready'
  ) {
    setIsAgentStreamConnected(true);
    return;
  }

  if (isStreamingAgentEvent(event)) {
    setIsAgentStreamConnected(true);
    setAgentTraceEntries((prev) => {
      const last = prev[prev.length - 1];
      const nextEntry: AgentTraceEntry = {
        id: `stream::${event.type}::${event.phase || ''}::${event.runId || ''}`,
        type: event.type,
        phase: event.phase,
        message: event.message,
        timestamp: eventTimestamp,
      };
      const next =
        last &&
        isStreamingAgentEvent({ streaming: undefined, phase: last.phase, meta: undefined }) &&
        last.type === event.type &&
        (last.phase || '') === (event.phase || '')
          ? [...prev.slice(0, -1), nextEntry]
          : [...prev.slice(-499), nextEntry];
      agentTraceEntriesRef.current = next;
      return next;
    });
    setCurrentThought(event.message);
    setAgentThoughts((prev) => {
      if (prev.length === 0) return [event.message];
      const next = [...prev];
      next[next.length - 1] = event.message;
      return next;
    });
    setIsAgentThinking(true);
    if (thoughtTimerRef.current) {
      clearTimeout(thoughtTimerRef.current);
    }
    thoughtTimerRef.current = setTimeout(() => {
      setIsAgentThinking(false);
    }, 4000);
    return;
  }

  const eventKey = createAgentEventKey(event);
  if (seenAgentEventsRef.current.has(eventKey)) {
    return;
  }
  seenAgentEventsRef.current.add(eventKey);

  const nextDayKey = currentTraceDayKey();
  if (traceDayRef.current !== nextDayKey) {
    traceDayRef.current = nextDayKey;
    agentTraceEntriesRef.current = [];
    setAgentTraceEntries([]);
    setAgentThoughts([]);
    setCurrentThought('');
  }

  const previousEntry = agentTraceEntriesRef.current[agentTraceEntriesRef.current.length - 1];
  const previousTimestamp = previousEntry?.timestamp?.getTime?.() || 0;
  const isRepeatedLowSignalMessage =
    previousEntry?.message === event.message &&
    eventTimestamp.getTime() - previousTimestamp < 30_000;

  if (isLowSignalSyncEvent(event) || isRepeatedLowSignalMessage) {
    updateAgentStats(event);
    return;
  }

  setIsAgentStreamConnected(true);
  setAgentActivities((prev) => [...prev.slice(-119), createAgentActivity(event)]);
  setAgentTraceEntries((prev) => {
    const next = [
      ...prev.slice(-499),
      {
        id: eventKey,
        type: event.type,
        phase: event.phase,
        message: event.message,
        timestamp: eventTimestamp,
      },
    ];
    agentTraceEntriesRef.current = next;
    return next;
  });
  updateAgentStats(event);

  if (typeof event.meta?.cursorX === 'number' && typeof event.meta?.cursorY === 'number') {
    setCursorTarget({
      x: event.meta.cursorX,
      y: event.meta.cursorY,
      actionType: typeof event.meta?.actionType === 'string' ? event.meta.actionType : undefined,
      text: typeof event.meta?.text === 'string' ? event.meta.text : undefined,
      timestamp: Date.now(),
    });
  }

  if (isHighSignalAgentEvent(event)) {
    setCurrentThought(event.message);
    setAgentThoughts((prev) => [...prev.slice(-4), event.message]);
    setIsAgentThinking(true);
    if (thoughtTimerRef.current) {
      clearTimeout(thoughtTimerRef.current);
    }
    thoughtTimerRef.current = setTimeout(() => {
      setIsAgentThinking(false);
    }, 4000);
    return;
  }

  setIsAgentThinking(false);
}
