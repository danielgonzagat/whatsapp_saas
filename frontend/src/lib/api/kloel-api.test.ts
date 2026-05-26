import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { kloelApi } from './kloel-api';

beforeEach(() => {
  document.cookie = 'kloel_access_token=test-token; path=/';
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { response: 'Hello from KLOEL' } }),
  } as Response);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function lastFetch(): { url: string; method: string; headers: Record<string, string> } {
  const call = vi.mocked(globalThis.fetch).mock.calls.at(-1);
  const input = call?.[0];
  const url = input instanceof Request ? input.url : String(input ?? '');
  const method = input instanceof Request ? input.method : 'GET';
  const headers: Record<string, string> = {};
  if (input instanceof Request) input.headers.forEach((v, k) => { headers[k] = v; });
  return { url, method, headers };
}

describe('kloelApi', () => {
  describe('chatSync', () => {
    it('POSTs to /kloel/think/sync with message body', async () => {
      await kloelApi.chatSync('Hello');
      const { url, method } = lastFetch();
      expect(method).toBe('POST');
      expect(url).toContain('/kloel/think/sync');
    });

    it('sends Authorization header', async () => {
      await kloelApi.chatSync('Hello');
      expect(lastFetch().headers.authorization).toBe('Bearer test-token');
    });

    it('returns the response shape', async () => {
      const res = await kloelApi.chatSync('Hello');
      expect(res.data).toBeDefined();
    });
  });

  describe('getHistory', () => {
    it('GETs /kloel/history', async () => {
      await kloelApi.getHistory();
      const { url, method } = lastFetch();
      expect(method).toBe('GET');
      expect(url).toContain('/kloel/history');
    });
  });

  describe('chat (streaming)', () => {
    it('returns an object with abort method', () => {
      const { abort } = kloelApi.chat('Hello', vi.fn(), vi.fn(), vi.fn());
      expect(typeof abort).toBe('function');
    });
  });

  describe('error handling', () => {
    it('propagates network errors for chatSync', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Offline'));
      const res = await kloelApi.chatSync('Hello');
      expect(res.error).toBe('Offline');
    });

    it('returns error on non-ok response', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'KLOEL error' }),
      } as Response);
      const res = await kloelApi.chatSync('Hello');
      expect(res.error).toBeTruthy();
    });
  });
});
