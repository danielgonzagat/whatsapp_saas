'use client';

/** Kloel stream phase type. */
export type KloelStreamPhase = 'thinking' | 'streaming' | 'tool_calling' | 'tool_result';

export type KloelStreamToolRiskLevel = 'low' | 'medium' | 'high';

export interface KloelStreamToolRisk {
  /** Public risk tier, safe for user-facing trace copy. */
  level: KloelStreamToolRiskLevel;
  /** Product-facing label. Raw tool names are not accepted here. */
  label: string;
  /** Compact score produced by the backend risk classifier. */
  score: number;
  /** Sanitized factors, never raw args or executable tool identifiers. */
  factors: readonly string[];
}

/** Kloel stream thread event shape. */
export interface KloelStreamThreadEvent {
  /** Type property. */
  type: 'thread';
  /** Conversation id property. */
  conversationId: string;
  /** Title property. */
  title?: string | undefined;
}

/** Kloel stream status event shape. */
export interface KloelStreamStatusEvent {
  /** Type property. */
  type: 'status';
  /** Phase property. */
  phase: KloelStreamPhase;
  /** Label property. */
  label?: string | undefined;
  /** Streaming property. */
  streaming?: boolean | undefined;
}

/** Per-turn memory recall event, safe for the user-facing trace. */
export interface KloelStreamMemoryLoadedEvent {
  /** Type property. */
  type: 'memory_loaded';
  /** Public-safe count of injected memory/profile/preference signals. */
  signalCount: number;
  /** Frontend-normalized public label, when present. */
  label?: string | undefined;
  /** Backend public message emitted by the live stream. */
  message?: string | undefined;
}

/** Kloel stream content event shape. */
export interface KloelStreamContentEvent {
  /** Type property. */
  type: 'content';
  /** Content property. */
  content: string;
}

/** Kloel stream tool call event shape. */
export interface KloelStreamToolCallEvent {
  /** Type property. */
  type: 'tool_call';
  /** Call id property. */
  callId?: string | undefined;
  /** Span id property. */
  spanId?: string | undefined;
  /** Tool property. */
  tool: string;
  /** Public risk metadata from backend execution classifier. */
  risk?: KloelStreamToolRisk | undefined;
}

/** Kloel stream tool result event shape. */
export interface KloelStreamToolResultEvent {
  /** Type property. */
  type: 'tool_result';
  /** Call id property. */
  callId?: string | undefined;
  /** Span id property. */
  spanId?: string | undefined;
  /** Tool property. */
  tool: string;
  /** Success property. */
  success?: boolean | undefined;
  /** Artifact id property. */
  artifactId?: string | undefined;
  /** Duration ms property. */
  durationMs?: number | undefined;
  /** Public risk metadata from backend execution classifier. */
  risk?: KloelStreamToolRisk | undefined;
}

/** Kloel stream done event shape. */
export interface KloelStreamDoneEvent {
  /** Type property. */
  type: 'done';
  /** Metadata property. */
  metadata?: Record<string, unknown>;
}

/** Kloel stream error event shape. */
export interface KloelStreamErrorEvent {
  /** Type property. */
  type: 'error';
  /** Error property. */
  error: string;
  /** Content property. */
  content?: string | undefined;
  /** Done property. */
  done?: boolean | undefined;
}

/** Kloel stream reasoning summary event shape. */
export interface KloelStreamReasoningSummaryEvent {
  /** Type property. */
  type: 'reasoning_summary';
  /** Text property. */
  text: string;
}

/** Kloel stream reasoning delta event shape. */
export interface KloelStreamReasoningDeltaEvent {
  /** Type property. */
  type: 'reasoning_delta';
  /** Text property. */
  text: string;
}

/** Kloel stream reasoning done event shape. */
export interface KloelStreamReasoningDoneEvent {
  /** Type property. */
  type: 'reasoning_done';
  /** Duration ms property. */
  durationMs: number;
}

/** Rich artifact kinds the stream can advertise without exposing internal tools. */
export type KloelStreamArtifactKind =
  | 'markdown'
  | 'html'
  | 'svg'
  | 'mermaid'
  | 'react'
  | 'pdf'
  | 'docx'
  | 'pptx'
  | 'xlsx'
  | 'image'
  | 'data'
  | 'code';

