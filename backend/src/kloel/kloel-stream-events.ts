import {
  formatTraceToolLabel,
  sanitizeAssistantReasoningTextForStorage,
} from './kloel-thread.helpers';

/** Kloel stream status phase type. */
type KloelStreamStatusPhase = 'thinking' | 'streaming_token' | 'tool_calling' | 'tool_result';

export type KloelToolRiskLevel = 'low' | 'medium' | 'high';

export interface KloelPublicToolRisk {
  /** Public risk tier, safe to show in the execution trace. */
  level: KloelToolRiskLevel;
  /** Product-facing label; may include a normalized public tool name, never private payloads. */
  label: string;
  /** Compact score derived from tool intent, sensitivity, blast radius and reversibility. */
  score: number;
  /** Sanitized factors that explain the score without exposing private payloads. */
  factors: readonly string[];
}

/** Kloel thread event shape. */
interface KloelThreadEvent {
  /** Type property. */
  type: 'thread';
  /** Conversation id property. */
  conversationId: string;
  /** Title property. */
  title?: string;
  /** Done property. */
  done: false;
}

/** Kloel status event shape. */
interface KloelStatusEvent {
  /** Type property. */
  type: 'status';
  /** Phase property. */
  phase: KloelStreamStatusPhase;
  /** Streaming property. */
  streaming?: boolean;
  /** Message property. */
  message?: string;
  /** Done property. */
  done: false;
}

/** Public per-turn memory recall event shape. */
interface KloelMemoryLoadedEvent {
  /** Type property. */
  type: 'memory_loaded';
  /** Public-safe count of model-injected memory/profile/preference signals. */
  signalCount: number;
  /** Product-facing summary, never raw memory content. */
  message: string;
  /** Done property. */
  done: false;
}

/** Kloel content event shape. */
interface KloelContentEvent {
  /** Type property. */
  type: 'content';
  /** Content property. */
  content: string;
  /** Done property. */
  done: false;
}

/** Kloel tool call event shape. */
interface KloelToolCallEvent {
  /** Type property. */
  type: 'tool_call';
  /** Call id property. */
  callId: string;
  /** Span id property. */
  spanId?: string;
  /** Tool property. */
  tool: string;

  /** Public risk metadata derived from the tool intent and sanitized arguments. */
  risk?: KloelPublicToolRisk;
  /** Done property. */
  done: false;
}

/** Kloel tool result event shape. */
interface KloelToolResultEvent {
  /** Type property. */
  type: 'tool_result';
  /** Call id property. */
  callId: string;
  /** Span id property. */
  spanId?: string;
  /** Tool property. */
  tool: string;
  /** Success property. */
  success: boolean;

  /** Artifact id property. */
  artifactId?: string;
  /** Duration ms property. */
  durationMs?: number;
  /** Public risk metadata derived from the tool intent and sanitized result. */
  risk?: KloelPublicToolRisk;
  /** Done property. */
  done: false;
}

/** Kloel error event shape. */
interface KloelErrorEvent {
  /** Type property. */
  type: 'error';
  /** Error property. */
  error: string;
  /** Content property. */
  content?: string;
  /** Done property. */
  done: boolean;
}

/** Kloel done event shape. */
interface KloelDoneEvent {
  /** Type property. */
  type: 'done';
  /** Done property. */
  done: true;
  /** Metadata property. */
  metadata?: Record<string, unknown>;
}

/** Kloel reasoning summary event shape (header summary derived from real reasoning). */
interface KloelReasoningSummaryEvent {
  /** Type property. */
  type: 'reasoning_summary';
  /** Text property. */
  text: string;
  /** Done property. */
  done: false;
}

/** Kloel reasoning delta event shape. Carries the real provider reasoning text streamed to the UI. */
interface KloelReasoningDeltaEvent {
  /** Type property. */
  type: 'reasoning_delta';
  /** Text property. */
  text: string;
  /** Done property. */
  done: false;
}

/** Kloel reasoning done event shape (reasoning to answer transition with measured duration). */
interface KloelReasoningDoneEvent {
  /** Type property. */
  type: 'reasoning_done';
  /** Duration ms property. */
  durationMs: number;
  /** Done property. */
  done: false;
}

/** Rich artifact kinds the stream can advertise without exposing internal tools. */
export type KloelFileArtifactKind =
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

