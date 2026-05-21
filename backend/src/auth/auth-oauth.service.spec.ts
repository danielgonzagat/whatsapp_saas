import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthOAuthService } from './auth-oauth.service';
import { AuthOAuthResolverService } from './auth-oauth-resolver.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleAuthService } from './google-auth.service';
import { FacebookAuthService } from './facebook-auth.service';
import { AppleAuthService } from './apple-auth.service';
import { TikTokAuthService } from './tiktok-auth.service';
import { RateLimitService } from './rate-limit.service';

const mockPrismaService = {
  socialAccount: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  $transaction: jest.fn((arg: unknown) => {
    if (typeof arg === 'function') {
      return arg({ socialAccount: mockPrismaService.socialAccount });
    }
    return Promise.all(arg as Array<Promise<unknown>>);
  }),
};

const mockGoogleAuthService = {
  verifyCredential: jest.fn(),
};

const mockFacebookAuthService = {
  verifyAccessToken: jest.fn(),
};

const mockAppleAuthService = {
  verifyCredential: jest.fn(),
};

const mockTikTokAuthService = {
  verifyAuthorizationCode: jest.fn(),
  verifyAccessToken: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, string> = {
      ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
      PROVIDER_SECRET_KEY: '0123456789abcdef0123456789abcdef',
      JWT_SECRET: '0123456789abcdef0123456789abcdef',
      FRONTEND_URL: 'http://localhost:3000',
    };
    return config[key];
  }),
};

const mockRateLimitService = {
  checkRateLimit: jest.fn().mockResolvedValue(undefined),
};

const mockResolverService = {
  findExistingAgent: jest.fn(),
  patchExistingAgent: jest.fn(),
  createAgentForOAuth: jest.fn(),
  handleOAuthError: jest.fn(),
};

const PROFILE_STUB = {
  provider: 'google' as const,
  providerId: 'google-abc123',
  email: 'user@example.com',
  name: 'Test User',
  image: null,
  emailVerified: true,
  syntheticEmail: false,
  accessToken: 'test-access-token-xxx',
  refreshToken: 'test-refresh-token-xxx',
  tokenExpiresAt: null,
  profileData: null,
};

const AGENT_STUB = {
  id: 'agent-1',
  email: 'user@example.com',
  workspaceId: 'ws-1',
  name: 'Test User',
  role: 'ADMIN' as const,
  provider: 'google',
  providerId: 'google-abc123',
  avatarUrl: null,
  emailVerified: true,
  disabledAt: null,
  deletedAt: null,
};

