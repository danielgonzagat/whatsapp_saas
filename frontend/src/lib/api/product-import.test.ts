import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importProducts } from './product-import';

const { apiFetch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch,
}));

const payload = {
  products: [{ name: 'Produto real' }],
  source: 'csv',
};

describe('importProducts', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('returns import errors from confirmed backend results', async () => {
    apiFetch.mockResolvedValueOnce({
      data: {
        imported: 1,
        failed: 1,
        results: [
          { success: true, product: { id: 'p1', name: 'Produto real' } },
          { success: false, error: 'SKU duplicado' },
        ],
      },
      status: 200,
    });

    await expect(importProducts(payload)).resolves.toEqual({
      imported: 1,
      failed: 1,
      errors: [{ message: 'SKU duplicado' }],
    });
  });

  it('rejects malformed import results instead of dropping product import failures', async () => {
    apiFetch.mockResolvedValueOnce({
      data: {
        imported: 0,
        failed: 1,
        results: { success: false, error: 'SKU duplicado' },
      },
      status: 200,
    });

    await expect(importProducts(payload)).rejects.toThrow(
      'Product import results did not return a confirmed payload',
    );
  });
});