/** Kloel stream file event shape. */
export interface KloelStreamFileEvent {
  /** Type property. */
  type: 'file';
  /** Name property. */
  name: string;
  /** Stable public artifact id, when the producer has one. */
  artifactId?: string | undefined;
  /** Render/edit strategy, when known by the producer. */
  kind?: KloelStreamArtifactKind | undefined;
  /** Inline text content for editable artifacts. */
  content?: string | undefined;
  /** Server-side content reference, when bytes are stored elsewhere. */
  contentRef?: string | undefined;
  /** Meta property. */
  meta?: string | undefined;
  /** Url property. */
  url?: string | undefined;
  /** Download url property. */
  downloadUrl?: string | undefined;
  /** Whether the artifact can be edited in the chat panel. */
  editable?: boolean | undefined;
  /** Whether the producer considers the artifact durable beyond the stream. */
  persistent?: boolean | undefined;
}

/** Kloel stream event type. */
export type KloelStreamEvent =
  | KloelStreamThreadEvent
  | KloelStreamStatusEvent
  | KloelStreamMemoryLoadedEvent
  | KloelStreamContentEvent
  | KloelStreamToolCallEvent
  | KloelStreamToolResultEvent
  | KloelStreamReasoningSummaryEvent
  | KloelStreamReasoningDeltaEvent
  | KloelStreamReasoningDoneEvent
  | KloelStreamFileEvent
  | KloelStreamDoneEvent
  | KloelStreamErrorEvent;

function normalizePhase(raw: unknown): KloelStreamPhase | null {
  switch (String(raw || '').trim()) {
    case 'thinking':
      return 'thinking';
    case 'streaming':
    case 'streaming_token':
      return 'streaming';
    case 'tool_calling':
      return 'tool_calling';
    case 'tool_result':
      return 'tool_result';
    default:
      return null;
  }
}

function tryAppendThread(event: Record<string, unknown>, events: KloelStreamEvent[]): void {
  const hasConversationId = typeof event.conversationId === 'string';
  if (!hasConversationId) {
    return;
  }
  if (event.type !== 'thread' && !hasConversationId) {
    return;
  }
  events.push({
    type: 'thread',
    conversationId: event.conversationId as string,
    title: typeof event.title === 'string' ? event.title : undefined,
  });
}

function tryAppendStatus(event: Record<string, unknown>, events: KloelStreamEvent[]): void {
  const normalizedPhase = normalizePhase(event.phase);
  if (event.type !== 'status' || !normalizedPhase) {
    return;
  }
  events.push({
    type: 'status',
    phase: normalizedPhase,
    label: typeof event.message === 'string' ? event.message : undefined,
    streaming: event.streaming === true || normalizedPhase === 'streaming',
  });
}

function tryAppendMemoryLoaded(
  event: Record<string, unknown>,
  events: KloelStreamEvent[],
): void {
  if (event.type !== 'memory_loaded') {
    return;
  }
  const rawCount = typeof event.signalCount === 'number' && Number.isFinite(event.signalCount)
    ? event.signalCount
    : 0;
  const signalCount = Math.max(0, Math.floor(rawCount));
  const label = typeof event.message === 'string' ? event.message.trim() : '';
  events.push({
    type: 'memory_loaded',
    signalCount,
    label:
      label ||
      (signalCount === 1
        ? '1 memória relevante encontrada.'
        : signalCount > 1
          ? `${signalCount} memórias relevantes encontradas.`
          : 'Nada relevante encontrado na memória.'),
  });
}

