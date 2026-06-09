import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { AuthTokenService } from './auth.token.service';
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

describe('AuthTokenService', () => {
  let service: AuthTokenService;
  let prismaMock: PrismaMock;
  let jwtMock: JwtMock;

  beforeEach(async () => {
    prismaMock = buildPrismaMock();
    jwtMock = buildJwtMock();
    service = new AuthTokenService(
      prismaMock as never as PrismaService,
      jwtMock as never as JwtService,
      undefined,
    );
  });

  describe('issueTokens', () => {
    it('should issue access and refresh tokens for valid agent', async () => {
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 0,
      });
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValueOnce('access-token-123');

      const result = await service.issueTokens(mockAgent);

      expect(result.access_token).toBe('access-token-123');
      expect(result.refresh_token).toBeTruthy();
      expect(result.user.id).toBe('agent-123');
      expect(result.user.email).toBe('test@example.com');
      expect(result.workspace?.id).toBe('workspace-123');
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalled();
      expect(prismaMock.refreshToken.create).toHaveBeenCalled();
    });

    it('should mark token as new user when extra.isNewUser is true', async () => {
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 0,
      });
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValueOnce('access-token-123');

      const result = await service.issueTokens(mockAgent, {
        isNewUser: true,
      });

      expect(result.isNewUser).toBe(true);
    });

    it('should throw when workspace is not found', async () => {
      prismaMock.workspace.findUnique.mockResolvedValueOnce(null);

      await expect(service.issueTokens(mockAgent)).rejects.toThrow(ServiceUnavailableException);
    });

    it('should throw when workspaceId is missing', async () => {
      const agentWithoutWorkspace = {
        ...mockAgent,
        workspaceId: null,
      };

      await expect(service.issueTokens(agentWithoutWorkspace)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw when agent is deleted', async () => {
      const deletedAgent = {
        ...mockAgent,
        deletedAt: new Date(),
      };

      await expect(service.issueTokens(deletedAgent)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when agent is disabled', async () => {
      const disabledAgent = {
        ...mockAgent,
        disabledAt: new Date(),
      };

      await expect(service.issueTokens(disabledAgent)).rejects.toThrow(UnauthorizedException);
    });

    it('should rotate refresh tokens correctly', async () => {
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 1,
      });
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValueOnce('access-token-123');

      await service.issueTokens(mockAgent);

      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { agentId: 'agent-123', revoked: false },
        data: { revoked: true },
      });
      expect(prismaMock.refreshToken.create).toHaveBeenCalled();
      const createCall = prismaMock.refreshToken.create.mock.calls[0][0];
      expect(createCall.data.agentId).toBe('agent-123');
      expect(typeof createCall.data.token).toBe('string');
      expect(createCall.data.expiresAt).toBeInstanceOf(Date);
    });

    it('should include user info in response', async () => {
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 0,
      });
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValueOnce('access-token-123');

      const result = await service.issueTokens(mockAgent);

      expect(result.user).toEqual({
        id: 'agent-123',
        name: 'Test User',
        email: 'test@example.com',
        workspaceId: 'workspace-123',
        role: 'ADMIN',
      });
    });
  });

  describe('issueTokensForAgentId', () => {
    it('should issue tokens when agent exists', async () => {
      prismaMock.agent.findUnique.mockResolvedValueOnce(mockAgent);
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 0,
      });
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValueOnce('access-token-123');

      const result = await service.issueTokensForAgentId('agent-123');

      expect(result.access_token).toBe('access-token-123');
      expect(prismaMock.agent.findUnique).toHaveBeenCalledWith({
        where: { id: 'agent-123' },
        select: {
          id: true,
          email: true,
          workspaceId: true,
          name: true,
          role: true,
          disabledAt: true,
          deletedAt: true,
        },
      });
    });

    it('should throw when agent does not exist', async () => {
      prismaMock.agent.findUnique.mockResolvedValueOnce(null);

      await expect(service.issueTokensForAgentId('nonexistent')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('should issue new tokens with valid refresh token', async () => {
      const stored = {
        ...mockRefreshToken,
        agent: mockAgent,
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(stored);
      // 1st updateMany: atomic claim of the inbound token
      // 2nd updateMany: rotateRefreshToken revoke-siblings step
      prismaMock.refreshToken.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValueOnce('new-access-token');

      const result = await service.refresh('rt-stub-1');

      expect(result.access_token).toBe('new-access-token');
      // Atomic claim: updateMany with id + revoked: false guard.
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'token-id-123', revoked: false },
        data: { revoked: true },
      });
    });

    it('should throw when refresh token not found', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(null);

      await expect(service.refresh('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when refresh token is revoked', async () => {
      // updatedAt set well outside the 15s grace window so the replay-sweep
      // path is exercised (true replay = revoked long ago).
      const revokedToken = {
        ...mockRefreshToken,
        revoked: true,
        updatedAt: new Date(Date.now() - 60_000),
        agent: mockAgent,
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(revokedToken);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 1,
      });

      await expect(service.refresh('revoked-token')).rejects.toThrow(UnauthorizedException);
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { agentId: 'agent-123', revoked: false },
        data: { revoked: true },
      });
    });

    it('should throw when refresh token is expired', async () => {
      const expiredToken = {
        ...mockRefreshToken,
        expiresAt: new Date(Date.now() - 1000),
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(expiredToken);

      await expect(service.refresh('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should detect and revoke replayed refresh tokens', async () => {
      // updatedAt set well outside the 15s grace window — this is a true
      // replay (token revoked minutes ago, attacker resurfacing it).
      const revokedToken = {
        ...mockRefreshToken,
        revoked: true,
        updatedAt: new Date(Date.now() - 60_000),
        agent: mockAgent,
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(revokedToken);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({
        count: 2,
      });

      await expect(service.refresh('replayed-token')).rejects.toThrow(UnauthorizedException);
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { agentId: 'agent-123', revoked: false },
        data: { revoked: true },
      });
    });

    it('does not REPLAY-sweep when stale token was rotated within 15s grace window', async () => {
      // Cross-tab race: two browser tabs read the same refresh token, the
      // first tab rotates it, the second tab presents the (now revoked)
      // stale copy a beat later. The second call must STILL 401 (so the
      // client retries with the fresh cookie), but must NOT sweep sibling
      // refresh tokens — that would log the legitimate user out of the
      // tab that just succeeded.
      const recentlyRevokedToken = {
        ...mockRefreshToken,
        revoked: true,
        updatedAt: new Date(Date.now() - 5_000), // 5s ago — inside 15s grace
        agent: mockAgent,
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(recentlyRevokedToken);

      await expect(service.refresh('stale-but-fresh')).rejects.toThrow(UnauthorizedException);
      // The defensive sweep must NOT have fired.
      expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalledWith({
        where: { agentId: 'agent-123', revoked: false },
        data: { revoked: true },
      });
    });

    it('should throw when agent is deleted', async () => {
      const stored = {
        ...mockRefreshToken,
        agent: { ...mockAgent, deletedAt: new Date() },
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(stored);

      await expect(service.refresh('token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when agent is disabled', async () => {
      const stored = {
        ...mockRefreshToken,
        agent: { ...mockAgent, disabledAt: new Date() },
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(stored);

      await expect(service.refresh('token')).rejects.toThrow(UnauthorizedException);
    });

    it('should revoke old token before issuing new pair', async () => {
      const stored = {
        ...mockRefreshToken,
        agent: mockAgent,
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(stored);
      prismaMock.refreshToken.updateMany
        .mockResolvedValueOnce({ count: 1 }) // atomic claim
        .mockResolvedValueOnce({ count: 0 }); // rotation revoke-siblings
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValueOnce('new-token');

      await service.refresh('rt-stub-1');

      const claimOrder = prismaMock.refreshToken.updateMany.mock.invocationCallOrder[0];
      const createOrder = prismaMock.refreshToken.create.mock.invocationCallOrder[0];
      // Atomic claim of inbound token must precede the new-token insert.
      expect(claimOrder).toBeLessThan(createOrder);
    });

    it('should reject concurrent refresh of the same token (race winner only)', async () => {
      // Simulate two concurrent refresh() calls competing for one active
      // token. Only ONE atomic claim should win (count=1); the loser sees
      // count=0 and is rejected with UnauthorizedException.
      const stored = {
        ...mockRefreshToken,
        agent: mockAgent,
      };
      // Both calls observe the same active token via findUnique.
      prismaMock.refreshToken.findUnique
        .mockResolvedValueOnce(stored)
        .mockResolvedValueOnce(stored);
      // First updateMany wins the claim (count=1, then rotation siblings),
      // second updateMany loses (count=0).
      prismaMock.refreshToken.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });
      prismaMock.workspace.findUnique.mockResolvedValue(mockWorkspace);
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValue('access-token');

      const [winner, loser] = await Promise.allSettled([
        service.refresh('rt-stub-1'),
        service.refresh('rt-stub-1'),
      ]);

      const fulfilled = [winner, loser].filter((r) => r.status === 'fulfilled');
      const rejected = [winner, loser].filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      const rejection = rejected[0];
      expect(rejection.reason).toBeInstanceOf(UnauthorizedException);
    });

    it('should return 503 when DB lookup fails (storage error)', async () => {
      prismaMock.refreshToken.findUnique.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(service.refresh('rt-stub-1')).rejects.toThrow(ServiceUnavailableException);
    });

    it('should return 503 when atomic claim fails (storage error)', async () => {
      const stored = {
        ...mockRefreshToken,
        agent: mockAgent,
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(stored);
      prismaMock.refreshToken.updateMany.mockRejectedValueOnce(new Error('Serialization failure'));

      await expect(service.refresh('rt-stub-1')).rejects.toThrow(ServiceUnavailableException);
    });

    it('retries the Serializable claim once on Prisma P2034 then succeeds', async () => {
      // Prisma signals true serialization conflicts (Serializable isolation
      // write/write race) with code P2034. The service must retry the
      // optimistic claim once before downgrading the request to a 503 —
      // otherwise two simultaneous tabs each refreshing trigger a transient
      // conflict that boots both clients to /login.
      const stored = {
        ...mockRefreshToken,
        agent: mockAgent,
      };
      // Build a real PrismaClientKnownRequestError so the `instanceof` guard
      // in the service matches; tests for other Prisma codes in the repo
      // construct the same shape (see inbox.service.spec.ts).
      const p2034 = new Prisma.PrismaClientKnownRequestError('write conflict', {
        code: 'P2034',
        clientVersion: 'test',
      });

      // First $transaction call rejects with P2034. Subsequent calls run the
      // callback against the mock client (rotateRefreshToken also uses
      // $transaction, so we have to keep the default behaviour for those).
      const defaultTx = prismaMock.$transaction.getMockImplementation();
      prismaMock.$transaction
        .mockImplementationOnce(() => Promise.reject(p2034))
        .mockImplementation(defaultTx);

      prismaMock.refreshToken.findUnique.mockResolvedValue(stored);
      prismaMock.refreshToken.updateMany
        .mockResolvedValueOnce({ count: 1 }) // retried claim succeeds
        .mockResolvedValueOnce({ count: 0 }); // rotateRefreshToken sibling sweep
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValueOnce('access-token-after-retry');

      const result = await service.refresh('rt-stub-1');

      expect(result.access_token).toBe('access-token-after-retry');
      // First call rejected, second succeeded, third = rotation tx. The exact
      // count matters less than: it was retried (>= 2 attempts).
      expect(prismaMock.$transaction.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('returns 503 when both Serializable claim attempts fail with P2034', async () => {
      // Sustained contention (e.g. database under load): the retry policy is
      // ONE retry, not infinite. A second P2034 must downgrade to 503 so the
      // client backs off instead of hammering the DB.
      const p2034 = new Prisma.PrismaClientKnownRequestError('write conflict', {
        code: 'P2034',
        clientVersion: 'test',
      });
      prismaMock.$transaction
        .mockImplementationOnce(() => Promise.reject(p2034))
        .mockImplementationOnce(() => Promise.reject(p2034));

      await expect(service.refresh('rt-stub-1')).rejects.toThrow(ServiceUnavailableException);
    });

    it('retries rotateRefreshToken once on P2034 after a successful claim (no spurious 503)', async () => {
      // Regression: the atomic claim already retried P2034, but the SECOND
      // Serializable transaction — rotateRefreshToken inside issueTokens —
      // had no retry. Two tabs refreshing the same agent collide on the wide
      // `updateMany WHERE agentId` rotation write; the legitimate winner used
      // to get a 503 instead of a fresh token pair. The rotation must now
      // retry the conflict once and succeed.
      const stored = {
        ...mockRefreshToken,
        agent: mockAgent,
      };
      const p2034 = new Prisma.PrismaClientKnownRequestError('write conflict', {
        code: 'P2034',
        clientVersion: 'test',
      });

      const defaultTx = prismaMock.$transaction.getMockImplementation();
      // 1st $transaction = claim (passes through, wins the claim).
      // 2nd $transaction = rotateRefreshToken first attempt → P2034 reject.
      // 3rd $transaction = rotateRefreshToken retry → passes through, succeeds.
      prismaMock.$transaction
        .mockImplementationOnce(defaultTx)
        .mockImplementationOnce(() => Promise.reject(p2034))
        .mockImplementation(defaultTx);

      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(stored);
      prismaMock.refreshToken.updateMany
        .mockResolvedValueOnce({ count: 1 }) // claim wins
        .mockResolvedValueOnce({ count: 0 }); // rotation sibling sweep on retry
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);
      prismaMock.refreshToken.create.mockResolvedValueOnce(mockRefreshToken);
      jwtMock.signAsync.mockResolvedValueOnce('access-token-after-rotation-retry');

      const result = await service.refresh('rt-stub-1');

      expect(result.access_token).toBe('access-token-after-rotation-retry');
      expect(result.refresh_token).toBeDefined();
      // claim (1) + rotation first attempt (2) + rotation retry (3).
      expect(prismaMock.$transaction.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('returns 503 when rotateRefreshToken fails with P2034 on both attempts', async () => {
      // Sustained contention during rotation: ONE retry, then downgrade to a
      // 503 so the client backs off instead of hammering the DB.
      const stored = {
        ...mockRefreshToken,
        agent: mockAgent,
      };
      const p2034 = new Prisma.PrismaClientKnownRequestError('write conflict', {
        code: 'P2034',
        clientVersion: 'test',
      });

      const defaultTx = prismaMock.$transaction.getMockImplementation();
      prismaMock.$transaction
        .mockImplementationOnce(defaultTx) // claim succeeds
        .mockImplementationOnce(() => Promise.reject(p2034)) // rotation attempt 1
        .mockImplementationOnce(() => Promise.reject(p2034)); // rotation retry

      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(stored);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.workspace.findUnique.mockResolvedValueOnce(mockWorkspace);

      await expect(service.refresh('rt-stub-1')).rejects.toThrow(ServiceUnavailableException);
    });

    it('should return 503 when token issuance fails after successful claim', async () => {
      const stored = {
        ...mockRefreshToken,
        agent: mockAgent,
      };
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(stored);
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });
      // Simulate a Prisma error during issueTokens (inside refreshToken)
      prismaMock.workspace.findUnique.mockRejectedValueOnce(new Error('Pool exhausted'));

      await expect(service.refresh('rt-stub-1')).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
