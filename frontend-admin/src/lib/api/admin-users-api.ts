import type { AdminRole } from '../auth/admin-session-types';
import { adminFetch } from './admin-client';

/** Admin user record shape. */
export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  mfaEnabled: boolean;
  mfaPendingSetup: boolean;
  passwordChangeRequired: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Admin users api. */
export const adminUsersApi = {
  me(): Promise<AdminUserRecord> {
    return adminFetch<AdminUserRecord>('/users/me');
  },
  list(): Promise<AdminUserRecord[]> {
    return adminFetch<AdminUserRecord[]>('/users');
  },
};
