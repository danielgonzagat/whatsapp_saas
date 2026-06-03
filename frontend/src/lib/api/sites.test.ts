import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mutate } from 'swr';

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

import { sitesApi } from './sites';

const mutateMock = vi.mocked(mutate);


beforeEach(() => {
  mutateMock.mockReset();
  document.cookie = 'kloel_access_token=test-token; path=/';
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 's1', name: 'Test Site', slug: 'test', status: 'DRAFT' }),
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
  if (input instanceof Request) {input.headers.forEach((v, k) => { headers[k] = v; });}
  return { url, method, headers };
}

describe('sitesApi', () => {
  describe('listSites', () => {
    it('GETs /sites', async () => {
      await sitesApi.listSites('ws1');
      const { url, method } = lastFetch();
      expect(method).toBe('GET');
      expect(url).toContain('/sites');
    });

    it('appends query params for status and search', async () => {
      await sitesApi.listSites('ws1', { status: 'PUBLISHED', search: 'foo' });
      const { url } = lastFetch();
      expect(url).toContain('status=PUBLISHED');
      expect(url).toContain('search=foo');
    });

    it('appends page and limit params', async () => {
      await sitesApi.listSites('ws1', { page: 2, limit: 10 });
      const { url } = lastFetch();
      expect(url).toContain('page=2');
      expect(url).toContain('limit=10');
    });
  });

  describe('createSite', () => {
    it('POSTs to /sites', async () => {
      await sitesApi.createSite('ws1', { name: 'New' });
      const { url, method } = lastFetch();
      expect(method).toBe('POST');
      expect(url).toContain('/sites');
    });
  });

  describe('getSite', () => {
    it('GETs /sites/:id', async () => {
      await sitesApi.getSite('ws1', 'site-1');
      const { url, method } = lastFetch();
      expect(method).toBe('GET');
      expect(url).toContain('/sites/site-1');
    });
  });

  describe('updateSite', () => {
    it('PUTs to /sites/:id', async () => {
      await sitesApi.updateSite('ws1', 'site-1', { name: 'Updated' });
      const { url, method } = lastFetch();
      expect(method).toBe('PUT');
      expect(url).toContain('/sites/site-1');
    });
  });

  describe('deleteSite', () => {
    it('DELETEs /sites/:id', async () => {
      await sitesApi.deleteSite('ws1', 'site-1');
      const { url, method } = lastFetch();
      expect(method).toBe('DELETE');
      expect(url).toContain('/sites/site-1');
    });
  });

  describe('publishSite', () => {
    it('POSTs to /sites/:id/publish', async () => {
      await sitesApi.publishSite('ws1', 'site-1');
      const { url, method } = lastFetch();
      expect(method).toBe('POST');
      expect(url).toContain('/sites/site-1/publish');
    });
  });

  describe('unpublishSite', () => {
    it('POSTs to /sites/:id/unpublish', async () => {
      await sitesApi.unpublishSite('ws1', 'site-1');
      const { url, method } = lastFetch();
      expect(method).toBe('POST');
      expect(url).toContain('/sites/site-1/unpublish');
    });
  });

  describe('listDomains', () => {
    it('GETs /sites/:id/domains', async () => {
      await sitesApi.listDomains('ws1', 'site-1');
      const { url, method } = lastFetch();
      expect(method).toBe('GET');
      expect(url).toContain('/sites/site-1/domains');
    });
  });

  describe('addDomain', () => {
    it('POSTs to /sites/:id/domains', async () => {
      await sitesApi.addDomain('ws1', 'site-1', { hostname: 'www.example.com' });
      const { url, method } = lastFetch();
      expect(method).toBe('POST');
      expect(url).toContain('/sites/site-1/domains');
    });
  });

  describe('deleteDomain', () => {
    it('DELETEs /sites/:id/domains/:domainId', async () => {
      await sitesApi.deleteDomain('ws1', 'site-1', 'dom-1');
      const { url, method } = lastFetch();
      expect(method).toBe('DELETE');
      expect(url).toContain('/sites/site-1/domains/dom-1');
    });
  });

  describe('listApps', () => {
    it('GETs /sites/:id/apps', async () => {
      await sitesApi.listApps('ws1', 'site-1');
      const { url, method } = lastFetch();
      expect(method).toBe('GET');
      expect(url).toContain('/sites/site-1/apps');
    });
  });

  describe('upsertApp', () => {
    it('PUTs to /sites/:id/apps/:appKey', async () => {
      await sitesApi.upsertApp('ws1', 'site-1', 'analytics', { enabled: true });
      const { url, method } = lastFetch();
      expect(method).toBe('PUT');
      expect(url).toContain('/sites/site-1/apps/analytics');
    });
  });

  describe('error handling', () => {
    it('propagates network errors', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Offline'));
      const res = await sitesApi.listSites('ws1');
      expect(res.error).toBe('Offline');
    });

    it('returns error on non-ok response', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'DB error' }),
      } as Response);
      const res = await sitesApi.listSites('ws1');
      expect(res.error).toBeTruthy();
    });

    it('does not invalidate sites when create returns an API error envelope', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Invalid site' }),
      } as Response);

      await expect(sitesApi.createSite('ws1', { name: 'New' })).rejects.toThrow('Invalid site');
      expect(mutateMock).not.toHaveBeenCalled();
    });
  });
});
