import { BadRequestException } from '@nestjs/common';
import { MailboxProvider, MailboxStatus } from '@prisma/client';
import { Metrics } from '../observability/metrics';
import { encryptMailboxToken, isEncryptedMailboxToken } from './mailbox-token-crypto';
import { MailboxGmailOAuthService } from './mailbox-gmail-oauth.service';
import { GmailClientService } from './mailbox-gmail-oauth/gmail-client.service';
import { GmailOAuthHandshakeService } from './mailbox-gmail-oauth/oauth-handshake.service';
import { GmailSyncService } from './mailbox-gmail-oauth/sync.service';
import { GmailSendService } from './mailbox-gmail-oauth/send.service';

jest.mock('../observability/metrics', () => ({
  Metrics: {
    mailbox: {
      connected: jest.fn(),
      syncCompleted: jest.fn(),
      syncFailed: jest.fn(),
      sendCompleted: jest.fn(),
      sendFailed: jest.fn(),
      sendSuppressed: jest.fn(),
    },
  },
}));

function firstCallArg<T>(mock: { mock: { calls: Array<[unknown, ...unknown[]]> } }): T {
  const [arg] = mock.mock.calls[0] ?? [];
  return arg as T;
}

type MailboxUpsertArgs = {
  where?: {
    workspaceId_provider_email?: {
      workspaceId: string;
      provider: MailboxProvider;
      email: string;
    };
  };
  create?: {
    accessToken?: string;
    refreshToken?: string;
    providerAccountId?: string;
    status?: MailboxStatus;
  };
  update?: {
    accessToken?: string;
    refreshToken?: string;
    status?: MailboxStatus;
  };
};

type IncomingEmailMessage = {
  workspaceId?: string;
  channel?: string;
  externalId?: string;
  from?: string;
  fromName?: string;
  content?: string;
};

function requestBodyFrom(init: RequestInit | undefined): string {
  if (typeof init?.body !== 'string') {
    throw new Error('Expected request body string');
  }
  return init.body;
}

