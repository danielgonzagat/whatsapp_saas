import { BadRequestException } from '@nestjs/common';
import { MailboxProvider, MailboxStatus } from '@prisma/client';
import { Metrics } from '../observability/metrics';
import { encryptMailboxToken, isEncryptedMailboxToken } from './mailbox-token-crypto';
import { MailboxImapSmtpService } from './mailbox-imap-smtp.service';

jest.mock('nodemailer');

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

describe('MailboxImapSmtpService', () => {
  const upsert = jest.fn();
  const findFirst = jest.fn();
  const update = jest.fn();
  const contactFindFirst = jest.fn();
  let service: MailboxImapSmtpService;
  let validationSpies: {
    validateImapConnection: jest.Mock;
    validateSmtpConnection: jest.Mock;
  };
  const mailboxMetrics = Metrics.mailbox as jest.Mocked<typeof Metrics.mailbox>;
  let sendMailMock: jest.Mock;
  let closeMock: jest.Mock;
  let createTransportMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    contactFindFirst.mockResolvedValue(null);
    sendMailMock = jest.fn();
    closeMock = jest.fn();
    createTransportMock = (jest.requireMock('nodemailer') as { createTransport: jest.Mock })
      .createTransport;
    createTransportMock.mockReturnValue({
      sendMail: sendMailMock,
      close: closeMock,
    });
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'unsubscribe-secret';
    service = new MailboxImapSmtpService({
      mailboxConnection: {
        upsert,
        findFirst,
        update,
      },
      contact: { findFirst: contactFindFirst },
    } as never);
    validationSpies = service as unknown as {
      validateImapConnection: jest.Mock;
      validateSmtpConnection: jest.Mock;
    };
    jest.spyOn(validationSpies, 'validateImapConnection').mockResolvedValue(undefined);
    jest.spyOn(validationSpies, 'validateSmtpConnection').mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    jest.restoreAllMocks();
  });

  it('validates and persists encrypted IMAP+SMTP credentials for a workspace mailbox', async () => {
    upsert.mockResolvedValueOnce({
      id: 'mailbox-1',
      provider: MailboxProvider.IMAP_SMTP,
      email: 'owner@example.com',
      status: MailboxStatus.ACTIVE,
      connectedAt: new Date('2026-05-11T12:00:00.000Z'),
    });

    const result = await service.connectMailbox('ws-1', {
      email: 'OWNER@EXAMPLE.COM',
      imapHost: 'imap.example.com',
      imapPort: 993,
      imapSecure: true,
      imapUsername: 'owner@example.com',
      imapPassword: 'plain-imap-password',
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      smtpSecure: true,
      smtpUsername: 'owner@example.com',
      smtpPassword: 'plain-smtp-password',
    });

    expect(validationSpies.validateImapConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'imap.example.com',
        port: 993,
        secure: true,
        username: 'owner@example.com',
        password: 'plain-imap-password',
      }),
    );
    expect(validationSpies.validateSmtpConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 465,
        secure: true,
        username: 'owner@example.com',
        password: 'plain-smtp-password',
      }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_provider_email: {
            workspaceId: 'ws-1',
            provider: MailboxProvider.IMAP_SMTP,
            email: 'owner@example.com',
          },
        },
        create: expect.objectContaining({
          provider: MailboxProvider.IMAP_SMTP,
          status: MailboxStatus.ACTIVE,
          imapPassword: expect.not.stringContaining('plain-imap-password'),
          smtpPassword: expect.not.stringContaining('plain-smtp-password'),
        }),
        update: expect.objectContaining({
          status: MailboxStatus.ACTIVE,
          imapPassword: expect.not.stringContaining('plain-imap-password'),
          smtpPassword: expect.not.stringContaining('plain-smtp-password'),
        }),
      }),
    );
    const call = upsert.mock.calls[0]?.[0];
    expect(isEncryptedMailboxToken(call.create.imapPassword)).toBe(true);
    expect(isEncryptedMailboxToken(call.create.smtpPassword)).toBe(true);
    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        provider: 'imap_smtp',
        email: 'owner@example.com',
        connectionId: 'mailbox-1',
      }),
    );
    expect(mailboxMetrics.connected).toHaveBeenCalledWith('imap_smtp', {
      workspace_id: 'ws-1',
    });
  });

  it('uses default IMAP and SMTP ports from the selected secure flags', async () => {
    upsert.mockResolvedValueOnce({
      id: 'mailbox-1',
      provider: MailboxProvider.IMAP_SMTP,
      email: 'owner@example.com',
      status: MailboxStatus.ACTIVE,
    });

    await service.connectMailbox('ws-1', {
      email: 'owner@example.com',
      imapHost: 'imap.example.com',
      imapSecure: false,
      imapPassword: 'imap-password',
      smtpHost: 'smtp.example.com',
      smtpSecure: false,
      smtpPassword: 'smtp-password',
    });

    expect(validationSpies.validateImapConnection).toHaveBeenCalledWith(
      expect.objectContaining({ port: 143, secure: false }),
    );
    expect(validationSpies.validateSmtpConnection).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: false }),
    );
  });

  it('does not persist credentials when validation fails', async () => {
    jest
      .spyOn(validationSpies, 'validateImapConnection')
      .mockRejectedValueOnce(new BadRequestException('imap_validation_failed'));

    await expect(
      service.connectMailbox('ws-1', {
        email: 'owner@example.com',
        imapHost: 'imap.example.com',
        imapPassword: 'imap-password',
        smtpHost: 'smtp.example.com',
        smtpPassword: 'smtp-password',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns the active IMAP+SMTP mailbox status for a workspace', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'mailbox-1',
      email: 'owner@example.com',
      provider: MailboxProvider.IMAP_SMTP,
      status: MailboxStatus.ACTIVE,
    });

    const status = await service.getPrimaryImapSmtpStatus('ws-1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws-1',
          provider: MailboxProvider.IMAP_SMTP,
          status: MailboxStatus.ACTIVE,
        },
      }),
    );
    expect(status).toEqual(expect.objectContaining({ email: 'owner@example.com' }));
  });

  it('sends IMAP/SMTP outbound via nodemailer with List-Unsubscribe header', async () => {
    sendMailMock.mockResolvedValueOnce({ messageId: '<smtp-msg-1@kloel.test>' });
    findFirst.mockResolvedValueOnce({
      id: 'mailbox-1',
      workspaceId: 'ws-1',
      email: 'owner@example.com',
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      smtpSecure: true,
      smtpUsername: encryptMailboxToken('owner@example.com'),
      smtpPassword: encryptMailboxToken('plain-smtp-password'),
    });

    const result = await service.sendMessageFromMailbox('ws-1', {
      toEmail: 'lead@example.com',
      subject: 'Oferta especial',
      html: '<p>Oferta</p>',
      proactive: true,
    });

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 465,
        secure: true,
        auth: { user: 'owner@example.com', pass: 'plain-smtp-password' },
      }),
    );
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'owner@example.com',
        to: 'lead@example.com',
        subject: 'Oferta especial',
        html: expect.stringContaining('Oferta'),
        headers: expect.objectContaining({
          'List-Unsubscribe': expect.stringContaining('unsubscribe'),
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        provider: 'imap_smtp',
        status: 'sent',
        sent: true,
        email: 'owner@example.com',
        messageId: '<smtp-msg-1@kloel.test>',
      }),
    );
    expect(mailboxMetrics.sendCompleted).toHaveBeenCalledWith('imap_smtp', {
      workspace_id: 'ws-1',
    });
    expect(closeMock).toHaveBeenCalled();
  });

  it('sends IMAP/SMTP without unsubscribe footer when proactive is false', async () => {
    sendMailMock.mockResolvedValueOnce({ messageId: '<msg-2>' });
    findFirst.mockResolvedValueOnce({
      id: 'mailbox-1',
      workspaceId: 'ws-1',
      email: 'owner@example.com',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpSecure: false,
      smtpUsername: null,
      smtpPassword: encryptMailboxToken('smtp-pass'),
    });

    const result = await service.sendMessageFromMailbox('ws-1', {
      toEmail: 'lead@example.com',
      subject: 'Resposta',
      html: '<p>Resposta</p>',
      proactive: false,
    });

    const sendCall = sendMailMock.mock.calls[0][0];
    expect(sendCall.html).not.toContain('cancelar');
    expect(sendCall.headers).toEqual({});
    expect(result.sent).toBe(true);
  });

  it('suppresses proactive IMAP/SMTP outbound when the contact opted out', async () => {
    contactFindFirst.mockResolvedValueOnce({ id: 'contact-1', optedOutAt: new Date() });

    const result = await service.sendMessageFromMailbox('ws-1', {
      toEmail: 'lead@example.com',
      subject: 'Oferta',
      html: '<p>Oferta</p>',
      proactive: true,
    });

    expect(createTransportMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        provider: 'imap_smtp',
        status: 'suppressed',
        sent: false,
        reason: 'recipient_unsubscribed',
      }),
    );
    expect(mailboxMetrics.sendSuppressed).toHaveBeenCalledWith('imap_smtp', {
      workspace_id: 'ws-1',
    });
  });

  it('marks the mailbox as errored when SMTP send fails', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('SMTP connection refused'));
    findFirst.mockResolvedValueOnce({
      id: 'mailbox-1',
      workspaceId: 'ws-1',
      email: 'owner@example.com',
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      smtpSecure: true,
      smtpUsername: null,
      smtpPassword: encryptMailboxToken('smtp-pass'),
    });

    await expect(
      service.sendMessageFromMailbox('ws-1', {
        toEmail: 'lead@example.com',
        subject: 'Oferta',
        html: '<p>Oferta</p>',
        proactive: true,
      }),
    ).rejects.toThrow('imap_smtp_send_failed');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mailbox-1' },
        data: expect.objectContaining({
          lastError: 'SMTP connection refused',
        }),
      }),
    );
    expect(mailboxMetrics.sendFailed).toHaveBeenCalledWith(
      'imap_smtp',
      'SMTP connection refused',
      { workspace_id: 'ws-1' },
    );
  });
});
