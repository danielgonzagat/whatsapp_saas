import { mutate } from 'swr';
import { apiFetch } from './core';

export const adRulesApi = {
  update: async (
    id: string,
    data: {
      name?: string;
      condition?: string;
      action?: string;
      alertMethod?: string;
      alertTarget?: string;
      active?: boolean;
    },
  ) => {
    const res = await apiFetch<{ id: string; name: string; active: boolean }>(
      `/ad-rules/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: data,
      },
    );
    mutate((key: string) => typeof key === 'string' && key.startsWith('/ad-rules'));
    return res;
  },
};
