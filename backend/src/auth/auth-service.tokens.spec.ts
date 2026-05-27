import { Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  refreshToken,
  REFRESH_TOKEN_ERROR_CODES,
} from './auth-service.tokens';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildJwtMock,
  buildPrismaMock,
  type JwtMock,
  type PrismaMock,
  mockAgent,
  mockRefreshToken,
  mockWorkspace,
} from './auth.token.service.spec.helpers';

jest.mock('./db-init-error.service', () => ({
  DbInitErrorService: {
    throwFriendlyDbInitError: jest.fn((error) => {
      throw error;
    }),
  },
}));

describe('refreshToken (auth-service.tokens)', () => {
  let prismaMock: PrismaMock;
  let jwtMock: JwtMock;
  let logger: Logger;

  beforeEach(() => {
    prismaMock = buildPrismaMock();
    jwtMock = buildJwtMock();
    logger = new Logger('refreshToken-test');
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  const call = () =>
    refreshToken(
      prismaMock as never as PrismaService,
      jwtMock as never as JwtService,
      logger,
      'rt-incoming',
    );

  const expectCode = async (expectedCode: string) => {
    try {
      await call();
      throw new Error('expected UnauthorizedException');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      const response = (error as UnauthorizedException).getResponse() as {
        code?: string;
      };
      expect(response.code).toBe(expectedCode);
    }
  };

  it('throws UNKNOWN when token not found', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce(null);
    await expectCode(REFRESH_TOKEN_ERROR_CODES.UNKNOWN);
  });

  it('throws AGENT_MISSING when stored.agent is null', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
      ...mockRefreshToken,
      agent: null,
    });
    await expectCode(REFRESH_TOKEN_ERROR_CODES.AGENT_MISSING);
  });

  it('throws REPLAYED when stored token is revoked', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
      ...mockRefreshToken,
      revoked: true,
      agent: mockAgent,
    });
    prismaMock.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });
    await expectCode(REFRESH_TOKEN_ERROR_CODES.REPLAYED);
  });

  it('throws EXPIRED when expiresAt is in the past', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
      ...mockRefreshToken,
      expiresAt: new Date(Date.now() - 60_000),
      agent: mockAgent,
    });
    await expectCode(REFRESH_TOKEN_ERROR_CODES.EXPIRED);
  });

  it('throws RACE_LOST when atomic claim count is 0 inside transaction', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
      ...mockRefreshToken,
      agent: mockAgent,
    });
    prismaMock.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });
    await expectCode(REFRESH_TOKEN_ERROR_CODES.RACE_LOST);
  });

  it('returns new tokens on the happy path', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
      ...mockRefreshToken,
      agent: mockAgent,
    });
    prismaMock.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);
    prismaMock.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
    jwtMock.signAsync.mockResolvedValueOnce('access-jwt-xyz');

    const result = await call();
    expect(result.access_token).toBe('access-jwt-xyz');
    expect(result.refresh_token).toBeTruthy();
    expect(result.user.id).toBe(mockAgent.id);
    expect(result.workspace?.id).toBe(mockWorkspace.id);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rolls back: throws 503 when issueTokens fails because workspace lookup misses', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
      ...mockRefreshToken,
      agent: mockAgent,
    });
    prismaMock.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.workspace.findUnique.mockResolvedValueOnce(null);

    await expect(call()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('error code constants are stable strings (frontend mirror depends on these)', () => {
    expect(REFRESH_TOKEN_ERROR_CODES.UNKNOWN).toBe('refresh_token_unknown');
    expect(REFRESH_TOKEN_ERROR_CODES.AGENT_MISSING).toBe('refresh_token_agent_missing');
    expect(REFRESH_TOKEN_ERROR_CODES.REPLAYED).toBe('refresh_token_replayed');
    expect(REFRESH_TOKEN_ERROR_CODES.EXPIRED).toBe('refresh_token_expired');
    expect(REFRESH_TOKEN_ERROR_CODES.RACE_LOST).toBe('refresh_token_race_lost');
    expect(REFRESH_TOKEN_ERROR_CODES.ISSUANCE_FAILED).toBe('refresh_token_issuance_failed');
  });
});
