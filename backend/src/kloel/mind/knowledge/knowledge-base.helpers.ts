/**
 * Pure helpers extracted from `knowledge-base.service.ts` (Wave 78).
 *
 * Keeps the NestJS service file focused on orchestration (Prisma writes,
 * wallet charging, queue dispatch) while the framework-free utilities live
 * here for reuse and direct unit testing.
 *
 * @cluster Mind/Knowledge
 * @see backend/src/kloel/mind/knowledge/knowledge-base.service.ts
 */
import { Parser } from 'htmlparser2';

import { WHITESPACE_G_RE } from '../../../common/regex';
import {
  buildSerializedOpenAiEmbeddingBillingDescriptor,
  type SerializedInputTokenBillingDescriptor,
  quoteOpenAiEmbeddingCostCents,
} from '../../../wallet/provider-pricing';
import {
  KNOWLEDGE_BASE_CHUNK_OVERLAP,
  KNOWLEDGE_BASE_CHUNK_SIZE,
  splitKnowledgeBaseText,
} from './knowledge-base.chunking.helpers';

/**
 * OpenAI embedding model used by the knowledge-base ingestion pipeline.
 * Kept as a constant so wallet quoting and billing descriptors agree.
 */
export const KNOWLEDGE_BASE_EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Wallet-usage envelope passed to the worker when prepaid ingestion is
 * charged. Stays as a plain serializable shape so it survives the Redis/
 * BullMQ hop without TypeScript erasure surprises.
 */
export type KnowledgeBaseWalletUsagePayload = {
  operation: 'kb_ingestion';
  requestId: string;
  billing: SerializedInputTokenBillingDescriptor;
};

/**
 * Domain error raised by the knowledge-base service when the workspace
 * wallet cannot fund a `kb_ingestion` charge. Exported so callers (and
 * tests) can match by class instead of string-sniffing.
 */
export class KnowledgeBaseWalletAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeBaseWalletAccessError';
  }
}

/**
 * Strip HTML to a flat text representation. Block-level tags are replaced
 * with spaces so paragraph boundaries survive without ever yielding huge
 * blank gaps, `script`/`style` content is dropped, and whitespace is
 * collapsed to a single space.
 *
 * Pure — does not touch the network, filesystem, or NestJS DI.
 */
export function htmlToText(html: string): string {
  if (!html) {
    return '';
  }

  const blockTags = new Set([
    'p',
    'div',
    'br',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'section',
    'article',
    'header',
    'footer',
  ]);
  const ignoredStack: string[] = [];
  const parts: string[] = [];

  const parser = new Parser(
    {
      onopentag: (name) => {
        const lower = name.toLowerCase();
        if (lower === 'script' || lower === 'style') {
          ignoredStack.push(lower);
          return;
        }
        if (blockTags.has(lower)) {
          parts.push(' ');
        }
      },
      ontext: (text) => {
        if (ignoredStack.length === 0) {
          parts.push(text);
        }
      },
      onclosetag: (name) => {
        const lower = name.toLowerCase();
        if (ignoredStack.length > 0 && ignoredStack[ignoredStack.length - 1] === lower) {
          ignoredStack.pop();
          return;
        }
        if (blockTags.has(lower)) {
          parts.push(' ');
        }
      },
    },
    { decodeEntities: true },
  );

  parser.write(html);
  parser.end();

  return parts.join(' ').replace(WHITESPACE_G_RE, ' ').trim();
}

/**
 * Estimate the OpenAI embedding cost for a knowledge-base ingestion based
 * on the chunks the worker will produce. Returns `null` when the chunker
 * yields no billable bytes (empty content) so callers can short-circuit
 * the wallet charge.
 *
 * Token estimation uses byte length as a deliberate upper bound — the
 * worker performs the exact accounting once embeddings are issued.
 */
export function estimateKnowledgeBaseEmbeddingQuote(
  content: string,
  maxChunks: number,
): {
  billing: SerializedInputTokenBillingDescriptor;
  estimatedCostCents: bigint;
  estimatedInputTokens: bigint;
} | null {
  const chunks = splitKnowledgeBaseText(
    content,
    KNOWLEDGE_BASE_CHUNK_SIZE,
    KNOWLEDGE_BASE_CHUNK_OVERLAP,
  ).slice(0, maxChunks);
  const estimatedInputTokens = chunks.reduce(
    (total, chunk) => total + BigInt(Buffer.byteLength(chunk, 'utf8')),
    0n,
  );

  if (estimatedInputTokens <= 0n) {
    return null;
  }

  return {
    billing: buildSerializedOpenAiEmbeddingBillingDescriptor(KNOWLEDGE_BASE_EMBEDDING_MODEL),
    estimatedCostCents: quoteOpenAiEmbeddingCostCents({
      model: KNOWLEDGE_BASE_EMBEDDING_MODEL,
      inputTokens: estimatedInputTokens,
    }),
    estimatedInputTokens,
  };
}

/**
 * PT-BR message used when the prepaid wallet cannot fund a kb ingestion.
 * Pulled out so the service body is just orchestration.
 */
export function knowledgeBaseInsufficientWalletMessage(): string {
  return 'Saldo insuficiente na wallet prepaid para indexar conteudo na base de conhecimento. Recarregue via PIX ou aguarde a auto-recarga antes de tentar novamente.';
}