/** Kloel file event shape (a delivered/generated artifact card). */
interface KloelFileEvent {
  /** Type property. */
  type: 'file';
  /** Name property. */
  name: string;
  /** Stable public artifact id, when the producer has one. */
  artifactId?: string;
  /** Render/edit strategy, when known by the producer. */
  kind?: KloelFileArtifactKind;
  /** Inline text content for editable artifacts. */
  content?: string;
  /** Server-side content reference, when bytes are stored elsewhere. */
  contentRef?: string;
  /** Meta property. */
  meta?: string;
  /** Url property. */
  url?: string;
  /** Download url property. */
  downloadUrl?: string;
  /** Whether the artifact can be edited in the chat panel. */
  editable?: boolean;
  /** Whether the producer considers the artifact durable beyond the stream. */
  persistent?: boolean;
  /** Done property. */
  done: false;
}

/** Kloel stream event type. */
export type KloelStreamEvent =
  | KloelThreadEvent
  | KloelStatusEvent
  | KloelMemoryLoadedEvent
  | KloelContentEvent
  | KloelToolCallEvent
  | KloelToolResultEvent
  | KloelReasoningSummaryEvent
  | KloelReasoningDeltaEvent
  | KloelReasoningDoneEvent
  | KloelFileEvent
  | KloelErrorEvent
  | KloelDoneEvent;

export function createKloelPublicThinkingLabel(_message: string): string {
  // Retired facade: the synthesized "thinking" label was a constant-shaped sentence
  // templated from the user's own message. Thinking status now carries no fabricated
  // text; provider reasoning is emitted only when it arrives as a real stream event.
  return '';
}

export function createKloelPublicStreamingLabel(_message: string): string {
  // Retired facade (see above): no synthesized streaming label; the streamed answer
  // text is the real signal.
  return '';
}

/** Create kloel thread event. */
export function createKloelThreadEvent(
  conversationId: string,
  title?: string | null,
): KloelThreadEvent {
  const resolvedTitle = typeof title === 'string' ? title : undefined;
  return {
    type: 'thread',
    conversationId,
    ...(resolvedTitle ? { title: resolvedTitle } : {}),
    done: false,
  };
}

/** Create kloel status event. */
export function createKloelStatusEvent(
  phase: KloelStreamStatusPhase,
  message?: string,
): KloelStatusEvent {
  const safeMessage = typeof message === 'string' ? message.trim() : '';
  return {
    type: 'status',
    phase,
    streaming: phase === 'streaming_token',
    ...(safeMessage ? { message: safeMessage } : {}),
    done: false,
  };
}
export function createKloelMemoryLoadedEvent(input: {
  signalCount: number;
}): KloelMemoryLoadedEvent {
  const rawCount = Number.isFinite(input.signalCount) ? input.signalCount : 0;
  const signalCount = Math.max(0, Math.floor(rawCount));
  const message =
    signalCount === 1
      ? '1 memória relevante encontrada.'
      : signalCount > 1
        ? `${signalCount} memórias relevantes encontradas.`
        : 'Nada relevante encontrado na memória.';
  return {
    type: 'memory_loaded',
    signalCount,
    message,
    done: false,
  };
}

/** Create kloel content event. */
const KLOEL_DSML_TOOL_CALLS_BLOCK_RE =
  /<[\uFF5C|]{2}DSML[\uFF5C|]{2}tool_calls\b[^>]*>[\s\S]*?<\/[\uFF5C|]{2}DSML[\uFF5C|]{2}tool_calls>/gi;
const KLOEL_DSML_INVOKE_BLOCK_RE =
  /<[\uFF5C|]{2}DSML[\uFF5C|]{2}invoke\b[^>]*>[\s\S]*?<\/[\uFF5C|]{2}DSML[\uFF5C|]{2}invoke>/gi;
const KLOEL_XML_TOOL_CALLS_BLOCK_RE = /<tool_calls\b[^>]*>[\s\S]*?<\/tool_calls>/gi;
const KLOEL_XML_INVOKE_BLOCK_RE = /<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi;
const KLOEL_OPEN_TOOL_MARKUP_RE =
  /<[\uFF5C|]{2}DSML[\uFF5C|]{2}(?:tool_calls|invoke)\b[\s\S]*$|<(?:tool_calls|invoke)\b[\s\S]*$/i;
