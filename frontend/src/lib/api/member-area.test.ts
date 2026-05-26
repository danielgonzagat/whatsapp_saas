import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { memberAreaApi } from './member-area';

beforeEach(() => {
  document.cookie = 'kloel_access_token=test-token; path=/';
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ id: 'ma1', name: 'Curso de Vendas' }] }),
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

describe('memberAreaApi', () => {
  describe('list', () => {
    it('GETs /member-areas', async () => {
      await memberAreaApi.list();
      const { url, method } = lastFetch();
      expect(method).toBe('GET');
      expect(url).toContain('/member-areas');
    });

    it('sends Authorization header', async () => {
      await memberAreaApi.list();
      expect(lastFetch().headers.authorization).toBe('Bearer test-token');
    });
  });

  describe('stats', () => {
    it('GETs /member-areas/stats', async () => {
      await memberAreaApi.stats();
      expect(lastFetch().url).toContain('/member-areas/stats');
    });
  });

  describe('get', () => {
    it('GETs /member-areas/:id', async () => {
      await memberAreaApi.get('ma1');
      const { url, method } = lastFetch();
      expect(method).toBe('GET');
      expect(url).toContain('/member-areas/ma1');
    });
  });

  describe('create', () => {
    it('POSTs to /member-areas', async () => {
      await memberAreaApi.create({ name: 'New Area' });
      const { url, method } = lastFetch();
      expect(method).toBe('POST');
      expect(url).toContain('/member-areas');
    });
  });

  describe('error handling', () => {
    it('propagates network errors', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Offline'));
      const res = await memberAreaApi.list();
      expect(res.error).toBe('Offline');
    });

    it('returns error on non-ok response', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Server error' }),
      } as Response);
      const res = await memberAreaApi.list();
      expect(res.error).toBeTruthy();
    });
  });
});