describe('MailboxGmailOAuthService', () => {
  const upsert = jest.fn();
  const findFirst = jest.fn();
  const update = jest.fn();
  const contactFindFirst = jest.fn();
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
  const mailboxMetrics = Metrics.mailbox as jest.Mocked<typeof Metrics.mailbox>;

  beforeEach(() => {
    jest.clearAllMocks();
    contactFindFirst.mockResolvedValue(null);
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'unsubscribe-secret';

    const prismaStub = {
      mailboxConnection: { upsert, findFirst, update },
      contact: { findFirst: contactFindFirst },
    };
    const gmailClient = new GmailClientService(prismaStub as never, config as never);
    const handshake = new GmailOAuthHandshakeService(prismaStub as never, gmailClient);
    const syncService = new GmailSyncService(
      prismaStub as never,
      omnichannel as never,
      gmailClient,
    );
    const sendService = new GmailSendService(prismaStub as never, config as never, gmailClient);

    service = new MailboxGmailOAuthService(
      prismaStub as never,
      config as never,
      handshake,
      syncService,
      sendService,
    );
  });

  afterEach(() => {
    delete process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
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

    const call = firstCallArg<MailboxUpsertArgs>(upsert);
    expect(call.where).toEqual({
      workspaceId_provider_email: {
        workspaceId: 'ws-1',
        provider: MailboxProvider.GMAIL,
        email: 'owner@example.com',
      },
    });
    expect(call.create).toMatchObject({
      providerAccountId: 'google-account-1',
      status: MailboxStatus.ACTIVE,
    });
    expect(call.update).toMatchObject({ status: MailboxStatus.ACTIVE });
    expect(call.create?.accessToken).not.toContain('plain-access-token');
    expect(call.create?.refreshToken).not.toContain('plain-refresh-token');
    expect(call.update?.accessToken).not.toContain('plain-access-token');
    expect(call.update?.refreshToken).not.toContain('plain-refresh-token');
    expect(isEncryptedMailboxToken(String(call.create?.accessToken))).toBe(true);
    expect(isEncryptedMailboxToken(String(call.create?.refreshToken))).toBe(true);
    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        provider: 'gmail',
        email: 'owner@example.com',
        connectionId: 'mailbox-1',
      }),
    );
    expect(mailboxMetrics.connected.mock.calls).toContainEqual(['gmail', { workspace_id: 'ws-1' }]);
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

    const incoming = firstCallArg<IncomingEmailMessage>(omnichannel.handleIncomingMessage);
    expect(incoming).toMatchObject({
      workspaceId: 'ws-1',
      channel: 'EMAIL',
      externalId: 'gmail:gmail-message-1',
      from: 'lead@example.com',
      fromName: 'Lead One',
    });
    expect(incoming.content).toContain('Quero comprar');
    const updateArgs = firstCallArg<{
      where?: { id?: string; workspaceId?: string };
      data?: { lastErrorAt?: null; lastError?: null; metadata?: { syncedMessageIds?: string[] } };
    }>(update);
    expect(updateArgs.where).toEqual({ id: 'mailbox-1', workspaceId: 'ws-1' });
    expect(updateArgs.data).toMatchObject({
      lastErrorAt: null,
      lastError: null,
      metadata: { syncedMessageIds: ['already-seen', 'gmail-message-1'] },
    });
    expect(result).toEqual(expect.objectContaining({ status: 'synced', imported: 1, seen: 2 }));
    expect(mailboxMetrics.syncCompleted.mock.calls).toContainEqual([
      'gmail',
      1,
      2,
      {
        workspace_id: 'ws-1',
        status: 'synced',
      },
    ]);
  });

  it('sends Gmail outbound from the connected customer mailbox with unsubscribe header', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'mailbox-1',
      workspaceId: 'ws-1',
      email: 'owner@example.com',
      accessToken: encryptMailboxToken('usable-access-token'),
      refreshToken: null,
      expiresAt: new Date(Date.now() + 3600_000),
      metadata: {},
    });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'gmail-send-1',
        threadId: 'thread-1',
      }),
    } as Response);

    const result = await service.sendMessageFromMailbox('ws-1', {
      toEmail: 'lead@example.com',
      subject: 'Oferta especial',
      html: '<p>Oferta</p>',
      proactive: true,
    });

    const [fetchUrl, fetchInit] = fetchSpy.mock.calls[0] ?? [];
    expect(fetchUrl).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    const body = JSON.parse(requestBodyFrom(fetchInit)) as {
      raw: string;
    };
    const rawMessage = Buffer.from(body.raw, 'base64url').toString('utf8');
    expect(rawMessage).toContain('From: owner@example.com');
    expect(rawMessage).toContain('To: lead@example.com');
    expect(rawMessage).toContain('List-Unsubscribe: <https://app.kloel.test/email/unsubscribe');
    expect(rawMessage).toContain('Oferta');
    expect(result).toEqual(
      expect.objectContaining({
        provider: 'gmail',
        status: 'sent',
        sent: true,
        email: 'owner@example.com',
        messageId: 'gmail-send-1',
      }),
    );
    expect(mailboxMetrics.sendCompleted.mock.calls).toContainEqual([
      'gmail',
      { workspace_id: 'ws-1' },
    ]);
  });

  it('suppresses proactive Gmail outbound when the contact opted out', async () => {
    contactFindFirst.mockResolvedValueOnce({ id: 'contact-1', optedOutAt: new Date() });
    const fetchSpy = jest.spyOn(global, 'fetch');

    const result = await service.sendMessageFromMailbox('ws-1', {
      toEmail: 'lead@example.com',
      subject: 'Oferta',
      html: '<p>Oferta</p>',
      proactive: true,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        provider: 'gmail',
        status: 'suppressed',
        sent: false,
        reason: 'recipient_unsubscribed',
      }),
    );
    expect(mailboxMetrics.sendSuppressed.mock.calls).toContainEqual([
      'gmail',
      {
        workspace_id: 'ws-1',
      },
    ]);
  });
});
