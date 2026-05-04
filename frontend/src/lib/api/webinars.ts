import { mutate } from 'swr';
import { apiFetch } from './core';

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
    mutate((key: string) => typeof key === 'string' && key.startsWith('/webinars'));
    return res;
  },

  remove: async (id: string) => {
    const res = await apiFetch<{ success: boolean }>(`/webinars/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/webinars'));
    return res;
  },
};
