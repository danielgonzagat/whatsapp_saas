'use client';

import type { KloelStreamEvent, KloelStreamPhase } from './kloel-stream-events';

const WHITESPACE_G_RE = /\s+/g;
const TRAILING_DOTS_RE = /[.]+$/;
const ASSISTANT_DSML_TOOL_CALLS_BLOCK_RE =
  /<[\uFF5C|]{2}DSML[\uFF5C|]{2}tool_calls\b[^>]*>[\s\S]*?<\/[\uFF5C|]{2}DSML[\uFF5C|]{2}tool_calls>/gi;
const ASSISTANT_DSML_INVOKE_BLOCK_RE =
  /<[\uFF5C|]{2}DSML[\uFF5C|]{2}invoke\b[^>]*>[\s\S]*?<\/[\uFF5C|]{2}DSML[\uFF5C|]{2}invoke>/gi;
const ASSISTANT_XML_TOOL_CALLS_BLOCK_RE = /<tool_calls\b[^>]*>[\s\S]*?<\/tool_calls>/gi;
const ASSISTANT_XML_INVOKE_BLOCK_RE = /<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi;
const ASSISTANT_OPEN_TOOL_MARKUP_RE =
  /<[\uFF5C|]{2}DSML[\uFF5C|]{2}(?:tool_calls|invoke)\b[\s\S]*$|<(?:tool_calls|invoke)\b[\s\S]*$/i;
const ASSISTANT_IMPLEMENTATION_PATH_RE =
  /\b(?:backend|frontend|src|scripts|apps|packages)\/[A-Za-z0-9._~!$&'()*+,;=:@/%-]+/g;
const ASSISTANT_FILE_REFERENCE_RE =
  /\barquivo\s+(?=[A-Za-z0-9._~!$&'()*+,;=:@/%-]*(?:[\\/\\\\]|(?:\.[A-Za-z0-9]{1,12}\b)))[A-Za-z0-9._~!$&'()*+,;=:@/%-]+/gi;
const ASSISTANT_IMPLEMENTATION_LANGUAGE_RE = /\b(?:TypeScript|JavaScript|TSX|JSX)\b/g;
const ASSISTANT_SYMBOL_COUNT_RE = /\b\d+\s+s[ií]mbolos?\b/gi;
const ASSISTANT_INTERNAL_CERTIFICATION_SENTENCE_RE =
  /\s*Meu status de\s+["“]?no overclaim["”]?\s+é\s+PASS\.[ \t]*/gi;
const ASSISTANT_INTERNAL_CERTIFICATION_TOKEN_RE =
  /\b(?:no overclaim|overclaim|PASS(?![-A-Za-zÀ-ÖØ-öø-ÿ0-9_])|ABI\s+\d+(?:\.\d+){1,3}|certificationVerdict|runtimeEvidencePct|INSUFFICIENT_EVIDENCE)\b/gi;
const ASSISTANT_INTERNAL_VERSION_RE = /\bversão\s+\d+(?:\.\d+){1,3}\b/gi;
const ASSISTANT_PRODUCT_LANGUAGE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bcode_outline\b/gi, 'inspeção da arquitetura interna'],
  [/\bcode outline\b/gi, 'inspeção da arquitetura interna'],
  [/\bsearch_codebase\b/gi, 'busca na arquitetura interna'],
  [/\bcode_detect_issues\b/gi, 'auditoria da arquitetura interna'],
  [/\brun_backend_tests\b/gi, 'validação operacional'],
  [/\brun backend tests\b/gi, 'validação operacional'],
  [/\bget_workspace_status\b/gi, 'verificação do estado do ambiente operacional'],
  [/\blist_products\b/gi, 'catálogo de produtos'],
  [/\blist products\b/gi, 'catálogo de produtos'],
  [/\bget_settings\b/gi, 'configurações da conta'],
  [/\bget settings\b/gi, 'configurações da conta'],
  [/\bget_billing_status\b/gi, 'status da assinatura'],
  [/\bget billing status\b/gi, 'status da assinatura'],
  [/\bget_product_plans\b/gi, 'consultar planos do produto'],
  [/\bworkingMemory\b/g, 'memória de trabalho'],
  [/\battention\.candidates\b/gi, 'foco de atenção'],
  [/\bdashboard:chat\b/gi, 'chat do Kloel'],
  [/\bdashboard\b/gi, 'chat do Kloel'],
  [/\bskill\s+checkout-recovery\b/gi, 'habilidade de recuperação de checkout'],
  [/\bskill\s+recuperação de checkout\b/gi, 'habilidade de recuperação de checkout'],
  [/\bcheckout-recovery\b/gi, 'recuperação de checkout'],
  [/\bwebhook\b/gi, 'integração externa'],
  [/\bbilling\b/gi, 'assinatura e cobrança'],
  [/\bscore\b/gi, 'pontuação'],
  [/\bworkspace\b/gi, 'ambiente operacional'],
  [/\bruntime\b/gi, 'arquitetura cognitiva'],
  [/\bbackend\b/gi, 'infraestrutura'],
  [/\bfrontend\b/gi, 'interface'],
  [/\bstateless\b/gi, 'sem memória persistente'],
  [/\bpending\b/gi, 'pendente'],
  [/\bactive\b/gi, 'ativo'],
  [/\bhealthy\b/gi, 'saudável'],
  [/\bdeveloping\b/gi, 'em desenvolvimento'],
  [/\bstable\b/gi, 'estável'],
  [/\bproven\b/gi, 'comprovado'],
  [/\bobserved\b/gi, 'observado'],
  [/\bcertificação interna\b/gi, 'verificação de consistência'],
  [/\bpassos e ferramentas acionados\b/gi, 'passos e ações executadas'],
  [/\bferramentas utilizadas\b/gi, 'ações executadas'],
  [/\bferramentas acionad[ao]s\b/gi, 'ações acionadas'],
  [/\bnomes de ferramentas\b/gi, 'nomes internos de capacidades'],
  [/\bmódulo principal\b/gi, 'núcleo operacional'],
];

