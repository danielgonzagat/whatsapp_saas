import { BadRequestException } from '@nestjs/common';
import { MailboxProvider, MailboxStatus } from '@prisma/client';
import { GmailOAuthHandshakeService } from './oauth-handshake.service';
import type { SignedGmailState } from './types';

const mockExchangeCode = jest.fn();
const mockFetchUserInfo = jest.fn();
const mockMailboxUpsert = jest.fn();

jest.mock('../mailbox-token-crypto', () => ({
  encryptMailboxToken: jest.fn((token: string | null | undefined) =>
    token ? `enc_${token}` : token,
  ),
}));

jest.mock('../../observability/metrics', () => ({
  Metrics: {
    mailbox: {
      connected: jest.fn(),
    },
  },
}));

describe('GmailOAuthHandshakeService', () => {
  let service: GmailOAuthHandshakeService;

  const parsedState: SignedGmailState = {
    workspaceId: 'ws-test-1',
    returnTo: '/marketing/email',
    ts: Date.now(),
  };

  const validToken = {
    access_token: 'access-token-abc',
    refresh_token: 'refresh-token-xyz',
    expires_in: 3600,
    scope: 'https://mail.google.com/',
    token_type: 'Bearer',
  };

  const validProfile = {
    id: 'google-user-123',
    email: 'test@workspace.com',
    verified_email: true,
    name: 'Test User',
    picture: 'https://example.com/pic.jpg',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new GmailOAuthHandshakeService(
      {
        mailboxConnection: { upsert: mockMailboxUpsert },
      } as never,
      {
        exchangeCode: mockExchangeCode,
        fetchUserInfo: mockFetchUserInfo,
      } as never,
    );
  });

  describe('persistOAuthResult', () => {
    it('exchanges code, fetches profile, and upserts an ACTIVE mailbox connection', async () => {
      mockExchangeCode.mockResolvedValue(validToken);
      mockFetchUserInfo.mockResolvedValue(validProfile);
      mockMailboxUpsert.mockResolvedValue({
        id: 'conn-1',
        provider: 'GMAIL',
        email: 'test@workspace.com',
        status: 'ACTIVE',
        connectedAt: new Date(),
        expiresAt: new Date(),
      });

      const result = await service.persistOAuthResult(parsedState, 'auth-code-123');

      expect(mockExchangeCode).toHaveBeenCalledWith('auth-code-123');
      expect(mockFetchUserInfo).toHaveBeenCalledWith('access-token-abc');

      expect(mockMailboxUpsert).toHaveBeenCalledTimes(1);
      const upsertCall = mockMailboxUpsert.mock.calls[0][0];

      expect(upsertCall.where).toEqual({
        workspaceId_provider_email: {
          workspaceId: 'ws-test-1',
          provider: MailboxProvider.GMAIL,
          email: 'test@workspace.com',
        },
      });

      expect(upsertCall.create.workspaceId).toBe('ws-test-1');
      expect(upsertCall.create.provider).toBe(MailboxProvider.GMAIL);
      expect(upsertCall.create.email).toBe('test@workspace.com');
      expect(upsertCall.create.status).toBe(MailboxStatus.ACTIVE);
      expect(upsertCall.create.accessToken).toBe('enc_access-token-abc');
      expect(upsertCall.create.refreshToken).toBe('enc_refresh-token-xyz');
      expect(upsertCall.create.providerAccountId).toBe('google-user-123');
      expect(upsertCall.create.expiresAt).toBeInstanceOf(Date);
      expect(upsertCall.create.connectedAt).toBeInstanceOf(Date);
      expect(upsertCall.create.disconnectedAt).toBeNull();
      expect(upsertCall.create.lastErrorAt).toBeNull();
      expect(upsertCall.create.lastError).toBeNull();
      expect(upsertCall.create.metadata).toBeDefined();

      const { workspaceId: _wsCreate, provider: _provCreate, email: _emailCreate, ...createConnectionData } = upsertCall.create;
      expect(upsertCall.update).toEqual(createConnectionData);

      expect(upsertCall.select).toEqual({
        id: true,
        provider: true,
        email: true,
        status: true,
        connectedAt: true,
        expiresAt: true,
      });

      const resultExpiresAt = result.expiresAt;
      expect(resultExpiresAt).toBeInstanceOf(Date);
      expect(result).toEqual({
        connected: true,
        provider: 'gmail',
        status: 'connected',
        email: 'test@workspace.com',
        connectionId: 'conn-1',
        returnTo: '/marketing/email',
        expiresAt: resultExpiresAt,
      });
    });

    it('throws BadRequestException when refresh_token is not granted, with no DB write', async () => {
      mockExchangeCode.mockResolvedValue({
        access_token: 'access-token-abc',
      });

      await expect(
        service.persistOAuthResult(parsedState, 'auth-code-123'),
      ).rejects.toThrow('gmail_refresh_token_not_granted');

      await expect(
        service.persistOAuthResult(parsedState, 'auth-code-123'),
      ).rejects.toThrow(BadRequestException);

      expect(mockMailboxUpsert).not.toHaveBeenCalled();
      expect(mockFetchUserInfo).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when email is not verified (verified_email is false)', async () => {
      mockExchangeCode.mockResolvedValue(validToken);
      mockFetchUserInfo.mockResolvedValue({
        ...validProfile,
        verified_email: false,
      });

      await expect(
        service.persistOAuthResult(parsedState, 'auth-code-123'),
      ).rejects.toThrow('gmail_email_not_verified');

      await expect(
        service.persistOAuthResult(parsedState, 'auth-code-123'),
      ).rejects.toThrow(BadRequestException);

      expect(mockMailboxUpsert).not.toHaveBeenCalled();
    });

    it('propagates parsedState.workspaceId into upsert where clause for tenant isolation', async () => {
      mockExchangeCode.mockResolvedValue(validToken);
      mockFetchUserInfo.mockResolvedValue(validProfile);
      mockMailboxUpsert.mockResolvedValue({
        id: 'conn-2',
        provider: 'GMAIL',
        email: 'test@workspace.com',
        status: 'ACTIVE',
        connectedAt: new Date(),
        expiresAt: new Date(),
      });

      const isolatedState: SignedGmailState = {
        workspaceId: 'ws-isolated-999',
        returnTo: '/settings',
        ts: Date.now(),
      };

      await service.persistOAuthResult(isolatedState, 'auth-code-456');

      const whereClause = mockMailboxUpsert.mock.calls[0][0].where;
      expect(whereClause.workspaceId_provider_email.workspaceId).toBe(
        'ws-isolated-999',
      );

      const createClause = mockMailboxUpsert.mock.calls[0][0].create;
      expect(createClause.workspaceId).toBe('ws-isolated-999');
    });
  });
});
