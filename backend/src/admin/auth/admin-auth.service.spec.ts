import { AdminRole, AdminUserStatus, type AdminUser } from '@prisma/client';
import { AdminAuthService } from './admin-auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue('hashed'),
}));

const TEST_IP = '127.0.0.1';
const TEST_USER_AGENT = 'vitest';
const TEST_PASSWORD_HASH = 'hashed-password';

function buildUser(overrides: Partial<AdminUser> = {}): AdminUser {
  const now = new Date('2026-05-11T12:00:00.000Z');
  return {
    id: 'admin-1',
    name: 'Owner',
    email: 'owner@kloel.com',
    passwordHash: TEST_PASSWORD_HASH,
    role: AdminRole.OWNER,
    status: AdminUserStatus.ACTIVE,
    mfaSecret: null,
    mfaEnabled: false,
    mfaPendingSetup: true,
    passwordChangeRequired: false,
    allowedIps: null,
    lastLoginAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
    createdById: null,
    ...overrides,
  };
}

function buildService(user: AdminUser) {
  const auditAppend = jest.fn().mockResolvedValue(undefined);
  const createFullSession = jest.fn().mockResolvedValue({
    state: 'authenticated',
    accessToken: 'access',
    refreshToken: 'refresh',
    admin: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  const signScoped = jest.fn().mockResolvedValue('scoped-token');
  const adminUserUpdate = jest.fn().mockResolvedValue({ ...user, lastLoginAt: new Date() });
  const prisma = {
    adminUser: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: adminUserUpdate,
    },
    adminLoginAttempt: { create: jest.fn().mockResolvedValue({}) },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (callback: unknown) => {
      if (typeof callback === 'function') {
        return callback({
          adminLoginAttempt: { create: jest.fn().mockResolvedValue({}) },
          adminUser: { update: jest.fn().mockResolvedValue(user) },
          adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
        });
      }
      return null;
    }),
  };
  const service = new AdminAuthService(
    prisma as never,
    {} as never,
    { isLocked: jest.fn().mockResolvedValue(false) } as never,
    { append: auditAppend } as never,
    { signScoped, createFullSession } as never,
  );
  return { service, auditAppend, createFullSession, signScoped, adminUserUpdate };
}

describe('AdminAuthService MFA bypass', () => {
  beforeEach(() => {
    delete process.env.ADMIN_MFA_BYPASS_ENABLED;
  });

  afterEach(() => {
    delete process.env.ADMIN_MFA_BYPASS_ENABLED;
    jest.clearAllMocks();
  });

  it('authenticates directly when bypass is active and MFA is not configured', async () => {
    process.env.ADMIN_MFA_BYPASS_ENABLED = 'true';
    const user = buildUser({ mfaEnabled: false, mfaPendingSetup: true });
    const { service, auditAppend, createFullSession } = buildService(user);

    const response = await service.login(user.email, 'Password123!', TEST_IP, TEST_USER_AGENT);

    expect(response.state).toBe('authenticated');
    expect(createFullSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: user.id }),
      TEST_IP,
      TEST_USER_AGENT,
    );
    expect(auditAppend).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.auth.login.mfa_bypassed', adminUserId: user.id }),
    );
  });

  it('authenticates directly when bypass is active and MFA is configured', async () => {
    process.env.ADMIN_MFA_BYPASS_ENABLED = '1';
    const user = buildUser({ mfaEnabled: true, mfaPendingSetup: false, mfaSecret: 'encrypted' });
    const { service } = buildService(user);

    const response = await service.login(user.email, 'Password123!', TEST_IP, TEST_USER_AGENT);

    expect(response.state).toBe('authenticated');
  });

  it('keeps password change required ahead of the bypass', async () => {
    process.env.ADMIN_MFA_BYPASS_ENABLED = 'true';
    const user = buildUser({ passwordChangeRequired: true });
    const { service, createFullSession, signScoped } = buildService(user);

    const response = await service.login(user.email, 'Password123!', TEST_IP, TEST_USER_AGENT);

    expect(response.state).toBe('password_change_required');
    expect(signScoped).toHaveBeenCalled();
    expect(createFullSession).not.toHaveBeenCalled();
  });

  it('requires MFA setup by default when MFA is not configured', async () => {
    const user = buildUser({ mfaEnabled: false, mfaPendingSetup: true });
    const { service } = buildService(user);

    const response = await service.login(user.email, 'Password123!', TEST_IP, TEST_USER_AGENT);

    expect(response.state).toBe('mfa_setup_required');
  });

  it('requires MFA verification by default when MFA is configured', async () => {
    const user = buildUser({ mfaEnabled: true, mfaPendingSetup: false, mfaSecret: 'encrypted' });
    const { service } = buildService(user);

    const response = await service.login(user.email, 'Password123!', TEST_IP, TEST_USER_AGENT);

    expect(response.state).toBe('mfa_required');
  });
});