const KLOEL_TOOL_MARKUP_START_RE =
  /<[\uFF5C|]{2}DSML[\uFF5C|]{2}(?:tool_calls|invoke)\b|<(?:tool_calls|invoke)\b/i;
const KLOEL_ARTIFACT_PROTOCOL_START_RE = /__artifact\b/i;
const KLOEL_ARTIFACT_PROTOCOL_MARKER_G_RE = /__artifact\b/gi;
const KLOEL_ARTIFACT_PROTOCOL_SEPARATOR = '\uE000';
const KLOEL_ARTIFACT_PROTOCOL_SEPARATOR_RE = /\uE000\r?\n?/g;
const KLOEL_STREAM_MARKUP_LOOKBEHIND_CHARS = 192;
const KLOEL_IMPLEMENTATION_PATH_RE =
  /\b(?:backend|frontend|src|scripts|apps|packages)\/[A-Za-z0-9._~!$&'()*+,;=:@/%-]+/g;
const KLOEL_FILE_REFERENCE_RE =
  /\barquivo\s+(?=[A-Za-z0-9._~!$&'()*+,;=:@/%-]*(?:[\\/\\\\]|(?:\.[A-Za-z0-9]{1,12}\b)))[A-Za-z0-9._~!$&'()*+,;=:@/%-]+/gi;
const KLOEL_IMPLEMENTATION_LANGUAGE_RE = /\b(?:TypeScript|JavaScript|TSX|JSX)\b/g;
const KLOEL_SYMBOL_COUNT_SENTENCE_RE = /\s*O módulo contém\s+\d+\s+símbolos[^.?!]*(?:[.?!]|$)/gi;
const KLOEL_INTERNAL_CERTIFICATION_SENTENCE_RE =
  /\s*Meu status de\s+["“]?no overclaim["”]?\s+é\s+PASS\.[ \t]*/gi;
const KLOEL_INTERNAL_CERTIFICATION_TOKEN_RE =
  /\b(?:no overclaim|overclaim|ABI\s+\d+(?:\.\d+){1,3}|certificationVerdict|runtimeEvidencePct|INSUFFICIENT_EVIDENCE)\b/gi;
const KLOEL_INTERNAL_CERTIFICATION_PASS_TOKEN_RE = /\bPASS(?![-A-Za-zÀ-ÖØ-öø-ÿ0-9_])/g;
const KLOEL_INTERNAL_VERSION_RE = /\bversão\s+\d+(?:\.\d+){1,3}\b/gi;
const KLOEL_STREAM_TRAILING_WORD_FRAGMENT_RE = /[A-Za-zÀ-ÖØ-öø-ÿ0-9_]{1,32}$/;
const KLOEL_PRODUCT_LANGUAGE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bcertificação interna\b/gi, 'verificação de consistência'],
  [/\bmódulo principal\b/gi, 'núcleo operacional'],
];

function replaceToolMarkupBlock(match: string): string {
  return match.includes('\n') ? '\n' : ' ';
}

function stripCompleteToolMarkup(value: string): string {
  return value
    .replace(KLOEL_DSML_TOOL_CALLS_BLOCK_RE, replaceToolMarkupBlock)
    .replace(KLOEL_DSML_INVOKE_BLOCK_RE, replaceToolMarkupBlock)
    .replace(KLOEL_XML_TOOL_CALLS_BLOCK_RE, replaceToolMarkupBlock)
    .replace(KLOEL_XML_INVOKE_BLOCK_RE, replaceToolMarkupBlock);
}

function findJsonObjectEnd(value: string, startIndex: number): number | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return null;
}

function findArtifactProtocolJsonSpan(
  value: string,
  markerEnd: number,
): { start: number; end: number } | null {
  let start = markerEnd;
  while (start < value.length && /\s/.test(value[start] || '')) {
    start += 1;
  }
  if (value[start] !== '{') {
    return null;
  }

  const end = findJsonObjectEnd(value, start);
  return end === null ? null : { start, end };
}

function artifactProtocolReplacement(): string {
  return KLOEL_ARTIFACT_PROTOCOL_SEPARATOR;
}

