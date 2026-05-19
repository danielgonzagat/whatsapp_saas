import { Injectable } from '@nestjs/common';
import type { ChatCompletionChunk, ChatCompletionMessageParam } from 'openai/resources/chat';

export const KLOEL_LLM_E2E_GUARD = Symbol('KLOEL_LLM_E2E_GUARD');

export interface KloelLLME2EGuard {
  isEnabled(): boolean;
  buildStream(
    writerMessages: readonly ChatCompletionMessageParam[],
  ): AsyncIterable<ChatCompletionChunk>;
}

function isLlmE2EHarnessEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.CI === 'true';
}

function messageContentToText(content: ChatCompletionMessageParam['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) => {
      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
        return part.text;
      }
      return '';
    })
    .join('\n');
}

function buildE2EAnswer(writerMessages: readonly ChatCompletionMessageParam[]): string {
  const transcript = writerMessages
    .map((message) => messageContentToText(message.content))
    .join('\n');
  const productName = transcript.match(/tmp-e2e-linked-[a-z0-9-]+/i)?.[0];
  if (productName) {
    return `${productName} custa R$ 123,45.`;
  }
  return 'Resposta deterministica do Kloel para o fluxo E2E.';
}

@Injectable()
export class NoopKloelLLME2EGuard implements KloelLLME2EGuard {
  isEnabled(): boolean {
    return isLlmE2EHarnessEnabled();
  }

  async *buildStream(
    writerMessages: readonly ChatCompletionMessageParam[],
  ): AsyncIterable<ChatCompletionChunk> {
    if (!this.isEnabled()) {
      throw new Error('NoopKloelLLME2EGuard.buildStream called outside e2e harness');
    }

    const now = Math.floor(Date.now() / 1000);
    yield {
      id: `chatcmpl-e2e-${now}`,
      object: 'chat.completion.chunk',
      created: now,
      model: 'kloel-e2e',
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: buildE2EAnswer(writerMessages) },
          finish_reason: null,
        },
      ],
    } as ChatCompletionChunk;
    yield {
      id: `chatcmpl-e2e-${now}`,
      object: 'chat.completion.chunk',
      created: now,
      model: 'kloel-e2e',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    } as ChatCompletionChunk;
  }
}
