/**
 * Pure helpers extracted from `site.controller.ts` (Wave 77 Subagent B).
 *
 * Everything here is dependency-free, deterministic, and side-effect-free.
 * `SiteController` keeps only the Nest plumbing (DI, guards, decorators) plus
 * the orchestration glue that touches Prisma / Wallet / fetch.
 *
 * Money path is preserved: cost-estimation and actual-cost quote selection
 * still flow through the same provider-llm-billing primitives — this file
 * only routes/derives them.
 */

import { BRAND_COLORS } from '../common/kloel-colors';
import { DIACRITICS_RE, SLUG_EDGE_HYPHEN_RE } from '../common/regex';
import {
  estimateAnthropicMessageQuoteCostCents,
  estimateOpenAiChatQuoteCostCents,
  quoteAnthropicMessageActualCostCents,
  quoteOpenAiChatActualCostCents,
} from '../wallet/provider-llm-billing';

export type SiteProvider = 'openai' | 'anthropic';

/** Max output tokens for one-shot site generation. */
export const SITE_GENERATION_MAX_OUTPUT_TOKENS = 4096;

/** PT-BR error message returned via HTTP 402 when the wallet has no balance. */
export const INSUFFICIENT_WALLET_MESSAGE =
  'Saldo insuficiente na wallet prepaid para gerar o site. Recarregue via PIX ou aguarde a auto-recarga antes de tentar novamente.';

const SLUG_NON_ALPHANUM_RE = /[^a-z0-9]+/g;

/**
 * Pick which provider to call first based on which keys are configured.
 * Returns `null` when neither key is set.
 */
export function resolveSiteProviderPreference(input: {
  openaiKey: string | undefined | null;
  anthropicKey: string | undefined | null;
}): SiteProvider | null {
  if (input.openaiKey) {
    return 'openai';
  }
  if (input.anthropicKey) {
    return 'anthropic';
  }
  return null;
}

/**
 * Build the system prompt for site generation. Includes the brand palette
 * and, when editing, the prior HTML so the LLM can amend instead of replace.
 */
export function buildSiteSystemPrompt(input: { currentHtml?: string | undefined }): string {
  return [
    'You are a landing page generator. Return ONLY valid HTML (no markdown, no code fences).',
    'The HTML must be a complete, self-contained page with inline CSS.',
    `Use modern design: dark background (${BRAND_COLORS.VOID}), light text (${BRAND_COLORS.SILVER}), accent (${BRAND_COLORS.EMBER}).`,
    input.currentHtml
      ? `The user wants to edit an existing page. Here is the current HTML:\n${input.currentHtml}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeSiteHtml(value: string): string {
  return value.replace(HTML_ESCAPE_RE, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

function normalizeFallbackPrompt(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, 180) : 'sua oferta';
}

const FALLBACK_TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const FALLBACK_H1_RE = /<h1[^>]*>([\s\S]*?)<\/h1>/i;
const FALLBACK_TAG_RE = /<[^>]+>/g;

function extractFallbackCurrentOffer(currentHtml: string | undefined): string {
  if (!currentHtml?.trim()) {
    return '';
  }
  const match = currentHtml.match(FALLBACK_TITLE_RE) ?? currentHtml.match(FALLBACK_H1_RE);
  const text = match?.[1]?.replace(FALLBACK_TAG_RE, ' ') ?? '';
  return normalizeFallbackPrompt(text);
}

/**
 * Build a complete deterministic landing page when no LLM provider is configured.
 * This keeps the product flow functional without pretending an AI provider ran.
 */
export function buildDeterministicFallbackSiteHtml(input: {
  prompt: string;
  currentHtml?: string | undefined;
}): string {
  const fallbackOffer =
    extractFallbackCurrentOffer(input.currentHtml) || normalizeFallbackPrompt(input.prompt);
  const offer = escapeSiteHtml(fallbackOffer);
  const requestedEdit = escapeSiteHtml(normalizeFallbackPrompt(input.prompt));
  const editContext = input.currentHtml?.trim()
    ? `<p class="notice"><strong>Alteracao solicitada:</strong> ${requestedEdit}. Modo fallback: o provedor IA nao esta configurado, entao a identidade da pagina foi preservada para revisao manual antes de publicar.</p>`
    : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${offer}</title>
  <style>
    :root { color-scheme: dark; --void: ${BRAND_COLORS.VOID}; --ember: ${BRAND_COLORS.EMBER}; --silver: ${BRAND_COLORS.SILVER}; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, Arial, sans-serif; background: var(--void); color: var(--silver); }
    main { min-height: 100vh; display: grid; place-items: center; padding: 56px 20px; }
    .page { width: min(1040px, 100%); display: grid; gap: 28px; }
    .eyebrow { color: var(--ember); text-transform: uppercase; letter-spacing: .14em; font-size: 12px; font-weight: 800; }
    h1 { margin: 0; font-size: clamp(36px, 7vw, 76px); line-height: .95; letter-spacing: 0; max-width: 900px; }
    p { margin: 0; color: rgba(224, 221, 216, .76); font-size: 18px; line-height: 1.7; max-width: 760px; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
    a { color: var(--silver); text-decoration: none; border: 1px solid rgba(232, 93, 48, .45); border-radius: 6px; padding: 13px 18px; font-weight: 800; }
    a.primary { background: var(--ember); border-color: var(--ember); color: #0a0a0c; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .card { border: 1px solid rgba(224, 221, 216, .14); border-radius: 6px; padding: 18px; background: rgba(255,255,255,.035); }
    .card strong { display: block; margin-bottom: 8px; color: var(--silver); }
    .notice { border-left: 3px solid var(--ember); padding-left: 14px; color: rgba(224, 221, 216, .68); }
  </style>
</head>
<body>
  <main>
    <section class="page">
      <div class="eyebrow">Kloel site fallback</div>
      <h1>${offer}</h1>
      <p>Pagina inicial pronta para validacao comercial enquanto o provedor IA e configurado. Ajuste textos, conecte checkout, publique e substitua por uma geracao IA quando a chave estiver ativa.</p>
      ${editContext}
      <div class="actions">
        <a class="primary" href="#checkout">Comprar agora</a>
        <a href="#faq">Ver perguntas</a>
      </div>
      <div class="grid">
        <div class="card"><strong>Oferta clara</strong><span>Headline, promessa e chamada para acao em primeiro plano.</span></div>
        <div class="card"><strong>Prova social</strong><span>Espaco reservado para depoimentos, resultados e autoridade.</span></div>
        <div class="card"><strong>Conversao</strong><span>Estrutura simples para conectar checkout, URL e campanha.</span></div>
      </div>
      <section id="faq" class="card">
        <strong>Perguntas frequentes</strong>
        <p>Inclua garantia, entrega, acesso e suporte antes de publicar para clientes reais.</p>
      </section>
    </section>
  </main>
</body>
</html>`;
}

/**
 * Estimate the quote cost for a site-generation request. Returns `undefined`
 * when the provider has no published pricing for the requested model.
 *
 * Throws any pricing error other than unknown-model so the caller can route
 * unexpected billing failures into ops alerts.
 */
export function estimateSiteGenerationQuote(input: {
  providerPreference: SiteProvider;
  model: string;
  systemPrompt: string;
  prompt: string;
}): bigint | undefined {
  if (input.providerPreference === 'openai') {
    return estimateOpenAiChatQuoteCostCents({
      model: input.model,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.prompt },
      ],
      maxOutputTokens: SITE_GENERATION_MAX_OUTPUT_TOKENS,
    });
  }

  return estimateAnthropicMessageQuoteCostCents({
    model: input.model,
    system: input.systemPrompt,
    messages: [{ role: 'user', content: input.prompt }],
    maxOutputTokens: SITE_GENERATION_MAX_OUTPUT_TOKENS,
  });
}

