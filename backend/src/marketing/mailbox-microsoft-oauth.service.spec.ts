import { BadRequestException } from '@nestjs/common';
import { MailboxProvider, MailboxStatus } from '@prisma/client';
import { Metrics } from '../observability/metrics';
import { encryptMailboxToken, isEncryptedMailboxToken } from './mailbox-token-crypto';
import { MailboxMicrosoftOAuthService } from './mailbox-microsoft-oauth.service';

jest.mock('../observability/metrics', () => ({
  Metrics: {
    mailbox: {
      connected: jest.fn(),
      sendCompleted: jest.fn(),
      sendFailed: jest.fn(),
      sendSuppressed: jest.fn(),
    },
  },
}));

describe('MailboxMicrosoftOAuthService', () => {
  const upsert = jest.fn();
  const findFirst = jest.fn();
  const update = jest.fn();
  const contactFindFirst = jest.fn();
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
    contactFindFirst.mockResolvedValue(null);
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'unsubscribe-secret';
    service = new MailboxMicrosoftOAuthService(
      {
        mailboxConnection: {
          upsert,
          findFirst,
          update,
        },
        contact: { findFirst: contactFindFirst },
      } as never,
      config as never,
    );
  });

  afterEach(() => {
    delete process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
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

  it('sends Microsoft Graph outbound from the connected customer mailbox with List-Unsubscribe header', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'mailbox-1',
      workspaceId: 'ws-1',
      email: 'owner@example.com',
      accessToken: encryptMailboxToken('usable-access-token'),
      refreshToken: null,
      expiresAt: new Date(Date.now() + 3600_000),
      metadata: {},
    });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 202,
      text: async () => '',
      json: async () => ({}),
    } as Response);

    const result = await service.sendMessageFromMailbox('ws-1', {
      toEmail: 'lead@example.com',
      subject: 'Oferta especial',
      html: '<p>Oferta</p>',
      proactive: true,
    });

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[0]).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    const body = JSON.parse(String(fetchCall[1].body)) as Record<string, unknown>;
    const message = body.message as Record<string, unknown>;
    expect(message.subject).toBe('Oferta especial');
    expect(message.body).toEqual({ contentType: 'HTML', content: expect.stringContaining('Oferta') });
    const headers = message.internetMessageHeaders as Array<{ name: string; value: string }>;
    expect(headers[0].name).toBe('List-Unsubscribe');
    expect(headers[0].value).toContain('<https://kloel.com/unsubscribe');
    expect(result).toEqual(
      expect.objectContaining({
        provider: 'microsoft',
        status: 'sent',
        sent: true,
        email: 'owner@example.com',
      }),
    );
    expect(mailboxMetrics.sendCompleted).toHaveBeenCalledWith('microsoft', {
      workspace_id: 'ws-1',
    });
  });

  it('sends Microsoft Graph outbound without footer when proactive is false', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'mailbox-1',
      workspaceId: 'ws-1',
      email: 'owner@example.com',
      accessToken: encryptMailboxToken('usable-access-token'),
      refreshToken: null,
      expiresAt: new Date(Date.now() + 3600_000),
      metadata: {},
    });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 202,
      text: async () => '',
      json: async () => ({}),
    } as Response);

    const result = await service.sendMessageFromMailbox('ws-1', {
      toEmail: 'lead@example.com',
      subject: 'Resposta manual',
      html: '<p>Resposta</p>',
      proactive: false,
    });

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(String(fetchCall[1].body)) as Record<string, unknown>;
    const message = body.message as Record<string, unknown>;
    expect(message.internetMessageHeaders).toBeUndefined();
    expect(message.body.content).not.toContain('cancelar');
    expect(result).toEqual(expect.objectContaining({ sent: true }));
  });

  it('suppresses proactive Microsoft outbound when the contact opted out', async () => {
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
        provider: 'microsoft',
        status: 'suppressed',
        sent: false,
        reason: 'recipient_unsubscribed',
      }),
    );
    expect(mailboxMetrics.sendSuppressed).toHaveBeenCalledWith('microsoft', {
      workspace_id: 'ws-1',
    });
  });

  it('refreshes an expired Microsoft access token before sending', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'mailbox-1',
      workspaceId: 'ws-1',
      email: 'owner@example.com',
      accessToken: encryptMailboxToken('expired-access-token'),
      refreshToken: encryptMailboxToken('plain-refresh-token'),
      expiresAt: new Date(Date.now() - 1000),
      metadata: {},
    });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'fresh-access-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        text: async () => '',
        json: async () => ({}),
      } as Response);

    const result = await service.sendMessageFromMailbox('ws-1', {
      toEmail: 'lead@example.com',
      subject: 'Oferta',
      html: '<p>Oferta</p>',
      proactive: true,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mailbox-1' },
        data: expect.objectContaining({
          accessToken: expect.not.stringContaining('fresh-access-token'),
          status: MailboxStatus.ACTIVE,
        }),
      }),
    );
    expect(result.sent).toBe(true);
  });
});
