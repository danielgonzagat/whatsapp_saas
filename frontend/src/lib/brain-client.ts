'use client';

import type { KloelStreamEvent } from './kloel-stream-events';
import { streamAuthenticatedKloelMessage } from './kloel-conversations';

export interface BrainStreamInput {
  message: string;
  conversationId?: string | null;
  source?: string;
  intent?: string;
  metadata?: Record<string, unknown>;
}

export interface BrainStreamOptions {
  onChunk: (chunk: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  onEvent?: (event: KloelStreamEvent) => void;
  signal?: AbortSignal;
}

export function streamBrainMessage(input: BrainStreamInput, options: BrainStreamOptions) {
  return streamAuthenticatedKloelMessage(
    {
      message: input.message,
      conversationId: input.conversationId,
    },
    options,
  );
}
