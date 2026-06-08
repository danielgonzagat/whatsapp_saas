import type { PublicCheckoutResponse } from '@/lib/public-checkout-contract';

export interface PublicCheckoutServerResult {
  initialData: PublicCheckoutResponse | null;
  initialError: string | null;
}

export async function loadPublicCheckoutFromServer(
  endpoint: string,
): Promise<PublicCheckoutServerResult> {
  try {
    const res = await fetch(endpoint, { cache: 'no-store' });

    if (!res.ok) {
      return {
        initialData: null,
        initialError: `Checkout nao encontrado (${res.status})`,
      };
    }

    return {
      initialData: (await res.json()) as PublicCheckoutResponse,
      initialError: null,
    };
  } catch {
    return {
      initialData: null,
      initialError: 'Nao foi possivel carregar este checkout agora.',
    };
  }
}
