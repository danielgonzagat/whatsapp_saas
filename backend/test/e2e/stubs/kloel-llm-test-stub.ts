import { Injectable } from '@nestjs/common';
import type { ChatCompletionChunk, ChatCompletionMessageParam } from 'openai/resources/chat';
import { KloelLLME2EGuard } from '../../src/kloel/kloel-llm-e2e-guard';

const LINKED_PRODUCT_HEADER = 'PRODUTO VINCULADO AO PROMPT:';

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
    const productHeader = /^PRODUTO\s+\d+\s*[:-]\s*(.+)$/i.exec(line);
    if (productHeader?.[1]) return productHeader[1].trim();
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

interface KloelStubExtraction {
  productName: string | null;
  productPrice: string | null;
}

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

export function buildKloelLlmTestStubStream(
  writerMessages: readonly ChatCompletionMessageParam[],
): AsyncIterable<ChatCompletionChunk> {
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

@Injectable()
export class KloelLLME2EStubGuard implements KloelLLME2EGuard {
  isEnabled(): boolean {
    return isKloelLlmTestStubEnabled();
  }

  buildStream(
    writerMessages: readonly ChatCompletionMessageParam[],
  ): AsyncIterable<ChatCompletionChunk> {
    return buildKloelLlmTestStubStream(writerMessages);
  }
}
