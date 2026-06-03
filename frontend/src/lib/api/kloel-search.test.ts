import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SEARCH_MODULE = './kloel-search';

type KloelSearchModule = {
  searchKloelGlobal: (query: string, limit?: number) => Promise<{
    query: string;
    total: number;
    results: Array<{ id: string; type: string; title: string; href: string }>;
  }>;
};

async function loadSearchModule(): Promise<KloelSearchModule> {
  return (await import(SEARCH_MODULE)) as unknown as KloelSearchModule;
}

beforeEach(() => {
  document.cookie = 'kloel_access_token=test-token; path=/';
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      query: 'PDRN',
      total: 1,
      results: [{ id: 'prod-1', type: 'product', title: 'PDRN real', href: '/products/prod-1' }],
    }),
  } as Response);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function lastFetchUrl(): string {
  const call = vi.mocked(globalThis.fetch).mock.calls.at(-1);
  const input = call?.[0];
  return input instanceof Request ? input.url : String(input ?? '');
}

describe('searchKloelGlobal', () => {
  it('calls the authenticated Kloel global search endpoint', async () => {
    const { searchKloelGlobal } = await loadSearchModule();

    await expect(searchKloelGlobal('  PDRN  ', 10)).resolves.toEqual({
      query: 'PDRN',
      total: 1,
      results: [{ id: 'prod-1', type: 'product', title: 'PDRN real', href: '/products/prod-1' }],
    });

    expect(lastFetchUrl()).toContain('/kloel/search?q=PDRN&limit=10');
  });

  it('does not call the network for tiny queries', async () => {
    const { searchKloelGlobal } = await loadSearchModule();

    await expect(searchKloelGlobal('p')).resolves.toEqual({ query: 'p', total: 0, results: [] });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects malformed successful search payloads instead of returning fake empty results', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ query: 'PDRN', total: '1', results: [] }),
    } as Response);
    const { searchKloelGlobal } = await loadSearchModule();

    await expect(searchKloelGlobal('PDRN')).rejects.toThrow('Invalid Kloel search payload');
  });

  it('rejects malformed result items from the authenticated search endpoint', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        query: 'PDRN',
        total: 1,
        results: [{ id: 'prod-1', type: 'unknown', title: 'PDRN real', href: '/products/prod-1' }],
      }),
    } as Response);
    const { searchKloelGlobal } = await loadSearchModule();

    await expect(searchKloelGlobal('PDRN')).rejects.toThrow('Invalid Kloel search payload');
  });
});