describe('AuthOAuthService', () => {
  let service: AuthOAuthService;
  let resolver: typeof mockResolverService;
  let googleAuth: typeof mockGoogleAuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.RATE_LIMIT_DISABLED = 'true';

    mockPrismaService.socialAccount.upsert.mockResolvedValue({
      id: 'sa-1',
      agentId: 'agent-1',
      provider: 'google',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthOAuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: GoogleAuthService, useValue: mockGoogleAuthService },
        { provide: FacebookAuthService, useValue: mockFacebookAuthService },
        { provide: AppleAuthService, useValue: mockAppleAuthService },
        { provide: TikTokAuthService, useValue: mockTikTokAuthService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RateLimitService, useValue: mockRateLimitService },
        { provide: AuthOAuthResolverService, useValue: mockResolverService },
      ],
    }).compile();

    service = module.get<AuthOAuthService>(AuthOAuthService);
    resolver = mockResolverService;
    googleAuth = mockGoogleAuthService;
  });

  describe('verifyGoogleCredential', () => {
    it('calls GoogleAuthService.verifyCredential after rate limit check', async () => {
      googleAuth.verifyCredential.mockResolvedValue({
        ...PROFILE_STUB,
        provider: 'google' as const,
      });

      const result = await service.verifyGoogleCredential({
        credential: 'google-credential-token-xxx',
        ip: '1.2.3.4',
      });

      expect(result.provider).toBe('google');
      expect(result.email).toBe('user@example.com');
      expect(mockRateLimitService.checkRateLimit).toHaveBeenCalledWith('oauth:google:1.2.3.4');
      expect(googleAuth.verifyCredential).toHaveBeenCalledWith('google-credential-token-xxx');
    });

    it('propagates error from GoogleAuthService', async () => {
      googleAuth.verifyCredential.mockRejectedValue(new Error('Invalid Google token'));
      await expect(
        service.verifyGoogleCredential({ credential: 'bad-credential', ip: '1.2.3.4' }),
      ).rejects.toThrow('Invalid Google token');
    });
  });

  describe('verifyFacebookAccessToken', () => {
    it('calls FacebookAuthService.verifyAccessToken after rate limit', async () => {
      mockFacebookAuthService.verifyAccessToken.mockResolvedValue({
        ...PROFILE_STUB,
        provider: 'facebook' as const,
        providerId: 'fb-456',
      });

      const result = await service.verifyFacebookAccessToken({
        accessToken: 'fb-access-token-xxx',
        userId: 'fb-user-1',
        ip: '5.6.7.8',
      });

      expect(result.provider).toBe('facebook');
      expect(mockRateLimitService.checkRateLimit).toHaveBeenCalledWith('oauth:facebook:5.6.7.8');
      expect(mockFacebookAuthService.verifyAccessToken).toHaveBeenCalledWith(
        'fb-access-token-xxx',
        'fb-user-1',
      );
    });
  });

  describe('verifyAppleIdentityToken', () => {
    it('calls AppleAuthService.verifyCredential after rate limit', async () => {
      mockAppleAuthService.verifyCredential.mockResolvedValue({
        ...PROFILE_STUB,
        provider: 'apple' as const,
        providerId: 'apple-789',
      });

      const result = await service.verifyAppleIdentityToken({
        identityToken: 'apple-id-token-xxx',
        authorizationCode: 'auth-code-xxx',
        redirectUri: 'https://app.example.com/callback',
        user: { name: { firstName: 'Alice', lastName: 'Smith' }, email: 'alice@example.com' },
        ip: '9.9.9.9',
      });

      expect(result.provider).toBe('apple');
      expect(mockRateLimitService.checkRateLimit).toHaveBeenCalledWith('oauth:apple:9.9.9.9');
    });
  });

  describe('verifyTikTokAuthorizationCode', () => {
    it('calls TikTokAuthService.verifyAuthorizationCode', async () => {
      mockTikTokAuthService.verifyAuthorizationCode.mockResolvedValue({
        ...PROFILE_STUB,
        provider: 'tiktok' as const,
        providerId: 'tt-abc',
      });

      const result = await service.verifyTikTokAuthorizationCode({
        code: 'tt-auth-code-xxx',
        redirectUri: 'https://app.example.com/tiktok-callback',
        ip: '10.0.0.1',
      });

      expect(result.provider).toBe('tiktok');
      expect(mockRateLimitService.checkRateLimit).toHaveBeenCalledWith('oauth:tiktok:10.0.0.1');
      expect(mockTikTokAuthService.verifyAuthorizationCode).toHaveBeenCalledWith(
        'tt-auth-code-xxx',
        'https://app.example.com/tiktok-callback',
      );
    });
  });

  describe('verifyTikTokAccessToken', () => {
    it('calls TikTokAuthService.verifyAccessToken', async () => {
      mockTikTokAuthService.verifyAccessToken.mockResolvedValue({
        ...PROFILE_STUB,
        provider: 'tiktok' as const,
        providerId: 'tt-direct',
      });

      const result = await service.verifyTikTokAccessToken({
        accessToken: 'tt-access-token-xxx',
        openId: 'tt-open-id',
        ip: '10.0.0.2',
      });

      expect(result.provider).toBe('tiktok');
      expect(mockTikTokAuthService.verifyAccessToken).toHaveBeenCalledWith({
        accessToken: 'tt-access-token-xxx',
        openId: 'tt-open-id',
        refreshToken: undefined,
        expiresInSeconds: undefined,
      });
    });
  });

  describe('resolveAgentForProfile', () => {
    it('throws BadRequestException for unsupported provider', async () => {
      await expect(
        service.resolveAgentForProfile({
          ...PROFILE_STUB,
          provider: 'github' as never,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for missing email', async () => {
      await expect(
        service.resolveAgentForProfile({
          ...PROFILE_STUB,
          email: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for missing providerId', async () => {
      await expect(
        service.resolveAgentForProfile({
          ...PROFILE_STUB,
          providerId: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('resolves existing agent and returns isNewUser=false', async () => {
      resolver.findExistingAgent.mockResolvedValue(AGENT_STUB);
      resolver.patchExistingAgent.mockResolvedValue(AGENT_STUB);

      const result = await service.resolveAgentForProfile(PROFILE_STUB);

      expect(result.agent).toEqual(AGENT_STUB);
      expect(result.isNewUser).toBe(false);
      expect(resolver.patchExistingAgent).toHaveBeenCalled();
      expect(resolver.createAgentForOAuth).not.toHaveBeenCalled();
    });

    it('creates new agent for first-time OAuth user and returns isNewUser=true', async () => {
      resolver.findExistingAgent.mockResolvedValue(null);
      resolver.createAgentForOAuth.mockResolvedValue({
        ...AGENT_STUB,
        id: 'agent-new',
      });

      const result = await service.resolveAgentForProfile(PROFILE_STUB);

      expect(result.agent).toEqual(expect.objectContaining({ id: 'agent-new' }));
      expect(result.isNewUser).toBe(true);
      expect(resolver.createAgentForOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          normalizedProvider: 'google',
          normalizedEmail: 'user@example.com',
        }),
      );
    });

    it('passes through HttpException without re-wrapping', async () => {
      resolver.findExistingAgent.mockRejectedValue(
        new ServiceUnavailableException('DB init error'),
      );

      await expect(service.resolveAgentForProfile(PROFILE_STUB)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('upsertSocialAccount', () => {
    it('upserts social account with encrypted tokens', async () => {
      mockPrismaService.socialAccount.findUnique.mockResolvedValue(null);

      await service.upsertSocialAccount('agent-1', PROFILE_STUB);

      expect(mockPrismaService.socialAccount.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { agentId_provider: { agentId: 'agent-1', provider: 'google' } },
        }),
      );
    });

    it('preserves existing tokens when not overwriting', async () => {
      mockPrismaService.socialAccount.findUnique.mockResolvedValue({
        id: 'sa-1',
        accessToken: 'encrypted-old-token',
        refreshToken: 'encrypted-old-refresh',
      });

      await service.upsertSocialAccount('agent-1', { ...PROFILE_STUB, accessToken: '' });

      expect(mockPrismaService.socialAccount.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            accessToken: 'encrypted-old-token',
          }),
        }),
      );
    });
  });

  describe('getEncryptionKey', () => {
    it('throws ServiceUnavailableException when no encryption key configured', async () => {
      // Force encryption key lookup to fail by providing invalid keys in config
      const configWithoutKey = {
        get: jest.fn().mockReturnValue(undefined),
      };

      const brokenModule = await Test.createTestingModule({
        providers: [
          AuthOAuthService,
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: GoogleAuthService, useValue: mockGoogleAuthService },
          { provide: FacebookAuthService, useValue: mockFacebookAuthService },
          { provide: AppleAuthService, useValue: mockAppleAuthService },
          { provide: TikTokAuthService, useValue: mockTikTokAuthService },
          { provide: ConfigService, useValue: configWithoutKey },
          { provide: RateLimitService, useValue: mockRateLimitService },
          { provide: AuthOAuthResolverService, useValue: mockResolverService },
        ],
      }).compile();
      const svc = brokenModule.get<AuthOAuthService>(AuthOAuthService);

      await expect(svc.upsertSocialAccount('agent-1', PROFILE_STUB)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