const PUBLIC_TOOL_LABELS: Record<string, string> = {
  'code outline': 'inspeção da arquitetura interna',
  'search codebase': 'busca na arquitetura interna',
  'code detect issues': 'auditoria da arquitetura interna',
  'run backend tests': 'validação operacional',
  'search web': 'pesquisa na web',
  'brave search': 'pesquisa na web',
  'web search': 'pesquisa na web',
  'local search': 'busca local',
  'refine response': 'mesa de refinamento',
  'search agent memory': 'consulta de memória',
  'search agent sessions': 'consulta de histórico',
  'get agent artifact': 'consulta de arquivo',
  'upsert agent skill': 'atualização operacional',
  'record agent skill outcome': 'registro operacional',
  'remember user info': 'memória atualizada',
  'mind.capability.extract structured text': 'extração estruturada',
  'mind.capability.advise response depth': 'calibração de profundidade',
  'mind.capability.refine prompt': 'refinamento de pedido',
  'create site': 'criação de site',
  'create image': 'criação de imagem',
  'create document': 'criação de documento',
  'create artifact': 'criação de artifact',
  'list products': 'catálogo de produtos',
  'get settings': 'configurações da conta',
  'get billing status': 'status da assinatura',
  'request anticipation': 'antecipação de recebíveis',
  'request withdrawal': 'solicitação de saque',
  'list sales': 'consulta de vendas',
  'create product': 'criação de produto',
  'send email': 'envio de mensagem',
  'send message': 'envio de mensagem',
  'self.health': 'saúde operacional',
};

const PUBLIC_TOOL_LABEL_SET = new Set(Object.values(PUBLIC_TOOL_LABELS));