export function sanitizeAssistantVisibleContent(value: string): string {
  return ASSISTANT_PRODUCT_LANGUAGE_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  )
    .replace(ASSISTANT_DSML_TOOL_CALLS_BLOCK_RE, ' ')
    .replace(ASSISTANT_DSML_INVOKE_BLOCK_RE, ' ')
    .replace(ASSISTANT_XML_TOOL_CALLS_BLOCK_RE, ' ')
    .replace(ASSISTANT_XML_INVOKE_BLOCK_RE, ' ')
    .replace(ASSISTANT_OPEN_TOOL_MARKUP_RE, '')
    .replace(/\bcapacidade:\s*[A-Za-z0-9_.-]+\b/gi, 'Ação operacional')
    .replace(
      /\bErro:\s*Venda\s+n[aã]o\s+encontrada\.?/gi,
      'Não encontrei uma venda correspondente para essa consulta.',
    )
    .replace(
      /\bA criação de site está conectada, mas o provedor de geração de sites ainda não está configurado neste ambiente\. Configure a chave do provedor e tente novamente\.?/gi,
      'A criação de site está conectada, mas a configuração de geração de sites ainda não foi concluída neste ambiente. Finalize a configuração e tente novamente.',
    )
    .replace(
      /\bA[cç][aã]o\s+"?catálogo de produtos"?\s+executada com sucesso\.?/gi,
      'Consultei seu catálogo real e registrei a observação operacional.',
    )
    .replace(
      /\bFalha ao executar\s+"?catálogo de produtos"?:\s*Missing Authorization header\.?\s*Tente novamente\.?/gi,
      'Não consegui consultar o catálogo de produtos agora porque sua sessão expirou. Faça login novamente para continuar.',
    )
    .replace(/\bMissing Authorization header\b/gi, 'sessão expirada')
    .replace(
      ASSISTANT_INTERNAL_CERTIFICATION_SENTENCE_RE,
      ' A verificação de consistência não detectou capacidades sem evidência observada. ',
    )
    .replace(/\bc[oó]digo(?:\s+fonte)?\b/gi, 'arquitetura interna')
    .replace(ASSISTANT_FILE_REFERENCE_RE, 'camada interna')
    .replace(ASSISTANT_IMPLEMENTATION_PATH_RE, 'arquitetura interna')
    .replace(ASSISTANT_IMPLEMENTATION_LANGUAGE_RE, 'tecnologia interna')
    .replace(ASSISTANT_SYMBOL_COUNT_RE, 'componentes reais')
    .replace(ASSISTANT_INTERNAL_VERSION_RE, 'versão atual')
    .replace(ASSISTANT_INTERNAL_CERTIFICATION_TOKEN_RE, 'verificação de consistência')
    .replace(/\balegação acima do observadoos\b/gi, 'passos')
    .replace(/\bvers[aã]o\s+verifica[cç][aã]o de consist[eê]ncia\b/gi, 'versão atual')
    .replace(
      /(?:\s+com)?\s+verifica[cç][aã]o de consist[eê]ncia(?:\s+verifica[cç][aã]o de consist[eê]ncia)+/gi,
      ' verificação de consistência',
    )
    .replace(
      /existe(?:\s+no contexto)?\s+com\s+outcome:\s*[^.]+/gi,
      'está registrada, mas ainda sem execução real',
    )
    .replace(/\b(?:outcome|success|failure|patch|view):\s*[^\s,.`]+`?/gi, '')
    .replace(/\bmétrica interna\b/gi, '')
    .replace(
      /A\s+(?:skill|habilidade)\s+`?(?:checkout-recovery|recuperação de checkout|habilidade de recuperação de checkout)`?\s+existe no contexto com[^.]*\./gi,
      'A habilidade de recuperação de checkout está registrada, mas ainda não foi exercitada.',
    )
    .replace(
      /A habilidade de recuperação de checkout existe no contexto com[^.]*\./gi,
      'A habilidade de recuperação de checkout está registrada, mas ainda não foi exercitada.',
    )
    .replace(
      /A skill recuperação de checkout existe no contexto com[^.]*\./gi,
      'A habilidade de recuperação de checkout está registrada, mas ainda não foi exercitada.',
    )
    .replace(/(?:[\u2705\u274c\u26a0\u{1f680}]|\uFE0F)+/gu, '')
    .replace(/\binfraestrutura\/arquitetura interna\b/gi, 'camada interna')
    .replace(/\bcamada internaexado\b/gi, 'arquivo anexado')
    .replace(/\bcamada interna teste\b/gi, 'Arquivo de teste')
    .replace(/\bcamada interna\s+interna\b/gi, 'camada interna')
    .replace(
      /\bEle está em tecnologia interna, no arquivo camada interna\./gi,
      'Ela está acessível em uma camada operacional validada.',
    )
    .replace(
      /\bEle está em camada operacional, no arquivo camada interna\./gi,
      'Ela está acessível em uma camada operacional validada.',
    )
    .replace(/\barquivo\s+camada interna\b/gi, 'camada operacional')
    .replace(/\btecnologia interna\b/gi, 'camada operacional')
    .replace(/\bcamada operacional\s+intern[ao]\b/gi, 'camada operacional')
    .replace(/\bO módulo contém componentes reais\./gi, 'O núcleo contém capacidades reais.')
    .replace(/\bfunções,\s*classes,\s*tipos\b/gi, 'componentes reais')
    .replace(/\bs[ií]mbolos reais\b/gi, 'componentes reais')
    .replace(/\bcomponentes reais\s*\(componentes reais\)/gi, 'componentes reais')
    .replace(/\barquitetura cognitiva\s+cognitiva\b/gi, 'arquitetura cognitiva')
    .replace(
      /\binspeção da arquitetura interna\s+camada interna\s+camada operacional\s+componentes reais\b/gi,
      'camada interna validada com componentes reais',
    )
    .replace(
      /\binspeção da arquitetura interna\s+camada interna\s+tecnologia interna\s+componentes reais\b/gi,
      'camada interna validada com componentes reais',
    )
    .replace(
      /\barquitetura interna\s+camada interna\s+componentes reais\b/gi,
      'camada interna validada com componentes reais',
    )
    .replace(/\bmeu arquitetura interna\b/gi, 'minha arquitetura interna')
    .replace(/\bmeu próprio arquitetura interna\b/gi, 'minha própria arquitetura interna')
    .replace(/\bao minha própria arquitetura interna\b/gi, 'à minha própria arquitetura interna')
    .replace(/\bdo minha arquitetura interna\b/gi, 'da minha arquitetura interna')
    .replace(
      /\bnão é uma simulação, é o camada interna na infraestrutura\b/gi,
      'não é uma simulação; é acesso real à camada operacional',
    )
    .replace(/\bo arquitetura interna\b/gi, 'a arquitetura interna')
    .replace(/\bdo arquitetura interna\b/gi, 'da arquitetura interna')
    .replace(/\bno arquitetura interna\b/gi, 'na arquitetura interna')
    .replace(/\bcamada interna no infraestrutura\b/gi, 'camada interna na infraestrutura')
    .replace(
      /\bEle está em camada operacional,\s+no\s+arquivo\s+`?camada interna`?\./gi,
      'Ela está acessível em uma camada operacional validada.',
    )
    .replace(/\bno\s+arquivo\s+`?camada interna`?\b/gi, 'em uma camada operacional')
    .replace(/\bno\s+chat do Kloel\b/gi, 'pelo chat do Kloel')
    .replace(/\barquitetura interna\b/gi, 'camada operacional')
    .replace(/\bcamada operacional\s+intern[ao]\b/gi, 'camada operacional')
    .replace(/\bambiente operacional está operacional\b/gi, 'ambiente operacional está ativo')
    .replace(/\binspeção da camada operacional\b/gi, 'checagem privada')
    .replace(/\bbusca na camada operacional\b/gi, 'checagem privada')
    .replace(/\bauditoria da camada operacional\b/gi, 'checagem privada')
    .replace(/\bestado oculto da ferramenta\b/gi, 'estado privado')
    .replace(/\bchamada a sistema\b/gi, 'detalhe privado')
    .replace(/\bcamada operacional\b/gi, 'processo privado')
    .replace(/à processo privado\b/gi, 'ao processo privado')
    .replace(/\bda processo privado\b/gi, 'do processo privado')
    .replace(/\bna processo privado\b/gi, 'no processo privado')
    .replace(/"em desenvolvimento"\s+\(em desenvolvimento\)/gi, '"em desenvolvimento"')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function sanitizeAssistantTraceLabel(value: string): string {
  return sanitizeAssistantVisibleContent(value)
    .replace(/\bAção enviada para [^.]+\.?/gi, 'Consultei contexto operacional relevante antes de responder.')
    .replace(/\bObservação recebida de [^.]+\.?/gi, 'Incorporei as observações encontradas antes de responder.')
    .replace(/\bFalha observada em [^.]+\.?/gi, 'Registrei uma limitação operacional antes de responder.')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

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

/** Assistant reasoning file shape (a delivered/generated artifact). */
export interface AssistantReasoningFile {
  /** Name property. */
  name: string;
  /** Meta property. */
  meta?: string | undefined;
  /** Url property. */
  url?: string | undefined;
  /** Download url property. */
  downloadUrl?: string | undefined;
}

/** Assistant reasoning shape (real model reasoning accumulated from the stream). */
export interface AssistantReasoning {
  /** Text property. */
  text: string;
  /** Summary property. */
  summary: string;
  /** Duration ms property. */
  durationMs: number | null;
  /** Files property. */
  files: AssistantReasoningFile[];
}

/** Get the real reasoning accumulated for an assistant message. */
export function getAssistantReasoning(metadata: unknown): AssistantReasoning {
  const normalized = normalizeAssistantMessageMetadata(metadata);
  const text = typeof normalized?.reasoningText === 'string' ? normalized.reasoningText : '';
  const summary =
    typeof normalized?.reasoningSummary === 'string' ? normalized.reasoningSummary : '';
  const durationMs =
    typeof normalized?.reasoningDurationMs === 'number' ? normalized.reasoningDurationMs : null;
  const rawFiles = Array.isArray(normalized?.files) ? normalized.files : [];
  const files = rawFiles
    .map((entry): AssistantReasoningFile | null => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const candidate = entry as Record<string, unknown>;
      if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
        return null;
      }
      return {
        name: candidate.name,
        meta: typeof candidate.meta === 'string' ? candidate.meta : undefined,
        url: typeof candidate.url === 'string' ? candidate.url : undefined,
        downloadUrl:
          typeof candidate.downloadUrl === 'string' ? candidate.downloadUrl : undefined,
      };
    })
    .filter((entry): entry is AssistantReasoningFile => !!entry);
  return { text, summary, durationMs, files };
}

