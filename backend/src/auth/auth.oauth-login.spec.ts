import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { FacebookAuthService } from './facebook-auth.service';
import { GoogleAuthService } from './google-auth.service';
import { TikTokAuthService } from './tiktok-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectService } from '../payments/connect/connect.service';

const mockPrismaService = {
  agent: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  workspace: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  socialAccount: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  $transaction: jest.fn((arg: unknown) => {
    if (typeof arg === 'function') {
      return (
        arg as (tx: {
          agent: typeof mockPrismaService.agent;
          workspace: typeof mockPrismaService.workspace;
        }) => unknown
      )({
        agent: mockPrismaService.agent,
        workspace: mockPrismaService.workspace,
      });
    }

    return Promise.all(arg as readonly unknown[]);
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
  createCustomAccount: jest.fn(),
};

describe('AuthService OAuth login', () => {
  let service: AuthService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();
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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = mockPrismaService;
  });

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
    prisma.socialAccount.findUnique.mockResolvedValue(null);
    prisma.socialAccount.upsert.mockResolvedValue({
      id: 'social-1',
      agentId: 'agent-1',
      provider: 'google',
      providerUserId: 'gid-1',
    });
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

    const result = await service.loginWithGoogleCredential({
      credential: 'google-credential',
      ip: '127.0.0.1',
    });

    expect(result).toHaveProperty('access_token');
    expect(result).toHaveProperty('isNewUser', true);
    expect(mockGoogleAuthService.verifyCredential).toHaveBeenCalledWith('google-credential');
  });

  it('should require reauthentication when Facebook login matches an existing verified email', async () => {
    mockFacebookAuthService.verifyAccessToken.mockResolvedValue({
      provider: 'facebook',
      providerId: 'fb-user-1',
      email: 'test@test.com',
      name: 'Test Facebook',
      image: 'https://cdn.example.com/fb-avatar.jpg',
      emailVerified: true,
      accessToken: 'fb-token',
    });
    prisma.socialAccount.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.agent.findFirst.mockResolvedValueOnce(null);
    prisma.agent.findMany.mockResolvedValue([
      {
        id: 'agent-1',
        email: 'test@test.com',
        name: 'Existing User',
        role: 'ADMIN',
        workspaceId: 'ws-1',
        provider: null,
        providerId: null,
        avatarUrl: null,
        emailVerified: false,
        disabledAt: null,
        deletedAt: null,
      },
    ]);

    await expect(
      service.loginWithFacebookAccessToken({
        accessToken: 'fb-token',
        userId: 'fb-user-1',
        ip: '127.0.0.1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: 'oauth_reauthentication_required',
      }),
    });

    expect(mockFacebookAuthService.verifyAccessToken).toHaveBeenCalledWith('fb-token', 'fb-user-1');
    expect(prisma.agent.update).not.toHaveBeenCalled();
    expect(prisma.socialAccount.upsert).not.toHaveBeenCalled();
  });

  it('should require reauthentication when multiple active accounts share the same verified email', async () => {
    mockFacebookAuthService.verifyAccessToken.mockResolvedValue({
      provider: 'facebook',
      providerId: 'fb-user-2',
      email: 'test@test.com',
      name: 'Test Facebook',
      image: null,
      emailVerified: true,
    });
    prisma.socialAccount.findUnique.mockResolvedValueOnce(null);
    prisma.agent.findFirst.mockResolvedValueOnce(null);
    prisma.agent.findMany.mockResolvedValue([
      {
        id: 'agent-1',
        email: 'test@test.com',
        name: 'Workspace One',
        role: 'ADMIN',
        workspaceId: 'ws-1',
        provider: null,
        providerId: null,
        avatarUrl: null,
        emailVerified: true,
        disabledAt: null,
        deletedAt: null,
      },
      {
        id: 'agent-2',
        email: 'test@test.com',
        name: 'Workspace Two',
        role: 'ADMIN',
        workspaceId: 'ws-2',
        provider: null,
        providerId: null,
        avatarUrl: null,
        emailVerified: true,
        disabledAt: null,
        deletedAt: null,
      },
    ]);

    await expect(
      service.loginWithFacebookAccessToken({
        accessToken: 'fb-token',
        userId: 'fb-user-2',
        ip: '127.0.0.1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: 'oauth_reauthentication_required',
      }),
    });

    expect(prisma.agent.update).not.toHaveBeenCalled();
    expect(prisma.socialAccount.upsert).not.toHaveBeenCalled();
  });

  it('should create/login through the secure TikTok code flow without requiring provider email', async () => {
    mockTikTokAuthService.verifyAuthorizationCode.mockResolvedValue({
      provider: 'tiktok',
      providerId: 'tt-user-1',
      email: 'tiktok-tt-user-1@oauth.kloel.local',
      name: 'TikTok User',
      image: 'https://cdn.example.com/tiktok-avatar.jpg',
      emailVerified: false,
      syntheticEmail: true,
      accessToken: 'tt-access-token',
      refreshToken: 'tt-refresh-token',
    });
    prisma.agent.findFirst.mockResolvedValue(null);
    prisma.agent.findMany.mockResolvedValue([]);
    prisma.socialAccount.findUnique.mockResolvedValue(null);
    prisma.socialAccount.upsert.mockResolvedValue({
      id: 'social-tt-1',
      agentId: 'agent-tt-1',
      provider: 'tiktok',
      providerUserId: 'tt-user-1',
    });
    prisma.workspace.create.mockResolvedValue({
      id: 'ws-tt-1',
      name: 'TikTok Workspace',
    });
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-tt-1',
      name: 'TikTok Workspace',
    });
    prisma.agent.create.mockResolvedValue({
      id: 'agent-tt-1',
      email: 'tiktok-tt-user-1@oauth.kloel.local',
      name: 'TikTok User',
      role: 'ADMIN',
      workspaceId: 'ws-tt-1',
    });

    const result = await service.loginWithTikTokAuthorizationCode({
      code: 'tiktok-code',
      redirectUri: 'https://auth.kloel.com/api/auth/callback/tiktok',
      ip: '127.0.0.1',
    });

    expect(result).toHaveProperty('access_token');
    expect(result).toHaveProperty('isNewUser', true);
    expect(mockTikTokAuthService.verifyAuthorizationCode).toHaveBeenCalledWith(
      'tiktok-code',
      'https://auth.kloel.com/api/auth/callback/tiktok',
    );
  });

  it('should preserve an existing real email when TikTok login uses a synthetic provider email', async () => {
    mockTikTokAuthService.verifyAuthorizationCode.mockResolvedValue({
      provider: 'tiktok',
      providerId: 'tt-user-2',
      email: 'tiktok-tt-user-2@oauth.kloel.local',
      name: 'TikTok User',
      image: null,
      emailVerified: false,
      syntheticEmail: true,
    });
    prisma.socialAccount.findUnique.mockResolvedValue({
      id: 'social-tt-2',
      provider: 'tiktok',
      providerUserId: 'tt-user-2',
      agent: {
        id: 'agent-tt-2',
        email: 'real-user@kloel.com',
        workspaceId: 'ws-tt-2',
        name: 'Existing User',
        role: 'ADMIN',
        provider: 'tiktok',
        providerId: 'tt-user-2',
        avatarUrl: null,
        emailVerified: true,
        disabledAt: null,
        deletedAt: null,
      },
    });
    prisma.socialAccount.upsert.mockResolvedValue({
      id: 'social-tt-2',
      agentId: 'agent-tt-2',
      provider: 'tiktok',
      providerUserId: 'tt-user-2',
    });
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-tt-2',
      name: 'Workspace',
    });

    const result = await service.loginWithTikTokAuthorizationCode({
      code: 'tiktok-code',
      redirectUri: 'https://auth.kloel.com/api/auth/callback/tiktok',
      ip: '127.0.0.1',
    });

    expect(prisma.agent.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'tiktok-tt-user-2@oauth.kloel.local',
        }),
      }),
    );
    expect(result.user?.email).toBe('real-user@kloel.com');
  });

  it('should create/login through the TikTok access-token flow used by the auth callback proxy', async () => {
    mockTikTokAuthService.verifyAccessToken.mockResolvedValue({
      provider: 'tiktok',
      providerId: 'tt-user-3',
      email: 'tiktok-tt-user-3@oauth.kloel.local',
      name: 'TikTok Proxy User',
      image: null,
      emailVerified: false,
      syntheticEmail: true,
      accessToken: 'tt-access-token',
      refreshToken: 'tt-refresh-token',
    });
    prisma.agent.findFirst.mockResolvedValue(null);
    prisma.agent.findMany.mockResolvedValue([]);
    prisma.socialAccount.findUnique.mockResolvedValue(null);
    prisma.socialAccount.upsert.mockResolvedValue({
      id: 'social-tt-3',
      agentId: 'agent-tt-3',
      provider: 'tiktok',
      providerUserId: 'tt-user-3',
    });
    prisma.workspace.create.mockResolvedValue({
      id: 'ws-tt-3',
      name: 'TikTok Proxy Workspace',
    });
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-tt-3',
      name: 'TikTok Proxy Workspace',
    });
    prisma.agent.create.mockResolvedValue({
      id: 'agent-tt-3',
      email: 'tiktok-tt-user-3@oauth.kloel.local',
      name: 'TikTok Proxy User',
      role: 'ADMIN',
      workspaceId: 'ws-tt-3',
    });

    const result = await service.loginWithTikTokAccessToken({
      accessToken: 'tt-access-token',
      openId: 'tt-user-3',
      refreshToken: 'tt-refresh-token',
      expiresInSeconds: 3600,
      ip: '127.0.0.1',
    });

    expect(result).toHaveProperty('access_token');
    expect(result).toHaveProperty('isNewUser', true);
    expect(mockTikTokAuthService.verifyAccessToken).toHaveBeenCalledWith({
      accessToken: 'tt-access-token',
      openId: 'tt-user-3',
      refreshToken: 'tt-refresh-token',
      expiresInSeconds: 3600,
    });
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
