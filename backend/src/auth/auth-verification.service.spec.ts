import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthVerificationService } from './auth-verification.service';
import { AuthWhatsappPasswordService } from './auth-whatsapp-password.service';
import { EmailService } from './email.service';

const mockPrismaService = {
  agent: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  workspace: {
    create: jest.fn(),
  },
  magicLinkToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn((arg: unknown) => {
    if (typeof arg === 'function') {
      return arg({
        agent: mockPrismaService.agent,
        workspace: mockPrismaService.workspace,
        magicLinkToken: mockPrismaService.magicLinkToken,
      });
    }
    return Promise.all(arg as Array<Promise<unknown>>);
  }),
};

const mockEmailService = {
  sendMagicLinkEmail: jest.fn().mockResolvedValue(true),
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, string> = {
      FRONTEND_URL: 'http://localhost:3000',
    };
    return config[key];
  }),
};

const mockAuthWhatsappPasswordService = {
  sendWhatsAppCode: jest.fn(),
  verifyWhatsAppCode: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
};

describe('AuthVerificationService', () => {
  let service: AuthVerificationService;
  let prisma: typeof mockPrismaService;
  let emailService: typeof mockEmailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.RATE_LIMIT_DISABLED = 'true';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthVerificationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AuthWhatsappPasswordService, useValue: mockAuthWhatsappPasswordService },
      ],
    }).compile();

    service = module.get<AuthVerificationService>(AuthVerificationService);
    prisma = mockPrismaService;
    emailService = mockEmailService;
  });

  describe('requestMagicLink', () => {
    const email = 'user@example.com';

    beforeEach(() => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'agent-1', workspaceId: 'ws-1' });
      prisma.magicLinkToken.create.mockResolvedValue({
        id: 'ml-1',
        email,
        tokenHash: 'hashed-token',
      });
    });

    it('creates magic link token and sends email', async () => {
      const result = await service.requestMagicLink({ email });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Se o email for válido');
      expect(prisma.magicLinkToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email,
            agentId: 'agent-1',
          }),
        }),
      );
      expect(emailService.sendMagicLinkEmail).toHaveBeenCalledWith(
        email,
        expect.stringContaining('/magic-link?token='),
      );
    });

    it('includes token in dev response body', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      try {
        const result = await service.requestMagicLink({ email });
        expect(result.token).toBeDefined();
        expect(result.magicLinkUrl).toBeDefined();
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('does not leak token in production response', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const result = await service.requestMagicLink({ email });
        expect(result.token).toBeUndefined();
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('throws BadRequestException for empty email', async () => {
      await expect(service.requestMagicLink({ email: '' })).rejects.toThrow(BadRequestException);
    });

    it('stores redirectTo when provided', async () => {
      await service.requestMagicLink({ email, redirectTo: '/settings' });

      expect(prisma.magicLinkToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            redirectTo: '/settings',
          }),
        }),
      );
    });
  });

  describe('verifyMagicLink', () => {
    it('throws BadRequestException for empty token', async () => {
      await expect(service.verifyMagicLink('')).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException for invalid token', async () => {
      prisma.magicLinkToken.findUnique.mockResolvedValue(null);

      await expect(service.verifyMagicLink('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for expired token', async () => {
      prisma.magicLinkToken.findUnique.mockResolvedValue({
        id: 'ml-1',
        email: 'user@example.com',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
        redirectTo: '/dashboard',
        agent: null,
      });

      await expect(service.verifyMagicLink('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for already used token', async () => {
      prisma.magicLinkToken.findUnique.mockResolvedValue({
        id: 'ml-1',
        email: 'user@example.com',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: new Date(),
        redirectTo: '/dashboard',
        agent: null,
      });

      await expect(service.verifyMagicLink('used-token')).rejects.toThrow(UnauthorizedException);
    });

    it('creates new workspace + agent for first-time magic link user', async () => {
      prisma.magicLinkToken.findUnique.mockResolvedValue({
        id: 'ml-1',
        email: 'new@example.com',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
        redirectTo: '/onboarding',
        agent: null,
      });
      prisma.workspace.create.mockResolvedValue({ id: 'ws-new' });
      prisma.agent.create.mockResolvedValue({
        id: 'agent-new',
        email: 'new@example.com',
        workspaceId: 'ws-new',
        name: 'New user',
        role: 'ADMIN',
        provider: null,
        providerId: null,
        avatarUrl: null,
        emailVerified: true,
        disabledAt: null,
        deletedAt: null,
      });
      prisma.magicLinkToken.update.mockResolvedValue({ id: 'ml-1' });

      const result = await service.verifyMagicLink('valid-token');

      expect(result.isNewUser).toBe(true);
      expect(result.redirectTo).toBe('/onboarding');
      expect(result.agent.email).toBe('new@example.com');
      expect(prisma.workspace.create).toHaveBeenCalled();
      expect(prisma.agent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'ADMIN',
            emailVerified: true,
          }),
        }),
      );
    });

    it('returns existing agent for returning magic link user', async () => {
      prisma.magicLinkToken.findUnique.mockResolvedValue({
        id: 'ml-2',
        email: 'existing@example.com',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
        redirectTo: '/dashboard',
        agent: {
          id: 'agent-2',
          email: 'existing@example.com',
          workspaceId: 'ws-2',
          name: 'Existing User',
          role: 'ADMIN',
          provider: null,
          providerId: null,
          avatarUrl: null,
          emailVerified: true,
          disabledAt: null,
          deletedAt: null,
        },
      });

      const result = await service.verifyMagicLink('valid-token');

      expect(result.isNewUser).toBe(false);
      expect(result.agent.id).toBe('agent-2');
      expect(prisma.agent.create).not.toHaveBeenCalled();
    });
  });

  describe('sendVerificationEmail', () => {
    it('sends verification email to unverified agent', async () => {
      prisma.agent.findUnique.mockResolvedValue({
        id: 'agent-1',
        workspaceId: 'ws-1',
        email: 'user@example.com',
        emailVerified: false,
      });
      prisma.agent.update.mockResolvedValue({ id: 'agent-1', workspaceId: 'ws-1' });

      const result = await service.sendVerificationEmail('agent-1');

      expect(result.success).toBe(true);
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        'user@example.com',
        expect.stringContaining('verify-email?token='),
      );
    });

    it('returns alreadyVerified when email is already verified', async () => {
      prisma.agent.findUnique.mockResolvedValue({
        id: 'agent-1',
        workspaceId: 'ws-1',
        email: 'user@example.com',
        emailVerified: true,
      });

      const result = await service.sendVerificationEmail('agent-1');

      expect(result).toHaveProperty('alreadyVerified', true);
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException for non-existent agent', async () => {
      prisma.agent.findUnique.mockResolvedValue(null);

      await expect(service.sendVerificationEmail('nonexistent')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('verifyEmail', () => {
    it('verifies email with a valid token', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        workspaceId: 'ws-1',
        emailVerificationExpiry: new Date(Date.now() + 60000),
      });
      prisma.agent.update.mockResolvedValue({ id: 'agent-1', workspaceId: 'ws-1' });

      const result = await service.verifyEmail('valid-token');

      expect(result.success).toBe(true);
      expect(result.message).toContain('verificado');
      expect(prisma.agent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent-1' },
          data: expect.objectContaining({
            emailVerified: true,
            emailVerificationToken: null,
          }),
        }),
      );
    });

    it('throws UnauthorizedException for invalid token', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);

      await expect(service.verifyEmail('invalid-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('resendVerificationEmail', () => {
    it('returns no-op message for non-existent email', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);

      const result = await service.resendVerificationEmail('nonexistent@example.com');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Se o email existir');
    });

    it('returns already verified for verified agent', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        workspaceId: 'ws-1',
        emailVerified: true,
      });

      const result = await service.resendVerificationEmail('verified@example.com');

      expect(result).toHaveProperty('alreadyVerified', true);
    });
  });

  describe('whatsapp delegation', () => {
    it('sendWhatsAppCode delegates to AuthWhatsappPasswordService', async () => {
      mockAuthWhatsappPasswordService.sendWhatsAppCode.mockResolvedValue({
        success: true,
        message: 'OTP sent',
      });

      const result = await service.sendWhatsAppCode('+5511999999999', '1.2.3.4');

      expect(result).toEqual({ success: true, message: 'OTP sent' });
      expect(mockAuthWhatsappPasswordService.sendWhatsAppCode).toHaveBeenCalledWith(
        '+5511999999999',
        '1.2.3.4',
      );
    });

    it('verifyWhatsAppCode delegates to AuthWhatsappPasswordService', async () => {
      mockAuthWhatsappPasswordService.verifyWhatsAppCode.mockResolvedValue({
        id: 'agent-1',
        email: 'user@example.com',
        workspaceId: 'ws-1',
        name: 'User',
        role: 'ADMIN',
        disabledAt: null,
        deletedAt: null,
      });

      const result = await service.verifyWhatsAppCode('+5511999999999', '123456', '1.2.3.4');

      expect(result.id).toBe('agent-1');
      expect(mockAuthWhatsappPasswordService.verifyWhatsAppCode).toHaveBeenCalledWith(
        '+5511999999999',
        '123456',
        '1.2.3.4',
      );
    });

    it('forgotPassword delegates to AuthWhatsappPasswordService', async () => {
      mockAuthWhatsappPasswordService.forgotPassword.mockResolvedValue({
        success: true,
        message: 'email sent',
      });

      const result = await service.forgotPassword('user@example.com', '1.2.3.4');

      expect(result.success).toBe(true);
      expect(mockAuthWhatsappPasswordService.forgotPassword).toHaveBeenCalledWith(
        'user@example.com',
        '1.2.3.4',
      );
    });

    it('resetPassword delegates to AuthWhatsappPasswordService', async () => {
      mockAuthWhatsappPasswordService.resetPassword.mockResolvedValue({
        success: true,
        message: 'password reset',
      });

      const result = await service.resetPassword('reset-token', 'new-password-123', '1.2.3.4');

      expect(result.success).toBe(true);
      expect(mockAuthWhatsappPasswordService.resetPassword).toHaveBeenCalledWith(
        'reset-token',
        'new-password-123',
        '1.2.3.4',
      );
    });
  });
});
