import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLeads } from './leads';

beforeEach(() => {
  document.cookie = 'kloel_access_token=test-token; path=/';
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => [{ id: 'l1', phone: '5511999999999', name: 'Alice', status: 'hot' }],
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

describe('getLeads', () => {
  it('GETs /kloel/leads/:workspaceId', async () => {
    await getLeads('ws-1');
    const { url, method } = lastFetch();
    expect(method).toBe('GET');
    expect(url).toContain('/kloel/leads/ws-1');
  });

  it('appends status and search query params', async () => {
    await getLeads('ws-1', { status: 'hot', search: 'Alice' });
    const { url } = lastFetch();
    expect(url).toContain('status=hot');
    expect(url).toContain('q=Alice');
  });

  it('appends limit query param', async () => {
    await getLeads('ws-1', { limit: 25 });
    expect(lastFetch().url).toContain('limit=25');
  });

  it('sends Authorization header', async () => {
    await getLeads('ws-1');
    expect(lastFetch().headers.authorization).toBe('Bearer test-token');
  });

  it('falls back to empty array when data is not an array', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);
    const leads = await getLeads('ws-1');
    expect(leads).toEqual([]);
  });

  it('unwraps { leads } envelope', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ leads: [{ id: 'l2', phone: '55', status: 'cold' }] }),
    } as Response);
    const leads = await getLeads('ws-1');
    expect(leads).toHaveLength(1);
    expect(leads[0].id).toBe('l2');
  });

  describe('error handling', () => {
    it('throws on error response', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      } as Response);
      await expect(getLeads('ws-1')).rejects.toThrow('Server error');
    });
  });
});
