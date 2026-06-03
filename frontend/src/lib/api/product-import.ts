import { apiFetch } from './core';

interface ImportResult {
  success: boolean;
  product?: { id: string; name: string };
  error?: string;
}

export async function importProducts(data: {
  products: Array<{
    name: string;
    price?: number;
    description?: string;
    [key: string]: unknown;
  }>;
  source?: string;
}): Promise<{ imported: number; failed: number; errors: Array<{ message: string }> }> {
  const res = await apiFetch<{
    imported?: number;
    failed?: number;
    results?: unknown;
  }>('/products/import', {
    method: 'POST',
    body: data,
  });
  if (res.error) {
    throw new Error(res.error);
  }

  const payload = res.data;
  if (!payload || typeof payload !== 'object') {
    throw new Error('Product import did not return a confirmed payload');
  }

  if (!Array.isArray(payload.results)) {
    throw new Error('Product import results did not return a confirmed payload');
  }

  const results = payload.results as ImportResult[];
  return {
    imported: Number(payload.imported || 0),
    failed: Number(payload.failed || 0),
    errors: results
      .filter((r: ImportResult) => !r.success && r.error)
      .map((r: ImportResult) => ({ message: r.error! })),
  };
}
