import { mutate } from 'swr';
import { apiFetch } from './core';

export interface FollowUpConfig {
  contactId?: string;
  phone?: string;
  message: string;
  scheduledAt: string;
  type?: 'follow_up' | 'reminder' | 'promotion';
}

export interface MeetingConfig {
  contactId?: string;
  phone?: string;
  title: string;
  description?: string;
  scheduledAt: string;
  duration?: number;
  meetingLink?: string;
}

interface KloelFollowup {
  id: string;
  contactId?: string;
  message?: string;
  scheduledAt?: string;
  status?: string;
}

export async function scheduleFollowUp(
  workspaceId: string,
  config: FollowUpConfig,
  _token?: string,
): Promise<{ success: boolean; jobId?: string; message?: string }> {
  const res = await apiFetch<{ success: boolean; jobId?: string; message?: string }>(`/followups`, {
    method: 'POST',
    body: { workspaceId, ...config },
  });
  if (res.error) {
    throw new Error(res.error || 'Erro ao agendar follow-up');
  }
  mutate((key: string) => typeof key === 'string' && key.startsWith('/followups'));
  return res.data as { success: boolean; jobId?: string; message?: string };
}

export async function listScheduledFollowUps(
  workspaceId: string,
  _token?: string,
): Promise<
  Array<{ id: string; phone: string; message: string; scheduledAt: string; status: string }>
> {
  const res = await apiFetch<{
    followups: Array<{
      id: string;
      phone: string;
      message: string;
      scheduledAt: string;
      status: string;
    }>;
  }>(`/followups?workspaceId=${encodeURIComponent(workspaceId)}`);
  if (res.error) {
    return [];
  }
  return res.data?.followups || [];
}

export async function cancelFollowUp(
  _workspaceId: string,
  followUpId: string,
  _token?: string,
): Promise<{ success: boolean }> {
  const res = await apiFetch<{ success: boolean }>(`/followups/${followUpId}`, {
    method: 'DELETE',
  });
  mutate((key: string) => typeof key === 'string' && key.startsWith('/followups'));
  return { success: !res.error };
}

export async function getFollowupsApi(workspaceId?: string) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  return apiFetch<{
    followups: Array<{
      id: string;
      phone: string;
      message: string;
      scheduledAt: string;
      status: string;
    }>;
  }>(`/followups${qs}`);
}

export async function getFollowupStatsApi(workspaceId?: string) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  return apiFetch<{ total: number; pending: number; completed: number; failed: number }>(
    `/followups/stats${qs}`,
  );
}

export async function patchFollowup(
  id: string,
  data: {
    status?: string;
    scheduledAt?: string;
    message?: string;
    notes?: string;
    [key: string]: unknown;
  },
): Promise<unknown> {
  const res = await apiFetch<unknown>(`/followups/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: data,
  });
  if (res.error) {
    throw new Error(res.error);
  }
  mutate((k: string) => typeof k === 'string' && k.startsWith('/followups'));
  return res.data;
}

export async function getKloelFollowups(contactId?: string): Promise<KloelFollowup[]> {
  const res = contactId
    ? await apiFetch<KloelFollowup[] | { followups: KloelFollowup[] }>(
        `/kloel/followups/${encodeURIComponent(contactId)}`,
      )
    : await apiFetch<KloelFollowup[] | { followups: KloelFollowup[] }>('/kloel/followups');
  if (res.error) {
    return [];
  }
  const data = res.data;
  return Array.isArray(data) ? data : ((data as { followups: KloelFollowup[] })?.followups ?? []);
}
