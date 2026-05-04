import { apiFetch } from './core';

export const checkoutPublicApi = {
  affiliateRedirect: (code: string) =>
    apiFetch<{ checkoutUrl: string; product?: { id: string; name: string; slug?: string } }>(
      `/checkout/public/r/${encodeURIComponent(code)}`,
    ),

  calculateShipping: (data: { slug: string; cep: string }) =>
    apiFetch<{
      options: Array<{
        carrier?: string;
        price: number;
        days: string;
        label?: string;
        name?: string;
      }>;
    }>('/checkout/public/shipping', { method: 'POST', body: data }),
};