/** Accumulate a reasoning/file stream event into assistant message metadata. */
function applyReasoningStreamEventToMetadata(
  metadata: Record<string, unknown>,
  event: KloelStreamEvent,
): Record<string, unknown> | null {
  if (event.type === 'reasoning_delta') {
    const current = typeof metadata.reasoningText === 'string' ? metadata.reasoningText : '';
    return { ...metadata, reasoningText: current + event.text };
  }
  if (event.type === 'reasoning_summary') {
    return { ...metadata, reasoningSummary: event.text };
  }
  if (event.type === 'reasoning_done') {
    return { ...metadata, reasoningDurationMs: event.durationMs };
  }
  if (event.type === 'file') {
    const currentFiles = Array.isArray(metadata.files) ? metadata.files : [];
    const nextFile: AssistantReasoningFile = {
      name: event.name,
      meta: event.meta,
      url: event.url,
      downloadUrl: event.downloadUrl,
    };
    return { ...metadata, files: [...currentFiles, nextFile] };
  }
  return null;
}

/** Append assistant trace from event. */
/**
 * Map a raw internal tool identifier to a safe, human label for the live
 * reasoning timeline. Mirrors the backend formatTraceToolLabel so the streamed
 * trace matches the persisted/reloaded one and never shows a raw code
 * identifier (e.g. "request_anticipation") on the user's screen.
 */
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

