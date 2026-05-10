import { Injectable } from '@nestjs/common';
import type { ChatCompletionChunk, ChatCompletionMessageParam } from 'openai/resources/chat';

export const KLOEL_LLM_E2E_GUARD = Symbol('KLOEL_LLM_E2E_GUARD');

export interface KloelLLME2EGuard {
  isEnabled(): boolean;
  buildStream(
    writerMessages: readonly ChatCompletionMessageParam[],
  ): AsyncIterable<ChatCompletionChunk>;
}

@Injectable()
export class NoopKloelLLME2EGuard implements KloelLLME2EGuard {
  isEnabled(): boolean {
    return false;
  }

  buildStream(): AsyncIterable<ChatCompletionChunk> {
    throw new Error('NoopKloelLLME2EGuard.buildStream called in production');
  }
}
