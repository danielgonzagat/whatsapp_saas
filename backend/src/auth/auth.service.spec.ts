import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from './email.service';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthService } from './google-auth.service';
import { FacebookAuthService } from './facebook-auth.service';
import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { hash as bcryptHash } from 'bcrypt';
import { hashAuthToken } from './auth-token-hash';
import { hashRefreshToken } from './refresh-token-hash';

// Mock implementations
const mockPrismaService = {
  agent: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  socialAccount: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },
  oAuthLinkIntent: {
    create: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  workspace: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  passwordResetToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  magicLinkToken: {
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
        socialAccount: mockPrismaService.socialAccount,
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
  sendMagicLinkEmail: jest.fn().mockResolvedValue(true),
  sendAccountLinkConfirmationEmail: jest.fn().mockResolvedValue(true),
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
  fetchPeopleProfile: jest.fn(),
};

const mockFacebookAuthService = {
  verifyAccessToken: jest.fn(),
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
        { provide: FacebookAuthService, useValue: mockFacebookAuthService },
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

  describe('createAnonymous', () => {
    it('creates a temporary visitor workspace without exposing the old Guest identity', async () => {
      prisma.workspace.create.mockResolvedValue({
        id: 'ws-anon',
        name: 'Workspace Temporario',
      });
      prisma.agent.create.mockResolvedValue({
        id: 'agent-anon',
        email: 'visitor_anon@visitor.kloel.local',
        name: 'Visitante',
        role: 'ADMIN',
        workspaceId: 'ws-anon',
      });

      const result = await service.createAnonymous('127.0.0.1', 'Mozilla/5.0');

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('user');
      expect(prisma.workspace.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Workspace Temporario',
          providerSettings: expect.objectContaining({
            guestMode: true,
            authMode: 'anonymous',
          }),
        }),
      });
      expect(prisma.agent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Visitante',
          email: expect.stringMatching(/^visitor_[a-z0-9]+@visitor\.kloel\.local$/),
          role: 'ADMIN',
          workspaceId: 'ws-anon',
        }),
      });
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

    it('should return a friendly error when account uses Facebook login', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        password: '',
        provider: 'facebook',
      });

      await expect(
        service.login({
          email: 'test@test.com',
          password: 'wrongpassword',
        }),
      ).rejects.toThrow('Esta conta usa Facebook. Entre com o Facebook.');
    });

    it('should return a friendly error when account uses Apple login', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        password: '',
        provider: 'apple',
      });

      await expect(
        service.login({
          email: 'test@test.com',
          password: 'wrongpassword',
        }),
      ).rejects.toThrow('Esta conta usa Apple. Entre com a Apple.');
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
          mockFacebookAuthService as any,
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
          mockFacebookAuthService as any,
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
      prisma.socialAccount.findUnique.mockResolvedValue(null);
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
      prisma.socialAccount.create.mockResolvedValue({
        id: 'sa-google-1',
        provider: 'google',
        providerUserId: 'gid-1',
        agentId: 'agent-1',
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
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.agent.findMany.mockRejectedValue(new Error('boom'));

      await expect(
        service.loginWithGoogleCredential({
          credential: 'google-credential',
          ip: '127.0.0.1',
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should create/login through the secure Facebook access token flow', async () => {
      mockFacebookAuthService.verifyAccessToken.mockResolvedValue({
        provider: 'facebook',
        providerId: 'fb-user-1',
        email: 'meta@test.com',
        name: 'Meta User',
        image: 'https://example.com/avatar.png',
        emailVerified: true,
      });
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.agent.findMany.mockResolvedValue([]);
      prisma.workspace.create.mockResolvedValue({
        id: 'ws-fb-1',
        name: 'Meta Workspace',
      });
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-fb-1',
        name: 'Meta Workspace',
      });
      prisma.agent.create.mockResolvedValue({
        id: 'agent-fb-1',
        email: 'meta@test.com',
        name: 'Meta User',
        role: 'ADMIN',
        workspaceId: 'ws-fb-1',
        provider: 'facebook',
        providerId: 'fb-user-1',
      });
      prisma.socialAccount.create.mockResolvedValue({
        id: 'sa-fb-1',
        provider: 'facebook',
        providerUserId: 'fb-user-1',
        agentId: 'agent-fb-1',
      });
      prisma.refreshToken.create.mockResolvedValue({ token: 'refresh-token' });

      const result = await service.loginWithFacebookAccessToken({
        accessToken: 'facebook-user-access-token',
        ip: '127.0.0.1',
      });

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('isNewUser', true);
      expect(mockFacebookAuthService.verifyAccessToken).toHaveBeenCalledWith(
        'facebook-user-access-token',
      );
    });

    it('should require email confirmation when Facebook login matches an existing account from another provider', async () => {
      mockFacebookAuthService.verifyAccessToken.mockResolvedValue({
        provider: 'facebook',
        providerId: 'fb-user-2',
        email: 'taken@test.com',
        name: 'Taken User',
        image: null,
        emailVerified: true,
      });
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.agent.findMany.mockResolvedValue([
        {
          id: 'agent-google-1',
          name: 'Taken User',
          email: 'taken@test.com',
          password: '',
          role: 'ADMIN',
          provider: 'google',
          providerId: 'gid-99',
          avatarUrl: null,
          emailVerified: true,
          workspaceId: 'ws-1',
          createdAt: new Date(),
          isOnline: false,
          phone: null,
        },
      ]);
      prisma.magicLinkToken.create.mockResolvedValue({
        id: 'ml-link-1',
        token: 'magic-token',
      });
      prisma.oAuthLinkIntent.create.mockResolvedValue({
        id: 'intent-1',
        token: 'link-token',
        provider: 'facebook',
        providerUserId: 'fb-user-2',
        agentId: 'agent-google-1',
      });

      await expect(
        service.loginWithFacebookAccessToken({
          accessToken: 'facebook-user-access-token',
          ip: '127.0.0.1',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          error: 'oauth_link_confirmation_required',
        }),
      });

      expect(prisma.magicLinkToken.updateMany).toHaveBeenCalledWith({
        where: { agentId: 'agent-google-1', used: false },
        data: { used: true },
      });
      expect(prisma.oAuthLinkIntent.updateMany).toHaveBeenCalledWith({
        where: {
          agentId: 'agent-google-1',
          provider: 'facebook',
          consumedAt: null,
        },
        data: {
          consumedAt: expect.any(Date),
        },
      });
      expect(emailService.sendAccountLinkConfirmationEmail).toHaveBeenCalledWith(
        'taken@test.com',
        expect.stringContaining('magic-link'),
        'Facebook',
        'Taken User',
      );
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
      expect(result).toHaveProperty('token');
      const resetToken = 'token' in result ? result.token : '';

      expect(result.success).toBe(true);
      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          token: hashAuthToken(resetToken),
          agentId: 'agent-1',
        }),
      });
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@test.com',
        expect.stringContaining('reset-password'),
      );
    });
  });

  describe('magic links', () => {
    it('should send a magic link for an existing user without revealing account state', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        email: 'magic@test.com',
      });
      prisma.magicLinkToken.create.mockResolvedValue({
        token: 'magic-token',
      });

      const result = await service.requestMagicLink('magic@test.com');
      expect(result).toHaveProperty('token');
      const magicToken = 'token' in result ? result.token : '';

      expect(result.success).toBe(true);
      expect(result.message).toContain('link de acesso');
      expect(prisma.magicLinkToken.updateMany).toHaveBeenCalledWith({
        where: { agentId: 'agent-1', used: false },
        data: { used: true },
      });
      expect(prisma.magicLinkToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          token: hashAuthToken(magicToken),
          agentId: 'agent-1',
        }),
      });
      expect(emailService.sendMagicLinkEmail).toHaveBeenCalledWith(
        'magic@test.com',
        expect.stringContaining('magic-link'),
      );
    });

    it('should consume a valid magic link token and issue a fresh session', async () => {
      prisma.oAuthLinkIntent.findUnique.mockResolvedValue(null);
      prisma.magicLinkToken.findUnique.mockResolvedValue({
        id: 'mlt-1',
        token: 'magic-token',
        used: false,
        expiresAt: new Date(Date.now() + 60_000),
        agentId: 'agent-1',
        agent: {
          id: 'agent-1',
          email: 'magic@test.com',
          name: 'Magic User',
          role: 'ADMIN',
          workspaceId: 'ws-1',
          emailVerified: false,
        },
      });
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        name: 'Magic Workspace',
      });
      prisma.refreshToken.create.mockResolvedValue({ token: 'refresh-token' });

      const result = await service.consumeMagicLink('magic-token');

      expect(prisma.magicLinkToken.findUnique).toHaveBeenCalledWith({
        where: { token: hashAuthToken('magic-token') },
        include: {
          agent: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              workspaceId: true,
              emailVerified: true,
            },
          },
        },
      });
      expect(prisma.magicLinkToken.update).toHaveBeenCalledWith({
        where: { id: 'mlt-1' },
        data: { used: true },
      });
      expect(prisma.agent.update).toHaveBeenCalledWith({
        where: { id: 'agent-1' },
        data: {
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpiry: null,
        },
      });
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.user).toMatchObject({
        id: 'agent-1',
        email: 'magic@test.com',
        workspaceId: 'ws-1',
      });
    });

    it('falls back to legacy plaintext magic link tokens during lookup', async () => {
      prisma.oAuthLinkIntent.findUnique.mockResolvedValue(null);
      prisma.magicLinkToken.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'mlt-legacy-1',
          token: 'legacy-magic-token',
          used: false,
          expiresAt: new Date(Date.now() + 60_000),
          agentId: 'agent-1',
          agent: {
            id: 'agent-1',
            email: 'magic@test.com',
            name: 'Magic User',
            role: 'ADMIN',
            workspaceId: 'ws-1',
            emailVerified: true,
          },
        });
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        name: 'Magic Workspace',
      });
      prisma.refreshToken.create.mockResolvedValue({ token: 'refresh-token' });

      await service.consumeMagicLink('legacy-magic-token');

      expect(prisma.magicLinkToken.findUnique).toHaveBeenNthCalledWith(1, {
        where: { token: hashAuthToken('legacy-magic-token') },
        include: {
          agent: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              workspaceId: true,
              emailVerified: true,
            },
          },
        },
      });
      expect(prisma.magicLinkToken.findUnique).toHaveBeenNthCalledWith(2, {
        where: { token: 'legacy-magic-token' },
        include: {
          agent: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              workspaceId: true,
              emailVerified: true,
            },
          },
        },
      });
    });

    it('should link a pending OAuth provider after magic link confirmation', async () => {
      prisma.magicLinkToken.findUnique.mockResolvedValue({
        id: 'mlt-link-1',
        token: 'magic-token',
        used: false,
        expiresAt: new Date(Date.now() + 60_000),
        agentId: 'agent-1',
        agent: {
          id: 'agent-1',
          email: 'magic@test.com',
          name: 'Magic User',
          role: 'ADMIN',
          workspaceId: 'ws-1',
          emailVerified: true,
        },
      });
      prisma.oAuthLinkIntent.findUnique.mockResolvedValue({
        id: 'intent-1',
        token: 'link-token',
        provider: 'facebook',
        providerUserId: 'fb-user-2',
        email: 'magic@test.com',
        displayName: 'Magic User',
        avatarUrl: 'https://example.com/avatar.png',
        emailVerified: true,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        agentId: 'agent-1',
      });
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      prisma.socialAccount.create.mockResolvedValue({
        id: 'sa-fb-1',
        provider: 'facebook',
        providerUserId: 'fb-user-2',
        agentId: 'agent-1',
      });
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        name: 'Magic Workspace',
      });
      prisma.refreshToken.create.mockResolvedValue({ token: 'refresh-token' });

      const result = await service.consumeMagicLink('magic-token', undefined, 'link-token');

      expect(prisma.magicLinkToken.findUnique).toHaveBeenCalledWith({
        where: { token: hashAuthToken('magic-token') },
        include: {
          agent: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              workspaceId: true,
              emailVerified: true,
            },
          },
        },
      });
      expect(prisma.oAuthLinkIntent.findUnique).toHaveBeenCalledWith({
        where: { token: hashAuthToken('link-token') },
      });
      expect(prisma.magicLinkToken.update).toHaveBeenCalledWith({
        where: { id: 'mlt-link-1' },
        data: { used: true },
      });
      expect(prisma.socialAccount.findUnique).toHaveBeenCalledWith({
        where: {
          provider_providerUserId: {
            provider: 'facebook',
            providerUserId: 'fb-user-2',
          },
        },
      });
      expect(prisma.socialAccount.create).toHaveBeenCalledWith({
        data: {
          provider: 'facebook',
          providerUserId: 'fb-user-2',
          agentId: 'agent-1',
          email: 'magic@test.com',
          avatarUrl: 'https://example.com/avatar.png',
          lastUsedAt: expect.any(Date),
        },
      });
      expect(prisma.oAuthLinkIntent.update).toHaveBeenCalledWith({
        where: { id: 'intent-1' },
        data: { consumedAt: expect.any(Date) },
      });
      expect(result).toHaveProperty('access_token');
    });
  });

  describe('google extended profile', () => {
    it('rejects the authenticated Google profile endpoint when the feature flag is disabled', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          META_ACCESS_TOKEN: 'mock-token',
          META_PHONE_NUMBER_ID: 'mock-phone-id',
          KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL: 'false',
        };
        return config[key];
      });

      await expect(
        service.getGoogleExtendedProfile('agent-1', 'google-access-token'),
      ).rejects.toThrow('Prefill sensível do Google está desabilitado no momento.');
    });

    it('returns a cached Google People profile for linked Google identities', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          META_ACCESS_TOKEN: 'mock-token',
          META_PHONE_NUMBER_ID: 'mock-phone-id',
          KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL: 'true',
        };
        return config[key];
      });

      prisma.agent.findUnique.mockResolvedValue({
        id: 'agent-1',
        email: 'daniel@kloel.com',
        provider: 'email',
        providerId: null,
        socialAccounts: [{ provider: 'google', providerUserId: 'gid-1', email: 'daniel@kloel.com' }],
      });

      const redis = {
        get: jest.fn().mockResolvedValue(
          JSON.stringify({
            provider: 'google',
            email: 'daniel@kloel.com',
            phone: '+5562999990000',
            birthday: '1994-04-18',
            address: {
              street: 'Rua 1',
              city: 'Caldas Novas',
              state: 'GO',
              postalCode: '75694-720',
              countryCode: 'BR',
              formattedValue: 'Rua 1, Caldas Novas - GO',
            },
          }),
        ),
        setex: jest.fn(),
      };
      const serviceWithRedis = new AuthService(
        mockPrismaService as any,
        mockJwtService as any,
        mockEmailService as any,
        mockConfigService as any,
        mockGoogleAuthService as any,
        mockFacebookAuthService as any,
        redis as any,
      );

      const result = await serviceWithRedis.getGoogleExtendedProfile(
        'agent-1',
        'google-access-token',
      );

      expect(redis.get).toHaveBeenCalledWith('auth:google-extended-profile:agent-1');
      expect(mockGoogleAuthService.fetchPeopleProfile).not.toHaveBeenCalled();
      expect(result).toEqual({
        provider: 'google',
        email: 'daniel@kloel.com',
        phone: '+5562999990000',
        birthday: '1994-04-18',
        address: {
          street: 'Rua 1',
          city: 'Caldas Novas',
          state: 'GO',
          postalCode: '75694-720',
          countryCode: 'BR',
          formattedValue: 'Rua 1, Caldas Novas - GO',
        },
      });
    });

    it('fetches and caches the Google People profile when the user has a linked Google identity', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          META_ACCESS_TOKEN: 'mock-token',
          META_PHONE_NUMBER_ID: 'mock-phone-id',
          KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL: 'true',
        };
        return config[key];
      });

      prisma.agent.findUnique.mockResolvedValue({
        id: 'agent-1',
        email: 'daniel@kloel.com',
        provider: 'email',
        providerId: null,
        socialAccounts: [{ provider: 'google', providerUserId: 'gid-1', email: 'daniel@kloel.com' }],
      });

      mockGoogleAuthService.fetchPeopleProfile.mockResolvedValue({
        email: 'daniel@kloel.com',
        phone: '+5562999990000',
        birthday: '1994-04-18',
        address: {
          street: 'Rua 1',
          city: 'Caldas Novas',
          state: 'GO',
          postalCode: '75694-720',
          countryCode: 'BR',
          formattedValue: 'Rua 1, Caldas Novas - GO',
        },
        raw: { ok: true },
      });

      const redis = {
        get: jest.fn().mockResolvedValue(null),
        setex: jest.fn().mockResolvedValue('OK'),
      };
      const serviceWithRedis = new AuthService(
        mockPrismaService as any,
        mockJwtService as any,
        mockEmailService as any,
        mockConfigService as any,
        mockGoogleAuthService as any,
        mockFacebookAuthService as any,
        redis as any,
      );

      const result = await serviceWithRedis.getGoogleExtendedProfile(
        'agent-1',
        'google-access-token',
      );

      expect(mockGoogleAuthService.fetchPeopleProfile).toHaveBeenCalledWith('google-access-token');
      expect(redis.setex).toHaveBeenCalledWith(
        'auth:google-extended-profile:agent-1',
        86400,
        JSON.stringify({
          provider: 'google',
          email: 'daniel@kloel.com',
          phone: '+5562999990000',
          birthday: '1994-04-18',
          address: {
            street: 'Rua 1',
            city: 'Caldas Novas',
            state: 'GO',
            postalCode: '75694-720',
            countryCode: 'BR',
            formattedValue: 'Rua 1, Caldas Novas - GO',
          },
        }),
      );
      expect(result).toEqual({
        provider: 'google',
        email: 'daniel@kloel.com',
        phone: '+5562999990000',
        birthday: '1994-04-18',
        address: {
          street: 'Rua 1',
          city: 'Caldas Novas',
          state: 'GO',
          postalCode: '75694-720',
          countryCode: 'BR',
          formattedValue: 'Rua 1, Caldas Novas - GO',
        },
      });
    });
  });

  describe('resetPassword', () => {
    it('should throw UnauthorizedException for invalid token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword('invalid-token', 'newpassword123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('falls back to legacy plaintext password reset tokens during lookup', async () => {
      prisma.passwordResetToken.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'prt-legacy-1',
          token: 'legacy-reset-token',
          used: false,
          expiresAt: new Date(Date.now() + 60_000),
          agentId: 'agent-1',
          agent: { id: 'agent-1' },
        });
      prisma.agent.update.mockResolvedValue({ id: 'agent-1' });
      prisma.passwordResetToken.update.mockResolvedValue({ id: 'prt-legacy-1' });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.resetPassword('legacy-reset-token', 'newpassword123');

      expect(prisma.passwordResetToken.findUnique).toHaveBeenNthCalledWith(1, {
        where: { token: hashAuthToken('legacy-reset-token') },
        include: { agent: true },
      });
      expect(prisma.passwordResetToken.findUnique).toHaveBeenNthCalledWith(2, {
        where: { token: 'legacy-reset-token' },
        include: { agent: true },
      });
      expect(result.success).toBe(true);
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

  describe('changePassword', () => {
    it('should reject when the current password is invalid', async () => {
      prisma.agent.findUnique.mockResolvedValue({
        id: 'agent-1',
        email: 'test@test.com',
        password: await bcryptHash('SenhaAtual@123', 10),
        provider: 'credentials',
      });

      await expect(
        service.changePassword('agent-1', 'SenhaErrada@123', 'SenhaNova@123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should update the password and revoke refresh tokens', async () => {
      prisma.agent.findUnique.mockResolvedValue({
        id: 'agent-1',
        email: 'test@test.com',
        password: await bcryptHash('SenhaAtual@123', 10),
        provider: 'credentials',
      });
      prisma.agent.update.mockResolvedValue({
        id: 'agent-1',
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.changePassword(
        'agent-1',
        'SenhaAtual@123',
        'SenhaNova@123',
      );

      expect(result).toEqual({ success: true });
      expect(prisma.agent.update).toHaveBeenCalledWith({
        where: { id: 'agent-1' },
        data: {
          password: expect.any(String),
        },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { agentId: 'agent-1', revoked: false },
        data: { revoked: true, revokedAt: expect.any(Date) },
      });
    });
  });

  describe('sessions', () => {
    it('lists active sessions with the current device highlighted', async () => {
      prisma.refreshToken.findMany.mockResolvedValue([
        {
          id: 'session-current',
          revoked: false,
          expiresAt: new Date('2026-05-01T12:00:00.000Z'),
          createdAt: new Date('2026-04-18T09:00:00.000Z'),
          updatedAt: new Date('2026-04-18T11:30:00.000Z'),
          lastUsedAt: new Date('2026-04-18T11:30:00.000Z'),
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
          ipAddress: '203.0.113.12',
        },
        {
          id: 'session-mobile',
          revoked: false,
          expiresAt: new Date('2026-04-29T18:00:00.000Z'),
          createdAt: new Date('2026-04-17T08:00:00.000Z'),
          updatedAt: new Date('2026-04-18T08:15:00.000Z'),
          lastUsedAt: new Date('2026-04-18T08:15:00.000Z'),
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1',
          ipAddress: '198.51.100.22',
        },
      ]);

      const result = await (service as any).listSessions('agent-1', 'session-current');

      expect(prisma.refreshToken.findMany).toHaveBeenCalledWith({
        where: {
          agentId: 'agent-1',
          revoked: false,
          expiresAt: {
            gt: expect.any(Date),
          },
        },
        orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
      });
      expect(result).toEqual({
        sessions: [
          expect.objectContaining({
            id: 'session-current',
            isCurrent: true,
            device: 'Chrome em macOS',
            deviceType: 'desktop',
            ipAddress: '203.0.113.12',
          }),
          expect.objectContaining({
            id: 'session-mobile',
            isCurrent: false,
            device: 'Safari em iOS',
            deviceType: 'mobile',
            ipAddress: '198.51.100.22',
          }),
        ],
      });
    });

    it('revokes only the current refresh session when signing out this device', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'session-current',
        agentId: 'agent-1',
        revoked: false,
      });
      prisma.refreshToken.update.mockResolvedValue({
        id: 'session-current',
        revoked: true,
      });

      const result = await (service as any).revokeCurrentSession('agent-1', 'session-current');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'session-current' },
        data: {
          revoked: true,
          revokedAt: expect.any(Date),
        },
      });
      expect(result).toEqual({ success: true, revokedSessionId: 'session-current' });
    });

    it('revokes every other session while preserving the current one', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      const result = await (service as any).revokeOtherSessions('agent-1', 'session-current');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          agentId: 'agent-1',
          revoked: false,
          expiresAt: {
            gt: expect.any(Date),
          },
          id: { not: 'session-current' },
        },
        data: {
          revoked: true,
          revokedAt: expect.any(Date),
        },
      });
      expect(result).toEqual({ success: true, revokedCount: 2 });
    });

    it('only revokes non-expired sessions when closing other devices', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await (service as any).revokeOtherSessions('agent-1', 'session-current');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          agentId: 'agent-1',
          revoked: false,
          expiresAt: {
            gt: expect.any(Date),
          },
          id: { not: 'session-current' },
        },
        data: {
          revoked: true,
          revokedAt: expect.any(Date),
        },
      });
    });
  });

  describe('verifyEmail', () => {
    describe('refresh token storage', () => {
      it('stores hashed refresh tokens when issuing a new session', async () => {
        const result = await (service as any).issueTokens({
          id: 'agent-1',
          email: 'test@kloel.com',
          name: 'Test User',
          role: 'ADMIN',
          workspaceId: 'ws-1',
        });

        const persistedToken = prisma.refreshToken.create.mock.calls[0][0].data.token;

        expect(result.refresh_token).toEqual(expect.any(String));
        expect(persistedToken).toBe(hashRefreshToken(result.refresh_token));
        expect(persistedToken).not.toBe(result.refresh_token);
      });

      it('looks up hashed refresh tokens and rotates the persisted hash', async () => {
        prisma.refreshToken.findUnique.mockResolvedValue({
          id: 'session-1',
          token: hashRefreshToken('refresh-raw-token'),
          revoked: false,
          expiresAt: new Date(Date.now() + 60_000),
          agent: {
            id: 'agent-1',
            email: 'test@kloel.com',
            name: 'Test User',
            role: 'ADMIN',
            workspaceId: 'ws-1',
          },
        });
        prisma.refreshToken.update.mockResolvedValue({ id: 'session-1' });

        const result = await service.refresh('refresh-raw-token');

        expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
          where: { token: hashRefreshToken('refresh-raw-token') },
          include: { agent: true },
        });
        expect(prisma.refreshToken.update).toHaveBeenCalledWith({
          where: { id: 'session-1' },
          data: expect.objectContaining({
            token: hashRefreshToken(result.refresh_token),
            lastUsedAt: expect.any(Date),
          }),
        });
      });

      it('falls back to legacy plaintext refresh tokens during rotation', async () => {
        prisma.refreshToken.findUnique
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'session-legacy',
            token: 'legacy-refresh-token',
            revoked: false,
            expiresAt: new Date(Date.now() + 60_000),
            agent: {
              id: 'agent-1',
              email: 'test@kloel.com',
              name: 'Test User',
              role: 'ADMIN',
              workspaceId: 'ws-1',
            },
          });
        prisma.refreshToken.update.mockResolvedValue({ id: 'session-legacy' });

        const result = await service.refresh('legacy-refresh-token');

        expect(prisma.refreshToken.findUnique).toHaveBeenNthCalledWith(1, {
          where: { token: hashRefreshToken('legacy-refresh-token') },
          include: { agent: true },
        });
        expect(prisma.refreshToken.findUnique).toHaveBeenNthCalledWith(2, {
          where: { token: 'legacy-refresh-token' },
          include: { agent: true },
        });
        expect(prisma.refreshToken.update).toHaveBeenCalledWith({
          where: { id: 'session-legacy' },
          data: expect.objectContaining({
            token: hashRefreshToken(result.refresh_token),
          }),
        });
      });
    });

    it('stores a hashed email verification token while sending the raw token in the URL', async () => {
      prisma.agent.findUnique.mockResolvedValue({
        id: 'agent-1',
        email: 'verify@kloel.com',
        emailVerified: false,
      });
      prisma.agent.update.mockResolvedValue({
        id: 'agent-1',
        emailVerificationToken: 'hashed-token',
      });

      const result = await service.sendVerificationEmail('agent-1');
      expect(result).toHaveProperty('token');
      const verificationToken = 'token' in result ? result.token : '';

      expect(prisma.agent.update).toHaveBeenCalledWith({
        where: { id: 'agent-1' },
        data: expect.objectContaining({
          emailVerificationToken: hashAuthToken(verificationToken),
          emailVerificationExpiry: expect.any(Date),
        }),
      });
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        'verify@kloel.com',
        expect.stringContaining(verificationToken),
      );
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);

      await expect(service.verifyEmail('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('falls back to legacy plaintext verification tokens during lookup', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        emailVerificationToken: 'legacy-verify-token',
        emailVerificationExpiry: new Date(Date.now() + 60_000),
      });
      prisma.agent.update.mockResolvedValue({
        id: 'agent-1',
        emailVerified: true,
      });

      await service.verifyEmail('legacy-verify-token');

      expect(prisma.agent.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { emailVerificationToken: hashAuthToken('legacy-verify-token') },
            { emailVerificationToken: 'legacy-verify-token' },
          ],
        },
      });
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

      expect(prisma.agent.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { emailVerificationToken: hashAuthToken('valid-token') },
            { emailVerificationToken: 'valid-token' },
          ],
        },
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('verificado');
    });
  });
});
