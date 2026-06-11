import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { castMock } from '../../test/helpers/cast-mock';
import { partialMatch } from '../../test/helpers/match-instance';
import { completeTrustedOAuthLogin } from './auth-service.oauth-complete';
import { issueTokens } from './auth-service.tokens';
import { upsertSocialAccount } from './auth-service.social-account';
import type { AuthPartsDeps } from './auth-service.register-login';
import type { GoogleVerifiedProfile } from './google-auth.service';
import type { PrismaService } from '../prisma/prisma.service';

jest.mock('./db-init-error.service', () => ({
  DbInitErrorService: {
    throwFriendlyDbInitError: jest.fn((error: unknown) => {
      throw error;
    }),
  },
}));
jest.mock('./auth-service.tokens', () => ({
  issueTokens: jest.fn(),
}));
jest.mock('./auth-service.social-account', () => ({
  upsertSocialAccount: jest.fn().mockResolvedValue(undefined),
}));

const mockedIssueTokens = jest.mocked(issueTokens);
const mockedUpsertSocial = jest.mocked(upsertSocialAccount);

interface PrismaShape {
  socialAccount: { findUnique: jest.Mock };
  agent: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock; create: jest.Mock };
  workspace: { create: jest.Mock };
  $transaction: jest.Mock;
}

function buildPrisma(): PrismaShape {
  const shape: PrismaShape = {
    socialAccount: { findUnique: jest.fn().mockResolvedValue(null) },
    agent: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      create: jest.fn(),
    },
    workspace: { create: jest.fn().mockResolvedValue({ id: 'ws-new' }) },
    $transaction: jest.fn((arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: PrismaShape) => unknown)(shape);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  return shape;
}

function firstCallArg<T>(mock: jest.Mock): T {
  const calls = castMock<Array<[T] | undefined>>(mock.mock.calls);
  return castMock<T>(calls[0]?.[0]);
}

function buildDeps(prisma: PrismaShape): AuthPartsDeps {
  return castMock<AuthPartsDeps>({
    prisma: castMock<PrismaService>(prisma),
    jwt: { signAsync: jest.fn().mockResolvedValue('jwt') },
    config: { get: jest.fn().mockReturnValue('encryption-key') },
    logger: new Logger('oauth-complete-test'),
  });
}

const TOKENS = castMock<Awaited<ReturnType<typeof issueTokens>>>({
  access_token: 'access-jwt',
  refresh_token: 'refresh-opaque',
  isNewUser: false,
});

function buildProfile(overrides: Partial<GoogleVerifiedProfile> = {}): GoogleVerifiedProfile {
  return castMock<GoogleVerifiedProfile>({
    provider: 'google',
    providerId: 'g-123',
    email: 'User@Test.com',
    name: 'User Name',
    image: 'https://img.example/u.png',
    emailVerified: true,
    ...overrides,
  });
}

const EXISTING_AGENT = {
  id: 'a-1',
  email: 'user@test.com',
  workspaceId: 'ws-1',
  name: 'User Name',
  role: 'ADMIN',
  provider: 'google',
  providerId: 'g-123',
  avatarUrl: 'https://img.example/u.png',
  emailVerified: true,
  disabledAt: null,
  deletedAt: null,
};

