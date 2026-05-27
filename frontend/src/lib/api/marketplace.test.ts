import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listMarketplaceTemplates, installMarketplaceTemplate } from './marketplace';

beforeEach(() => {
  document.cookie = 'kloel_access_token=test-token; path=/';
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ id: 't1', name: 'Sales CRM', category: 'crm' }] }),
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

describe('marketplace', () => {
  describe('listMarketplaceTemplates', () => {
    it('GETs /marketplace/templates', async () => {
      await listMarketplaceTemplates();
      const { url, method } = lastFetch();
      expect(method).toBe('GET');
      expect(url).toContain('/marketplace/templates');
    });

    it('appends category query param', async () => {
      await listMarketplaceTemplates({ category: 'crm' });
      expect(lastFetch().url).toContain('category=crm');
    });

    it('sends Authorization header', async () => {
      await listMarketplaceTemplates();
      expect(lastFetch().headers.authorization).toBe('Bearer test-token');
    });

    it('returns empty array on error', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'fail' }),
      } as Response);
      const res = await listMarketplaceTemplates();
      expect(res).toEqual([]);
    });
  });

  describe('installMarketplaceTemplate', () => {
    it('POSTs to /marketplace/install/:id', async () => {
      await installMarketplaceTemplate('t1');
      const { url, method } = lastFetch();
      expect(method).toBe('POST');
      expect(url).toContain('/marketplace/install/t1');
    });

    it('returns success response', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { success: true, templateId: 't1' } }),
      } as Response);
      const res = await installMarketplaceTemplate('t1');
      expect(res.data).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('propagates network errors on install', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Offline'));
      const res = await installMarketplaceTemplate('t1');
      expect(res.error).toBe('Offline');
    });
  });
});
