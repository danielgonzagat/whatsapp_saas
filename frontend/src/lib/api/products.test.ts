import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { productApi } from './products';

beforeEach(() => {
  document.cookie = 'kloel_access_token=test-token; path=/';
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { products: [{ id: 'p1', name: 'Widget' }], count: 1 } }),
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

describe('productApi', () => {
  describe('list', () => {
    it('GETs /products with default params', async () => {
      await productApi.list();
      const { url, method } = lastFetch();
      expect(method).toBe('GET');
      expect(url).toContain('/products');
    });

    it('appends category query param', async () => {
      await productApi.list({ category: 'books' });
      expect(lastFetch().url).toContain('category=books');
    });

    it('sends Authorization header', async () => {
      await productApi.list();
      expect(lastFetch().headers.authorization).toBe('Bearer test-token');
    });
  });

  describe('get', () => {
    it('GETs /products/:id', async () => {
      await productApi.get('prod-1');
      const { url, method } = lastFetch();
      expect(method).toBe('GET');
      expect(url).toContain('/products/prod-1');
    });
  });

  describe('create', () => {
    it('POSTs to /products', async () => {
      await productApi.create({ name: 'New', price: 99 });
      const { url, method } = lastFetch();
      expect(method).toBe('POST');
      expect(url).toContain('/products');
    });
  });

  describe('remove', () => {
    it('DELETEs /products/:id', async () => {
      await productApi.remove('prod-1');
      const { url, method } = lastFetch();
      expect(method).toBe('DELETE');
      expect(url).toContain('/products/prod-1');
    });
  });

  describe('getCategories', () => {
    it('GETs /products/categories/list', async () => {
      await productApi.getCategories();
      expect(lastFetch().url).toContain('/products/categories/list');
    });
  });

  describe('error handling', () => {
    it('propagates network errors', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Offline'));
      const res = await productApi.list();
      expect(res.error).toBe('Offline');
    });

    it('returns error on non-ok response', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'DB error' }),
      } as Response);
      const res = await productApi.list();
      expect(res.error).toBeTruthy();
    });
  });
});
