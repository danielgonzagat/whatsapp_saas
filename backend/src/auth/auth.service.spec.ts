import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from './email.service';
import { ConfigService } from '@nestjs/config';
import { FacebookAuthService } from './facebook-auth.service';
import { GoogleAuthService } from './google-auth.service';
import { ConnectService } from '../payments/connect/connect.service';
import { TikTokAuthService } from './tiktok-auth.service';
import { RateLimitService } from './rate-limit.service';
import type { Redis } from 'ioredis';
import {
  BadRequestException,
  ConflictException,
  HttpStatus,
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
    delete: jest.fn(),
  },
  affiliatePartner: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  connectAccountBalance: {
    deleteMany: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  socialAccount: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
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
      ENCRYPTION_KEY: '12345678901234567890123456789012',
    };
    return config[key];
  }),
};

const mockGoogleAuthService = {
  verifyCredential: jest.fn(),
};

const mockFacebookAuthService = {
  verifyAccessToken: jest.fn(),
};

const mockTikTokAuthService = {
  verifyAuthorizationCode: jest.fn(),
  verifyAccessToken: jest.fn(),
};

const mockConnectService = {
  createCustomAccount: jest.fn().mockResolvedValue({
    accountBalanceId: 'cab_affiliate',
    stripeAccountId: 'acct_affiliate',
    requestedCapabilities: ['card_payments', 'transfers'],
  }),
};

const mockRateLimitService = {
  checkRateLimit: jest.fn().mockResolvedValue(undefined),
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: typeof mockPrismaService;
  let emailService: typeof mockEmailService;
  let connectService: typeof mockConnectService;

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
        { provide: FacebookAuthService, useValue: mockFacebookAuthService },
        { provide: TikTokAuthService, useValue: mockTikTokAuthService },
        { provide: ConnectService, useValue: mockConnectService },
        { provide: RateLimitService, useValue: mockRateLimitService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = mockPrismaService;
    emailService = mockEmailService;
    connectService = module.get(ConnectService);
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
    beforeEach(() => {
      prisma.affiliatePartner.findFirst.mockResolvedValue(null);
    });

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

    it('should provision affiliate workspace + connect account when invite token is valid', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.affiliatePartner.findFirst.mockResolvedValue({
        id: 'partner-1',
        workspaceId: 'seller-ws',
        partnerName: 'Ana',
        partnerEmail: 'affiliate@test.com',
        type: 'AFFILIATE',
        partnerWorkspaceId: null,
        metadata: { inviteTokenHash: 'placeholder' },
      });
      prisma.workspace.create.mockResolvedValue({
        id: 'ws-aff',
        name: 'Ana Workspace',
      });
      prisma.agent.create.mockResolvedValue({
        id: 'agent-aff',
        email: 'affiliate@test.com',
        name: 'Ana',
        role: 'ADMIN',
        workspaceId: 'ws-aff',
      });
      prisma.affiliatePartner.update.mockResolvedValue({
        id: 'partner-1',
        partnerWorkspaceId: 'ws-aff',
        status: 'ACTIVE',
      });
      prisma.refreshToken.create.mockResolvedValue({ token: 'refresh-token' });

      const result = await service.register({
        name: 'Ana',
        email: 'affiliate@test.com',
        password: 'password123',
        workspaceName: 'Ana Workspace',
        affiliateInviteToken: 'invite-token-1',
      });

      expect(result).toHaveProperty('access_token');
      expect(prisma.affiliatePartner.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            partnerEmail: 'affiliate@test.com',
            metadata: expect.objectContaining({
              path: ['inviteTokenHash'],
            }),
          }),
        }),
      );
      expect(connectService.createCustomAccount).toHaveBeenCalledWith({
        workspaceId: 'ws-aff',
        accountType: 'AFFILIATE',
        email: 'affiliate@test.com',
        displayName: 'Ana Workspace',
      });
      expect(prisma.affiliatePartner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'partner-1' },
          data: expect.objectContaining({
            partnerWorkspaceId: 'ws-aff',
            status: 'ACTIVE',
          }),
        }),
      );
    });

    it('should provision the mapped connect role when a coproducer invite token is valid', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.affiliatePartner.findFirst.mockResolvedValue({
        id: 'partner-2',
        workspaceId: 'seller-ws',
        partnerName: 'Carla',
        partnerEmail: 'copro@test.com',
        type: 'COPRODUCER',
        partnerWorkspaceId: null,
        metadata: { inviteTokenHash: 'placeholder' },
      });
      prisma.workspace.create.mockResolvedValue({
        id: 'ws-copro',
        name: 'Carla Workspace',
      });
      prisma.agent.create.mockResolvedValue({
        id: 'agent-copro',
        email: 'copro@test.com',
        name: 'Carla',
        role: 'ADMIN',
        workspaceId: 'ws-copro',
      });
      prisma.affiliatePartner.update.mockResolvedValue({
        id: 'partner-2',
        partnerWorkspaceId: 'ws-copro',
        status: 'ACTIVE',
      });
      prisma.refreshToken.create.mockResolvedValue({ token: 'refresh-token' });

      const result = await service.register({
        name: 'Carla',
        email: 'copro@test.com',
        password: 'password123',
        workspaceName: 'Carla Workspace',
        affiliateInviteToken: 'invite-token-2',
      });

      expect(result).toHaveProperty('access_token');
      expect(connectService.createCustomAccount).toHaveBeenCalledWith({
        workspaceId: 'ws-copro',
        accountType: 'COPRODUCER',
        email: 'copro@test.com',
        displayName: 'Carla Workspace',
      });
    });

    it('should reject invalid affiliate invite token before creating workspace', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.affiliatePartner.findFirst.mockResolvedValue(null);

      await expect(
        service.register({
          name: 'Ana',
          email: 'affiliate@test.com',
          password: 'password123',
          affiliateInviteToken: 'invalid-token',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.workspace.create).not.toHaveBeenCalled();
      expect(prisma.agent.create).not.toHaveBeenCalled();
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
          mockFacebookAuthService as unknown as FacebookAuthService,
          mockTikTokAuthService as unknown as TikTokAuthService,
          mockConnectService as unknown as ConnectService,
          new RateLimitService(mockRedis),
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
        if (previousDisabled !== undefined) {
          process.env.RATE_LIMIT_DISABLED = previousDisabled;
        } else {
          process.env.RATE_LIMIT_DISABLED = 'true';
        }
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
          mockFacebookAuthService as unknown as FacebookAuthService,
          mockTikTokAuthService as unknown as TikTokAuthService,
          mockConnectService as unknown as ConnectService,
          new RateLimitService({
            incr: jest.fn().mockRejectedValue(new Error('redis down')),
            expire: jest.fn(),
          } as unknown as Redis),
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
        if (previousDisabled !== undefined) {
          process.env.RATE_LIMIT_DISABLED = previousDisabled;
        } else {
          process.env.RATE_LIMIT_DISABLED = 'true';
        }
      }
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
