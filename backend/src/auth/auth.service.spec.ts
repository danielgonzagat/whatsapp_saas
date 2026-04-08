import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from './email.service';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthService } from './google-auth.service';
import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

// Mock implementations
const mockPrismaService = {
  agent: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  workspace: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  passwordResetToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn((arg: any) => {
    if (typeof arg === 'function') {
      // Transação interativa
      return arg({
        agent: mockPrismaService.agent,
        workspace: mockPrismaService.workspace,
      });
    }
    // Transação em batch (array de operações)
    return Promise.all(arg);
  }),
};

const mockJwtService = {
  signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
};

const mockEmailService = {
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, string> = {
      META_ACCESS_TOKEN: 'mock-token',
      META_PHONE_NUMBER_ID: 'mock-phone-id',
    };
    return config[key];
  }),
};

const mockGoogleAuthService = {
  verifyCredential: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: typeof mockPrismaService;
  let emailService: typeof mockEmailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // AuthService's rate limiter is fail-closed on Redis unavailability
    // (see P0-5). Unit tests don't wire up Redis, so disable enforcement
    // via the documented escape hatch.
    process.env.RATE_LIMIT_DISABLED = 'true';
    mockPrismaService.workspace.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        where?.id ? { id: where.id, name: 'Workspace' } : null,
    );
    mockPrismaService.refreshToken.create.mockResolvedValue({
      token: 'refresh-token',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: GoogleAuthService, useValue: mockGoogleAuthService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = mockPrismaService;
    emailService = mockEmailService;
  });

  describe('checkEmail', () => {
    it('should return exists: true for existing email', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
      });

      const result = await service.checkEmail('test@test.com');

      expect(result).toEqual({ exists: true });
      expect(prisma.agent.findFirst).toHaveBeenCalledWith({
        where: { email: 'test@test.com' },
      });
    });

    it('should return exists: false for new email', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);

      const result = await service.checkEmail('new@test.com');

      expect(result).toEqual({ exists: false });
    });
  });

  describe('register', () => {
    it('should throw ConflictException for existing email', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: '1',
        email: 'existing@test.com',
      });

      await expect(
        service.register({
          name: 'Test',
          email: 'existing@test.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create workspace and agent for new registration', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.workspace.create.mockResolvedValue({
        id: 'ws-1',
        name: 'Test Workspace',
      });
      prisma.agent.create.mockResolvedValue({
        id: 'agent-1',
        email: 'new@test.com',
        name: 'Test User',
        role: 'ADMIN',
        workspaceId: 'ws-1',
      });
      prisma.refreshToken.create.mockResolvedValue({ token: 'refresh-token' });

      const result = await service.register({
        name: 'Test User',
        email: 'new@test.com',
        password: 'password123',
        workspaceName: 'Test Workspace',
      });

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('user');
      expect(prisma.workspace.create).toHaveBeenCalled();
      expect(prisma.agent.create).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException for non-existent email', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'nonexistent@test.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        password: '$2b$10$invalidhash',
      });

      await expect(
        service.login({
          email: 'test@test.com',
          password: 'wrongpassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return a friendly error when account uses Google login', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        password: '',
        provider: 'google',
      });

      await expect(
        service.login({
          email: 'test@test.com',
          password: 'wrongpassword',
        }),
      ).rejects.toThrow('Esta conta usa Google. Entre com o Google.');
    });

    it('should return 429 after exceeding the rate limit via Redis', async () => {
      // Build a service instance with a mock Redis that counts per key.
      // login() calls checkRateLimit twice per attempt (email + IP), so the
      // mock must track them independently.
      const previousDisabled = process.env.RATE_LIMIT_DISABLED;
      delete process.env.RATE_LIMIT_DISABLED;
      try {
        const counters = new Map<string, number>();
        const mockRedis: any = {
          incr: jest.fn().mockImplementation(async (key: string) => {
            const next = (counters.get(key) || 0) + 1;
            counters.set(key, next);
            return next;
          }),
          expire: jest.fn().mockResolvedValue(1),
        };
        const serviceWithRedis = new AuthService(
          mockPrismaService,
          mockJwtService as any,
          mockEmailService as any,
          mockConfigService as any,
          mockGoogleAuthService as any,
          mockRedis,
        );

        prisma.agent.findFirst.mockResolvedValue(null);
        const ip = '127.0.0.1';

        // First 5 attempts fail with 401 (credentials wrong, rate limit not yet hit)
        for (let i = 0; i < 5; i++) {
          await expect(
            serviceWithRedis.login({ email: 'nonexistent@test.com', password: 'x', ip }),
          ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
        }

        // 6th attempt trips the per-key limit -> 429
        await expect(
          serviceWithRedis.login({ email: 'nonexistent@test.com', password: 'x', ip }),
        ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
      } finally {
        if (previousDisabled !== undefined) process.env.RATE_LIMIT_DISABLED = previousDisabled;
        else process.env.RATE_LIMIT_DISABLED = 'true';
      }
    });

    it('should fail closed with 503 when Redis fails (no silent in-memory fallback)', async () => {
      // Enforces P0-5 invariant: rate limiting in multi-instance deployments
      // MUST be backed by Redis. If Redis is down, reject the request rather
      // than silently degrading to a per-instance in-memory Map (which an
      // attacker can bypass by spreading attempts across replicas).
      const previousDisabled = process.env.RATE_LIMIT_DISABLED;
      delete process.env.RATE_LIMIT_DISABLED;
      try {
        const serviceWithRedisFailure = new AuthService(
          mockPrismaService,
          mockJwtService as any,
          mockEmailService as any,
          mockConfigService as any,
          mockGoogleAuthService as any,
          {
            incr: jest.fn().mockRejectedValue(new Error('redis down')),
            expire: jest.fn(),
          } as any,
        );

        prisma.agent.findFirst.mockResolvedValue(null);

        await expect(
          serviceWithRedisFailure.login({
            email: 'nonexistent@test.com',
            password: 'x',
            ip: '127.0.0.1',
          }),
        ).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
      } finally {
        if (previousDisabled !== undefined) process.env.RATE_LIMIT_DISABLED = previousDisabled;
        else process.env.RATE_LIMIT_DISABLED = 'true';
      }
    });
  });

  describe('oauthLogin', () => {
    it('should reject legacy insecure oauth payloads', async () => {
      await expect(
        service.oauthLogin({
          provider: 'google',
          providerId: 'gid-1',
          email: 'test@test.com',
          name: 'Test',
          image: undefined,
          ip: '127.0.0.1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create/login through the secure Google credential flow', async () => {
      mockGoogleAuthService.verifyCredential.mockResolvedValue({
        provider: 'google',
        providerId: 'gid-1',
        email: 'test@test.com',
        name: 'Test',
        image: undefined,
        emailVerified: true,
      });
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.agent.findMany.mockResolvedValue([]);
      prisma.workspace.create.mockResolvedValue({
        id: 'ws-1',
        name: 'Test Workspace',
      });
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        name: 'Test Workspace',
      });
      prisma.agent.create.mockResolvedValue({
        id: 'agent-1',
        email: 'test@test.com',
        name: 'Test',
        role: 'ADMIN',
        workspaceId: 'ws-1',
      });
      prisma.refreshToken.create.mockResolvedValue({ token: 'refresh-token' });

      const result = await service.loginWithGoogleCredential({
        credential: 'google-credential',
        ip: '127.0.0.1',
      });

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('isNewUser', true);
      expect(mockGoogleAuthService.verifyCredential).toHaveBeenCalledWith('google-credential');
    });

    it('should return InternalServerErrorException (500) on unexpected errors', async () => {
      mockGoogleAuthService.verifyCredential.mockResolvedValue({
        provider: 'google',
        providerId: 'gid-1',
        email: 'test@test.com',
        name: 'Test',
        image: undefined,
        emailVerified: true,
      });
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.agent.findMany.mockRejectedValue(new Error('boom'));

      await expect(
        service.loginWithGoogleCredential({
          credential: 'google-credential',
          ip: '127.0.0.1',
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('forgotPassword', () => {
    it('should return success message for non-existent email (security)', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);

      const result = await service.forgotPassword('nonexistent@test.com');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Se o email existir');
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should send reset email for existing user', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        email: 'test@test.com',
      });
      prisma.passwordResetToken.create.mockResolvedValue({
        token: 'reset-token',
      });

      const result = await service.forgotPassword('test@test.com');

      expect(result.success).toBe(true);
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@test.com',
        expect.stringContaining('reset-password'),
      );
    });
  });

  describe('resetPassword', () => {
    it('should throw UnauthorizedException for invalid token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword('invalid-token', 'newpassword123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        token: 'expired-token',
        used: false,
        expiresAt: new Date(Date.now() - 1000), // Expired
        agent: { id: 'agent-1' },
      });

      await expect(service.resetPassword('expired-token', 'newpassword123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        token: 'used-token',
        used: true,
        expiresAt: new Date(Date.now() + 60000),
        agent: { id: 'agent-1' },
      });

      await expect(service.resetPassword('used-token', 'newpassword123')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('verifyEmail', () => {
    it('should throw UnauthorizedException for invalid token', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);

      await expect(service.verifyEmail('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should verify email successfully', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        emailVerificationToken: 'valid-token',
        emailVerificationExpiry: new Date(Date.now() + 60000),
      });
      prisma.agent.update.mockResolvedValue({
        id: 'agent-1',
        emailVerified: true,
      });

      const result = await service.verifyEmail('valid-token');

      expect(result.success).toBe(true);
      expect(result.message).toContain('verificado');
    });
  });
});
