/**
 * Pure helpers extracted from `mind-runtime.service.ts` so the orchestrator
 * focuses on DI, Prisma/event spine, and capability dispatch. Anything that
 * touches Prisma, NestJS, the event spine, or the executor stays in the
 * service; only side-effect-free parsing/derivation/text-building lives here.
 */
import type { Prisma } from '@prisma/client';
import type { BrainDecideDto } from './mind-runtime.dto';
import type { CommercialGraphRecommendation } from './mind-commercial-graph.types';
import type { PredecidedAction } from '../../unified-agent.types';

/**
 * Return the most recent user message content (trimmed). Iterates the message
 * list in reverse so the latest user turn wins. Returns `undefined` when the
 * list is empty or has no user content.
 */
export function latestUserText(messages: BrainDecideDto['messages']): string | undefined {
  if (!messages?.length) {
    return undefined;
  }
  return [...messages]
    .reverse()
    .find((message) => message.role === 'user' && message.content.trim())?.content;
}

/**
 * Coerce an arbitrary value into a non-empty trimmed string, returning
 * `undefined` for non-strings or empty/whitespace-only strings.
 */
export function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Deep-clone an arbitrary JSON-serializable value via the round-trip
 * `JSON.stringify` → `JSON.parse` so the result is structurally independent
 * and safe to embed in Prisma JSON columns.
 */
export function cloneJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Coerce an arbitrary value into a plain record (`Record<string, unknown>`).
 * Returns an empty object for non-objects, arrays, or `null`.
 */
export function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function publicOperatorLabel(intent: string): string {
  return String(intent || '').trim() || 'operação solicitada';
}

function readResultRows(result: unknown, keys: string[] = []): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    return result.filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === 'object'),
    );
  }
  const record = readRecord(result);
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object'),
      );
    }
  }
  return [];
}

function formatBrl(value: unknown): string | undefined {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) {
    return undefined;
  }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(amount)
    .replace(/\u00a0/g, ' ');
}

function productStatusLabel(value: unknown): string {
  if (value === true) {
    return 'ativo';
  }
  if (value === false) {
    return 'inativo';
  }
  return 'status não informado';
}

function summarizeProductCatalog(result: unknown): string {
  const products = readResultRows(result, ['products', 'items', 'data']);
  if (products.length === 0) {
    return 'Consultei seu catálogo real e não encontrei produtos cadastrados neste workspace.';
  }
  const rendered = products
    .slice(0, 4)
    .map((product) => {
      const name = readOptionalString(product.name) ?? 'Produto sem nome';
      const price = formatBrl(product.price);
      const status = productStatusLabel(product.active);
      return [name, price, status].filter(Boolean).join(' · ');
    })
    .join('; ');
  const suffix = products.length > 4 ? `; +${products.length - 4} outro(s)` : '';
  return `Consultei seu catálogo real: ${rendered}${suffix}.`;
}

/**
 * Build the list of predecided actions for the unified agent.
 *
 * If the requested intent is in the allow-list, returns a single predecided
 * action carrying any caller-provided action/tool args (read out of the
 * brain context). Otherwise returns an empty list so the agent can decide
 * freely.
 */
export function buildPredecidedActions(input: {
  allowedTools: string[];
  context?: Record<string, unknown>;
  intent: string;
}): PredecidedAction[] {
  if (!input.allowedTools.includes(input.intent)) {
    return [];
  }
  const args = readRecord(input.context?.actionArgs ?? input.context?.toolArgs);
  return [{ tool: input.intent, args: args }];
}

/**
 * Resolve the user-facing message for a decide call by falling back through
 * the message list, the structured context `message` key, and finally the
 * intent itself. Returns an empty string when nothing usable is found — the
 * caller is expected to validate emptiness.
 */
export function resolveDecideMessage(body: BrainDecideDto): string {
  const fromMessages = latestUserText(body.messages);
  const fromContext = typeof body.context?.message === 'string' ? body.context.message : undefined;
  return fromMessages ?? fromContext ?? body.intent ?? 'user_message';
}

/**
 * Build the assistant response text for an operator capability execution.
 * Pure string formatting — no side effects.
 */
export function buildOperatorResponseText(input: {
  intent: string;
  ok: boolean;
  error?: string | undefined;
  result?: unknown;
}): string {
  if (!input.ok) {
    return `Falha ao executar ${publicOperatorLabel(input.intent)}: ${input.error ?? 'erro desconhecido'}.`;
  }
  if (input.intent === 'list_products') {
    return summarizeProductCatalog(input.result);
  }
  return `Executei ${publicOperatorLabel(input.intent)} e registrei a observação operacional real.`;
}

/**
 * Build the SSE-style event payload list for the streaming decision API.
 * Pure transformation over the decision shape — the caller is responsible
 * for actually emitting/flushing the events.
 */
export function buildStreamEvents(decision: {
  actions: unknown[];
  conversationId?: string;
  response?: string;
  title?: string;
}): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [
    {
      type: 'status',
      phase: 'thinking',
      message: 'Kloel Brain construindo contexto do workspace',
    },
  ];
  if (decision.conversationId) {
    events.push({
      type: 'thread',
      conversationId: decision.conversationId,
      title: decision.title,
    });
  }
  for (const action of decision.actions) {
    if (!action || typeof action !== 'object') {
      continue;
    }
    const record = action as Record<string, unknown>;
    events.push({
      type: 'tool_result',
      tool: typeof record.tool === 'string' ? record.tool : 'brain_action',
      result: record.result,
      success: true,
    });
  }
  events.push({
    type: 'content',
    content: decision.response || 'Ação processada pelo Kloel Brain.',
  });
  events.push({ type: 'done', done: true });
  return events;
}

/**
 * Build the top-3 confidence-formatted insight lines surfaced by the
 * observe() endpoint. Pure transformation over the recommendation list —
 * caller decides what to do with the result.
 */
export function buildObserveInsights(recommendations: CommercialGraphRecommendation[]): string[] {
  return recommendations
    .slice(0, 3)
    .map(
      (recommendation) =>
        `${recommendation.action}: ${Math.round(
          recommendation.confidence * 100,
        )}% confidence. ${recommendation.reason}`,
    );
}
