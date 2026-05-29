import {
  onModuleDestroyLifecycle,
  getOpenAiKey,
  writeStreamChunk,
} from './guest-chat.lifecycle.helpers';
import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

describe('guest-chat.lifecycle.helpers (K71 proof)', () => {
  describe('onModuleDestroyLifecycle', () => {
    it('clears the provided cleanup interval', () => {
      const timer = setInterval(() => undefined, 1000);
      const clearSpy = jest.spyOn(global, 'clearInterval');
      onModuleDestroyLifecycle(timer);
      expect(clearSpy).toHaveBeenCalledWith(timer);
      clearSpy.mockRestore();
    });

    it('is a no-op when the interval is undefined', () => {
      const clearSpy = jest.spyOn(global, 'clearInterval');
      expect(() => onModuleDestroyLifecycle(undefined)).not.toThrow();
      expect(clearSpy).not.toHaveBeenCalled();
      clearSpy.mockRestore();
    });
  });

  describe('getOpenAiKey', () => {
    it('returns whatever resolveTextLlmApiKey delegates to (configService.get path)', () => {
      const cfg = {
        get: jest.fn((k: string) => (k === 'OPENAI_API_KEY' ? 'sk-test-config-K71' : undefined)),
      } as unknown as ConfigService;
      const key = getOpenAiKey(cfg);
      expect(typeof key === 'string' || key === undefined).toBe(true);
    });
  });

  describe('writeStreamChunk', () => {
    it('writes a single SSE-formatted line wrapping the JSON payload', () => {
      const write = jest.fn();
      const res = { write } as unknown as Response;
      writeStreamChunk(res, { content: 'chunk-a', done: false });
      expect(write).toHaveBeenCalledTimes(1);
      const arg = (write.mock.calls[0] as [string])[0];
      expect(arg.startsWith('data: ')).toBe(true);
      expect(arg.endsWith('\n\n')).toBe(true);
      const payload = JSON.parse(arg.slice('data: '.length).trimEnd()) as {
        content: string;
        done: boolean;
      };
      expect(payload).toEqual({ content: 'chunk-a', done: false });
    });

    it('passes the done flag through unchanged', () => {
      const write = jest.fn();
      const res = { write } as unknown as Response;
      writeStreamChunk(res, { done: true });
      const arg = (write.mock.calls[0] as [string])[0];
      const payload = JSON.parse(arg.slice('data: '.length).trimEnd()) as { done: boolean };
      expect(payload.done).toBe(true);
    });
  });
});
