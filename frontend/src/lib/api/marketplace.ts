import { mutate } from 'swr';
import { apiFetch } from './core';

export async function installMarketplaceTemplate(templateId: string) {
  const res = await apiFetch<{ success: boolean; templateId: string }>(
    `/marketplace/install/${encodeURIComponent(templateId)}`,
    {
      method: 'POST',
    },
  );
  mutate((key: string) => typeof key === 'string' && key.startsWith('/marketplace'));
  return res;
}

export async function listMarketplaceTemplates(params?: {
  category?: string;
  search?: string;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const qs = new URLSearchParams();
  if (params?.category) {
    qs.set('category', params.category);
  }
  if (params?.search) {
    qs.set('search', params.search);
  }
  if (params?.limit) {
    qs.set('limit', String(params.limit));
  }
  const query = qs.toString();
  interface TemplateListResponse {
    templates?: Array<Record<string, unknown>>;
  }
  const res = await apiFetch<Array<Record<string, unknown>> | TemplateListResponse>(
    `/marketplace/templates${query ? `?${query}` : ''}`,
  );
  if (res.error) {
    return [];
  }
  const data = res.data;
  return Array.isArray(data) ? data : ((data as TemplateListResponse)?.templates ?? []);
}
