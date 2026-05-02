import { apiFetch } from './core';

export async function importProducts(data: {
  products: Array<{
    name: string;
    price?: number;
    description?: string;
    [key: string]: unknown;
  }>;
  source?: string;
}): Promise<{ imported: number; errors: Array<{ message: string }> }> {
  const res = await apiFetch<{ imported: number; errors?: Array<{ message: string }> }>(
    '/products/import',
    {
      method: 'POST',
      body: data,
    },
  );
  if (res.error) {
    throw new Error(res.error);
  }
  return {
    imported: Number(res.data?.imported || 0),
    errors: Array.isArray(res.data?.errors) ? res.data.errors : [],
  };
}
