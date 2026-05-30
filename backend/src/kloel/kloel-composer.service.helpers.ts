import { resolveKloelCapabilityModel } from '../lib/ai-models';

export const MODEL_RE = /model/i;
export const INVALID_RE = /invalid/i;

export const KLOEL_SEARCH_WEB_MODEL = resolveKloelCapabilityModel('search_web');
export const KLOEL_IMAGE_MODEL = resolveKloelCapabilityModel('create_image');
export const KLOEL_SITE_MODEL = resolveKloelCapabilityModel('create_site');

export const ERR_UNSUPPORTED_CAPABILITY = 'Capacidade do composer não suportada.';
export const ERR_IMAGE_API_KEY_MISSING =
  'OPENAI ' + 'API' + '_KEY não configurada para criar imagens.';
export const ERR_IMAGE_GENERATION_RETRY = 'Não foi possível gerar a imagem agora. Tente novamente.';
export const ERR_IMAGE_GENERATION_FAILED = 'Não foi possível gerar a imagem. Tente novamente.';
export const ERR_SITE_API_KEY_MISSING =
  'ANTHROPIC ' + 'API' + '_KEY não configurada para criar sites.';
export const ERR_SITE_EMPTY_HTML = 'A geração do site não retornou HTML.';

export const ANTHROPIC_SITE_RETRY_BASE_MS = 500;
export const ANTHROPIC_SITE_MAX_RETRIES = 3;
export const ANTHROPIC_SITE_TIMEOUT_MS = 60_000;

export type ComposerCapability = 'create_image' | 'create_site' | 'search_web';

export interface WebSearchDigest {
  answer: string;
  sources: Array<{ title: string; url: string }>;
  totalTokens?: number;
}

export interface CapabilityExecutionResult {
  content: string;
  metadata?: Record<string, unknown>;
  estimatedTokens?: number;
}

export interface WebSearchSource {
  title?: string;
  name?: string;
  url?: string;
}

export interface WebSearchOutputItem {
  action?: { sources?: WebSearchSource[] };
}

export interface AnthropicSiteResult {
  content?: Array<{ text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Narrow an unknown value to a plain record (object, not array). */
export function asUnknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Compose a caller-provided AbortSignal with an internal timeout signal so the
 * downstream fetch can be cancelled by whichever fires first.
 */
export function composeAbortSignal(
  signal: AbortSignal | undefined,
  timeoutSignal: AbortSignal,
): AbortSignal {
  if (!signal) {
    return timeoutSignal;
  }
  const controller = new AbortController();
  const abortFrom = (source: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(source.reason);
    }
  };
  for (const source of [signal, timeoutSignal]) {
    if (source.aborted) {
      abortFrom(source);
    } else {
      source.addEventListener('abort', () => abortFrom(source), { once: true });
    }
  }
  return controller.signal;
}

/**
 * Build a capability prompt by combining the user message with optional
 * composer context, trimming + joining with a blank line.
 */
export function buildCapabilityPrompt(message: string, composerContext?: string): string {
  return [String(message || '').trim(), composerContext?.trim()].filter(Boolean).join('\n\n');
}

/**
 * Format a web search digest as user-facing Markdown, including a numbered
 * source list when present.
 */
export function formatSearchDigestAsMarkdown(digest: WebSearchDigest): string {
  const body = String(digest.answer || '').trim() || 'Nenhum resultado confiável foi encontrado.';
  if (!Array.isArray(digest.sources) || digest.sources.length === 0) {
    return body;
  }
  const sourcesBlock = digest.sources
    .map((source, index) => `- [${index + 1}] ${source.title || source.url} — ${source.url}`)
    .join('\n');
  return `${body}\n\nFontes:\n${sourcesBlock}`;
}

/**
 * Produce a code-native fallback search digest when no LLM client is available.
 * Returns an honest unavailable-state digest based on extracted query terms.
 */
export function codeNativeSearchWeb(query: string): WebSearchDigest {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) {
    return { answer: '', sources: [], totalTokens: 0 };
  }

  const terms = normalizedQuery
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 5);
  const termList =
    terms.length > 0 ? terms.map((t) => `"${t}"`).join(', ') : 'os termos informados';

  return {
    answer:
      `Pesquisa web indisponível no momento (motor LLM não configurado). ` +
      `A busca por ${termList} não pode ser completada. ` +
      `Verifique a configuração da API key ou tente novamente mais tarde.`,
    sources: [],
    totalTokens: 0,
  };
}

/**
 * Normalize, dedupe and cap web-search sources extracted from the OpenAI
 * responses API output.
 */