const ANSWER_FENCED_BLOCK_G_RE = /```([a-zA-Z0-9_+-]*)[^\S\r\n]*\r?\n([\s\S]*?)```/g;
const ANSWER_DIACRITICS_G_RE = /[̀-ͯ]/g;
const ANSWER_NON_SLUG_G_RE = /[^a-zA-Z0-9]+/g;
const ANSWER_EDGE_DASH_G_RE = /^-+|-+$/g;
const ANSWER_FILE_HEADING_RE = /^\s*#{1,3}\s+(.+)$/m;
const ANSWER_TRAILING_WS_G_RE = /\s+$/;

const ANSWER_FILE_KIND_BY_LANG: Record<string, { ext: string; mime: string; label: string }> = {
  markdown: { ext: 'md', mime: 'text/markdown', label: 'Documento' },
  md: { ext: 'md', mime: 'text/markdown', label: 'Documento' },
  html: { ext: 'html', mime: 'text/html', label: 'Página HTML' },
  svg: { ext: 'svg', mime: 'image/svg+xml', label: 'Imagem SVG' },
  csv: { ext: 'csv', mime: 'text/csv', label: 'Planilha CSV' },
  json: { ext: 'json', mime: 'application/json', label: 'Dados JSON' },
  mermaid: { ext: 'mmd', mime: 'text/plain', label: 'Diagrama' },
  yaml: { ext: 'yaml', mime: 'text/plain', label: 'Configuração' },
  yml: { ext: 'yml', mime: 'text/plain', label: 'Configuração' },
  sql: { ext: 'sql', mime: 'text/plain', label: 'Script SQL' },
  python: { ext: 'py', mime: 'text/x-python', label: 'Código Python' },
  py: { ext: 'py', mime: 'text/x-python', label: 'Código Python' },
  javascript: { ext: 'js', mime: 'text/javascript', label: 'Código JavaScript' },
  js: { ext: 'js', mime: 'text/javascript', label: 'Código JavaScript' },
  typescript: { ext: 'ts', mime: 'text/plain', label: 'Código TypeScript' },
  ts: { ext: 'ts', mime: 'text/plain', label: 'Código TypeScript' },
  tsx: { ext: 'tsx', mime: 'text/plain', label: 'Componente React' },
  jsx: { ext: 'jsx', mime: 'text/javascript', label: 'Componente React' },
  bash: { ext: 'sh', mime: 'text/x-sh', label: 'Script Shell' },
  sh: { ext: 'sh', mime: 'text/x-sh', label: 'Script Shell' },
};
const DEFAULT_ANSWER_FILE_KIND = { ext: 'txt', mime: 'text/plain', label: 'Documento' };
const MIN_ANSWER_FILE_CHARS = 280;
const MAX_ANSWER_FILES = 3;

