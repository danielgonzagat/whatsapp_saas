import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { AuthOAuthService } from './auth-oauth.service';
import { AuthPartnerService } from './auth-partner.service';
import { AuthVerificationService } from './auth-verification.service';
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
  $transaction: jest.fn((arg: (tx: Record<string, unknown>) => Promise<unknown>) => {
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

const mockAuthOAuthService = {
  verifyGoogleCredential: jest.fn(),
  verifyFacebookAccessToken: jest.fn(),
  verifyAppleIdentityToken: jest.fn(),
  verifyTikTokAuthorizationCode: jest.fn(),
  verifyTikTokAccessToken: jest.fn(),
  resolveAgentForProfile: jest.fn(),
};

const mockAuthPartnerService = {
  resolvePartnerInvite: jest.fn().mockResolvedValue(null),
  finalizePartnerInviteRegistration: jest.fn().mockResolvedValue(undefined),
  resolvePartnerInviteAccountType: jest.fn(),
};

const mockAuthVerificationService = {
  requestMagicLink: jest.fn(),
  verifyMagicLink: jest.fn(),
  sendWhatsAppCode: jest.fn(),
  verifyWhatsAppCode: jest.fn(),
  forgotPassword: jest.fn().mockResolvedValue({
    success: true,
    message: 'Se o email existir, um link de redefinição será enviado.',
  }),
  resetPassword: jest.fn().mockResolvedValue(undefined),
  sendVerificationEmail: jest.fn(),
  verifyEmail: jest
    .fn()
    .mockResolvedValue({ success: true, message: 'Email verificado com sucesso.' }),
  resendVerificationEmail: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: typeof mockPrismaService;

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
        { provide: AuthOAuthService, useValue: mockAuthOAuthService },
        { provide: AuthPartnerService, useValue: mockAuthPartnerService },
        { provide: AuthVerificationService, useValue: mockAuthVerificationService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = mockPrismaService;
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
      mockAuthPartnerService.resolvePartnerInvite.mockResolvedValue(null);
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
      mockAuthPartnerService.resolvePartnerInvite.mockResolvedValue({
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
      prisma.refreshToken.create.mockResolvedValue({ token: 'refresh-token' });

      const result = await service.register({
        name: 'Ana',
        email: 'affiliate@test.com',
        password: 'password123',
        workspaceName: 'Ana Workspace',
        affiliateInviteToken: 'invite-token-1',
      });

      expect(result).toHaveProperty('access_token');
      expect(mockAuthPartnerService.resolvePartnerInvite).toHaveBeenCalledWith(
        'invite-token-1',
        'affiliate@test.com',
      );
      expect(mockAuthPartnerService.finalizePartnerInviteRegistration).toHaveBeenCalledWith(
        expect.objectContaining({
          invite: expect.objectContaining({ id: 'partner-1' }),
          workspace: expect.objectContaining({ id: 'ws-aff' }),
          agent: expect.objectContaining({ id: 'agent-aff' }),
          email: 'affiliate@test.com',
        }),
      );
    });

    it('should provision the mapped connect role when a coproducer invite token is valid', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      mockAuthPartnerService.resolvePartnerInvite.mockResolvedValue({
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
      prisma.refreshToken.create.mockResolvedValue({ token: 'refresh-token' });

      const result = await service.register({
        name: 'Carla',
        email: 'copro@test.com',
        password: 'password123',
        workspaceName: 'Carla Workspace',
        affiliateInviteToken: 'invite-token-2',
      });

      expect(result).toHaveProperty('access_token');
      expect(mockAuthPartnerService.finalizePartnerInviteRegistration).toHaveBeenCalledWith(
        expect.objectContaining({
          invite: expect.objectContaining({ id: 'partner-2', type: 'COPRODUCER' }),
          workspace: expect.objectContaining({ id: 'ws-copro' }),
          email: 'copro@test.com',
        }),
      );
    });

    it('should reject invalid affiliate invite token before creating workspace', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      mockAuthPartnerService.resolvePartnerInvite.mockRejectedValue(
        new BadRequestException('token inválido'),
      );

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
        const mockRedis: { incr: jest.Mock; expire: jest.Mock } = {
          incr: jest.fn().mockImplementation(async (key: string) => {
            const next = (counters.get(key) || 0) + 1;
            counters.set(key, next);
            return next;
          }),
          expire: jest.fn().mockResolvedValue(1),
        };
        const serviceWithRedis = new AuthService(
          mockPrismaService,
          mockJwtService as never,
          {} as never,
          {} as never,
          {} as never,
          mockRedis as never,
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
          mockJwtService as never,
          {} as never,
          {} as never,
          {} as never,
          {
            incr: jest.fn().mockRejectedValue(new Error('redis down')),
            expire: jest.fn(),
          } as never,
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
      mockAuthVerificationService.forgotPassword.mockResolvedValue({
        success: true,
        message: 'Se o email existir, um link de redefinição será enviado.',
      });

      const result = await service.forgotPassword('nonexistent@test.com');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Se o email existir');
      expect(mockAuthVerificationService.forgotPassword).toHaveBeenCalledWith(
        'nonexistent@test.com',
        undefined,
      );
    });

    it('should send reset email for existing user', async () => {
      mockAuthVerificationService.forgotPassword.mockResolvedValue({
        success: true,
        message: 'Se o email existir, um link de redefinição será enviado.',
      });

      const result = await service.forgotPassword('test@test.com');

      expect(result.success).toBe(true);
      expect(mockAuthVerificationService.forgotPassword).toHaveBeenCalledWith(
        'test@test.com',
        undefined,
      );
    });
  });

  describe('resetPassword', () => {
    it('should throw UnauthorizedException for invalid token', async () => {
      mockAuthVerificationService.resetPassword.mockRejectedValue(
        new UnauthorizedException('Token inválido ou expirado'),
      );

      await expect(service.resetPassword('invalid-token', 'newpassword123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for expired token', async () => {
      mockAuthVerificationService.resetPassword.mockRejectedValue(
        new UnauthorizedException('Token expirado'),
      );

      await expect(service.resetPassword('expired-token', 'newpassword123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for used token', async () => {
      mockAuthVerificationService.resetPassword.mockRejectedValue(
        new UnauthorizedException('Token já utilizado'),
      );

      await expect(service.resetPassword('used-token', 'newpassword123')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('verifyEmail', () => {
    it('should throw UnauthorizedException for invalid token', async () => {
      mockAuthVerificationService.verifyEmail.mockRejectedValue(
        new UnauthorizedException('Token de verificação inválido ou expirado.'),
      );

      await expect(service.verifyEmail('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should verify email successfully', async () => {
      mockAuthVerificationService.verifyEmail.mockResolvedValue({
        success: true,
        message: 'Email verificado com sucesso.',
      });

      const result = await service.verifyEmail('valid-token');

      expect(result.success).toBe(true);
      expect(result.message).toContain('verificado');
    });
  });
});
