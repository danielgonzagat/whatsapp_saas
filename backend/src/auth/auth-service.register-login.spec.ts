import { Logger, ConflictException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { compare as bcryptCompare } from 'bcrypt';
import { castMock } from '../../test/helpers/cast-mock';
import { partialMatch } from '../../test/helpers/match-instance';
import {
  checkEmail,
  createAnonymous,
  register,
  login,
  type AuthPartsDeps,
} from './auth-service.register-login';
import type { PrismaService } from '../prisma/prisma.service';

jest.mock('./db-init-error.service', () => ({
  DbInitErrorService: {
    throwFriendlyDbInitError: jest.fn((error: unknown) => {
      throw error;
    }),
  },
}));

jest.mock('./auth-service.partner-invite', () => ({
  resolvePartnerInvite: jest.fn().mockResolvedValue(null),
  finalizePartnerInviteRegistration: jest.fn().mockResolvedValue(undefined),
}));

interface PrismaShape {
  agent: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
  workspace: { create: jest.Mock; findUnique: jest.Mock };
  refreshToken: { create: jest.Mock; updateMany: jest.Mock };
}

function buildPrisma(): PrismaShape {
  return {
    agent: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    workspace: { create: jest.fn(), findUnique: jest.fn() },
    refreshToken: { create: jest.fn(), updateMany: jest.fn() },
  };
}

function buildDeps(prisma: PrismaShape): { deps: AuthPartsDeps; jwt: { signAsync: jest.Mock } } {
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed-access-jwt') };
  const deps = castMock<AuthPartsDeps>({
    prisma: castMock<PrismaService>(prisma),
    jwt: castMock<JwtService>(jwt),
    rateLimitService: { checkRateLimit: jest.fn().mockResolvedValue(undefined) },
    logger: new Logger('register-login-test'),
    connectService: { createCustomAccount: jest.fn() },
  });
  return { deps, jwt };
}

function firstArg<T>(mock: jest.Mock): T {
  const calls = castMock<Array<[T]>>(mock.mock.calls);
  return calls[0][0];
}

const WORKSPACE = { id: 'ws-1', name: 'Test Workspace' };

describe('auth-service.register-login', () => {
  let prisma: PrismaShape;
  let deps: AuthPartsDeps;
  let jwt: { signAsync: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildPrisma();
    ({ deps, jwt } = buildDeps(prisma));
    prisma.workspace.findUnique.mockResolvedValue(WORKSPACE);
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.refreshToken.create.mockResolvedValue({ token: 'rt' });
  });

  describe('checkEmail', () => {
    it('reports exists:false for unknown email and scopes lookup to real workspaces', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      const result = await checkEmail(castMock<PrismaService>(prisma), 'nobody@test.com');
      expect(result).toEqual({ exists: false });
      expect(prisma.agent.findFirst).toHaveBeenCalledWith({
        where: { email: 'nobody@test.com', workspaceId: { not: '' } },
      });
    });

    it('reports exists:true for a known email', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'a-1' });
      const result = await checkEmail(castMock<PrismaService>(prisma), 'known@test.com');
      expect(result).toEqual({ exists: true });
    });
  });

  describe('register', () => {
    const base = { name: 'New User', email: 'New@Test.com', password: 'Str0ngP4ss!' };

    it('persists a bcrypt hash, never the plaintext password, and issues tokens', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.workspace.create.mockResolvedValue(WORKSPACE);
      prisma.agent.create.mockResolvedValue({
        id: 'agent-new',
        email: 'new@test.com',
        name: 'New User',
        role: 'ADMIN',
        workspaceId: 'ws-1',
      });

      const result = await register(deps, base);

      expect(result.access_token).toBe('signed-access-jwt');
      const createArgs = firstArg<{ data: { password: string; email: string } }>(
        prisma.agent.create,
      );
      expect(createArgs.data.password).not.toBe('Str0ngP4ss!');
      expect(createArgs.data.password.startsWith('$2')).toBe(true);
      // bcrypt with rounds=12 produces a verifiable hash of the original.
      await expect(bcryptCompare('Str0ngP4ss!', createArgs.data.password)).resolves.toBe(true);
      // Email is normalized to lowercase before persistence (workspace isolation lookup).
      expect(createArgs.data.email).toBe('new@test.com');
    });

    it('rejects a duplicate email with ConflictException before creating a workspace', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'existing', email: 'new@test.com' });

      await expect(register(deps, base)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.workspace.create).not.toHaveBeenCalled();
      expect(prisma.agent.create).not.toHaveBeenCalled();
    });

    it('maps a Prisma P2002 unique-violation race into a ConflictException', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.workspace.create.mockResolvedValue(WORKSPACE);
      prisma.agent.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(register(deps, base)).rejects.toBeInstanceOf(ConflictException);
    });

    it('signs the access token with the agent identity claims', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.workspace.create.mockResolvedValue(WORKSPACE);
      prisma.agent.create.mockResolvedValue({
        id: 'agent-new',
        email: 'new@test.com',
        name: 'New User',
        role: 'ADMIN',
        workspaceId: 'ws-1',
      });

      await register(deps, base);

      expect(jwt.signAsync).toHaveBeenCalledWith(
        partialMatch({
          sub: 'agent-new',
          email: 'new@test.com',
          workspaceId: 'ws-1',
          role: 'ADMIN',
        }),
        expect.anything(),
      );
    });
  });

  describe('login', () => {
    const creds = { email: 'user@test.com', password: 'Correct#Pass1' };

    it('rejects with UnauthorizedException when no agent matches', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      await expect(login(deps, creds)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('rejects with UnauthorizedException when the password does not match the stored hash', async () => {
      const hash = (await import('bcrypt')).hashSync('Right#Pass1', 12);
      prisma.agent.findFirst.mockResolvedValue({
        id: 'a-1',
        email: 'user@test.com',
        password: hash,
        workspaceId: 'ws-1',
        role: 'ADMIN',
        disabledAt: null,
        deletedAt: null,
      });

      await expect(login(deps, { ...creds, password: 'Wrong#Pass1' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('directs an OAuth-only (passwordless google) account to the provider login', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: 'a-1',
        email: 'user@test.com',
        password: null,
        provider: 'google',
        workspaceId: 'ws-1',
        disabledAt: null,
        deletedAt: null,
      });

      await expect(login(deps, creds)).rejects.toThrow(/Google/);
    });

    it('refuses a deleted account regardless of a matching password', async () => {
      const hash = (await import('bcrypt')).hashSync('Correct#Pass1', 12);
      prisma.agent.findFirst.mockResolvedValue({
        id: 'a-1',
        email: 'user@test.com',
        password: hash,
        workspaceId: 'ws-1',
        role: 'ADMIN',
        disabledAt: null,
        deletedAt: new Date(),
      });

      await expect(login(deps, creds)).rejects.toThrow(/excluída/);
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('issues tokens with the correct identity when the password matches', async () => {
      const hash = (await import('bcrypt')).hashSync('Correct#Pass1', 12);
      prisma.agent.findFirst.mockResolvedValue({
        id: 'a-1',
        email: 'user@test.com',
        name: 'User',
        password: hash,
        workspaceId: 'ws-1',
        role: 'ADMIN',
        disabledAt: null,
        deletedAt: null,
      });

      const result = await login(deps, creds);

      expect(result.access_token).toBe('signed-access-jwt');
      expect(result.user).toEqual(
        partialMatch({ id: 'a-1', email: 'user@test.com', workspaceId: 'ws-1', role: 'ADMIN' }),
      );
      // A fresh login revokes prior refresh tokens (single-session rotation).
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { agentId: 'a-1', revoked: false },
        data: { revoked: true },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        partialMatch({ data: partialMatch({ agentId: 'a-1' }) }),
      );
    });
  });

  describe('createAnonymous', () => {
    it('provisions a guest workspace + admin agent with a hashed random password', async () => {
      prisma.workspace.create.mockResolvedValue(WORKSPACE);
      prisma.agent.create.mockResolvedValue({
        id: 'guest-1',
        email: 'guest_abc@guest.kloel.local',
        name: 'Guest',
        role: 'ADMIN',
        workspaceId: 'ws-1',
      });

      const result = await createAnonymous(deps);

      expect(result.access_token).toBe('signed-access-jwt');
      const createArgs = firstArg<{ data: { password: string; role: string } }>(
        prisma.agent.create,
      );
      // Guest accounts still store a bcrypt hash, never an empty/plaintext secret.
      expect(createArgs.data.password.startsWith('$2')).toBe(true);
      expect(createArgs.data.role).toBe('ADMIN');
    });
  });
});