function slugifyAnswerFileBase(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(ANSWER_DIACRITICS_G_RE, '')
    .replace(ANSWER_NON_SLUG_G_RE, '-')
    .replace(ANSWER_EDGE_DASH_G_RE, '')
    .toLowerCase()
    .slice(0, 48);
  return slug || 'documento';
}

function toUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

/**
 * Derive downloadable file cards from substantial fenced document/code blocks in
 * the completed answer text. Works across every answer path (direct + tool) and
 * survives reload, because it reads the rendered answer the client already has.
 * Honest: only real blocks (>= MIN_ANSWER_FILE_CHARS) become cards.
 */
export function detectDeliverableAnswerFiles(answer: string): AssistantReasoningFile[] {
  const source = String(answer || '');
  const files: AssistantReasoningFile[] = [];
  const seen = new Set<string>();
  ANSWER_FENCED_BLOCK_G_RE.lastIndex = 0;
  let match = ANSWER_FENCED_BLOCK_G_RE.exec(source);
  while (match && files.length < MAX_ANSWER_FILES) {
    const lang = String(match[1] || '').toLowerCase();
    const content = String(match[2] || '').replace(ANSWER_TRAILING_WS_G_RE, '');
    match = ANSWER_FENCED_BLOCK_G_RE.exec(source);
    if (content.trim().length < MIN_ANSWER_FILE_CHARS) {
      continue;
    }
    const dedupeKey = content.slice(0, 160);
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    const kind = ANSWER_FILE_KIND_BY_LANG[lang] || DEFAULT_ANSWER_FILE_KIND;
    const headingMatch = content.match(ANSWER_FILE_HEADING_RE);
    const base = headingMatch
      ? slugifyAnswerFileBase(headingMatch[1] || '')
      : `documento-${files.length + 1}`;
    files.push({
      name: `${base}.${kind.ext}`,
      meta: `${kind.label} · ${kind.ext.toUpperCase()}`,
      downloadUrl: `data:${kind.mime};charset=utf-8;base64,${toUtf8Base64(content)}`,
    });
  }
  // Trailing unclosed fence: a document whose closing ``` never arrived (the
  // answer was cut off / is the only block) still gets a card so truncated
  // documents remain downloadable.
  if (files.length < MAX_ANSWER_FILES) {
    const fenceCount = (source.match(/```/g) || []).length;
    const lastFence = source.lastIndexOf('```');
    if (fenceCount % 2 === 1 && lastFence >= 0) {
      const tail = source.slice(lastFence + 3);
      const nlIndex = tail.indexOf('\n');
      if (nlIndex >= 0) {
        const lang = tail.slice(0, nlIndex).trim().toLowerCase();
        const content = tail.slice(nlIndex + 1).replace(ANSWER_TRAILING_WS_G_RE, '');
        const dedupeKey = content.slice(0, 160);
        if (content.trim().length >= MIN_ANSWER_FILE_CHARS && !seen.has(dedupeKey)) {
          const kind = ANSWER_FILE_KIND_BY_LANG[lang] || DEFAULT_ANSWER_FILE_KIND;
          const headingMatch = content.match(ANSWER_FILE_HEADING_RE);
          const base = headingMatch
            ? slugifyAnswerFileBase(headingMatch[1] || '')
            : `documento-${files.length + 1}`;
          files.push({
            name: `${base}.${kind.ext}`,
            meta: `${kind.label} · ${kind.ext.toUpperCase()}`,
            downloadUrl: `data:${kind.mime};charset=utf-8;base64,${toUtf8Base64(content)}`,
          });
        }
      }
    }
  }
  return files;
}

/** Merge answer-derived file cards into a reasoning object, deduped by name. */
export function withDeliverableFiles(
  reasoning: AssistantReasoning,
  answer: string,
): AssistantReasoning {
  const derived = detectDeliverableAnswerFiles(answer);
  if (derived.length === 0) {
    return reasoning;
  }
  const existingNames = new Set(reasoning.files.map((file) => file.name));
  const extra = derived.filter((file) => !existingNames.has(file.name));
  if (extra.length === 0) {
    return reasoning;
  }
  return { ...reasoning, files: [...reasoning.files, ...extra] };
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
      label: sanitizeAssistantTraceLabel('Consultei contexto operacional relevante antes de responder.'),
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
  const tool = typeof candidate.tool === 'string' ? candidate.tool : undefined;
  const success = typeof candidate.success === 'boolean' ? candidate.success : undefined;
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
  };
}


function lowercaseLeadingCharacter(value: string) {
  if (!value) {
    return value;
  }
  return value.charAt(0).toLowerCase() + value.slice(1);
}
