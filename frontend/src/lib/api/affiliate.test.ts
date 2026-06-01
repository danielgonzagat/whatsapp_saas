import { beforeEach, describe, expect, it, vi } from 'vitest';
import { affiliateApi, requireAffiliateApiSuccess } from './affiliate';

const { apiFetch, mutate } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch,
}));

vi.mock('swr', () => ({
  mutate,
}));

describe('affiliateApi', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    mutate.mockReset();
  });

  it('rejects malformed marketplace product payloads instead of returning an empty marketplace', async () => {
    apiFetch.mockResolvedValueOnce({
      data: { products: { id: 'ap-1', name: 'Produto parceiro' } },
      status: 200,
    });

    await expect(affiliateApi.marketplace()).rejects.toThrow(
      'Affiliate marketplace products did not return a confirmed payload',
    );
  });

  it('normalizes my-products from the real backend wrapper', async () => {
    apiFetch.mockResolvedValueOnce({
      data: {
        products: [{ id: 'req-1', name: 'Produto salvo' }],
        count: 1,
      },
      status: 200,
    });

    const response = await affiliateApi.myProducts();

    expect(response.data).toEqual([{ id: 'req-1', name: 'Produto salvo' }]);
    expect(apiFetch).toHaveBeenCalledWith('/affiliate/my-products');
  });

  it('rejects malformed my-products payloads instead of returning no affiliations', async () => {
    apiFetch.mockResolvedValueOnce({
      data: { products: { id: 'req-1', name: 'Produto salvo' } },
      status: 200,
    });

    await expect(affiliateApi.myProducts()).rejects.toThrow(
      'Affiliate products did not return a confirmed payload',
    );
  });

  it('normalizes ai-search products to the graph search results contract', async () => {
    apiFetch.mockResolvedValueOnce({
      data: {
        products: [{ id: 'ap-1', name: 'Produto parceiro' }],
      },
      status: 200,
    });

    const response = await affiliateApi.aiSearch('parceiro');

    expect(response.data).toEqual({
      results: [{ id: 'ap-1', name: 'Produto parceiro' }],
    });
    expect(apiFetch).toHaveBeenCalledWith('/affiliate/ai-search', {
      method: 'POST',
      body: { query: 'parceiro' },
    });
  });

  it('rejects malformed ai-search payloads instead of returning empty graph results', async () => {
    apiFetch.mockResolvedValueOnce({
      data: { results: { id: 'ap-1', name: 'Produto parceiro' } },
      status: 200,
    });

    await expect(affiliateApi.aiSearch('parceiro')).rejects.toThrow(
      'Affiliate search products did not return a confirmed payload',
    );
  });

  it('normalizes category objects from the real backend to strings', async () => {
    apiFetch.mockResolvedValueOnce({
      data: {
        categories: [{ name: 'Cursos' }, { name: 'Comunidade' }],
      },
      status: 200,
    });

    const response = await affiliateApi.categories();

    expect(response.data).toEqual(['Cursos', 'Comunidade']);
  });

  it('invalidates affiliate caches only after successful mutations', async () => {
    apiFetch.mockResolvedValueOnce({
      data: { success: true, affiliationId: 'req-1' },
      status: 200,
      success: true,
    });

    await affiliateApi.requestAffiliation('ap-1');

    expect(mutate).toHaveBeenCalledWith(expect.any(Function));
  });

  it('throws backend mutation errors without invalidating affiliate caches', async () => {
    apiFetch.mockResolvedValueOnce({
      error: 'KYC required',
      status: 403,
    });

    await expect(affiliateApi.requestAffiliation('ap-1')).rejects.toThrow('KYC required');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('throws fallback mutation errors when backend reports success false', () => {
    expect(() =>
      requireAffiliateApiSuccess(
        { success: false, status: 200 },
        'Could not save affiliate product',
      ),
    ).toThrow('Could not save affiliate product');
  });
});
