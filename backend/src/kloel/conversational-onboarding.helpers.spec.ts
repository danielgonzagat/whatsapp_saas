/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { buildOnboardingFallback, writeSseResponse } from './conversational-onboarding.helpers';
import type { StructuredLogger } from '../logging/structured-logger';

describe('conversational-onboarding.helpers (K74 proof)', () => {
  describe('buildOnboardingFallback', () => {
    it('returns the canonical fallback reply and emits a structured warn log', () => {
      const warn = jest.fn();
      const logger = { warn } as unknown as StructuredLogger;
      const reply = buildOnboardingFallback(
        'thinker_failed',
        {
          error: new TypeError('boom'),
          workspaceId: 'ws-test',
          hasResponseHeaders: false,
          willingWrite: true,
        },
        logger,
      );

      expect(reply).toContain('instabilidade');
      expect(reply).toContain('onboarding');
      expect(warn).toHaveBeenCalledTimes(1);
      const calls = warn.mock.calls as Array<[string, Record<string, unknown>]>;
      const [message, meta] = calls[0];
      expect(message).toBe('Onboarding degraded');
      expect(meta.tag).toBe('kloel_onboarding_degraded');
      expect(meta.reason).toBe('thinker_failed');
      expect(meta.errorMessage).toBe('boom');
      expect(meta.errorName).toBe('TypeError');
    });

    it('coerces non-Error errors to a JSON-stringified diagnostic', () => {
      const warn = jest.fn();
      const logger = { warn } as unknown as StructuredLogger;
      buildOnboardingFallback(
        'unknown_failure',
        {
          error: { code: 'EPIPE' },
          workspaceId: 'ws-x',
          hasResponseHeaders: true,
          willingWrite: false,
        },
        logger,
      );

      const calls = warn.mock.calls as Array<[string, Record<string, unknown>]>;
      const [, meta] = calls[0];
      expect(meta.errorMessage).toBe('{"code":"EPIPE"}');
      expect(meta.errorName).toBe('object');
    });

    it('returns empty errorMessage for null error', () => {
      const warn = jest.fn();
      const logger = { warn } as unknown as StructuredLogger;
      buildOnboardingFallback(
        'null_error',
        {
          error: null,
          workspaceId: 'ws-y',
          hasResponseHeaders: false,
          willingWrite: false,
        },
        logger,
      );

      const calls = warn.mock.calls as Array<[string, Record<string, unknown>]>;
      const [, meta] = calls[0];
      expect(meta.errorMessage).toBe('');
    });
  });

  describe('writeSseResponse', () => {
    it('writes an SSE-formatted JSON payload with content + done=true and closes the stream', () => {
      const setHeader = jest.fn();
      const write = jest.fn();
      const end = jest.fn();
      const res = { setHeader, write, end } as unknown as import('express').Response;

      writeSseResponse(res, 'olá kloel');

      expect(setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(write).toHaveBeenCalledTimes(1);
      const writeArg = (write.mock.calls[0] as [string])[0];
      expect(writeArg.startsWith('data: ')).toBe(true);
      expect(writeArg.endsWith('\n\n')).toBe(true);
      const payload = JSON.parse(writeArg.slice('data: '.length).trimEnd()) as {
        content: string;
        done: boolean;
      };
      expect(payload).toEqual({ content: 'olá kloel', done: true });
      expect(end).toHaveBeenCalledTimes(1);
    });
  });
});
