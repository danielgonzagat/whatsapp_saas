import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from './email.service';
import { ConfigService } from '@nestjs/config';
import { FacebookAuthService } from './facebook-auth.service';
import { GoogleAuthService } from './google-auth.service';
import { AppleAuthService } from './apple-auth.service';
import { ConnectService } from '../payments/connect/connect.service';
import { TikTokAuthService } from './tiktok-auth.service';
import { RateLimitService } from './rate-limit.service';
import { AuthTokenService } from './auth.token.service';
import { UnauthorizedException } from '@nestjs/common';

// Mock implementations
const mockAgentModel = {
  findFirst: jest.fn(),
  findMany: jest.fn(),
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};
const mockWorkspaceModel = {
  create: jest.fn(),
  findUnique: jest.fn(),
  delete: jest.fn(),
};
const mockPrismaService = {
  agent: mockAgentModel,
  workspace: mockWorkspaceModel,
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
  $transaction: jest.fn((arg: unknown) => {
    if (typeof arg === 'function') {
      // Transação interativa
      return (
        arg as (tx: {
          agent: typeof mockAgentModel;
          workspace: typeof mockWorkspaceModel;
        }) => unknown
      )({
        agent: mockAgentModel,
        workspace: mockWorkspaceModel,
      });
    }
    // Transação em batch (array de operações)
    return Promise.all(arg as Array<Promise<unknown>>);
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

const mockAppleAuthService = {
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

const mockAuthTokenService = {
  issueTokens: jest.fn(),
  issueTokensForAgentId: jest.fn(),
  refresh: jest.fn(),
  revokeAccessToken: jest.fn(),
  isAccessTokenRevoked: jest.fn(),
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
        { provide: AppleAuthService, useValue: mockAppleAuthService },
        { provide: FacebookAuthService, useValue: mockFacebookAuthService },
        { provide: TikTokAuthService, useValue: mockTikTokAuthService },
        { provide: ConnectService, useValue: mockConnectService },
        { provide: RateLimitService, useValue: mockRateLimitService },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = mockPrismaService;
    emailService = mockEmailService;
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
