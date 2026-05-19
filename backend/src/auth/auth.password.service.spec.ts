import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthTokenService } from './auth.token.service';
import { AuthPartnerService } from './auth-partner.service';
import { RateLimitService } from './rate-limit.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { AuthPasswordService } from './auth.password.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn(),
}));

import { compare as bcryptCompare } from 'bcrypt';

describe('AuthPasswordService', () => {
  let service: AuthPasswordService;
  let prisma: {
    agent: { findFirst: jest.Mock; create: jest.Mock };
    workspace: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let tokenService: { issueTokens: jest.Mock };
  let partner: { resolvePartnerInvite: jest.Mock; finalizePartnerInviteRegistration: jest.Mock };
  let rateLimit: { checkRateLimit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      agent: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      workspace: { create: jest.fn().mockResolvedValue({ id: 'ws-1', name: 'X' }) },
      $transaction: jest.fn(),
    };
    tokenService = { issueTokens: jest.fn().mockResolvedValue({ accessToken: 'tk' }) };
    partner = {
      resolvePartnerInvite: jest.fn().mockResolvedValue(null),
      finalizePartnerInviteRegistration: jest.fn().mockResolvedValue(undefined),
    };
    rateLimit = { checkRateLimit: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthPasswordService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthTokenService, useValue: tokenService },
        { provide: AuthPartnerService, useValue: partner },
        { provide: RateLimitService, useValue: rateLimit },
        { provide: OpsAlertService, useValue: { alertOnCriticalError: jest.fn() } },
      ],
    }).compile();
    service = module.get(AuthPasswordService);

    (bcryptCompare as jest.Mock).mockReset();
  });

  describe('checkEmail', () => {
    it('reports existence when agent found', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'a' });
      await expect(service.checkEmail('x@x.com')).resolves.toEqual({ exists: true });
    });

    it('reports absence when agent not found', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      await expect(service.checkEmail('x@x.com')).resolves.toEqual({ exists: false });
    });
  });

  describe('register', () => {
    it('rejects with ConflictException when email already exists', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'a', workspaceId: 'ws-1' });
      await expect(
        service.register({ email: 'X@X.com', password: 'pw' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates workspace + agent + issues tokens on happy path', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.agent.create.mockResolvedValue({ id: 'a', email: 'x@x.com', workspaceId: 'ws-1' });
      const result = await service.register({
        email: 'X@X.com',
        password: 'pw',
        name: 'Alice',
      });
      expect(prisma.workspace.create).toHaveBeenCalled();
      expect(prisma.agent.create).toHaveBeenCalled();
      expect(tokenService.issueTokens).toHaveBeenCalled();
      expect(result).toEqual({ accessToken: 'tk' });
    });

    it('enforces rate limit by IP on registration', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.agent.create.mockResolvedValue({ id: 'a' });
      await service.register({ email: 'x@x.com', password: 'pw', ip: '1.2.3.4' });
      expect(rateLimit.checkRateLimit).toHaveBeenCalledWith('register:1.2.3.4');
    });
  });

  describe('login', () => {
    it('rejects with UnauthorizedException when agent not found', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      await expect(
        service.login({ email: 'x@x.com', password: 'pw' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects OAuth-only account (google) with provider-specific message', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: 'a',
        email: 'x@x.com',
        workspaceId: 'ws-1',
        name: 'X',
        role: 'ADMIN',
        password: '',
        provider: 'google',
        disabledAt: null,
        deletedAt: null,
      });
      await expect(
        service.login({ email: 'x@x.com', password: 'pw' }),
      ).rejects.toThrow(/Google/);
    });

    it('rejects with UnauthorizedException on wrong password', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: 'a',
        email: 'x@x.com',
        workspaceId: 'ws-1',
        name: 'X',
        role: 'ADMIN',
        password: 'hashed',
        provider: null,
        disabledAt: null,
        deletedAt: null,
      });
      (bcryptCompare as jest.Mock).mockResolvedValue(false);
      await expect(
        service.login({ email: 'x@x.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('issues tokens when bcrypt verifies password', async () => {
      const agent = {
        id: 'a',
        email: 'x@x.com',
        workspaceId: 'ws-1',
        name: 'X',
        role: 'ADMIN',
        password: 'hashed',
        provider: null,
        disabledAt: null,
        deletedAt: null,
      };
      prisma.agent.findFirst.mockResolvedValue(agent);
      (bcryptCompare as jest.Mock).mockResolvedValue(true);
      const result = await service.login({ email: 'x@x.com', password: 'pw' });
      expect(tokenService.issueTokens).toHaveBeenCalledWith(agent);
      expect(result).toEqual({ accessToken: 'tk' });
    });

    it('applies BOTH global IP rate limit and per-email rate limit', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      await expect(
        service.login({ email: 'x@x.com', password: 'pw', ip: '9.9.9.9' }),
      ).rejects.toThrow();
      expect(rateLimit.checkRateLimit).toHaveBeenCalledWith('login:9.9.9.9');
      expect(rateLimit.checkRateLimit).toHaveBeenCalledWith('login:9.9.9.9:x@x.com');
    });
  });
});
