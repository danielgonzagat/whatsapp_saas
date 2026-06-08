import { Prisma } from '@prisma/client';
import { WHITESPACE_G_RE } from '../common/regex';
import { buildTimestampedRuntimeId } from './kloel-id.util';
import { type KloelStreamEvent } from './kloel-stream-events';

const TRAILING_DOTS_RE = /[.]+$/;
const SEPARATOR_G_RE = /[_-]+/g;
const INLINE_WHITESPACE_G_RE = /[^\S\r\n]+/g;
const LINE_PADDING_G_RE = /[ \t]*\r?\n[ \t]*/g;
const EXCESS_BLANK_LINES_G_RE = /\n{3,}/g;
const MECHANICAL_PRODUCT_SUCCESS_RE =
  /\bA[cç][aã]o\s+"?(?:list_products|catálogo de produtos)"?\s+executada com sucesso\.?/gi;
const MECHANICAL_PRODUCT_AUTH_FAILURE_RE =
  /\bFalha ao executar\s+"?(?:list_products|catálogo de produtos)"?:\s*Missing Authorization header\.?\s*Tente novamente\.?/gi;
const AUTH_HEADER_ERROR_RE = /\bMissing Authorization header\b/gi;

export function sanitizeAssistantThreadContentForRead(value: string): string {
  return String(value || '')
    .replace(
      MECHANICAL_PRODUCT_SUCCESS_RE,
      'Consultei seu catálogo real e registrei a observação operacional.',
    )
    .replace(
      MECHANICAL_PRODUCT_AUTH_FAILURE_RE,
      'Não consegui consultar o catálogo de produtos agora porque sua sessão expirou. Faça login novamente para continuar.',
    )
    .replace(/\bCapacidade:\s*self\.health\b/gi, 'Ação operacional: saúde operacional')
    .replace(/\bself\.health\b/gi, 'saúde operacional')
    .replace(/\blist_products\b/gi, 'catálogo de produtos')
    .replace(/\bestado oculto da ferramenta\b/gi, 'estado privado')
    .replace(/\bchamada a sistema\b/gi, 'detalhe privado')
    .replace(/\bcamada operacional\b/gi, 'processo privado')
    .replace(/à processo privado\b/gi, 'ao processo privado')
    .replace(/\bda processo privado\b/gi, 'do processo privado')
    .replace(/\bna processo privado\b/gi, 'no processo privado')
    .replace(AUTH_HEADER_ERROR_RE, 'sessão expirada')
    .replace(INLINE_WHITESPACE_G_RE, ' ')
    .replace(LINE_PADDING_G_RE, '\n')
    .replace(EXCESS_BLANK_LINES_G_RE, '\n\n')
    .trim();
}

