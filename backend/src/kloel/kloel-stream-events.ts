/** Kloel stream status phase type. */
type KloelStreamStatusPhase = 'thinking' | 'streaming_token' | 'tool_calling' | 'tool_result';

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
  /** Args property. */
  args: Record<string, unknown>;
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
  /** Result property. */
  result: unknown;
  /** Error property. */
  error?: string;
  /** Artifact id property. */
  artifactId?: string;
  /** Duration ms property. */
  durationMs?: number;
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

/** Kloel stream event type. */
export type KloelStreamEvent =
  | KloelThreadEvent
  | KloelStatusEvent
  | KloelContentEvent
  | KloelToolCallEvent
  | KloelToolResultEvent
  | KloelErrorEvent
  | KloelDoneEvent;

const PUBLIC_STATUS_MAX_TOPIC_CHARS = 96;
const PUBLIC_STATUS_WHITESPACE_RE = /\s+/g;
const PUBLIC_STATUS_PREFIX_RE =
  /^(?:eu\s+)?(?:quero|preciso|gostaria|queria|necessito|vamos|me\s+ajude\s+a|me\s+ajuda\s+a)\s+/i;
const PUBLIC_STATUS_NEGATIVE_CLAUSE_RE = /\b(?:sem|não|nao)\b[\s\S]*$/i;
const PUBLIC_STATUS_INTERNAL_TOKEN_RE = /\b(?:step|span|call_[a-z0-9_]+)\b/gi;
const PUBLIC_STATUS_SENTENCE_BREAK_RE = /[.!?]+/;

function lowercaseLeadingCharacter(value: string): string {
  if (!value) {
    return value;
  }
  return `${value.charAt(0).toLocaleLowerCase('pt-BR')}${value.slice(1)}`;
}

function truncatePublicStatusTopic(value: string): string {
  if (value.length <= PUBLIC_STATUS_MAX_TOPIC_CHARS) {
    return value;
  }
  const truncated = value.slice(0, PUBLIC_STATUS_MAX_TOPIC_CHARS);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${(lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated).trim()}...`;
}

function extractPublicStatusTopic(message: string): string {
  const firstSentence = String(message || '')
    .replace(PUBLIC_STATUS_WHITESPACE_RE, ' ')
    .trim()
    .split(PUBLIC_STATUS_SENTENCE_BREAK_RE)
    .find((part) => part.trim());
  const topic = String(firstSentence || '')
    .replace(PUBLIC_STATUS_PREFIX_RE, '')
    .replace(PUBLIC_STATUS_NEGATIVE_CLAUSE_RE, '')
    .replace(PUBLIC_STATUS_INTERNAL_TOKEN_RE, '')
    .replace(/[“”"]/g, '')
    .replace(PUBLIC_STATUS_WHITESPACE_RE, ' ')
    .replace(/[\s,:;\u2014-]+$/g, '')
    .trim();

  return truncatePublicStatusTopic(lowercaseLeadingCharacter(topic));
}

export function createKloelPublicThinkingLabel(message: string): string {
  const topic = extractPublicStatusTopic(message);
  if (!topic) {
    return 'Organizando o contexto da conversa em um resumo público do raciocínio.';
  }
  return `Entendi o pedido: ${topic}. Estou transformando isso em um resumo público do raciocínio.`;
}

export function createKloelPublicStreamingLabel(message: string): string {
  const topic = extractPublicStatusTopic(message);
  if (!topic) {
    return 'Convertendo o raciocínio público em resposta final.';
  }
  return `Convertendo o raciocínio sobre ${topic} em resposta final.`;
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
  return {
    type: 'status',
    phase,
    streaming: phase === 'streaming_token',
    ...(typeof message === 'string' ? { message } : {}),
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
  /\b(?:no overclaim|overclaim|PASS(?![-A-Za-zÀ-ÖØ-öø-ÿ0-9_])|ABI\s+\d+(?:\.\d+){1,3}|certificationVerdict|runtimeEvidencePct|INSUFFICIENT_EVIDENCE)\b/gi;
const KLOEL_INTERNAL_VERSION_RE = /\bversão\s+\d+(?:\.\d+){1,3}\b/gi;
const KLOEL_PRODUCT_LANGUAGE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bcertificação interna\b/gi, 'verificação de consistência'],
  [/\bpassos e ferramentas acionados\b/gi, 'passos e ações executadas'],
  [/\bferramentas utilizadas\b/gi, 'ações executadas'],
  [/\bferramentas acionad[ao]s\b/gi, 'ações acionadas'],
  [/\bnomes de ferramentas\b/gi, 'nomes internos de capacidades'],
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
    .replace(/\balegação acima do observadoos\b/gi, 'passos');
}

function compactToolMarkupWhitespace(value: string, trim: boolean): string {
  const compacted = value
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n');
  return trim ? compacted.trim() : compacted;
}

export function sanitizeKloelAssistantVisibleText(value: string): string {
  return compactToolMarkupWhitespace(
    sanitizeProductFacingImplementationLeakage(
      stripCompleteToolMarkup(value).replace(KLOEL_OPEN_TOOL_MARKUP_RE, ''),
    ),
    true,
  );
}

export function createKloelAssistantVisibleTextStreamFilter(): {
  push: (chunk: string) => string;
  flush: () => string;
} {
  let pending = '';

  const drain = (flush: boolean): string => {
    pending = compactToolMarkupWhitespace(
      sanitizeProductFacingImplementationLeakage(stripCompleteToolMarkup(pending)),
      false,
    );
    const toolMarkupStart = pending.search(KLOEL_TOOL_MARKUP_START_RE);
    if (toolMarkupStart >= 0) {
      const visiblePrefix = pending.slice(0, toolMarkupStart).replace(/[ \t]+$/g, '');
      pending = flush ? '' : pending.slice(toolMarkupStart);
      return visiblePrefix;
    }
    if (flush) {
      const visible = pending;
      pending = '';
      return visible;
    }
    if (pending.length <= KLOEL_STREAM_MARKUP_LOOKBEHIND_CHARS) {
      return '';
    }
    const emitUntil = pending.length - KLOEL_STREAM_MARKUP_LOOKBEHIND_CHARS;
    const visible = pending.slice(0, emitUntil);
    pending = pending.slice(emitUntil);
    return visible;
  };

  return {
    push(chunk: string): string {
      pending += chunk;
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
export function createKloelToolCallEvent(
  callId: string,
  tool: string,
  args: Record<string, unknown>,
): KloelToolCallEvent {
  return {
    type: 'tool_call',
    callId,
    spanId: callId,
    tool,
    args,
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
    tool: input.tool,
    success: input.success,
    result: input.result,
    ...(input.error !== undefined ? { error: input.error } : {}),
    ...(input.artifactId !== undefined ? { artifactId: input.artifactId } : {}),
    ...(typeof input.durationMs === 'number' ? { durationMs: input.durationMs } : {}),
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
  return {
    type: 'done',
    done: true,
    ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}
