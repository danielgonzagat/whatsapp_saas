import { mutate } from 'swr';
import { apiFetch } from './core';

type WebinarMutationEnvelope = { error?: string | undefined; status: number };

function confirmWebinarMutation<T extends WebinarMutationEnvelope>(
  response: T,
  fallbackMessage: string,
): T {
  if (response.error) {
    throw new Error(response.error);
  }
  if (response.status >= 400) {
    throw new Error(fallbackMessage);
  }
  return response;
}

export const webinarApi = {
  update: async (
    id: string,
    data: {
      title?: string;
      url?: string;
      date?: string;
      description?: string;
      status?: string;
      productId?: string;
    },
  ) => {
    const res = await apiFetch<{ id: string; title: string }>(
      `/webinars/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: data,
      },
    );
    const confirmed = confirmWebinarMutation(res, 'Falha ao atualizar webinario.');
    mutate((key: string) => typeof key === 'string' && key.startsWith('/webinars'));
    return confirmed;
  },

  remove: async (id: string) => {
    const res = await apiFetch<{ success: boolean }>(`/webinars/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const confirmed = confirmWebinarMutation(res, 'Falha ao remover webinario.');
    mutate((key: string) => typeof key === 'string' && key.startsWith('/webinars'));
    return confirmed;
  },
};
