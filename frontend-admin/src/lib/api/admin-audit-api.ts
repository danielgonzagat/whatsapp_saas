import { adminFetch } from './admin-client';

/** Admin audit record shape. */
export interface AdminAuditRecord {
  /** Id property. */
  id: string;
  /** Admin user id property. */
  adminUserId: string | null;
  /** Action property. */
  action: string;
  /** Entity type property. */
  entityType: string | null;
  /** Entity id property. */
  entityId: string | null;
  /** Details property. */
  details: unknown;
  /** Ip property. */
  ip: string | null;
  /** User agent property. */
  userAgent: string | null;
  /** Created at property. */
  createdAt: string;
  /** Admin user property. */
  adminUser?: { id: string; name: string; email: string; role: string } | null;
}

/** Admin audit list response shape. */
export interface AdminAuditListResponse {
  /** Items property. */
  items: AdminAuditRecord[];
  /** Total property. */
  total: number;
}

/** Admin audit list filters shape. */
export interface AdminAuditListFilters {
  /** Admin user id property. */
  adminUserId?: string;
  /** Action property. */
  action?: string;
  /** Entity type property. */
  entityType?: string;
  /** From property. */
  from?: string;
  /** To property. */
  to?: string;
  /** Skip property. */
  skip?: number;
  /** Take property. */
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
