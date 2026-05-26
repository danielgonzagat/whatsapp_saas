import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crmApi } from './crm';

beforeEach(() => {
  document.cookie = 'kloel_access_token=test-token; path=/';
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      data: { data: [{ id: 'c1', name: 'Alice', phone: '5511999999999' }], meta: { total: 1, page: 1, limit: 20, pages: 1 } },
    }),
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

describe('crmApi', () => {
  describe('listContacts', () => {
    it('GETs /crm/contacts', async () => {
      await crmApi.listContacts();
      const { url, method } = lastFetch();
      expect(method).toBe('GET');
      expect(url).toContain('/crm/contacts');
    });

    it('appends search params', async () => {
      await crmApi.listContacts({ search: 'Alice', limit: 10 });
      const { url } = lastFetch();
      expect(url).toContain('search=Alice');
      expect(url).toContain('limit=10');
    });

    it('sends Authorization header', async () => {
      await crmApi.listContacts();
      expect(lastFetch().headers.authorization).toBe('Bearer test-token');
    });
  });

  describe('listPipelines', () => {
    it('GETs /crm/pipelines', async () => {
      await crmApi.listPipelines();
      expect(lastFetch().url).toContain('/crm/pipelines');
    });
  });

  describe('createDeal', () => {
    it('POSTs to /crm/deals', async () => {
      await crmApi.createDeal({ contactId: 'c1', stageId: 's1', title: 'Big deal', value: 5000 });
      const { url, method } = lastFetch();
      expect(method).toBe('POST');
      expect(url).toContain('/crm/deals');
    });
  });

  describe('error handling', () => {
    it('propagates network errors', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Offline'));
      const res = await crmApi.listContacts();
      expect(res.error).toBe('Offline');
    });

    it('returns error on non-ok response', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'DB error' }),
      } as Response);
      const res = await crmApi.listContacts();
      expect(res.error).toBeTruthy();
    });
  });
});