/** OpenAI chat-completions usage shape used by the actual-cost quoter. */
export type OpenAiSiteUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
};

/** Anthropic messages usage shape used by the actual-cost quoter. */
export type AnthropicSiteUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/**
 * Route the post-call usage payload through the correct provider quoter to
 * derive the actual settlement cost.
 */
export function quoteSiteActualCostCents(input: {
  providerPreference: SiteProvider;
  model: string;
  usage: unknown;
}): bigint {
  if (input.providerPreference === 'openai') {
    return quoteOpenAiChatActualCostCents({
      model: input.model,
      usage: input.usage,
    });
  }
  return quoteAnthropicMessageActualCostCents({
    model: input.model,
    usage: input.usage,
  });
}

/**
 * Build the publish slug for a site by name+id. Mirrors the original inline
 * pipeline: lowercase → strip diacritics → collapse non-alphanum to hyphens
 * → trim edge hyphens → suffix first 6 chars of the site id.
 */
export function buildSiteSlug(input: { name: string | null | undefined; id: string }): string {
  const baseSlug = (input.name || 'site')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .replace(SLUG_NON_ALPHANUM_RE, '-')
    .replace(SLUG_EDGE_HYPHEN_RE, '');
  return `${baseSlug}-${input.id.slice(0, 6)}`;
}

/** Build the OpenAI chat-completions request body for site generation. */
export function buildOpenAiSiteRequestBody(input: {
  model: string;
  systemPrompt: string;
  prompt: string;
}): Record<string, unknown> {
  return {
    model: input.model,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.prompt },
    ],
    max_tokens: SITE_GENERATION_MAX_OUTPUT_TOKENS,
    temperature: 0.7,
  };
}

/** Build the Anthropic messages request body for site generation. */
export function buildAnthropicSiteRequestBody(input: {
  model: string;
  systemPrompt: string;
  prompt: string;
}): Record<string, unknown> {
  return {
    model: input.model,
    max_tokens: SITE_GENERATION_MAX_OUTPUT_TOKENS,
    system: input.systemPrompt,
    messages: [{ role: 'user', content: input.prompt }],
  };
}

/** Pick the HTML string out of an OpenAI chat-completions response. */
export function extractOpenAiSiteHtml(result: {
  choices?: Array<{ message?: { content?: string | null } | null }>;
}): string | null {
  return result.choices?.[0]?.message?.content?.trim() || null;
}

/** Pick the HTML string out of an Anthropic messages response. */
export function extractAnthropicSiteHtml(result: {
  content?: Array<{ text?: string | null }>;
}): string | null {
  return result.content?.[0]?.text?.trim() || null;
}

/**
 * Resolve the effective request id from a (possibly absent) idempotency key.
 * Returns the trimmed key when non-empty, otherwise the provided fallback.
 *
 * Decoupled from `randomUUID` so callers (and tests) keep control over the
 * fallback source.
 */
export function resolveSiteRequestId(input: {
  idempotencyKey: string | undefined | null;
  fallback: string;
}): string {
  if (typeof input.idempotencyKey === 'string') {
    const trimmed = input.idempotencyKey.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return input.fallback;
}
