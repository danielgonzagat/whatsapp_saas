import { Test, TestingModule } from '@nestjs/testing';
import { AdminUserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminMfaService } from './admin-mfa.service';
import { AdminLoginAttemptsService } from './admin-login-attempts.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminSessionFactory } from './admin-session-factory';
import { AdminAuthService } from './admin-auth.service';

const mockBcryptCompare = jest.fn();
const mockBcryptHash = jest.fn();

jest.mock('bcrypt', () => ({
  compare: (...args: unknown[]) => mockBcryptCompare(...args),
  hash: (...args: unknown[]) => mockBcryptHash(...args),
}));

const mockSha256Hex = jest.fn();
jest.mock('../common/admin-crypto', () => ({
  sha256Hex: (...args: unknown[]) => mockSha256Hex(...args),
}));

describe('AdminAuthService', () => {
  let service: AdminAuthService;

  const ip = '1.2.3.4';
  const userAgent = 'test-agent';
  const email = 'admin@test.com';
  const normalizedEmail = email.trim().toLowerCase();

  const adminUser = {
    id: 'admin_1',
    email: normalizedEmail,
    name: 'Admin',
    role: 'OWNER' as const,
    status: AdminUserStatus.ACTIVE,
    passwordHash: '$2b$12$hashed',
    passwordChangeRequired: false,
    mfaEnabled: true,
    mfaPendingSetup: false,
    mfaSecret: 'encrypted-secret',
    lockedUntil: null as Date | null,
    lastLoginAt: null as Date | null,
    failedLoginCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTx = {
    adminLoginAttempt: { create: jest.fn() },
    adminUser: { update: jest.fn() },
    adminAuditLog: { create: jest.fn() },
    adminSession: { update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
  };

  const mockUserFindUnique = jest.fn();
  const mockUserUpdate = jest.fn();
  const mockSessionFindUnique = jest.fn();

  const prismaMock = {
    adminUser: {
      findUnique: mockUserFindUnique,
      update: mockUserUpdate,
    },
    adminSession: {
      findUnique: mockSessionFindUnique,
    },
    adminLoginAttempt: {
      create: jest.fn(),
      count: jest.fn(),
    },
    adminAuditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockMfa = {
    createSetup: jest.fn(),
    resumeSetup: jest.fn(),
    verifyCode: jest.fn(),
  };

  const mockAttempts = {
    isLocked: jest.fn(),
    record: jest.fn(),
  };

  const mockAudit = {
    append: jest.fn(),
  };

  const mockSessionFactory = {
    signScoped: jest.fn(),
    createFullSession: jest.fn(),
  };

  const sessionPayload = {
    state: 'authenticated' as const,
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    admin: { id: 'admin_1', name: 'Admin', email: normalizedEmail, role: 'OWNER' as const },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockBcryptCompare.mockResolvedValue(true);
    mockBcryptHash.mockResolvedValue('$2b$12$newhash');
    mockSha256Hex.mockReturnValue('hashed-token');

    mockUserFindUnique.mockResolvedValue(adminUser);
    mockUserUpdate.mockResolvedValue(adminUser);
    mockSessionFindUnique.mockResolvedValue(null);

    mockMfa.createSetup.mockResolvedValue({
      encryptedSecret: 'enc-1',
      otpauthUrl: 'otpauth://test',
      qrDataUrl: 'data:image/png;base64,test',
    });
    mockMfa.resumeSetup.mockResolvedValue({
      encryptedSecret: 'enc-1',
      otpauthUrl: 'otpauth://test',
      qrDataUrl: 'data:image/png;base64,test',
    });
    mockMfa.verifyCode.mockImplementation(() => undefined);

    mockAttempts.isLocked.mockResolvedValue(false);
    mockAttempts.record.mockResolvedValue(undefined);

    mockAudit.append.mockResolvedValue(undefined);

    mockSessionFactory.signScoped.mockResolvedValue('scoped-token');
    mockSessionFactory.createFullSession.mockResolvedValue(sessionPayload);

    prismaMock.$transaction.mockImplementation(async (cbOrArray: unknown) => {
      if (typeof cbOrArray === 'function') {
        return cbOrArray(mockTx);
      }
      return [];
    });
    prismaMock.adminLoginAttempt.count.mockResolvedValue(0);
    mockTx.adminLoginAttempt.create.mockResolvedValue({ id: 'att_1' });
    mockTx.adminUser.update.mockResolvedValue(adminUser);
    mockTx.adminAuditLog.create.mockResolvedValue({ id: 'log_1' });
    mockTx.adminSession.update.mockResolvedValue({ id: 'sess_1' });
    mockTx.adminSession.updateMany.mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AdminMfaService, useValue: mockMfa },
        { provide: AdminLoginAttemptsService, useValue: mockAttempts },
        { provide: AdminAuditService, useValue: mockAudit },
        { provide: AdminSessionFactory, useValue: mockSessionFactory },
      ],
    }).compile();

    service = module.get(AdminAuthService);
  });

  describe('login', () => {
    it('returns mfa_required state when MFA user logs in', async () => {
      const result = await service.login(email, 'correct-pass', ip, userAgent);

      expect(result).toEqual({
        state: 'mfa_required',
        token: 'scoped-token',
      });
    });

    it('throws rate limited when isLocked returns true', async () => {
      mockAttempts.isLocked.mockResolvedValueOnce(true);

      await expect(service.login(email, 'pass', ip, userAgent)).rejects.toThrow(
        /muitas tentativas/i,
      );
    });

    it('logs audit entry when rate limited', async () => {
      mockAttempts.isLocked.mockResolvedValueOnce(true);

      await expect(service.login(email, 'pass', ip, userAgent)).rejects.toThrow();

      expect(mockAudit.append).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'admin.auth.login.rate_limited',
          ip,
          userAgent,
        }),
      );
    });

    it('throws invalid credentials for unknown email', async () => {
      mockUserFindUnique.mockResolvedValueOnce(null);

      await expect(service.login('unknown@test.com', 'pass', ip, userAgent)).rejects.toThrow(
        /credenciais inv.lidas/i,
      );
    });

    it('records failed login attempt for unknown email', async () => {
      mockUserFindUnique.mockResolvedValueOnce(null);

      await expect(service.login('unknown@test.com', 'pass', ip, userAgent)).rejects.toThrow();

      expect(mockTx.adminLoginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'unknown@test.com', success: false }),
        }),
      );
    });

    it('throws invalid credentials for wrong password', async () => {
      mockBcryptCompare.mockResolvedValueOnce(false);

      await expect(service.login(email, 'wrong-pass', ip, userAgent)).rejects.toThrow(
        /credenciais inv.lidas/i,
      );
    });

    it('increments failedLoginCount on bad password', async () => {
      mockBcryptCompare.mockResolvedValueOnce(false);

      await expect(service.login(email, 'wrong-pass', ip, userAgent)).rejects.toThrow();

      expect(mockTx.adminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: adminUser.id },
          data: { failedLoginCount: { increment: 1 } },
        }),
      );
    });

    it('throws account locked when lockedUntil is in the future', async () => {
      const futureDate = new Date(Date.now() + 3600000);
      mockUserFindUnique.mockResolvedValueOnce({ ...adminUser, lockedUntil: futureDate });

      await expect(service.login(email, 'pass', ip, userAgent)).rejects.toThrow(/bloqueada/i);
    });

    it('throws user suspended for SUSPENDED status', async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        ...adminUser,
        status: AdminUserStatus.SUSPENDED,
      });

      await expect(service.login(email, 'correct-pass', ip, userAgent)).rejects.toThrow(
        /suspensa/i,
      );
    });

    it('throws user deactivated for DEACTIVATED status', async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        ...adminUser,
        status: AdminUserStatus.DEACTIVATED,
      });

      await expect(service.login(email, 'correct-pass', ip, userAgent)).rejects.toThrow(
        /desativada/i,
      );
    });

    it('resets failedLoginCount and lockedUntil on successful login', async () => {
      await service.login(email, 'correct-pass', ip, userAgent);

      expect(mockTx.adminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { failedLoginCount: 0, lockedUntil: null },
        }),
      );
    });

    it('returns password_change_required state when flagged', async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        ...adminUser,
        passwordChangeRequired: true,
      });

      const result = await service.login(email, 'correct-pass', ip, userAgent);

      expect(result).toEqual({
        state: 'password_change_required',
        token: 'scoped-token',
      });
      expect(mockSessionFactory.signScoped).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'password_change' }),
      );
    });

    it('returns mfa_setup_required when MFA not enabled', async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        ...adminUser,
        mfaEnabled: false,
      });

      const result = await service.login(email, 'correct-pass', ip, userAgent);

      expect(result).toEqual({
        state: 'mfa_setup_required',
        token: 'scoped-token',
      });
    });

    it('returns mfa_required when MFA is enabled', async () => {
      const result = await service.login(email, 'correct-pass', ip, userAgent);

      expect(mockSessionFactory.signScoped).toHaveBeenLastCalledWith(
        expect.objectContaining({ scope: 'mfa_verify' }),
      );
    });
  });

  describe('changePassword', () => {
    const changeAdmin = {
      id: 'admin_1',
      name: 'A',
      email,
      role: 'OWNER' as const,
      sessionId: 's1',
      scope: 'password_change' as const,
    };

    it('updates password and returns next state', async () => {
      const result = await service.changePassword(changeAdmin, 'NewP@ss1', ip, userAgent);

      expect(mockBcryptHash).toHaveBeenCalledWith('NewP@ss1', 12);
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'admin_1' },
          data: expect.objectContaining({
            passwordHash: '$2b$12$newhash',
            passwordChangeRequired: false,
          }),
        }),
      );
      expect(result).toEqual({ state: 'mfa_required', token: 'scoped-token' });
    });

    it('rejects non-password_change scope', async () => {
      const badAdmin = { ...changeAdmin, scope: 'full' as const };

      await expect(service.changePassword(badAdmin, 'NewP@ss1', ip, userAgent)).rejects.toThrow(
        /inv.lida/i,
      );
    });
  });

  describe('setupMfa', () => {
    const setupAdmin = {
      id: 'admin_1',
      name: 'A',
      email,
      role: 'OWNER' as const,
      sessionId: 's1',
      scope: 'mfa_setup' as const,
    };

    it('creates new MFA setup when no existing secret', async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        ...adminUser,
        mfaSecret: null,
        mfaEnabled: false,
        mfaPendingSetup: false,
      });

      const result = await service.setupMfa(setupAdmin);

      expect(result.otpauthUrl).toBe('otpauth://test');
      expect(result.qrDataUrl).toBe('data:image/png;base64,test');
      expect(mockMfa.createSetup).toHaveBeenCalledWith(email);
    });

    it('resumes MFA setup when pending secret exists', async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        ...adminUser,
        mfaSecret: 'existing-enc',
        mfaEnabled: false,
        mfaPendingSetup: true,
      });

      const result = await service.setupMfa(setupAdmin);

      expect(mockMfa.resumeSetup).toHaveBeenCalledWith(email, 'existing-enc');
      expect(result.otpauthUrl).toBe('otpauth://test');
    });

    it('creates fresh setup when MFA is already enabled', async () => {
      mockUserFindUnique.mockResolvedValueOnce({
        ...adminUser,
        mfaSecret: 'old-enc',
        mfaEnabled: true,
        mfaPendingSetup: false,
      });

      await service.setupMfa(setupAdmin);

      expect(mockMfa.createSetup).toHaveBeenCalled();
    });

    it('rejects non-mfa_setup scope', async () => {
      const badAdmin = { ...setupAdmin, scope: 'full' as const };

      await expect(service.setupMfa(badAdmin)).rejects.toThrow(/inv.lida/i);
    });
  });

  describe('verifyInitialMfa', () => {
    const setupAdmin = {
      id: 'admin_1',
      name: 'A',
      email,
      role: 'OWNER' as const,
      sessionId: 's1',
      scope: 'mfa_setup' as const,
    };

    it('verifies code and enables MFA', async () => {
      mockUserFindUnique.mockResolvedValue(adminUser);
      mockTx.adminUser.update.mockResolvedValue({
        ...adminUser,
        mfaEnabled: true,
        mfaPendingSetup: false,
      });

      const result = await service.verifyInitialMfa(setupAdmin, '123456', ip, userAgent);

      expect(mockMfa.verifyCode).toHaveBeenCalledWith(adminUser.mfaSecret, '123456');
      expect(mockTx.adminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'admin_1' },
          data: expect.objectContaining({
            mfaEnabled: true,
            mfaPendingSetup: false,
          }),
        }),
      );
      expect(result).toEqual(sessionPayload);
    });

    it('rejects non-mfa_setup scope', async () => {
      const badAdmin = { ...setupAdmin, scope: 'full' as const };

      await expect(service.verifyInitialMfa(badAdmin, '123456', ip, userAgent)).rejects.toThrow(
        /inv.lida/i,
      );
    });
  });

  describe('verifyMfa', () => {
    const verifyAdmin = {
      id: 'admin_1',
      name: 'A',
      email,
      role: 'OWNER' as const,
      sessionId: 's1',
      scope: 'mfa_verify' as const,
    };

    it('verifies MFA code and returns full session', async () => {
      mockUserFindUnique.mockResolvedValue(adminUser);

      const result = await service.verifyMfa(verifyAdmin, '123456', ip, userAgent);

      expect(mockMfa.verifyCode).toHaveBeenCalledWith(adminUser.mfaSecret, '123456');
      expect(result).toEqual(sessionPayload);
    });

    it('rejects non-mfa_verify scope', async () => {
      const badAdmin = { ...verifyAdmin, scope: 'full' as const };

      await expect(service.verifyMfa(badAdmin, '123456', ip, userAgent)).rejects.toThrow(
        /inv.lida/i,
      );
    });
  });

  describe('refresh', () => {
    const sessionRow = {
      id: 'sess_1',
      adminUserId: 'admin_1',
      tokenHash: 'hashed-token',
      ip,
      userAgent,
      revokedAt: null as Date | null,
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
      adminUser,
    };

    it('returns new session on valid refresh token', async () => {
      mockSha256Hex.mockReturnValueOnce('hashed-token');
      mockSessionFindUnique.mockResolvedValueOnce({
        ...sessionRow,
        include: { adminUser: true },
      });

      const result = await service.refresh('raw-refresh', ip, userAgent);

      expect(mockSha256Hex).toHaveBeenCalledWith('raw-refresh');
      expect(mockSessionFactory.createFullSession).toHaveBeenCalled();
      expect(result).toEqual(sessionPayload);
    });

    it('throws when session not found', async () => {
      mockSessionFindUnique.mockResolvedValueOnce(null);

      await expect(service.refresh('unknown', ip, userAgent)).rejects.toThrow(/inv.lida/i);
    });

    it('throws when session is revoked', async () => {
      mockSessionFindUnique.mockResolvedValueOnce({
        ...sessionRow,
        revokedAt: new Date(),
      });

      await expect(service.refresh('raw-refresh', ip, userAgent)).rejects.toThrow(/inv.lida/i);
    });

    it('throws when session is expired', async () => {
      mockSessionFindUnique.mockResolvedValueOnce({
        ...sessionRow,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh('raw-refresh', ip, userAgent)).rejects.toThrow(/expirada/i);
    });

    it('throws when admin user is suspended', async () => {
      mockSessionFindUnique.mockResolvedValueOnce({
        ...sessionRow,
        adminUser: { ...adminUser, status: AdminUserStatus.SUSPENDED },
      });

      await expect(service.refresh('raw-refresh', ip, userAgent)).rejects.toThrow(/suspensa/i);
    });
  });

  describe('logout', () => {
    const fullAdmin = {
      id: 'admin_1',
      name: 'A',
      email,
      role: 'OWNER' as const,
      sessionId: 'sess_1',
      scope: 'full' as const,
    };

    it('revokes the session', async () => {
      await service.logout(fullAdmin, ip, userAgent);

      expect(mockTx.adminSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sess_1', revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        }),
      );
    });

    it('writes audit log on logout', async () => {
      await service.logout(fullAdmin, ip, userAgent);

      expect(mockTx.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            adminUserId: 'admin_1',
            action: 'admin.auth.logout',
          }),
        }),
      );
    });

    it('no-ops when sessionId is missing', async () => {
      const noSessionAdmin = { ...fullAdmin, sessionId: '' };

      await expect(service.logout(noSessionAdmin, ip, userAgent)).resolves.toBeUndefined();
    });
  });

  describe('hashPassword (static)', () => {
    it('hashes a plaintext password', async () => {
      mockBcryptHash.mockResolvedValueOnce('$2b$12$static-hash');

      const result = await AdminAuthService.hashPassword('secret');

      expect(result).toBe('$2b$12$static-hash');
      expect(mockBcryptHash).toHaveBeenCalledWith('secret', 12);
    });
  });
});
