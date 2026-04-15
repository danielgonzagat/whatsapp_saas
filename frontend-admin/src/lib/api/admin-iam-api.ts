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

export interface CreateAdminUserInput {
  name: string;
  email: string;
  temporaryPassword: string;
  role: 'OWNER' | 'MANAGER' | 'STAFF';
}

export interface UpdateAdminUserInput {
  name?: string;
  role?: 'OWNER' | 'MANAGER' | 'STAFF';
  status?: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
}

export interface PermissionSetEntry {
  module: string;
  action: string;
  allowed: boolean;
}

export const adminIamApi = {
  listUsers(): Promise<AdminUserRecord[]> {
    return adminFetch<AdminUserRecord[]>('/users');
  },
  getUserPermissions(id: string): Promise<AdminUserPermission[]> {
    return adminFetch<AdminUserPermission[]>(`/users/${encodeURIComponent(id)}/permissions`);
  },
  createUser(input: CreateAdminUserInput): Promise<AdminUserRecord> {
    return adminFetch<AdminUserRecord>('/users', { method: 'POST', body: input });
  },
  updateUser(id: string, patch: UpdateAdminUserInput): Promise<AdminUserRecord> {
    return adminFetch<AdminUserRecord>(`/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: patch,
    });
  },
  setPermissions(id: string, permissions: PermissionSetEntry[]): Promise<AdminUserPermission[]> {
    return adminFetch<AdminUserPermission[]>(`/users/${encodeURIComponent(id)}/permissions`, {
      method: 'PUT',
      body: { permissions },
    });
  },
};
