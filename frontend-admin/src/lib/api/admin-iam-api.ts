import { adminFetch } from './admin-client';

export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'MANAGER' | 'STAFF';
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  mfaEnabled: boolean;
  mfaPendingSetup: boolean;
  passwordChangeRequired: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserPermission {
  id: string;
  adminUserId: string;
  module: string;
  action: string;
  allowed: boolean;
  createdAt: string;
}

export const adminIamApi = {
  listUsers(): Promise<AdminUserRecord[]> {
    return adminFetch<AdminUserRecord[]>('/users');
  },
  getUserPermissions(id: string): Promise<AdminUserPermission[]> {
    return adminFetch<AdminUserPermission[]>(`/users/${encodeURIComponent(id)}/permissions`);
  },
};
