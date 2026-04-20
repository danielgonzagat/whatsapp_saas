import type { AdminRole } from '../auth/admin-session-types';
import { adminFetch } from './admin-client';

/** Admin user record shape. */
export interface AdminUserRecord {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Email property. */
  email: string;
  /** Role property. */
  role: AdminRole;
  /** Status property. */
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  /** Mfa enabled property. */
  mfaEnabled: boolean;
  /** Mfa pending setup property. */
  mfaPendingSetup: boolean;
  /** Password change required property. */
  passwordChangeRequired: boolean;
  /** Last login at property. */
  lastLoginAt: string | null;
  /** Created at property. */
  createdAt: string;
  /** Updated at property. */
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
