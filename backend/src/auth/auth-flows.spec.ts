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
import { ConflictException } from '@nestjs/common';

const mockPrisma = {
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
  affiliatePartner: {
    findFirst: jest.fn(),
    update: jest.fn(),
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
      return arg({
        agent: mockPrisma.agent,
        workspace: mockPrisma.workspace,
      } as Partial<typeof mockPrisma>);
    }
    return Promise.all(arg as Array<Promise<unknown>>);
  }),
};

const mockJwt = {
  signAsync: jest.fn().mockResolvedValue('access-token'),
  sign: jest.fn().mockReturnValue('access-token'),
};

const mockEmail = {
  sendEmail: jest.fn().mockResolvedValue(undefined),
};

const mockConfig = {
  get: jest.fn().mockReturnValue(undefined),
};

const mockGoogleAuth = {
  verifyIdToken: jest.fn(),
};

const mockFacebookAuth = {
  verifyAccessToken: jest.fn(),
};

const mockTikTokAuth = {
  exchangeCodeForToken: jest.fn(),
};

const mockConnect = {
  createCustomAccount: jest.fn(),
};

const mockRateLimit = {
  checkRateLimit: jest.fn().mockResolvedValue(undefined),
};

describe('AuthFlows', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.RATE_LIMIT_DISABLED = 'true';
    mockPrisma.agent.findFirst.mockResolvedValue(null);
    mockPrisma.workspace.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        where?.id ? { id: where.id, name: 'Workspace' } : null,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: EmailService, useValue: mockEmail },
        { provide: ConfigService, useValue: mockConfig },
        { provide: GoogleAuthService, useValue: mockGoogleAuth },
        { provide: FacebookAuthService, useValue: mockFacebookAuth },
        { provide: TikTokAuthService, useValue: mockTikTokAuth },
        { provide: ConnectService, useValue: mockConnect },
        { provide: RateLimitService, useValue: mockRateLimit },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('check-email flow', () => {
    it('returns exists: false for unknown email', async () => {
      const result = await service.checkEmail('new@test.com');
      expect(result).toEqual({ exists: false });
      expect(mockPrisma.agent.findFirst).toHaveBeenCalledWith({
        where: { email: 'new@test.com', workspaceId: { not: '' } },
      });
    });

    it('returns exists: true for known email', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        email: 'known@test.com',
      });

      const result = await service.checkEmail('known@test.com');
      expect(result).toEqual({ exists: true });
    });
  });

  describe('register → duplicate prevention', () => {
    const validRegistration = {
      name: 'Flow User',
      email: 'flow@test.com',
      password: 'Str0ngP4ss!',
      workspaceName: 'Flow Workspace',
    };

    beforeEach(() => {
      mockPrisma.affiliatePartner.findFirst.mockResolvedValue(null);
    });

    it('creates workspace and agent, returns access_token', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);
      mockPrisma.workspace.create.mockResolvedValue({
        id: 'ws-flow',
        name: 'Flow Workspace',
      });
      mockPrisma.agent.create.mockResolvedValue({
        id: 'agent-flow',
        email: 'flow@test.com',
        name: 'Flow User',
        role: 'ADMIN',
        workspaceId: 'ws-flow',
      });
      mockPrisma.refreshToken.create.mockResolvedValue({ token: 'refresh-token' });

      const result = await service.register(validRegistration);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('user');
      expect(mockPrisma.workspace.create).toHaveBeenCalled();
      expect(mockPrisma.agent.create).toHaveBeenCalled();
    });

    it('rejects duplicate email with ConflictException', async () => {
      mockPrisma.agent.findFirst.mockResolvedValue({
        id: 'agent-dup',
        email: 'flow@test.com',
      });

      await expect(service.register(validRegistration)).rejects.toThrow(ConflictException);
    });

    it('confirms email exists after successful registration', async () => {
      mockPrisma.agent.findFirst.mockResolvedValueOnce(null);
      mockPrisma.agent.findFirst.mockResolvedValueOnce({
        id: 'agent-flow',
        email: 'flow@test.com',
      });
      mockPrisma.workspace.create.mockResolvedValue({
        id: 'ws-flow',
        name: 'Flow Workspace',
      });
      mockPrisma.agent.create.mockResolvedValue({
        id: 'agent-flow',
        email: 'flow@test.com',
        name: 'Flow User',
        role: 'ADMIN',
        workspaceId: 'ws-flow',
      });
      mockPrisma.refreshToken.create.mockResolvedValue({ token: 'refresh-token' });

      await service.register(validRegistration);
      const afterCheck = await service.checkEmail('flow@test.com');

      expect(afterCheck).toEqual({ exists: true });
    });
  });
});