describe('completeTrustedOAuthLogin', () => {
  let prisma: PrismaShape;
  let deps: AuthPartsDeps;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildPrisma();
    deps = buildDeps(prisma);
    mockedIssueTokens.mockResolvedValue(TOKENS);
    mockedUpsertSocial.mockResolvedValue(undefined);
  });

  describe('input validation', () => {
    it('rejects an unsupported provider before touching the database', async () => {
      await expect(
        completeTrustedOAuthLogin(
          deps,
          buildProfile({ provider: castMock<GoogleVerifiedProfile['provider']>('github') }),
        ),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        response: partialMatch({ error: 'invalid_provider' }),
      });
      expect(prisma.socialAccount.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a profile without email', async () => {
      await expect(
        completeTrustedOAuthLogin(deps, buildProfile({ email: '   ' })),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        response: partialMatch({ error: 'missing_email' }),
      });
    });

    it('rejects a profile without providerId', async () => {
      await expect(
        completeTrustedOAuthLogin(deps, buildProfile({ providerId: '  ' })),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        response: partialMatch({ error: 'missing_provider_id' }),
      });
    });
  });

  describe('existing account resolution', () => {
    it('logs in via the SocialAccount link, refreshes the social record, and issues tokens', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({ agent: { ...EXISTING_AGENT } });

      const result = await completeTrustedOAuthLogin(deps, buildProfile());

      expect(result).toBe(TOKENS);
      // Fully up-to-date agent: nothing to write back.
      expect(prisma.agent.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(mockedUpsertSocial).toHaveBeenCalledWith(
        deps,
        'a-1',
        partialMatch({ provider: 'google', providerId: 'g-123', email: 'user@test.com' }),
      );
      expect(mockedIssueTokens).toHaveBeenCalledWith(
        deps.prisma,
        deps.jwt,
        deps.logger,
        partialMatch({ id: 'a-1' }),
        { isNewUser: false },
      );
    });

    it('falls back to the legacy agent.provider/providerId columns when no SocialAccount exists', async () => {
      prisma.agent.findFirst.mockResolvedValue({ ...EXISTING_AGENT });

      await completeTrustedOAuthLogin(deps, buildProfile());

      expect(prisma.agent.findFirst).toHaveBeenCalledWith(
        partialMatch({ where: { provider: 'google', providerId: 'g-123' } }),
      );
      expect(mockedIssueTokens).toHaveBeenCalledWith(
        deps.prisma,
        deps.jwt,
        deps.logger,
        partialMatch({ id: 'a-1' }),
        { isNewUser: false },
      );
    });

    it('backfills providerId/avatar/emailVerified on a matched legacy agent', async () => {
      prisma.agent.findMany.mockResolvedValue([
        { ...EXISTING_AGENT, providerId: null, avatarUrl: null, emailVerified: false },
      ]);
      prisma.agent.update.mockResolvedValue({ ...EXISTING_AGENT });

      await completeTrustedOAuthLogin(deps, buildProfile());

      expect(prisma.agent.update).toHaveBeenCalledWith(
        partialMatch({
          where: { id: 'a-1' },
          data: partialMatch({
            providerId: 'g-123',
            avatarUrl: 'https://img.example/u.png',
            emailVerified: true,
          }),
        }),
      );
    });

    it('never overwrites the stored email when the provider email is synthetic', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        agent: { ...EXISTING_AGENT, email: 'real@test.com', emailVerified: false },
      });
      prisma.agent.update.mockResolvedValue({ ...EXISTING_AGENT, email: 'real@test.com' });

      await completeTrustedOAuthLogin(deps, buildProfile({ syntheticEmail: true }));

      const updateArg = firstCallArg<{ data: Record<string, unknown> }>(prisma.agent.update);
      expect(updateArg.data).not.toHaveProperty('email');
      expect(updateArg.data).toHaveProperty('emailVerified', true);
    });

    it('requires re-authentication when the email belongs to a different login method', async () => {
      prisma.agent.findMany.mockResolvedValue([
        { ...EXISTING_AGENT, provider: 'credentials', providerId: null },
      ]);

      await expect(completeTrustedOAuthLogin(deps, buildProfile())).rejects.toMatchObject({
        constructor: ConflictException,
        response: partialMatch({ error: 'oauth_reauthentication_required' }),
      });
      expect(mockedIssueTokens).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses to authenticate a deleted account', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({
        agent: { ...EXISTING_AGENT, deletedAt: new Date() },
      });

      await expect(completeTrustedOAuthLogin(deps, buildProfile())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(mockedIssueTokens).not.toHaveBeenCalled();
    });
  });

  describe('first-time OAuth signup', () => {
    it('provisions workspace + ADMIN agent with blank password and issues isNewUser tokens', async () => {
      const created = { ...EXISTING_AGENT, id: 'a-new', workspaceId: 'ws-new' };
      prisma.agent.create.mockResolvedValue(created);

      const result = await completeTrustedOAuthLogin(deps, buildProfile());

      expect(result).toBe(TOKENS);
      expect(prisma.workspace.create).toHaveBeenCalledWith(
        partialMatch({ data: { name: "User Name's Workspace" } }),
      );
      expect(prisma.agent.create).toHaveBeenCalledWith(
        partialMatch({
          data: partialMatch({
            email: 'user@test.com',
            password: '',
            role: 'ADMIN',
            workspaceId: 'ws-new',
            provider: 'google',
            providerId: 'g-123',
            emailVerified: true,
          }),
        }),
      );
      expect(mockedUpsertSocial).toHaveBeenCalledWith(
        deps,
        'a-new',
        partialMatch({ provider: 'google', providerId: 'g-123' }),
      );
      expect(mockedIssueTokens).toHaveBeenCalledWith(
        deps.prisma,
        deps.jwt,
        deps.logger,
        partialMatch({ id: 'a-new' }),
        { isNewUser: true },
      );
    });

    it('derives the agent name from the email when the provider sends none', async () => {
      prisma.agent.create.mockResolvedValue({ ...EXISTING_AGENT, id: 'a-new' });

      await completeTrustedOAuthLogin(
        deps,
        buildProfile({ name: '  ', email: 'maria.silva@test.com' }),
      );

      expect(prisma.agent.create).toHaveBeenCalledWith(
        partialMatch({ data: partialMatch({ name: 'Maria silva' }) }),
      );
    });
  });

  describe('error translation', () => {
    it('maps PrismaClientValidationError to a 400 invalid_oauth_payload', async () => {
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientValidationError('bad payload', { clientVersion: 'test' }),
      );

      await expect(completeTrustedOAuthLogin(deps, buildProfile())).rejects.toMatchObject({
        constructor: BadRequestException,
        response: partialMatch({ error: 'invalid_oauth_payload' }),
      });
    });

    it('wraps unknown failures in a 500 with a traceable errorId', async () => {
      prisma.$transaction.mockRejectedValue(new Error('boom'));

      await expect(completeTrustedOAuthLogin(deps, buildProfile())).rejects.toMatchObject({
        constructor: InternalServerErrorException,
        response: partialMatch({
          error: 'oauth_internal_error',
          errorId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        }),
      });
    });
  });
});
