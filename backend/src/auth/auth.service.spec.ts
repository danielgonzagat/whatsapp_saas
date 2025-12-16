import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from './email.service';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  HttpStatus,
  InternalServerErrorException,
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
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
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
    };
    return config[key];
  }),
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: typeof mockPrismaService;
  let emailService: typeof mockEmailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = mockPrismaService;
    emailService = mockEmailService;
  });

  describe('checkEmail', () => {
    it('should return exists: true for existing email', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: '1', email: 'test@test.com' });
      
      const result = await service.checkEmail('test@test.com');
      
      expect(result).toEqual({ exists: true });
      expect(prisma.agent.findFirst).toHaveBeenCalledWith({ where: { email: 'test@test.com' } });
    });

    it('should return exists: false for new email', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      
      const result = await service.checkEmail('new@test.com');
      
      expect(result).toEqual({ exists: false });
    });
  });

  describe('register', () => {
    it('should throw ConflictException for existing email', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: '1', email: 'existing@test.com' });
      
      await expect(service.register({
        name: 'Test',
        email: 'existing@test.com',
        password: 'password123',
      })).rejects.toThrow(ConflictException);
    });

    it('should create workspace and agent for new registration', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.workspace.create.mockResolvedValue({ id: 'ws-1', name: 'Test Workspace' });
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
      
      await expect(service.login({
        email: 'nonexistent@test.com',
        password: 'password123',
      })).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        password: '$2b$10$invalidhash',
      });
      
      await expect(service.login({
        email: 'test@test.com',
        password: 'wrongpassword',
      })).rejects.toThrow(UnauthorizedException);
    });

    it('should return 429 after too many attempts (fallback local rate limit)', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      const ip = '127.0.0.1';

      for (let i = 0; i < 5; i++) {
        await expect(
          service.login({ email: 'nonexistent@test.com', password: 'x', ip }),
        ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
      }

      await expect(
        service.login({ email: 'nonexistent@test.com', password: 'x', ip }),
      ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    });

    it('should not break login when Redis fails (fallback local)', async () => {
      const serviceWithRedisFailure = new AuthService(
        mockPrismaService as any,
        mockJwtService as any,
        mockEmailService as any,
        mockConfigService as any,
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
      ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
    });
  });

  describe('oauthLogin', () => {
    it('should throw ConflictException when email is linked to another provider', async () => {
      prisma.agent.findMany.mockResolvedValue([
        {
        id: 'agent-1',
        email: 'test@test.com',
        name: 'Test',
        role: 'ADMIN',
        workspaceId: 'ws-1',
        provider: 'google',
        providerId: 'gid-1',
        },
      ]);

      prisma.workspace.findUnique.mockResolvedValue({ id: 'ws-1' });

      await expect(
        service.oauthLogin({
          provider: 'apple',
          providerId: 'aid-1',
          email: 'test@test.com',
          name: 'Test',
          image: undefined,
          ip: '127.0.0.1',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should return InternalServerErrorException (500) on unexpected errors', async () => {
      prisma.agent.findMany.mockRejectedValue(new Error('boom'));

      await expect(
        service.oauthLogin({
          provider: 'google',
          providerId: 'gid-1',
          email: 'test@test.com',
          name: 'Test',
          image: undefined,
          ip: '127.0.0.1',
        }),
      ).rejects.toThrow(InternalServerErrorException);
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
      prisma.passwordResetToken.create.mockResolvedValue({ token: 'reset-token' });
      
      const result = await service.forgotPassword('test@test.com');
      
      expect(result.success).toBe(true);
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@test.com',
        expect.stringContaining('reset-password')
      );
    });
  });

  describe('resetPassword', () => {
    it('should throw UnauthorizedException for invalid token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      
      await expect(service.resetPassword('invalid-token', 'newpassword123')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        token: 'expired-token',
        used: false,
        expiresAt: new Date(Date.now() - 1000), // Expired
        agent: { id: 'agent-1' },
      });
      
      await expect(service.resetPassword('expired-token', 'newpassword123')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        token: 'used-token',
        used: true,
        expiresAt: new Date(Date.now() + 60000),
        agent: { id: 'agent-1' },
      });
      
      await expect(service.resetPassword('used-token', 'newpassword123')).rejects.toThrow(UnauthorizedException);
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
