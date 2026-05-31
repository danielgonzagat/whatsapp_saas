import { Logger, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { compare as bcryptCompare } from 'bcrypt';
import { castMock } from '../../test/helpers/cast-mock';
import { partialMatch } from '../../test/helpers/match-instance';
import {
  forgotPassword,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
} from './auth-service.password-verification';
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
  agent: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  passwordResetToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  refreshToken: { updateMany: jest.Mock };
  $transaction: jest.Mock;
}

function buildPrisma(): PrismaShape {
  const shape: PrismaShape = {
    agent: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    refreshToken: { updateMany: jest.fn() },
    $transaction: jest.fn((arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: PrismaShape) => unknown)(shape);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  return shape;
}

function buildDeps(prisma: PrismaShape): {
  deps: AuthPartsDeps;
  email: { sendPasswordResetEmail: jest.Mock; sendVerificationEmail: jest.Mock };
} {
  const email = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  };
  const deps = castMock<AuthPartsDeps>({
    prisma: castMock<PrismaService>(prisma),
    jwt: castMock<JwtService>({ signAsync: jest.fn() }),
    emailService: email,
    rateLimitService: { checkRateLimit: jest.fn().mockResolvedValue(undefined) },
    logger: new Logger('password-verification-test'),
  });
  return { deps, email };
}

function firstArg<T>(mock: jest.Mock): T {
  const calls = castMock<Array<[T]>>(mock.mock.calls);
  return calls[0][0];
}

describe('auth-service.password-verification', () => {
  let prisma: PrismaShape;
  let deps: AuthPartsDeps;
  let email: { sendPasswordResetEmail: jest.Mock; sendVerificationEmail: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildPrisma();
    ({ deps, email } = buildDeps(prisma));
  });

  describe('forgotPassword', () => {
    it('returns a non-committal success without creating a token for an unknown email', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);

      const result = await forgotPassword(deps, 'ghost@test.com');

      expect(result.success).toBe(true);
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('invalidates prior unused reset tokens, mints a new one, and emails the reset link', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'a-1', email: 'user@test.com' });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.passwordResetToken.create.mockResolvedValue({ id: 'prt-1' });

      await forgotPassword(deps, 'user@test.com');

      // Old unused tokens for this agent are burned before a new one is issued.
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { agentId: 'a-1', used: false },
        data: { used: true },
      });
      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith(
        partialMatch({ data: partialMatch({ agentId: 'a-1', token: expect.anything() }) }),
      );
      const mintedResetToken = firstArg<{ data: { token: string } }>(
        prisma.passwordResetToken.create,
      ).data.token;
      expect(email.sendPasswordResetEmail).toHaveBeenCalledWith(
        'user@test.com',
        expect.stringContaining(`reset-password?token=${mintedResetToken}`),
      );
    });
  });

  describe('resetPassword', () => {
    const validToken = {
      id: 'prt-1',
      token: 'reset-tok',
      agentId: 'a-1',
      used: false,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      agent: { workspaceId: 'ws-1' },
    };

    it('rejects an unknown token with UnauthorizedException', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(resetPassword(deps, 'reset-tok', 'NewStr0ng!')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an already-used token (no replay of a consumed reset)', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({ ...validToken, used: true });
      await expect(resetPassword(deps, 'reset-tok', 'NewStr0ng!')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...validToken,
        expiresAt: new Date(Date.now() - 60_000),
      });
      await expect(resetPassword(deps, 'reset-tok', 'NewStr0ng!')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a too-short new password with HTTP 400 before mutating anything', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validToken);
      await expect(resetPassword(deps, 'reset-tok', 'short')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('atomically stores a bcrypt hash, consumes the token, and revokes all refresh tokens', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validToken);
      prisma.agent.update.mockResolvedValue({});
      prisma.passwordResetToken.update.mockResolvedValue({});
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      const result = await resetPassword(deps, 'reset-tok', 'NewStr0ng!Pass');

      expect(result.success).toBe(true);
      // Whole reset runs inside one transaction (no partial state).
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      const agentUpdate = firstArg<{
        where: { id: string; workspaceId: string };
        data: { password: string };
      }>(prisma.agent.update);
      // Workspace isolation enforced on the update target.
      expect(agentUpdate.where).toEqual({ id: 'a-1', workspaceId: 'ws-1' });
      expect(agentUpdate.data.password).not.toBe('NewStr0ng!Pass');
      await expect(bcryptCompare('NewStr0ng!Pass', agentUpdate.data.password)).resolves.toBe(true);

      // Token marked used; all sessions revoked so a leaked reset link can't ride an old session.
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
        partialMatch({ where: { id: 'prt-1' }, data: { used: true } }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { agentId: 'a-1' },
        data: { revoked: true },
      });
    });

    it('is throwing an HttpException type for the short-password path', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validToken);
      await expect(resetPassword(deps, 'reset-tok', '1234567')).rejects.toBeInstanceOf(
        HttpException,
      );
    });
  });

  describe('sendVerificationEmail', () => {
    it('rejects an unknown agent', async () => {
      prisma.agent.findUnique.mockResolvedValue(null);
      await expect(sendVerificationEmail(deps, 'missing')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('short-circuits when email is already verified (no token, no email)', async () => {
      prisma.agent.findUnique.mockResolvedValue({ id: 'a-1', emailVerified: true });
      const result = await sendVerificationEmail(deps, 'a-1');
      expect(result.alreadyVerified).toBe(true);
      expect(prisma.agent.update).not.toHaveBeenCalled();
      expect(email.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('writes a verification token scoped to the workspace and emails the verify link', async () => {
      prisma.agent.findUnique.mockResolvedValue({
        id: 'a-1',
        email: 'user@test.com',
        emailVerified: false,
        workspaceId: 'ws-1',
      });
      prisma.agent.update.mockResolvedValue({});

      await sendVerificationEmail(deps, 'a-1');

      expect(prisma.agent.update).toHaveBeenCalledWith(
        partialMatch({
          where: { id: 'a-1', workspaceId: 'ws-1' },
          data: partialMatch({ emailVerificationToken: expect.anything() }),
        }),
      );
      const mintedVerificationToken = firstArg<{ data: { emailVerificationToken: string } }>(
        prisma.agent.update,
      ).data.emailVerificationToken;
      expect(email.sendVerificationEmail).toHaveBeenCalledWith(
        'user@test.com',
        expect.stringContaining(`verify-email?token=${mintedVerificationToken}`),
      );
    });
  });

  describe('verifyEmail', () => {
    it('rejects an unknown verification token', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      await expect(verifyEmail(deps, 'bad-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an expired verification token', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: 'a-1',
        workspaceId: 'ws-1',
        emailVerificationExpiry: new Date(Date.now() - 60_000),
      });
      await expect(verifyEmail(deps, 'tok')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('marks the email verified and clears the token fields on success', async () => {
      prisma.agent.findFirst.mockResolvedValue({
        id: 'a-1',
        workspaceId: 'ws-1',
        emailVerificationExpiry: new Date(Date.now() + 60_000),
      });
      prisma.agent.update.mockResolvedValue({});

      const result = await verifyEmail(deps, 'tok');

      expect(result?.success).toBe(true);
      expect(prisma.agent.update).toHaveBeenCalledWith(
        partialMatch({
          where: { id: 'a-1', workspaceId: 'ws-1' },
          data: {
            emailVerified: true,
            emailVerificationToken: null,
            emailVerificationExpiry: null,
          },
        }),
      );
    });
  });
});
