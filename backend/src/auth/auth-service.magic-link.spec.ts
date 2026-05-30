import { Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { castMock } from '../../test/helpers/cast-mock';
import { partialMatch } from '../../test/helpers/match-instance';
import { requestMagicLink, verifyMagicLink } from './auth-service.magic-link';
import type { AuthPartsDeps } from './auth-service.register-login';
import type { PrismaService } from '../prisma/prisma.service';

jest.mock('./db-init-error.service', () => ({
  DbInitErrorService: {
    throwFriendlyDbInitError: jest.fn((error: unknown) => {
      throw error;
    }),
  },
}));

interface PrismaShape {
  agent: { findFirst: jest.Mock; update: jest.Mock; create: jest.Mock };
  workspace: { create: jest.Mock; findUnique: jest.Mock };
  magicLinkToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  refreshToken: { create: jest.Mock; updateMany: jest.Mock };
  $transaction: jest.Mock;
}

function buildPrisma(): PrismaShape {
  const shape: PrismaShape = {
    agent: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    workspace: { create: jest.fn(), findUnique: jest.fn() },
    magicLinkToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    refreshToken: { create: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn((arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: PrismaShape) => unknown)(shape);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  return shape;
}

interface MagicLinkDeps {
  deps: AuthPartsDeps;
  email: { sendMagicLinkEmail: jest.Mock };
}

function firstArg<T>(mock: jest.Mock): T {
  const calls = castMock<Array<[T]>>(mock.mock.calls);
  return calls[0][0];
}

function buildDeps(prisma: PrismaShape): MagicLinkDeps {
  const email = { sendMagicLinkEmail: jest.fn().mockResolvedValue(undefined) };
  const deps = castMock<AuthPartsDeps>({
    prisma: castMock<PrismaService>(prisma),
    jwt: castMock<JwtService>({ signAsync: jest.fn().mockResolvedValue('access-jwt') }),
    emailService: email,
    config: { get: jest.fn().mockReturnValue('https://app.kloel.com') },
    rateLimitService: { checkRateLimit: jest.fn().mockResolvedValue(undefined) },
    logger: new Logger('magic-link-test'),
  });
  return { deps, email };
}

const WORKSPACE = { id: 'ws-1', name: 'WS' };
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

describe('auth-service.magic-link', () => {
  let prisma: PrismaShape;
  let deps: AuthPartsDeps;
  let email: { sendMagicLinkEmail: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildPrisma();
    ({ deps, email } = buildDeps(prisma));
    prisma.workspace.findUnique.mockResolvedValue(WORKSPACE);
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.refreshToken.create.mockResolvedValue({ token: 'rt' });
  });

  describe('requestMagicLink', () => {
    it('rejects an empty email with BadRequestException', async () => {
      await expect(requestMagicLink(deps, { email: '  ' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.magicLinkToken.create).not.toHaveBeenCalled();
    });

    it('persists only a HASH of the token (never the raw token) and emails the link', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'a-1' });
      prisma.magicLinkToken.create.mockResolvedValue({ id: 'ml-1' });

      const result = await requestMagicLink(deps, {
        email: 'User@Test.com',
        redirectTo: '/inbox',
      });

      const createArgs = firstArg<{
        data: { email: string; tokenHash: string; redirectTo: string; agentId: string | null };
      }>(prisma.magicLinkToken.create);
      // Email normalized; agent linked; redirect preserved.
      expect(createArgs.data.email).toBe('user@test.com');
      expect(createArgs.data.agentId).toBe('a-1');
      expect(createArgs.data.redirectTo).toBe('/inbox');
      // The stored value is a sha256 hex digest, not the raw token surfaced (dev only) in the result.
      expect(createArgs.data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(createArgs.data.tokenHash).not.toBe(result.token);
      expect(email.sendMagicLinkEmail).toHaveBeenCalledWith(
        'user@test.com',
        expect.stringContaining(`token=${result.token}`),
      );
    });

    it('returns a non-committal success message even when the email is unknown (no enumeration)', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.magicLinkToken.create.mockResolvedValue({ id: 'ml-1' });

      const result = await requestMagicLink(deps, { email: 'ghost@test.com' });

      expect(result.success).toBe(true);
      const createArgs = firstArg<{ data: { agentId: string | null } }>(
        prisma.magicLinkToken.create,
      );
      expect(createArgs.data.agentId).toBeNull();
    });
  });

  describe('verifyMagicLink', () => {
    it('rejects a blank token with BadRequestException', async () => {
      await expect(verifyMagicLink(deps, '   ')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an already-used token with UnauthorizedException', async () => {
      prisma.magicLinkToken.findUnique.mockResolvedValue({
        id: 'ml-1',
        email: 'user@test.com',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        agent: null,
      });

      await expect(verifyMagicLink(deps, 'raw-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an expired token with UnauthorizedException', async () => {
      prisma.magicLinkToken.findUnique.mockResolvedValue({
        id: 'ml-1',
        email: 'user@test.com',
        usedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
        agent: null,
      });

      await expect(verifyMagicLink(deps, 'raw-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('looks the token up by its hash, not the raw value', async () => {
      prisma.magicLinkToken.findUnique.mockResolvedValue(null);
      await expect(verifyMagicLink(deps, 'raw-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.magicLinkToken.findUnique).toHaveBeenCalledWith(
        partialMatch({ where: { tokenHash: sha256('raw-token') } }),
      );
    });

    it('marks the link used and issues tokens for an existing verified agent', async () => {
      prisma.magicLinkToken.findUnique.mockResolvedValue({
        id: 'ml-1',
        email: 'user@test.com',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        redirectTo: '/dashboard',
        agent: {
          id: 'a-1',
          email: 'user@test.com',
          workspaceId: 'ws-1',
          name: 'User',
          role: 'ADMIN',
          emailVerified: true,
          disabledAt: null,
          deletedAt: null,
        },
      });
      prisma.magicLinkToken.update.mockResolvedValue({});

      const result = await verifyMagicLink(deps, 'raw-token');

      expect(result.access_token).toBe('access-jwt');
      expect(result.isNewUser).toBe(false);
      expect(result.redirectTo).toBe('/dashboard');
      // The link must be single-use: it is stamped used on success.
      expect(prisma.magicLinkToken.update).toHaveBeenCalledWith(
        partialMatch({ where: { id: 'ml-1' }, data: partialMatch({ usedAt: expect.anything() }) }),
      );
    });

    it('provisions a new workspace+agent (isNewUser) when no agent is linked yet', async () => {
      prisma.magicLinkToken.findUnique.mockResolvedValue({
        id: 'ml-2',
        email: 'fresh@test.com',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        redirectTo: '/welcome',
        agent: null,
      });
      prisma.workspace.create.mockResolvedValue(WORKSPACE);
      prisma.agent.create.mockResolvedValue({
        id: 'a-new',
        email: 'fresh@test.com',
        workspaceId: 'ws-1',
        name: 'Fresh',
        role: 'ADMIN',
        emailVerified: true,
        disabledAt: null,
        deletedAt: null,
      });
      prisma.magicLinkToken.update.mockResolvedValue({});

      const result = await verifyMagicLink(deps, 'raw-token');

      expect(result.isNewUser).toBe(true);
      expect(result.redirectTo).toBe('/welcome');
      // New magic-link agents are created with emailVerified true and a blank password (passwordless).
      const createArgs = firstArg<{ data: { emailVerified: boolean; password: string } }>(
        prisma.agent.create,
      );
      expect(createArgs.data.emailVerified).toBe(true);
      expect(createArgs.data.password).toBe('');
    });
  });
});