function stripCompleteArtifactProtocol(value: string): string {
  let output = '';
  let cursor = 0;
  KLOEL_ARTIFACT_PROTOCOL_MARKER_G_RE.lastIndex = 0;
  let match = KLOEL_ARTIFACT_PROTOCOL_MARKER_G_RE.exec(value);

  while (match) {
    const markerStart = match.index;
    const markerEnd = markerStart + match[0].length;
    const jsonSpan = findArtifactProtocolJsonSpan(value, markerEnd);
    if (!jsonSpan) {
      break;
    }

    output += value.slice(cursor, markerStart);
    output += artifactProtocolReplacement();
    cursor = jsonSpan.end;
    if (value[cursor] === '\r' && value[cursor + 1] === '\n') {
      cursor += 2;
    } else if (value[cursor] === '\n') {
      cursor += 1;
    }
    KLOEL_ARTIFACT_PROTOCOL_MARKER_G_RE.lastIndex = cursor;
    match = KLOEL_ARTIFACT_PROTOCOL_MARKER_G_RE.exec(value);
  }

  return output + value.slice(cursor);
}

function stripOpenArtifactProtocol(value: string): string {
  const markerStart = value.search(KLOEL_ARTIFACT_PROTOCOL_START_RE);
  return markerStart >= 0 ? value.slice(0, markerStart) : value;
}

function findInternalMarkupStart(value: string): number {
  const starts = [
    value.search(KLOEL_TOOL_MARKUP_START_RE),
    value.search(KLOEL_ARTIFACT_PROTOCOL_START_RE),
  ].filter((index) => index >= 0);
  return starts.length > 0 ? Math.min(...starts) : -1;
}

function splitStreamSanitizerWindow(
  value: string,
  flush: boolean,
): { rawWindow: string; rawTail: string } {
  if (flush) {
    return { rawWindow: value, rawTail: '' };
  }

  let rawWindow = value.slice(0, value.length - KLOEL_STREAM_MARKUP_LOOKBEHIND_CHARS);
  let rawTail = value.slice(value.length - KLOEL_STREAM_MARKUP_LOOKBEHIND_CHARS);
  const trailingWordFragment = rawWindow.match(KLOEL_STREAM_TRAILING_WORD_FRAGMENT_RE)?.[0] ?? '';

  if (trailingWordFragment.length > 0) {
    rawWindow = rawWindow.slice(0, -trailingWordFragment.length);
    rawTail = trailingWordFragment + rawTail;
  }

  return { rawWindow, rawTail };
}

function sanitizeProductFacingImplementationLeakage(value: string): string {
  const productSafe = KLOEL_PRODUCT_LANGUAGE_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  );

  return productSafe
    .replace(
      KLOEL_INTERNAL_CERTIFICATION_SENTENCE_RE,
      ' A verificação de consistência não detectou alegações acima das capacidades observadas. ',
    )
    .replace(KLOEL_SYMBOL_COUNT_SENTENCE_RE, ' A inspeção confirmou componentes reais conectados.')
    .replace(/\bc[oó]digo fonte\b/gi, 'arquitetura interna')
    .replace(KLOEL_FILE_REFERENCE_RE, 'camada interna')
    .replace(KLOEL_IMPLEMENTATION_PATH_RE, 'arquitetura interna')
    .replace(KLOEL_IMPLEMENTATION_LANGUAGE_RE, 'tecnologia interna')
    .replace(KLOEL_INTERNAL_VERSION_RE, 'versão atual')
    .replace(KLOEL_INTERNAL_CERTIFICATION_TOKEN_RE, 'alegação acima do observado')
    .replace(KLOEL_INTERNAL_CERTIFICATION_PASS_TOKEN_RE, 'alegação acima do observado')
    .replace(/\balegação acima do observadoos\b/gi, 'passos')
    .replace(/\balegação acima do observadoadas\b/gi, 'passadas');
}

