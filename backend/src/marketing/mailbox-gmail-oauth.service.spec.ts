import { BadRequestException } from '@nestjs/common';
import { MailboxProvider, MailboxStatus } from '@prisma/client';
import { encryptMailboxToken, isEncryptedMailboxToken } from './mailbox-token-crypto';
import { MailboxGmailOAuthService } from './mailbox-gmail-oauth.service';

describe('MailboxGmailOAuthService', () => {
  const upsert = jest.fn();
  const findFirst = jest.fn();
  const update = jest.fn();
  const omnichannel = {
    handleIncomingMessage: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        GOOGLE_CLIENT_ID: 'gmail-client-id',
        GOOGLE_CLIENT_SECRET: 'gmail-client-secret',
        BACKEND_PUBLIC_URL: 'https://api.kloel.test',
        FRONTEND_URL: 'https://app.kloel.test',
        EMAIL_OAUTH_STATE_SECRET: 'state-secret',
      };
      return values[key];
    }),
  };
  let service: MailboxGmailOAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    service = new MailboxGmailOAuthService(
      {
        mailboxConnection: {
          upsert,
          findFirst,
          update,
        },
      } as never,
      config as never,
      omnichannel as never,
    );
  });

  afterEach(() => {
    delete process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
    jest.restoreAllMocks();
  });

  it('builds a Gmail OAuth URL with mailbox scopes and signed state', () => {
    const result = service.buildAuthUrl('ws-1', '/marketing/email');
    const url = new URL(result.authUrl);

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('gmail-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.kloel.test/marketing/connect/email/gmail/callback',
    );
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/gmail.modify');
    expect(url.searchParams.get('state')).toMatch(/^[^.]+\.[^.]+$/);
  });

  it('exchanges a valid callback code and persists encrypted Gmail tokens', async () => {
    const state = new URL(service.buildAuthUrl('ws-1').authUrl).searchParams.get('state') || '';
    upsert.mockResolvedValueOnce({
      id: 'mailbox-1',
      provider: MailboxProvider.GMAIL,
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
          scope: 'https://www.googleapis.com/auth/gmail.modify',
          token_type: 'Bearer',
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'google-account-1',
          email: 'OWNER@EXAMPLE.COM',
          verified_email: true,
          name: 'Owner',
        }),
      } as Response);

    const result = await service.completeOAuth('ws-1', 'auth-code', state);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_provider_email: {
            workspaceId: 'ws-1',
            provider: MailboxProvider.GMAIL,
            email: 'owner@example.com',
          },
        },
        create: expect.objectContaining({
          accessToken: expect.not.stringContaining('plain-access-token'),
          refreshToken: expect.not.stringContaining('plain-refresh-token'),
          providerAccountId: 'google-account-1',
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
        provider: 'gmail',
        email: 'owner@example.com',
        connectionId: 'mailbox-1',
      }),
    );
  });

  it('rejects callbacks when Google does not grant a refresh token', async () => {
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

  it('returns the active Gmail mailbox status for a workspace', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'mailbox-1',
      email: 'owner@example.com',
      provider: MailboxProvider.GMAIL,
      status: MailboxStatus.ACTIVE,
    });

    const status = await service.getPrimaryGmailStatus('ws-1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws-1',
          provider: MailboxProvider.GMAIL,
          status: MailboxStatus.ACTIVE,
        },
      }),
    );
    expect(status).toEqual(expect.objectContaining({ email: 'owner@example.com' }));
  });

  it('syncs new Gmail messages into Omnichannel inbox once per message id', async () => {
    const encryptedAccessToken = encryptMailboxToken('usable-access-token');
    findFirst.mockResolvedValueOnce({
      id: 'mailbox-1',
      workspaceId: 'ws-1',
      email: 'owner@example.com',
      accessToken: encryptedAccessToken,
      refreshToken: null,
      expiresAt: new Date(Date.now() + 3600_000),
      metadata: { syncedMessageIds: ['already-seen'] },
    });
    update.mockResolvedValue({});
    omnichannel.handleIncomingMessage.mockResolvedValue({ id: 'inbox-message-1' });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [{ id: 'already-seen' }, { id: 'gmail-message-1' }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'gmail-message-1',
          threadId: 'thread-1',
          historyId: 'history-1',
          payload: {
            headers: [
              { name: 'From', value: 'Lead One <lead@example.com>' },
              { name: 'Subject', value: 'Quero comprar' },
            ],
            mimeType: 'multipart/alternative',
            parts: [
              {
                mimeType: 'text/plain',
                body: {
                  data: Buffer.from('Pode me mandar detalhes?').toString('base64url'),
                },
              },
            ],
          },
        }),
      } as Response);

    const result = await service.syncLatestInbox('ws-1', 10);

    expect(omnichannel.handleIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        channel: 'EMAIL',
        externalId: 'gmail:gmail-message-1',
        from: 'lead@example.com',
        fromName: 'Lead One',
        content: expect.stringContaining('Quero comprar'),
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mailbox-1' },
        data: expect.objectContaining({
          lastErrorAt: null,
          lastError: null,
          metadata: expect.objectContaining({
            syncedMessageIds: ['already-seen', 'gmail-message-1'],
          }),
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ status: 'synced', imported: 1, seen: 2 }));
  });
});
