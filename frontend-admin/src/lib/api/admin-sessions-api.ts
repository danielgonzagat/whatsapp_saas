import { adminFetch } from './admin-client';

/** Admin session record shape. */
export interface AdminSessionRecord {
  /** Id property. */
  id: string;
  /** Ip property. */
  ip: string;
  /** User agent property. */
  userAgent: string;
  /** Created at property. */
  createdAt: string;
  /** Expires at property. */
  expiresAt: string;
  /** Revoked at property. */
  revokedAt: string | null;
}

/** Admin sessions api. */
export const adminSessionsApi = {
  listMine(): Promise<AdminSessionRecord[]> {
    return adminFetch<AdminSessionRecord[]>('/sessions/me');
  },
  revoke(id: string): Promise<void> {
    return adminFetch<void>(`/sessions/${id}`, { method: 'DELETE' });
  },
};
