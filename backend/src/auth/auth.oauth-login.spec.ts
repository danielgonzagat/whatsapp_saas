import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { FacebookAuthService } from './facebook-auth.service';
import { GoogleAuthService } from './google-auth.service';
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