export interface StoredProcessingTraceEntry {
  id: string;
  kind: 'status' | 'tool_call' | 'tool_result';
  phase: 'thinking' | 'tool_calling' | 'tool_result' | 'streaming';
  label: string;
  createdAt: string;
  tool?: string;
  spanId?: string;
  artifactId?: string;
  durationMs?: number;
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
    if (phase === 'tool_calling' || phase === 'tool_result') {
      return null;
    }

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
    const spanId = event.spanId || event.callId;
    return {
      id: event.callId ? `${event.callId}:call` : buildTimestampedRuntimeId('trace_tool_call'),
      kind: 'tool_call',
      phase: 'tool_calling',
      label: 'Consultei contexto operacional relevante antes de responder.',
      createdAt: new Date().toISOString(),
      tool: formatTraceToolLabel(event.tool),
      ...(spanId ? { spanId } : {}),
    };
  }
  if (event.type === 'tool_result') {
    const spanId = event.spanId || event.callId;
    return {
      id: event.callId ? `${event.callId}:result` : buildTimestampedRuntimeId('trace_tool_result'),
      kind: 'tool_result',
      phase: 'tool_result',
      label: event.success
        ? 'Incorporei as observações encontradas antes de responder.'
        : 'Registrei uma limitação operacional antes de responder.',
      createdAt: new Date().toISOString(),
      tool: formatTraceToolLabel(event.tool),
      success: event.success,
      ...(spanId ? { spanId } : {}),
      ...(event.artifactId ? { artifactId: event.artifactId } : {}),
      ...(typeof event.durationMs === 'number' ? { durationMs: event.durationMs } : {}),
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

/** User-visible pre-response sections extracted from a model answer. */
export interface ExtractedExecutablePreResponse {
  visibleContent: string;
  processingTrace: StoredProcessingTraceEntry[];
  processingSummary?: string;
}

type ExecutablePreResponseSection = 'reasoning' | 'actions' | 'observations' | 'final';

const EXECUTABLE_PRE_RESPONSE_HEADING_ALIASES: Record<
  ExecutablePreResponseSection,
  readonly string[]
> = {
  reasoning: [
    'raciocinio',
    'raciocinio resumido',
    'chain of thought',
    'cot',
    'reasoning trace',
    'reasoning trace reasoning chain',
    'reasoning chain',
    'reasoning summary',
    'reasoning item',
    'scratchpad',
    'extended thinking',
    'extended thinking thinking blocks',
    'thinking',
    'thinking blocks',
  ],
  actions: [
    'acoes',
    'actions',
    'action',
    'react',
    'react trajectory',
    'agent trajectory',
    'agent trace',
    'agent execution trace',
    'agent execution trace with react style intermediate steps',
    'execution trace',
    'trace',
    'traces and spans',
    'pre resposta executavel',
    'intermediate steps',
    'tool calling',
    'tool calling function calling',
    'function calling',
    'tool calls',
    'tool use',
    'computer use loop',
    'code interpreter tool use',
  ],
  observations: [
    'observacoes',
    'observations',
    'observation',
    'tool result',
    'tool results',
    'tool observation',
    'tool observations',
    'results',
  ],
  final: ['resposta final', 'final answer', 'final response', 'answer', 'response'],
};

const EXECUTABLE_PRE_RESPONSE_HEADING_SOURCE = [
  'racioc[ií]nio(?:\\s+resumido)?',
  'chain[-\\s]*of[-\\s]*thought',
  'cot',
  'reasoning\\s+(?:trace\\s*/\\s*reasoning\\s+chain|trace|chain|summary|items?)',
  'scratchpad',
  'extended\\s+thinking\\s*/\\s*thinking\\s+blocks?',
  'extended\\s+thinking',
  'thinking\\s+blocks?',
  'thinking',
  'a[cç][õo]es',
  'actions?',
  'react(?:\\s+trajectory)?',
  'agent\\s+trajectory',
  'agent\\s+execution\\s+trace\\s+with\\s+react[-\\s]*style\\s+intermediate\\s+steps',
  'agent\\s+(?:execution\\s+)?trace',
  'execution\\s+trace',
  'traces?\\s+(?:and|&)\\s+spans?',
  'pre[-\\s]*resposta\\s+executavel',
  'trace',
  'intermediate\\s+steps?',
  'tool\\s+calling\\s*/\\s*function\\s+calling',
  'tool\\s+(?:calling|calls?|use)',
  'function\\s+calling',
  'computer\\s+use\\s+loop',
  'code\\s+interpreter(?:\\s+tool)?\\s+use',
  'observa[cç][õo]es',
  'observations?',
  'tool\\s+(?:results?|observations?)',
  'results?',
  'resposta\\s+final',
  'final\\s+(?:answer|response)',
  'answer',
  'response',
].join('|');

function normalizeExecutablePreResponseHeadingText(rawHeading: string): string {
  return rawHeading
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeExecutablePreResponseHeading(
  rawHeading: string,
): ExecutablePreResponseSection | null {
  const normalized = normalizeExecutablePreResponseHeadingText(rawHeading);

  for (const [section, aliases] of Object.entries(EXECUTABLE_PRE_RESPONSE_HEADING_ALIASES)) {
    if (aliases.includes(normalized)) {
      return section as ExecutablePreResponseSection;
    }
  }
  return null;
}

const BARE_EXECUTABLE_PRE_RESPONSE_HEADINGS = new Set([
  'raciocinio',
  'raciocinio resumido',
  'acoes',
  'observacoes',
  'resposta final',
]);

function shouldAcceptExecutablePreResponseHeading(rawHeading: string, separator: string): boolean {
  if (separator.trim()) {
    return true;
  }
  return BARE_EXECUTABLE_PRE_RESPONSE_HEADINGS.has(
    normalizeExecutablePreResponseHeadingText(rawHeading),
  );
}

function isNoOpExecutablePreResponseSection(
  phase: StoredProcessingTraceEntry['phase'],
  cleaned: string,
): boolean {
  if (phase !== 'tool_calling' && phase !== 'tool_result') {
    return false;
  }
  const normalized = normalizeExecutablePreResponseHeadingText(cleaned);
  if (['nenhuma', 'nenhum', 'none'].includes(normalized)) {
    return true;
  }
  const noSignal = /\b(?:nenhuma|nenhum|sem|nao houve|nao exige|nao exigiu|no|none)\b/.test(
    normalized,
  );
  if (!noSignal) {
    return false;
  }
  const actionSignal =
    /\b(?:acao|acoes|action|actions|ferramenta|ferramentas|tool|tools|workspace|ambiente operacional)\b/.test(
      normalized,
    );
  const observationSignal =
    /\b(?:observacao|observacoes|observation|observations|resultado|resultados|result|results)\b/.test(
      normalized,
    );
  return phase === 'tool_calling' ? actionSignal : observationSignal;
}

function cleanExecutablePreResponseSection(value: string): string {
  return String(value || '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(WHITESPACE_G_RE, ' ')
    .trim()
    .replace(TRAILING_DOTS_RE, '');
}

function buildExecutablePreResponseEntry(
  phase: StoredProcessingTraceEntry['phase'],
  canonicalLabel: string,
  sectionText: string,
  index: number,
): StoredProcessingTraceEntry | null {
  const cleaned = cleanExecutablePreResponseSection(sectionText);
  if (!cleaned || isNoOpExecutablePreResponseSection(phase, cleaned)) {
    return null;
  }
  return {
    id: buildTimestampedRuntimeId(`trace_model_${phase}_${index}`),
    kind: 'status',
    phase,
    label: `${canonicalLabel}: ${cleaned}.`,
    createdAt: new Date().toISOString(),
  };
}

function uppercaseLeadingCharacter(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildExecutablePreResponseSummary(
  entries: StoredProcessingTraceEntry[],
): string | undefined {
  const firstMeaningfulLabel = entries
    .map((entry) =>
      cleanExecutablePreResponseSection(entry.label).replace(
        /^(?:Raciocínio resumido|Ações|Observações):\s*/i,
        '',
      ),
    )
    .find(Boolean);

  return firstMeaningfulLabel ? `${uppercaseLeadingCharacter(firstMeaningfulLabel)}.` : undefined;
}

export function extractExecutablePreResponseFromAssistantText(
  assistantText: string,
): ExtractedExecutablePreResponse {
  const original = String(assistantText || '');
  const headingRe = new RegExp(
    `(^|\\n|\\s+---\\s*)\\s*(?:[-#>*]\\s*)?(?:\\*\\*)?\\s*(${EXECUTABLE_PRE_RESPONSE_HEADING_SOURCE})\\s*([:：]|[-–—])?\\s*(?:\\*\\*)?\\s*([:：]|[-–—])?\\s*`,
    'gim',
  );
  const matches = Array.from(original.matchAll(headingRe))
    .map((match) => {
      const rawHeading = match[2] || '';
      const separator = `${match[3] || ''}${match[4] || ''}`;
      const key = normalizeExecutablePreResponseHeading(rawHeading);
      return key && shouldAcceptExecutablePreResponseHeading(rawHeading, separator)
        ? {
            key,
            contentStart: (match.index ?? 0) + match[0].length,
            headingStart: match.index ?? 0,
          }
        : null;
    })
    .filter(
      (
        match,
      ): match is {
        key: ExecutablePreResponseSection;
        contentStart: number;
        headingStart: number;
      } => !!match,
    );

  const finalSection = matches.find((match) => match.key === 'final');
  if (!finalSection) {
    return { visibleContent: original, processingTrace: [] };
  }

  const sectionText = (key: ExecutablePreResponseSection): string => {
    const current = matches.find((match) => match.key === key);
    if (!current) {
      return '';
    }
    const next = matches.find((match) => match.headingStart > current.headingStart);
    return original.slice(current.contentStart, next?.headingStart ?? original.length).trim();
  };

  const processingTrace = [
    buildExecutablePreResponseEntry('thinking', 'Raciocínio resumido', sectionText('reasoning'), 0),
    buildExecutablePreResponseEntry('tool_calling', 'Ações', sectionText('actions'), 1),
    buildExecutablePreResponseEntry('tool_result', 'Observações', sectionText('observations'), 2),
  ].filter((entry): entry is StoredProcessingTraceEntry => !!entry);

  if (processingTrace.length === 0) {
    return { visibleContent: original, processingTrace: [] };
  }

  const visibleContent = sectionText('final') || original;
  const processingSummary = buildExecutablePreResponseSummary(processingTrace);
  return {
    visibleContent,
    processingTrace,
    ...(processingSummary ? { processingSummary } : {}),
  };
}

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
  const raw = String(toolName || 'ferramenta').trim();
  const normalized = raw.replace(SEPARATOR_G_RE, ' ').replace(WHITESPACE_G_RE, ' ').toLowerCase();
  const productLabels: Record<string, string> = {
    code_outline: 'inspeção da arquitetura interna',
    search_codebase: 'busca na arquitetura interna',
    code_detect_issues: 'auditoria da arquitetura interna',
    run_backend_tests: 'validação operacional',
    'run backend tests': 'validação operacional',
    search_web: 'pesquisa na web',
    refine_response: 'mesa de refinamento',
    'refine response': 'mesa de refinamento',
    create_site: 'criação de site',
    'create site': 'criação de site',
    create_image: 'criação de imagem',
    'create image': 'criação de imagem',
    list_products: 'catálogo de produtos',
    'list products': 'catálogo de produtos',
    get_settings: 'configurações da conta',
    'get settings': 'configurações da conta',
    get_billing_status: 'status da assinatura',
    'get billing status': 'status da assinatura',
    'self.health': 'saúde operacional',
  };
  const productLabel = productLabels[raw] ?? productLabels[normalized];
  if (productLabel) {
    return productLabel;
  }

  if (!normalized) {
    return 'a ferramenta';
  }
  return normalized
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
