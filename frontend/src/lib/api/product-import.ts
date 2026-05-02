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
    imported: number;
    failed: number;
    results?: ImportResult[];
  }>('/products/import', {
    method: 'POST',
    body: data,
  });
  if (res.error) {
    throw new Error(res.error);
  }
  const results = Array.isArray(res.data?.results) ? res.data.results : [];
  return {
    imported: Number(res.data?.imported || 0),
    failed: Number(res.data?.failed || 0),
    errors: results
      .filter((r: ImportResult) => !r.success && r.error)
      .map((r: ImportResult) => ({ message: r.error! })),
  };
}
