/**
 * Deterministic LLM test stub for the Kloel chat streaming pipeline.
 *
 * Activated only when the runtime env signals a non-production e2e/test
 * harness (mirrors the same env-detection contract used by
 * {@link TestModeThrottlerGuard}). When active the stub returns a fake
 * async iterable that yields ChatCompletionChunk-shaped values from the LLM provider so
 * that the rest of the streaming pipeline (KloelStreamWriter, SSE
 * serialization, token accounting) runs unchanged.
 *
 * The CI harness sets `OPENAI_API_KEY=e2e-dummy-key`; with that key any
 * real LLM-provider request fails immediately and the chat composer e2e specs
 * cannot validate the streaming contract or the linked-product prompt
 * context. The stub bridges that gap by echoing the product name + price
 * extracted from the system messages so the assistant reply visibly
 * reflects the linked product.
 *
 * Production behavior is untouched — the dispatch uses the real LLM-provider
 * client whenever {@link isKloelLlmTestStubEnabled} returns false.
 */
import type { ChatCompletionChunk, ChatCompletionMessageParam } from 'openai/resources/chat';

type ChatCompletionStream = AsyncIterable<ChatCompletionChunk>;

const LINKED_PRODUCT_HEADER = 'PRODUTO VINCULADO AO PROMPT:';

/** True when a non-production harness should bypass real OpenAI calls. */
export function isKloelLlmTestStubEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.E2E_TEST_MODE === 'true') return true;
  if (process.env.KLOEL_LLM_STUB === 'true') return true;
  if (process.env.OPENAI_API_KEY === 'e2e-dummy-key') return true;
  return false;
}

function readMessageContent(message: ChatCompletionMessageParam): string {
  const content = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join(' ');
  }
  return '';
}

function extractLinkedProductBlock(systemContent: string): string | null {
  const headerIndex = systemContent.indexOf(LINKED_PRODUCT_HEADER);
  if (headerIndex < 0) return null;
  const block = systemContent.slice(headerIndex);
  const stopIndex = block.indexOf('\n\n');
  return stopIndex >= 0 ? block.slice(0, stopIndex) : block;
}

function findProductNameInBlock(block: string): string | null {
  const lines = block.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    // Format produced by KloelContextFormatter.buildWorkspaceProductContext:
    // `PRODUTO 1: <name>`
    const productHeader = /^PRODUTO\s+\d+\s*[:-]\s*(.+)$/i.exec(line);
    if (productHeader?.[1]) return productHeader[1].trim();
    // Fallback for `Nome: <name>` shapes from older formatters / tests.
    const directMatch = /^Nome\s*[:-]\s*(.+)$/i.exec(line);
    if (directMatch?.[1]) return directMatch[1].trim();
    const dashMatch = /^[-•]\s*Nome\s*[:-]\s*(.+)$/i.exec(line);
    if (dashMatch?.[1]) return dashMatch[1].trim();
  }
  return null;
}

function findPriceInBlock(block: string): string | null {
  const match = /R\$\s*[\d.,]+/.exec(block);
  return match ? match[0] : null;
}

export interface KloelStubExtraction {
  productName: string | null;
  productPrice: string | null;
}

/**
 * Inspect the writer messages and extract linked-product hints (name + price)
 * from the system prompt, if any. Used by the deterministic stream stub.
 */
export function extractLinkedProductHints(
  writerMessages: readonly ChatCompletionMessageParam[],
): KloelStubExtraction {
  for (const message of writerMessages) {
    if (message.role !== 'system') continue;
    const content = readMessageContent(message);
    const block = extractLinkedProductBlock(content);
    if (!block) continue;
    return {
      productName: findProductNameInBlock(block),
      productPrice: findPriceInBlock(block),
    };
  }
  return { productName: null, productPrice: null };
}

function buildStubReply(extraction: KloelStubExtraction): string {
  const parts: string[] = ['[stub]'];
  if (extraction.productName) {
    parts.push(extraction.productName);
  }
  if (extraction.productPrice) {
    parts.push(extraction.productPrice);
  }
  if (parts.length === 1) {
    parts.push('Resposta deterministica do stub para testes e2e.');
  }
  return parts.join(' - ');
}

function buildChunk(content: string): ChatCompletionChunk {
  return {
    id: 'chatcmpl-e2e-stub',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'kloel-e2e-stub',
    choices: [
      {
        index: 0,
        delta: { content },
        finish_reason: null,
      },
    ],
  };
}

/**
 * Build a deterministic ChatCompletionChunk async iterable that mirrors the
 * shape returned by the real OpenAI streaming client. Streams short word
 * deltas so the SSE pipeline emits multiple content events.
 */
export function buildKloelLlmTestStubStream(
  writerMessages: readonly ChatCompletionMessageParam[],
): ChatCompletionStream {
  const extraction = extractLinkedProductHints(writerMessages);
  const reply = buildStubReply(extraction);
  const chunks = reply.split(/(\s+)/).filter((part) => part.length > 0);

  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      const iter = {
        next(): Promise<IteratorResult<ChatCompletionChunk>> {
          if (index >= chunks.length) {
            return Promise.resolve({ done: true } as IteratorResult<ChatCompletionChunk>);
          }
          const value = buildChunk(chunks[index]);
          index += 1;
          return Promise.resolve({ value, done: false });
        },
      };
      return iter;
    },
  };
}
