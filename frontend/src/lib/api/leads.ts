import { apiFetch } from './core';
import type { CrmContact } from './crm';

/**
 * Lead / commercial-stage view-model for the canonical contact entity
 * (CrmContact, backed by the backend `Contact` model). The shared identity
 * fields are re-derived from CrmContact; this view adds funnel-/UI-derived
 * fields (status, lastIntent, lastInteraction, totalMessages, metadata) that
 * the leads list/detail screens render. Behaviour/shape unchanged — `name`
 * and `email` stay optional (CrmContact already allows `| null`, which every
 * consumer handles via `|| ''`).
 */
export type Contact = Pick<
  CrmContact,
  'id' | 'phone' | 'name' | 'email' | 'createdAt' | 'updatedAt'
> & {
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
};

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