function compactToolMarkupWhitespace(value: string, trim: boolean): string {
  const compacted = value
    .replace(KLOEL_ARTIFACT_PROTOCOL_SEPARATOR_RE, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n');
  return trim ? compacted.trim() : compacted;
}

export function sanitizeKloelAssistantVisibleText(value: string): string {
  const withoutCompleteMarkup = stripCompleteArtifactProtocol(stripCompleteToolMarkup(value));
  return compactToolMarkupWhitespace(
    sanitizeProductFacingImplementationLeakage(
      stripOpenArtifactProtocol(withoutCompleteMarkup).replace(KLOEL_OPEN_TOOL_MARKUP_RE, ''),
    ),
    true,
  );
}

export function createKloelAssistantVisibleTextStreamFilter(): {
  push: (chunk: string) => string;
  flush: () => string;
} {
  let pending = '';
  let dropNextLeadingBreak = false;

  const drain = (flush: boolean): string => {
    if (!flush && pending.length <= KLOEL_STREAM_MARKUP_LOOKBEHIND_CHARS) {
      return '';
    }

    const { rawWindow, rawTail } = splitStreamSanitizerWindow(pending, flush);
    const strippedWindow = stripCompleteArtifactProtocol(stripCompleteToolMarkup(rawWindow));
    dropNextLeadingBreak = strippedWindow.endsWith(KLOEL_ARTIFACT_PROTOCOL_SEPARATOR);

    const markupStart = findInternalMarkupStart(strippedWindow);
    if (markupStart >= 0) {
      const visiblePrefix = compactToolMarkupWhitespace(
        sanitizeProductFacingImplementationLeakage(strippedWindow.slice(0, markupStart)),
        false,
      ).replace(/[ \t]+$/g, '');
      pending = flush ? '' : strippedWindow.slice(markupStart) + rawTail;
      return visiblePrefix;
    }

    const visible = compactToolMarkupWhitespace(
      sanitizeProductFacingImplementationLeakage(strippedWindow),
      false,
    );
    pending = rawTail;
    return visible;
  };

  return {
    push(chunk: string): string {
      const nextChunk = dropNextLeadingBreak ? chunk.replace(/^\r?\n/, '') : chunk;
      dropNextLeadingBreak = false;
      pending += nextChunk;
      return drain(false);
    },
    flush(): string {
      return drain(true);
    },
  };
}

export function createKloelContentEvent(content: string): KloelContentEvent {
  return {
    type: 'content',
    content,
    done: false,
  };
}

/** Create kloel tool call event. */
const TOOL_RISK_READ_RE =
  /\b(?:get|list|read|search|query|lookup|find|outline|status|memory|session|history|health|coverage|dependencies)\b/i;
const TOOL_RISK_VALIDATION_RE =
  /\b(?:test|tests|lint|build|audit|detect|coverage|validate|validation|health)\b/i;
const TOOL_RISK_MUTATION_RE =
  /\b(?:create|update|upsert|delete|remove|send|publish|refund|withdraw|payment|charge|campaign|change|set|toggle|execute|run)\b/i;
const TOOL_RISK_FINANCIAL_RE =
  /\b(?:payment|pix|boleto|card|wallet|withdraw|withdrawal|anticipation|refund|charge|billing|order|sale|coupon|discount)\b/i;
const TOOL_RISK_EXTERNAL_RE =
  /\b(?:send|publish|web|email|instagram|messenger|whatsapp|campaign|browser|scrape|search)\b/i;
const TOOL_RISK_IRREVERSIBLE_RE =
  /\b(?:delete|remove|send|publish|refund|withdraw|payment|charge|change plan|cancel)\b/i;
const TOOL_RISK_SENSITIVE_ARG_RE =
  /(?:email|phone|cpf|cnpj|password|secret|token|key|recipient|customer|message|body|amount|price|payment|address)/i;

function normalizeToolNameForRisk(tool: string): string {
  return String(tool || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function createKloelPublicToolLabel(tool: string): string {
  return formatTraceToolLabel(tool);
}

function hasSensitiveToolArgs(args: Record<string, unknown>): boolean {
  return Object.keys(args).some((key) => TOOL_RISK_SENSITIVE_ARG_RE.test(key));
}

export function classifyKloelToolRisk(
  tool: string,
  args: Record<string, unknown> = {},
): KloelPublicToolRisk {
  const normalized = normalizeToolNameForRisk(tool);
  const factors = new Set<string>();
  let score = 2;

  if (TOOL_RISK_READ_RE.test(normalized)) {
    score = 1;
    factors.add('leitura sem alteração');
  }
  if (TOOL_RISK_VALIDATION_RE.test(normalized)) {
    score = Math.min(score, 1);
    factors.add('validação sem alteração');
  }
  if (TOOL_RISK_MUTATION_RE.test(normalized)) {
    score += 3;
    factors.add('pode alterar estado');
  }
  if (TOOL_RISK_FINANCIAL_RE.test(normalized)) {
    score += 3;
    factors.add('impacto financeiro ou comercial');
  }
  if (TOOL_RISK_EXTERNAL_RE.test(normalized)) {
    score += 1;
    factors.add('alcance externo');
  }
  if (TOOL_RISK_IRREVERSIBLE_RE.test(normalized)) {
    score += 2;
    factors.add('reversão exige cuidado');
  }
  if (hasSensitiveToolArgs(args)) {
    score += 2;
    factors.add('argumentos sensíveis redigidos');
  }

  const level: KloelToolRiskLevel = score >= 8 ? 'high' : score >= 4 ? 'medium' : 'low';
  const label =
    level === 'high'
      ? 'ação sensível controlada'
      : level === 'medium'
        ? 'ação controlada'
        : 'consulta segura';

  return {
    level,
    label,
    score,
    factors: Array.from(factors).slice(0, 4),
  };
}

export function createKloelToolCallEvent(
  callId: string,
  tool: string,
  args: Record<string, unknown>,
): KloelToolCallEvent {
  return {
    type: 'tool_call',
    callId,
    spanId: callId,
    tool: createKloelPublicToolLabel(tool),
    risk: classifyKloelToolRisk(tool, args),
    done: false,
  };
}

/** Create kloel tool result event. */
export function createKloelToolResultEvent(input: {
  callId: string;
  tool: string;
  success: boolean;
  result: unknown;
  error?: string;
  artifactId?: string;
  durationMs?: number;
}): KloelToolResultEvent {
  return {
    type: 'tool_result',
    callId: input.callId,
    spanId: input.callId,
    tool: createKloelPublicToolLabel(input.tool),
    success: input.success,
    ...(input.artifactId !== undefined ? { artifactId: input.artifactId } : {}),
    ...(typeof input.durationMs === 'number' ? { durationMs: input.durationMs } : {}),
    risk: classifyKloelToolRisk(input.tool),
    done: false,
  };
}

/** Create kloel error event. */
export function createKloelErrorEvent(input: {
  error: string;
  content?: string;
  done?: boolean;
}): KloelErrorEvent {
  return {
    type: 'error',
    error: input.error,
    ...(input.content !== undefined ? { content: input.content } : {}),
    done: input.done === true,
  };
}

/** Create kloel done event. */
export function createKloelDoneEvent(metadata?: Record<string, unknown>): KloelDoneEvent {
  const sanitizedMetadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (key === 'capability' || key === 'capabilityError') {
      continue;
    }
    sanitizedMetadata[key] = value;
  }

  return {
    type: 'done',
    done: true,
    ...(Object.keys(sanitizedMetadata).length > 0 ? { metadata: sanitizedMetadata } : {}),
  };
}

/** Create kloel reasoning summary event (real header summary; never a constant). */
export function createKloelReasoningSummaryEvent(text: string): KloelReasoningSummaryEvent {
  return {
    type: 'reasoning_summary',
    text: sanitizeAssistantReasoningTextForStorage(text),
    done: false,
  };
}

/** Create reasoning delta event carrying the real provider reasoning text. */
export function createKloelReasoningDeltaEvent(text: string): KloelReasoningDeltaEvent {
  return {
    type: 'reasoning_delta',
    text: sanitizeAssistantReasoningTextForStorage(text),
    done: false,
  };
}

/** Create kloel reasoning done event (reasoning to answer transition, measured duration). */
export function createKloelReasoningDoneEvent(durationMs: number): KloelReasoningDoneEvent {
  return {
    type: 'reasoning_done',
    durationMs,
    done: false,
  };
}

/** Create kloel file event (a delivered/generated artifact card). */
export function createKloelFileEvent(input: {
  name: string;
  artifactId?: string;
  kind?: KloelFileArtifactKind;
  content?: string;
  contentRef?: string;
  meta?: string;
  url?: string;
  downloadUrl?: string;
  editable?: boolean;
  persistent?: boolean;
}): KloelFileEvent {
  return {
    type: 'file',
    name: input.name,
    ...(input.artifactId !== undefined ? { artifactId: input.artifactId } : {}),
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.contentRef !== undefined ? { contentRef: input.contentRef } : {}),
    ...(input.meta !== undefined ? { meta: input.meta } : {}),
    ...(input.url !== undefined ? { url: input.url } : {}),
    ...(input.downloadUrl !== undefined ? { downloadUrl: input.downloadUrl } : {}),
    ...(input.editable !== undefined ? { editable: input.editable } : {}),
    ...(input.persistent !== undefined ? { persistent: input.persistent } : {}),
    done: false,
  };
}
