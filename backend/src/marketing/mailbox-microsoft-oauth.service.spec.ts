import { BadRequestException } from '@nestjs/common';
import { MailboxProvider, MailboxStatus } from '@prisma/client';
import { Metrics } from '../observability/metrics';
import { isEncryptedMailboxToken } from './mailbox-token-crypto';
import { MailboxMicrosoftOAuthService } from './mailbox-microsoft-oauth.service';

jest.mock('../observability/metrics', () => ({
  Metrics: {
    mailbox: {
      connected: jest.fn(),
    },
  },
}));

describe('MailboxMicrosoftOAuthService', () => {
  const upsert = jest.fn();
  const findFirst = jest.fn();
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        MICROSOFT_CLIENT_ID: 'microsoft-client-id',
        MICROSOFT_CLIENT_SECRET: 'microsoft-client-secret',
        MICROSOFT_TENANT_ID: 'common',
        BACKEND_PUBLIC_URL: 'https://api.kloel.test',
        FRONTEND_URL: 'https://app.kloel.test',
        EMAIL_OAUTH_STATE_SECRET: 'state-secret',
      };
      return values[key];
    }),
  };
  let service: MailboxMicrosoftOAuthService;
  const mailboxMetrics = Metrics.mailbox as jest.Mocked<typeof Metrics.mailbox>;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    service = new MailboxMicrosoftOAuthService(
      {
        mailboxConnection: {
          upsert,
          findFirst,
        },
      } as never,
      config as never,
    );
  });

  afterEach(() => {
    delete process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
    jest.restoreAllMocks();
  });

  it('builds a Microsoft OAuth URL with mailbox scopes and signed state', () => {
    const result = service.buildAuthUrl('ws-1', '/marketing/email');
    const url = new URL(result.authUrl);

    expect(url.origin + url.pathname).toBe(
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    );
    expect(url.searchParams.get('client_id')).toBe('microsoft-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.kloel.test/marketing/connect/email/microsoft/callback',
    );
    expect(url.searchParams.get('scope')).toContain('Mail.ReadWrite');
    expect(url.searchParams.get('scope')).toContain('Mail.Send');
    expect(url.searchParams.get('scope')).toContain('offline_access');
    expect(url.searchParams.get('state')).toMatch(/^[^.]+\.[^.]+$/);
  });

  it('exchanges a valid callback code and persists encrypted Microsoft tokens', async () => {
    const state = new URL(service.buildAuthUrl('ws-1').authUrl).searchParams.get('state') || '';
    upsert.mockResolvedValueOnce({
      id: 'mailbox-1',
      provider: MailboxProvider.MICROSOFT,
      email: 'owner@example.com',
      status: MailboxStatus.ACTIVE,
      connectedAt: new Date('2026-05-11T12:00:00.000Z'),
      expiresAt: new Date('2026-05-11T13:00:00.000Z'),
    });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'plain-access-token',
          refresh_token: 'plain-refresh-token',
          expires_in: 3600,
          scope: 'Mail.Read Mail.Send Mail.ReadWrite',
          token_type: 'Bearer',
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'microsoft-account-1',
          mail: 'OWNER@EXAMPLE.COM',
          userPrincipalName: 'owner@example.com',
          displayName: 'Owner',
        }),
      } as Response);

    const result = await service.completeOAuth('ws-1', 'auth-code', state);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_provider_email: {
            workspaceId: 'ws-1',
            provider: MailboxProvider.MICROSOFT,
            email: 'owner@example.com',
          },
        },
        create: expect.objectContaining({
          accessToken: expect.not.stringContaining('plain-access-token'),
          refreshToken: expect.not.stringContaining('plain-refresh-token'),
          providerAccountId: 'microsoft-account-1',
          status: MailboxStatus.ACTIVE,
        }),
        update: expect.objectContaining({
          accessToken: expect.not.stringContaining('plain-access-token'),
          refreshToken: expect.not.stringContaining('plain-refresh-token'),
          status: MailboxStatus.ACTIVE,
        }),
      }),
    );
    const call = upsert.mock.calls[0]?.[0];
    expect(isEncryptedMailboxToken(call.create.accessToken)).toBe(true);
    expect(isEncryptedMailboxToken(call.create.refreshToken)).toBe(true);
    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        provider: 'microsoft',
        email: 'owner@example.com',
        connectionId: 'mailbox-1',
      }),
    );
    expect(mailboxMetrics.connected).toHaveBeenCalledWith('microsoft', {
      workspace_id: 'ws-1',
    });
  });

  it('rejects callbacks when Microsoft does not grant a refresh token', async () => {
    const state = new URL(service.buildAuthUrl('ws-1').authUrl).searchParams.get('state') || '';
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'plain-access-token',
        expires_in: 3600,
      }),
    } as Response);

    await expect(service.completeOAuth('ws-1', 'auth-code', state)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns the active Microsoft mailbox status for a workspace', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'mailbox-1',
      email: 'owner@example.com',
      provider: MailboxProvider.MICROSOFT,
      status: MailboxStatus.ACTIVE,
    });

    const status = await service.getPrimaryMicrosoftStatus('ws-1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws-1',
          provider: MailboxProvider.MICROSOFT,
          status: MailboxStatus.ACTIVE,
        },
      }),
    );
    expect(status).toEqual(expect.objectContaining({ email: 'owner@example.com' }));
  });
});
