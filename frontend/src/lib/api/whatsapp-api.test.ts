import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { whatsappApi } from './whatsapp-api';

beforeEach(() => {
  document.cookie = 'kloel_access_token=test-token; path=/';
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { connected: true, status: 'connected' } }),
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

describe('whatsappApi', () => {
  describe('getStatus', () => {
    it('GETs /whatsapp-api/session/status', async () => {
      await whatsappApi.getStatus();
      const { url, method } = lastFetch();
      expect(method).toBe('GET');
      expect(url).toContain('/whatsapp-api/session/status');
    });

    it('sends Authorization header', async () => {
      await whatsappApi.getStatus();
      expect(lastFetch().headers.authorization).toBe('Bearer test-token');
    });
  });

  describe('disconnect', () => {
    it('DELETEs /whatsapp-api/session/disconnect', async () => {
      await whatsappApi.disconnect();
      const { url, method } = lastFetch();
      expect(method).toBe('DELETE');
      expect(url).toContain('/whatsapp-api/session/disconnect');
    });
  });

  describe('logout', () => {
    it('POSTs to /whatsapp-api/session/logout', async () => {
      await whatsappApi.logout();
      const { url, method } = lastFetch();
      expect(method).toBe('POST');
      expect(url).toContain('/whatsapp-api/session/logout');
    });
  });

  describe('getContacts', () => {
    it('GETs /whatsapp-api/contacts', async () => {
      await whatsappApi.getContacts();
      expect(lastFetch().url).toContain('/whatsapp-api/contacts');
    });
  });

  describe('error handling', () => {
    it('propagates network errors', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Offline'));
      const res = await whatsappApi.getStatus();
      expect(res.error).toBe('Offline');
    });

    it('returns error on non-ok response', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ message: 'Service unavailable' }),
      } as Response);
      const res = await whatsappApi.getStatus();
      expect(res.error).toBeTruthy();
    });
  });
});
