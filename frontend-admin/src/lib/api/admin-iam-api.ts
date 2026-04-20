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
  role: 'OWNER' | 'MANAGER' | 'STAFF';
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

/** Admin user permission shape. */
export interface AdminUserPermission {
  /** Id property. */
  id: string;
  /** Admin user id property. */
  adminUserId: string;
  /** Module property. */
  module: string;
  /** Action property. */
  action: string;
  /** Allowed property. */
  allowed: boolean;
  /** Created at property. */
  createdAt: string;
}

/** Create admin user input shape. */
export interface CreateAdminUserInput {
  /** Name property. */
  name: string;
  /** Email property. */
  email: string;
  /** Temporary password property. */
  temporaryPassword: string;
  /** Role property. */
  role: 'OWNER' | 'MANAGER' | 'STAFF';
}

/** Update admin user input shape. */
export interface UpdateAdminUserInput {
  /** Name property. */
  name?: string;
  /** Role property. */
  role?: 'OWNER' | 'MANAGER' | 'STAFF';
  /** Status property. */
  status?: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
}

/** Permission set entry shape. */
export interface PermissionSetEntry {
  /** Module property. */
  module: string;
  /** Action property. */
  action: string;
  /** Allowed property. */
  allowed: boolean;
}

/** Admin iam api. */
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
