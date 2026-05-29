import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { resolveTextLlmApiKey } from '../lib/llm-provider';
/** Cleanup interval on module destroy. */
export function onModuleDestroyLifecycle(cleanupInterval: NodeJS.Timeout | undefined): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
}
/** Read the OpenAI API key from config. */
export function getOpenAiKey(configService: ConfigService): string | undefined {
  return resolveTextLlmApiKey(configService);
}
/** Write an SSE stream chunk to the response. */
export function writeStreamChunk(
  res: Response,
  data: { content?: string; chunk?: string; done?: boolean; error?: string },
): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
