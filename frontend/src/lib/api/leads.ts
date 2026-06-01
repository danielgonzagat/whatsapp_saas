import { apiFetch } from './core';

/** Lead shape. */
export interface Contact {
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

type ContactsPayload = Contact[] | { leads: Contact[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractContactsPayload(data: ContactsPayload | undefined): Contact[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (isRecord(data) && Array.isArray(data.leads)) {
    return data.leads as Contact[];
  }

  throw new Error('Contacts list did not return a confirmed payload');
}

export async function getContacts(
  workspaceId: string,
  params?: { status?: string; search?: string; limit?: number },
): Promise<Contact[]> {
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

  const res = await apiFetch<ContactsPayload>(endpoint);
  if (res.error || res.status >= 400) {
    throw new Error(res.error ?? 'Erro ao listar contatos');
  }

  return extractContactsPayload(res.data);
}
