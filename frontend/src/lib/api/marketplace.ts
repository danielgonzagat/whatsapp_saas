import { mutate } from 'swr';
import { apiFetch } from './core';

type MarketplaceEnvelope = { error?: string | undefined; status: number };

function requireMarketplaceResponse<T extends MarketplaceEnvelope>(
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

export async function installMarketplaceTemplate(templateId: string) {
  const res = requireMarketplaceResponse(
    await apiFetch<{ success: boolean; templateId: string }>(
      `/marketplace/install/${encodeURIComponent(templateId)}`,
      {
        method: 'POST',
      },
    ),
    'Falha ao instalar template do marketplace.',
  );
  if (res.data?.success === false) {
    throw new Error('Falha ao instalar template do marketplace.');
  }
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
    data?: Array<Record<string, unknown>>;
    templates?: Array<Record<string, unknown>>;
  }
  const res = await apiFetch<Array<Record<string, unknown>> | TemplateListResponse>(
    `/marketplace/templates${query ? `?${query}` : ''}`,
  );
  requireMarketplaceResponse(res, 'Falha ao carregar templates do marketplace.');
  const data = res.data;
  if (Array.isArray(data)) {
    return data;
  }
  const templateEnvelope = data as TemplateListResponse | undefined;
  if (Array.isArray(templateEnvelope?.templates)) {
    return templateEnvelope.templates;
  }
  if (Array.isArray(templateEnvelope?.data)) {
    return templateEnvelope.data;
  }
  throw new Error('Templates do marketplace nao retornaram um payload confirmado.');
}