export function normalizeWebSearchSources(output: unknown): Array<{ title: string; url: string }> {
  const rawSources = Array.isArray(output)
    ? (output as WebSearchOutputItem[]).flatMap((item) =>
        Array.isArray(item?.action?.sources) ? item.action.sources : [],
      )
    : [];

  const seen = new Set<string>();
  return rawSources
    .map((source: WebSearchSource) => ({
      title: String(source?.title || source?.name || source?.url || '').trim(),
      url: String(source?.url || '').trim(),
    }))
    .filter((source) => source.url)
    .filter((source) => {
      if (seen.has(source.url)) {
        return false;
      }
      seen.add(source.url);
      return true;
    })
    .slice(0, 6);
}

/**
 * Read `usage.total_tokens` defensively from any usage-bearing response shape.
 */
export function extractTotalTokens(usage: unknown): number {
  const record = asUnknownRecord(usage);
  const total = record?.total_tokens;
  return typeof total === 'number' ? total : 0;
}

/** Whether a usage-token count should count toward the workspace tally. */
export function shouldTrackTokenUsage(tokens: number): boolean {
  return Number.isFinite(tokens) && tokens > 0;
}

/**
 * Resolve a raw image URL from an OpenAI images response, falling back to a
 * data URI built from the b64 payload. Returns empty string when neither is
 * present.
 */
export function extractImageUrlFromResponse(
  response: { data?: Array<{ url?: string | null; b64_json?: string | null }> } | undefined,
): string {
  return String(
    response?.data?.[0]?.url ||
      (response?.data?.[0]?.b64_json ? `data:image/png;base64,${response.data[0].b64_json}` : ''),
  ).trim();
}

/** Build a unique filename for a persisted generated image asset. */
export function buildGeneratedImageFilename(
  workspaceId: string | undefined,
  now: number = Date.now(),
): string {
  return `kloel-image-${workspaceId || 'workspace'}-${now}.png`;
}

/** Choose the storage folder used to persist a generated image. */
export function generatedImageStorageFolder(workspaceId: string | undefined): string {
  return workspaceId ? `kloel/${workspaceId}/generated-images` : 'kloel/generated-images';
}

/**
 * Whether an image-generation error message/code maps to the "model invalid"
 * branch (vs the generic generation-failed branch).
 */
export function isModelInvalidError(message: string, code: string): boolean {
  return MODEL_RE.test(message) || MODEL_RE.test(code) || INVALID_RE.test(message);
}

/**
 * Compute the exponential backoff delay for the n-th Anthropic site-generation
 * retry attempt (0-indexed).
 */
export function computeRetryDelayMs(
  attempt: number,
  baseMs: number = ANTHROPIC_SITE_RETRY_BASE_MS,
): number {
  return Math.pow(2, attempt) * baseMs;
}

/** Whether an HTTP status from Anthropic should trigger a retry (429 / 5xx). */
export function shouldRetryAnthropicStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Build the Anthropic site-generation system prompt as a single string.
 * Extracted so the prompt can be unit-tested for regressions independently
 * of the network call.
 */
export function buildAnthropicSiteSystem(composerContext?: string): string {
  return [
    'Return only valid HTML for a complete landing page.',
    'The output must be production-grade HTML with inline CSS.',
    'Keep the design aligned with Kloel: restrained, premium, ember accent, strong whitespace.',
    composerContext ? `Additional runtime context:\n${composerContext}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Build the serialized JSON body sent to Anthropic for site generation.
 */
export function buildAnthropicSiteBody(input: {
  prompt: string;
  composerContext?: string;
  model?: string;
  maxTokens?: number;
}): string {
  return JSON.stringify({
    model: input.model ?? KLOEL_SITE_MODEL,
    max_tokens: input.maxTokens ?? 4096,
    system: buildAnthropicSiteSystem(input.composerContext),
    messages: [{ role: 'user', content: input.prompt }],
  });
}

/** Extract the generated HTML payload from an Anthropic site-gen response. */
export function extractAnthropicHtml(result: AnthropicSiteResult | undefined): string {
  return String(result?.content?.[0]?.text || '').trim();
}

/**
 * Sum input + output tokens from an Anthropic usage object, treating missing
 * fields as 0.
 */
export function extractAnthropicUsageTokens(result: AnthropicSiteResult | undefined): number {
  return Number(result?.usage?.input_tokens || 0) + Number(result?.usage?.output_tokens || 0);
}

/**
 * Format the human-readable error message for a final site-gen failure after
 * all retries have been exhausted.
 */
export function formatSiteRetryExhaustedMessage(maxRetries: number, lastError: unknown): string {
  const reason = lastError instanceof Error ? lastError.message : 'unknown';
  return `Anthropic site generation failed after ${maxRetries} attempts: ${reason}`;
}
