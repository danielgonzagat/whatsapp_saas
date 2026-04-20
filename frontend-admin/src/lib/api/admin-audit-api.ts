import { adminFetch } from './admin-client';

/** Admin audit record shape. */
export interface AdminAuditRecord {
  id: string;
  adminUserId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  adminUser?: { id: string; name: string; email: string; role: string } | null;
}

/** Admin audit list response shape. */
export interface AdminAuditListResponse {
  items: AdminAuditRecord[];
  total: number;
}

/** Admin audit list filters shape. */
export interface AdminAuditListFilters {
  adminUserId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  skip?: number;
  take?: number;
}

/** Admin audit api. */
export const adminAuditApi = {
  list(filters: AdminAuditListFilters = {}): Promise<AdminAuditListResponse> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    return adminFetch<AdminAuditListResponse>(qs ? `/audit?${qs}` : '/audit');
  },
};
