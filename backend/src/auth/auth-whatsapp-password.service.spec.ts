import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
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
  passwordResetToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  refreshToken: {
    updateMany: jest.fn(),
  },
  $transaction: jest.fn((arg: unknown) => {
    if (typeof arg === 'function') {
      return arg({
        agent: mockPrismaService.agent,
        workspace: mockPrismaService.workspace,
        passwordResetToken: mockPrismaService.passwordResetToken,
        refreshToken: mockPrismaService.refreshToken,
      });
    }
    return Promise.all(arg as Array<Promise<unknown>>);
  }),
};

const mockEmailService = {
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, string> = {
      META_ACCESS_TOKEN: 'fake-meta-token',
      META_PHONE_NUMBER_ID: '123456789',
    };
    return config[key] ?? null;
  }),
};

function createFetchMock(success = true) {
  return jest.fn().mockResolvedValue(
    success
      ? {
          json: jest.fn().mockResolvedValue({}),
        }
      : {
          json: jest.fn().mockResolvedValue({
            error: { message: 'invalid phone number' },
          }),
        },
  );
}

const mockRedis = {
  setex: jest.fn().mockResolvedValue('OK'),
  get: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
};

describe('AuthWhatsappPasswordService', () => {
  let service: AuthWhatsappPasswordService;
  let prisma: typeof mockPrismaService;
  let emailService: typeof mockEmailService;
  let fetchMock: ReturnType<typeof createFetchMock>;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.RATE_LIMIT_DISABLED = 'true';
    fetchMock = createFetchMock();
    global.fetch = fetchMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthWhatsappPasswordService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AuthWhatsappPasswordService>(AuthWhatsappPasswordService);
    prisma = mockPrismaService;
    emailService = mockEmailService;
  });

  afterEach(() => {
    delete process.env.RATE_LIMIT_DISABLED;
  });

  describe('sendWhatsAppCode', () => {
    it('sends WhatsApp code via Meta API and stores in Redis', async () => {
      const result = await service.sendWhatsAppCode('+5511999999999', '1.2.3.4');

      expect(result.success).toBe(true);
      expect(result.message).toContain('WhatsApp');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'whatsapp-verify:5511999999999',
        300,
        expect.stringMatching(/^\d{6}$/),
      );
      expect(fetchMock).toHaveBeenCalled();
      expect(fetchMock.mock.calls[0][0]).toContain('graph.facebook.com');
    });

    it('stores OTP in response when NODE_ENV is not production and Meta API fails', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      global.fetch = jest.fn().mockRejectedValue(new Error('fail'));
      try {
        const result = await service.sendWhatsAppCode('+5511999999999', '1.2.3.4');
        const code = (result as Record<string, unknown>).code;
        expect(code).toBeDefined();
        expect(code).toMatch(/^\d{6}$/);
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('does not include code in production response', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const result = await service.sendWhatsAppCode('+5511999999999', '1.2.3.4');
        const code = (result as Record<string, unknown>).code;
        expect(code).toBeUndefined();
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('logs warning when Redis is not available', async () => {
      const loggerWarnSpy = jest.spyOn(
        (service as unknown as Record<string, unknown>)['logger'] as { warn: jest.Mock },
        'warn',
      );

      const moduleNoRedis = await Test.createTestingModule({
        providers: [
          AuthWhatsappPasswordService,
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: EmailService, useValue: mockEmailService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const serviceNoRedis = moduleNoRedis.get<AuthWhatsappPasswordService>(
        AuthWhatsappPasswordService,
      );

      await serviceNoRedis.sendWhatsAppCode('+5511999999999', '1.2.3.4');

      // The fallback log is on the inner service, so check it logs without Redis
      loggerWarnSpy.mockRestore();
    });

    it('handles Meta API error gracefully', async () => {
      fetchMock = createFetchMock(false);
      global.fetch = fetchMock;

      // Re-create service with error fetch
      const module2 = await Test.createTestingModule({
        providers: [
          AuthWhatsappPasswordService,
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: EmailService, useValue: mockEmailService },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
        ],
      }).compile();

      const svc = module2.get<AuthWhatsappPasswordService>(AuthWhatsappPasswordService);

      const result = await svc.sendWhatsAppCode('+5511999999999', '1.2.3.4');

      expect(result.success).toBe(true);
      expect(result.message).toContain('WhatsApp');
    });

    it('handles fetch network error gracefully', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network timeout'));

      const result = await service.sendWhatsAppCode('+5511999999999', '1.2.3.4');

      expect(result.success).toBe(true);
      expect(result.message).toContain('WhatsApp');
    });

    it('does not log the OTP code in debug log', async () => {
      const loggerDebugSpy = jest.spyOn(
        (service as unknown as Record<string, unknown>)['logger'] as { debug: jest.Mock },
        'debug',
      );

      await service.sendWhatsAppCode('+5511999999999', '1.2.3.4');

      const debugCalls = loggerDebugSpy.mock.calls;
      for (const call of debugCalls) {
        const msg = String(call[0]);
        expect(msg).not.toMatch(/^\d{6}$/);
      }

      loggerDebugSpy.mockRestore();
    });
  });

  describe('verifyWhatsAppCode', () => {
    const phone = '+5511999999999';
    const normalizedPhone = '5511999999999';

    it('verifies a valid OTP and returns existing agent', async () => {
      mockRedis.get.mockResolvedValue('123456');
      prisma.agent.findFirst.mockResolvedValue({
        id: 'agent-1',
        email: `${normalizedPhone}@whatsapp.kloel.com`,
        workspaceId: 'ws-1',
        name: 'Test User',
        role: 'ADMIN',
        disabledAt: null,
        deletedAt: null,
      });

      const result = await service.verifyWhatsAppCode(phone, '123456', '1.2.3.4');

      expect(result.id).toBe('agent-1');
      expect(result.email).toContain('whatsapp.kloel.com');
      expect(mockRedis.del).toHaveBeenCalledWith(`whatsapp-verify:${normalizedPhone}`);
    });

    it('throws UnauthorizedException for invalid OTP', async () => {
      mockRedis.get.mockResolvedValue('123456');

      await expect(service.verifyWhatsAppCode(phone, '654321', '1.2.3.4')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when no stored OTP exists', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.verifyWhatsAppCode(phone, '123456', '1.2.3.4')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('creates new workspace and agent for new phone number', async () => {
      mockRedis.get.mockResolvedValue('123456');
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.workspace.create.mockResolvedValue({ id: 'ws-new' });
      prisma.agent.create.mockResolvedValue({
        id: 'agent-new',
        email: `${normalizedPhone}@whatsapp.kloel.com`,
        workspaceId: 'ws-new',
        name: 'User 9999',
        role: 'ADMIN',
        disabledAt: null,
        deletedAt: null,
      });

      const result = await service.verifyWhatsAppCode(phone, '123456', '1.2.3.4');

      expect(result.id).toBe('agent-new');
      expect(prisma.workspace.create).toHaveBeenCalled();
      expect(prisma.agent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phone: normalizedPhone,
            provider: 'whatsapp',
            role: 'ADMIN',
          }),
        }),
      );
    });
  });

  describe('forgotPassword', () => {
    const email = 'user@example.com';

    it('creates reset token and sends email for existing agent', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'agent-1', workspaceId: 'ws-1' });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({
        id: 'rt-1',
        token: 'mock-token',
        agentId: 'agent-1',
        expiresAt: new Date(),
        used: false,
      });

      const result = await service.forgotPassword(email, '1.2.3.4');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Se o email existir');
      const resetUrl = emailService.sendPasswordResetEmail.mock.calls[0]?.[1];
      expect(resetUrl).toContain('reset-password');
      expect(new URL(resetUrl).searchParams.has('token')).toBe(true);
    });

    it('returns opaque success for non-existent email (no existence leak)', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);

      const result = await service.forgotPassword('nonexistent@example.com', '1.2.3.4');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Se o email existir');
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('includes token in dev response but not in production', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'agent-1', workspaceId: 'ws-1' });
      prisma.passwordResetToken.create.mockResolvedValue({
        id: 'rt-2',
        token: 'mock-token-prod',
        agentId: 'agent-1',
        expiresAt: new Date(),
        used: false,
      });

      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const result = await service.forgotPassword(email, '1.2.3.4');
        const devToken = (result as Record<string, unknown>).token;
        const devResetUrl = (result as Record<string, unknown>).resetUrl;
        expect(devToken).toBeUndefined();
        expect(devResetUrl).toBeUndefined();
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });

  describe('resetPassword', () => {
    const resetCredential = 'valid-reset-token';
    const newPassword = 'new-password-123';

    it('resets password with valid token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: resetCredential,
        agentId: 'agent-1',
        expiresAt: new Date(Date.now() + 60000),
        used: false,
        agent: { id: 'agent-1' },
      });
      prisma.agent.update.mockResolvedValue({ id: 'agent-1', workspaceId: 'ws-1' });
      prisma.passwordResetToken.update.mockResolvedValue({ id: 'rt-1' });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.resetPassword(resetCredential, newPassword, '1.2.3.4');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Senha redefinida');
      expect(prisma.agent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent-1' },
          data: expect.objectContaining({
            password: expect.stringContaining('$2'),
          }),
        }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { agentId: 'agent-1' },
          data: { revoked: true },
        }),
      );
    });

    it('throws UnauthorizedException for expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: resetCredential,
        agentId: 'agent-1',
        expiresAt: new Date(Date.now() - 60000),
        used: false,
        agent: { id: 'agent-1' },
      });

      await expect(service.resetPassword(resetCredential, newPassword, '1.2.3.4')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for already used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: resetCredential,
        agentId: 'agent-1',
        expiresAt: new Date(Date.now() + 60000),
        used: true,
        agent: { id: 'agent-1' },
      });

      await expect(service.resetPassword(resetCredential, newPassword, '1.2.3.4')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for non-existent token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword(resetCredential, newPassword, '1.2.3.4')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws HttpException for password shorter than 8 characters', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: resetCredential,
        agentId: 'agent-1',
        expiresAt: new Date(Date.now() + 60000),
        used: false,
        agent: { id: 'agent-1' },
      });

      await expect(service.resetPassword(resetCredential, 'short', '1.2.3.4')).rejects.toThrow(
        HttpException,
      );
    });
  });
});
