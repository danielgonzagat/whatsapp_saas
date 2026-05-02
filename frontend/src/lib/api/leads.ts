import { apiFetch } from './core';

/** Lead shape. */
export interface Lead {
  /** Id property. */
  id: string;
  /** Phone property. */
  phone: string;
  /** Name property. */
  name?: string;
  /** Email property. */
  email?: string;
  /** Status property. */
  status: string;
  /** Last intent property. */
  lastIntent?: string;
  /** Last interaction property. */
  lastInteraction?: string;
  /** Total messages property. */
  totalMessages?: number;
  /** Metadata property. */
  metadata?: Record<string, unknown>;
  /** Created at property. */
  createdAt?: string;
  /** Updated at property. */
  updatedAt?: string;
}

export async function getLeads(
  workspaceId: string,
  params?: { status?: string; search?: string; limit?: number },
): Promise<Lead[]> {
  const query = new URLSearchParams();
  if (params?.status) {
    query.set('status', params.status);
  }
  if (params?.search) {
    query.set('q', params.search);
  }
  if (params?.limit) {
    query.set('limit', String(params.limit));
  }

  const endpoint = `/kloel/leads/${encodeURIComponent(workspaceId)}${
    query.toString() ? `?${query.toString()}` : ''
  }`;

  const res = await apiFetch<Lead[] | { leads: Lead[] }>(endpoint);
  if (res.error) {
    throw new Error(res.error);
  }

  const data = res.data;
  if (Array.isArray(data)) {
    return data;
  }
  if (
    data &&
    typeof data === 'object' &&
    'leads' in data &&
    Array.isArray((data as { leads: Lead[] }).leads)
  ) {
    return (data as { leads: Lead[] }).leads;
  }
  return [];
}