function normalizeToolName(tool: string): string {
  return String(tool || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizePublicToolLabel(tool: string): string {
  const raw = String(tool || '').trim();
  if (!raw) {
    return 'ação operacional';
  }
  if (PUBLIC_TOOL_LABEL_SET.has(raw)) {
    return raw;
  }

  const normalized = normalizeToolName(raw);
  const mapped = PUBLIC_TOOL_LABELS[normalized] ?? PUBLIC_TOOL_LABELS[raw];
  if (mapped) {
    return mapped;
  }
  if (/\b(?:search|query|lookup|get|list|find|memory|session|history)\b/.test(normalized)) {
    return 'consulta operacional';
  }
  return 'ação operacional';
}

export function normalizeToolRisk(value: unknown): KloelStreamToolRisk | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const level = value.level;
  if (level !== 'low' && level !== 'medium' && level !== 'high') {
    return undefined;
  }
  const label = typeof value.label === 'string' ? value.label.trim() : '';
  const score = typeof value.score === 'number' && Number.isFinite(value.score) ? value.score : 0;
  if (!label || score < 0) {
    return undefined;
  }
  const factors = Array.isArray(value.factors)
    ? value.factors.filter(
        (factor): factor is string => typeof factor === 'string' && factor.trim().length > 0,
      )
    : [];
  return {
    level,
    label,
    score,
    factors: factors.slice(0, 4),
  };
}

function tryAppendToolCall(event: Record<string, unknown>, events: KloelStreamEvent[]): void {
  if (event.type !== 'tool_call' || typeof event.tool !== 'string') {
    return;
  }
  const risk = normalizeToolRisk(event.risk);
  events.push({
    type: 'tool_call',
    callId: typeof event.callId === 'string' ? event.callId : undefined,
    spanId: typeof event.spanId === 'string' ? event.spanId : undefined,
    tool: normalizePublicToolLabel(event.tool),
    ...(risk ? { risk } : {}),
  });
}

function tryAppendToolResult(event: Record<string, unknown>, events: KloelStreamEvent[]): void {
  if (event.type !== 'tool_result' || typeof event.tool !== 'string') {
    return;
  }
  const risk = normalizeToolRisk(event.risk);
  events.push({
    type: 'tool_result',
    callId: typeof event.callId === 'string' ? event.callId : undefined,
    spanId: typeof event.spanId === 'string' ? event.spanId : undefined,
    tool: normalizePublicToolLabel(event.tool),
    success: typeof event.success === 'boolean' ? event.success : undefined,
    artifactId: typeof event.artifactId === 'string' ? event.artifactId : undefined,
    durationMs: typeof event.durationMs === 'number' ? event.durationMs : undefined,
    ...(risk ? { risk } : {}),
  });
}

function tryAppendContent(event: Record<string, unknown>, events: KloelStreamEvent[]): void {
  if (event.type !== 'content' || typeof event.content !== 'string' || event.content.length === 0) {
    return;
  }
  events.push({
    type: 'content',
    content: event.content,
  });
}

function tryAppendError(event: Record<string, unknown>, events: KloelStreamEvent[]): void {
  if (event.type !== 'error' || typeof event.error !== 'string' || event.error.length === 0) {
    return;
  }
  events.push({
    type: 'error',
    error: event.error,
    content:
      typeof event.content === 'string' && event.content.length > 0 ? event.content : undefined,
    done: event.done === true,
  });
}

function tryAppendReasoningSummary(
  event: Record<string, unknown>,
  events: KloelStreamEvent[],
): void {
  if (
    event.type !== 'reasoning_summary' ||
    typeof event.text !== 'string' ||
    event.text.length === 0
  ) {
    return;
  }
  events.push({ type: 'reasoning_summary', text: event.text });
}

function tryAppendReasoningDelta(event: Record<string, unknown>, events: KloelStreamEvent[]): void {
  if (event.type !== 'reasoning_delta' || typeof event.text !== 'string' || event.text.length === 0) {
    return;
  }
  // Surface the streamed reasoning text token-by-token so the live thinking
  // timeline can render the real model reasoning as it arrives (per the
  // reasoning_delta contract). The text field carries the delta payload.
  events.push({ type: 'reasoning_delta', text: event.text });
}

function tryAppendReasoningDone(event: Record<string, unknown>, events: KloelStreamEvent[]): void {
  if (event.type !== 'reasoning_done' || typeof event.durationMs !== 'number') {
    return;
  }
  events.push({ type: 'reasoning_done', durationMs: event.durationMs });
}

function isStreamArtifactKind(value: unknown): value is KloelStreamArtifactKind {
  switch (value) {
    case 'markdown':
    case 'html':
    case 'svg':
    case 'mermaid':
    case 'react':
    case 'pdf':
    case 'docx':
    case 'pptx':
    case 'xlsx':
    case 'image':
    case 'data':
    case 'code':
      return true;
    default:
      return false;
  }
}

function tryAppendFile(event: Record<string, unknown>, events: KloelStreamEvent[]): void {
  if (event.type !== 'file' || typeof event.name !== 'string' || event.name.length === 0) {
    return;
  }
  events.push({
    type: 'file',
    name: event.name,
    artifactId: typeof event.artifactId === 'string' ? event.artifactId : undefined,
    kind: isStreamArtifactKind(event.kind) ? event.kind : undefined,
    content: typeof event.content === 'string' ? event.content : undefined,
    contentRef: typeof event.contentRef === 'string' ? event.contentRef : undefined,
    meta: typeof event.meta === 'string' ? event.meta : undefined,
    url: typeof event.url === 'string' ? event.url : undefined,
    downloadUrl: typeof event.downloadUrl === 'string' ? event.downloadUrl : undefined,
    editable: typeof event.editable === 'boolean' ? event.editable : undefined,
    persistent: typeof event.persistent === 'boolean' ? event.persistent : undefined,
  });
}

const PRIVATE_DONE_METADATA_KEYS = new Set(['capability', 'capabilityError']);

function sanitizeDoneMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (!isRecord(metadata)) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (PRIVATE_DONE_METADATA_KEYS.has(key)) {
      continue;
    }
    sanitized[key] = value;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function shouldAppendDone(event: Record<string, unknown>, events: KloelStreamEvent[]): boolean {
  if (event.type !== 'done') {
    return false;
  }
  if (events.some((entry) => entry.type === 'done')) {
    return false;
  }
  if (events.some((entry) => entry.type === 'error')) {
    return false;
  }
  return true;
}

/** Parse kloel stream payload. */
export function parseKloelStreamPayload(payload: unknown): KloelStreamEvent[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const event = payload as Record<string, unknown>;
  const events: KloelStreamEvent[] = [];

  tryAppendThread(event, events);
  tryAppendStatus(event, events);
  tryAppendMemoryLoaded(event, events);
  tryAppendToolCall(event, events);
  tryAppendToolResult(event, events);
  tryAppendContent(event, events);
  tryAppendError(event, events);
  tryAppendReasoningSummary(event, events);
  tryAppendReasoningDelta(event, events);
  tryAppendReasoningDone(event, events);
  tryAppendFile(event, events);

  if (shouldAppendDone(event, events)) {
    const metadata = sanitizeDoneMetadata(event.metadata);
    events.push({ type: 'done', ...(metadata !== undefined ? { metadata } : {}) });
  }

  return events;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
