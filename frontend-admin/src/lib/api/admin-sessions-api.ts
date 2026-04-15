import { adminFetch } from './admin-client';

export interface AdminSessionRecord {
  id: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export const adminSessionsApi = {
  listMine(): Promise<AdminSessionRecord[]> {
    return adminFetch<AdminSessionRecord[]>('/sessions/me');
  },
  revoke(id: string): Promise<void> {
    return adminFetch<void>(`/sessions/${id}`, { method: 'DELETE' });
  },
};
