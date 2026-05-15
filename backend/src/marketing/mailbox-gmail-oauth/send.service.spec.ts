import { BadRequestException } from '@nestjs/common';
import { MailboxProvider, MailboxStatus } from '@prisma/client';
import { GmailSendService } from './send.service';

jest.mock('../../observability/metrics', () => ({
  Metrics: {
    mailbox: {
      sendCompleted: jest.fn(),
      sendFailed: jest.fn(),
      sendSuppressed: jest.fn(),
    },
  },
}));

jest.mock('../../common/utils/unsubscribe-footer.util', () => ({
  buildUnsubscribeFooterHtml: jest.fn().mockReturnValue('<footer-unsub />'),
}));

jest.mock('./mime-builder', () => ({
  buildRawMimeMessage: jest.fn().mockReturnValue('encoded-mime-base64'),
}));

describe('GmailSendService', () => {
  const connectionFindFirst = jest.fn();
  const connectionUpdate = jest.fn();
  const contactFindFirst = jest.fn();
  const resolveAccessToken = jest.fn();

  const prismaMock = {
    mailboxConnection: { findFirst: connectionFindFirst, update: connectionUpdate },
    contact: { findFirst: contactFindFirst },
  };
  const configMock = { get: jest.fn().mockReturnValue('Kloel') };
  const gmailClientMock = { resolveAccessToken };

  let service: GmailSendService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    contactFindFirst.mockResolvedValue(null);
    resolveAccessToken.mockResolvedValue('access-token-123');
    service = new GmailSendService(
      prismaMock as never,
      configMock as never,
      gmailClientMock as never,
    );
  });

  it('throws BadRequestException when toEmail is missing or invalid', async () => {
    await expect(
      service.sendMessageFromMailbox('ws-1', { toEmail: 'not-an-email' }),
    ).rejects.toThrow(BadRequestException);
    expect(connectionFindFirst).not.toHaveBeenCalled();
  });

  it('returns suppressed when recipient has opted out', async () => {
    contactFindFirst.mockResolvedValue({ id: 'c-1', optedOutAt: new Date() });

    const result = await service.sendMessageFromMailbox('ws-1', {
      toEmail: 'user@example.com',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'suppressed',
        sent: false,
        reason: 'recipient_unsubscribed',
      }),
    );
    expect(connectionFindFirst).not.toHaveBeenCalled();
  });

  it('returns not_connected when no active Gmail mailbox is found', async () => {
    connectionFindFirst.mockResolvedValue(null);

    const result = await service.sendMessageFromMailbox('ws-1', {
      toEmail: 'user@example.com',
    });

    expect(result).toEqual({ provider: 'gmail', status: 'not_connected', sent: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('queries only ACTIVE mailbox connections scoped by workspaceId', async () => {
    connectionFindFirst.mockResolvedValue(null);

    await service.sendMessageFromMailbox('ws-isolated', {
      toEmail: 'user@example.com',
      proactive: false,
    });

    const call = connectionFindFirst.mock.calls[0][0];
    expect(call.where.workspaceId).toBe('ws-isolated');
    expect(call.where.provider).toBe(MailboxProvider.GMAIL);
    expect(call.where.status).toBe(MailboxStatus.ACTIVE);
  });

  it('sends successfully and returns messageId on Gmail API 200', async () => {
    connectionFindFirst.mockResolvedValue({
      id: 'mb-1',
      workspaceId: 'ws-1',
      email: 'sender@workspace.com',
      accessToken: 'enc-token',
      refreshToken: 'enc-refresh',
      expiresAt: new Date(Date.now() + 3600_000),
      metadata: {},
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'msg-001', threadId: 'thr-001' }),
    });

    const result = await service.sendMessageFromMailbox('ws-1', {
      toEmail: 'user@example.com',
      proactive: false,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'sent',
        sent: true,
        messageId: 'msg-001',
        threadId: 'thr-001',
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws BadRequestException and persists lastError on Gmail API 4xx', async () => {
    connectionFindFirst.mockResolvedValue({
      id: 'mb-1',
      workspaceId: 'ws-1',
      email: 'sender@workspace.com',
      accessToken: 'enc-token',
      refreshToken: 'enc-refresh',
      expiresAt: new Date(Date.now() + 3600_000),
      metadata: {},
    });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    });

    await expect(
      service.sendMessageFromMailbox('ws-1', {
        toEmail: 'user@example.com',
        proactive: false,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(connectionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mb-1', workspaceId: 'ws-1' },
        data: expect.objectContaining({
          lastError: 'gmail_send_failed',
        }),
      }),
    );
  });
});
