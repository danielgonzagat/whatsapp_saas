import { BadRequestException } from '@nestjs/common';
import { EmailConnectService } from './email-connect.service';

const readWorkspaceEmailDeliveryMock = jest.fn();
const isWorkspaceDeliveryReadyMock = jest.fn();

jest.mock('../../kloel/email-workspace-delivery', () => ({
  readWorkspaceEmailDelivery: (
    config: unknown,
  ) => readWorkspaceEmailDeliveryMock(config),
  isWorkspaceDeliveryReady: (
    delivery: unknown,
  ) => isWorkspaceDeliveryReadyMock(delivery),
}));

const buildUnsubscribeFooterHtmlMock = jest.fn();

jest.mock('../../common/utils/unsubscribe-footer.util', () => ({
  buildUnsubscribeFooterHtml: (
    opts: unknown,
  ) => buildUnsubscribeFooterHtmlMock(opts),
  buildListUnsubscribeHeader: jest.fn().mockReturnValue(null),
}));

describe('EmailConnectService', () => {
  const channelConfigFindUnique = jest.fn();
  const workspaceFindUnique = jest.fn();
  const workspaceUpdate = jest.fn();

  const sendSingleEmail = jest.fn();

  const getPrimaryGmailStatus = jest.fn();
  const getPrimaryMicrosoftStatus = jest.fn();
  const getPrimaryImapSmtpStatus = jest.fn();

  let service: EmailConnectService;

  beforeEach(() => {
    jest.clearAllMocks();

    readWorkspaceEmailDeliveryMock.mockReturnValue(null);
    isWorkspaceDeliveryReadyMock.mockReturnValue(false);

    buildUnsubscribeFooterHtmlMock.mockReturnValue('<footer></footer>');

    service = new EmailConnectService(
      {
        channelConfig: { findUnique: channelConfigFindUnique },
        workspace: { findUnique: workspaceFindUnique, update: workspaceUpdate },
      } as never,
      { sendSingleEmail } as never,
      { getPrimaryGmailStatus } as never,
      { getPrimaryMicrosoftStatus } as never,
      { getPrimaryImapSmtpStatus } as never,
    );
  });

  describe('getStatus', () => {
    it('returns connected snapshot with right provider name when workspace has gmail', async () => {
      readWorkspaceEmailDeliveryMock.mockReturnValue({
        provider: 'resend',
        resendApiKey: 'rk-live',
      });
      isWorkspaceDeliveryReadyMock.mockReturnValue(true);

      workspaceFindUnique.mockResolvedValue({
        providerSettings: { email: { enabled: true } },
        name: 'My Workspace',
      });
      channelConfigFindUnique.mockResolvedValue({
        transferCriteria: {},
      });

      getPrimaryGmailStatus.mockResolvedValue({
        email: 'hi@gmail.com',
        provider: 'gmail',
        status: 'connected',
        id: 'mailbox-1',
        lastSyncAt: '2026-05-10T00:00:00Z',
        lastErrorAt: null,
        lastError: null,
      });
      getPrimaryMicrosoftStatus.mockResolvedValue(null);
      getPrimaryImapSmtpStatus.mockResolvedValue(null);

      const result = await service.getStatus('ws-1');

      expect(result.provider).toBe('gmail');
      expect(result.connected).toBe(true);
      expect(result.status).toBe('connected');
      expect(result.enabled).toBe(true);
      expect(result.providerAvailable).toBe(true);
      expect(result.fromEmail).toBe('hi@gmail.com');
      expect(result.fromName).toBe('KLOEL');
      expect(result.mailboxConnectionId).toBe('mailbox-1');
      expect(result.mailboxProvider).toBe('gmail');
      expect(result.mailboxStatus).toBe('connected');
      expect(result.lastSyncAt).toBe('2026-05-10T00:00:00Z');
      expect(result.workspaceName).toBe('My Workspace');
    });

    it('returns disconnected shape when workspace has no email provider configured', async () => {
      readWorkspaceEmailDeliveryMock.mockReturnValue(null);
      isWorkspaceDeliveryReadyMock.mockReturnValue(false);

      workspaceFindUnique.mockResolvedValue({
        providerSettings: {},
        name: 'Empty WS',
      });
      channelConfigFindUnique.mockResolvedValue(null);

      getPrimaryGmailStatus.mockResolvedValue(null);
      getPrimaryMicrosoftStatus.mockResolvedValue(null);
      getPrimaryImapSmtpStatus.mockResolvedValue(null);

      const result = await service.getStatus('ws-2');

      expect(result.connected).toBe(false);
      expect(result.status).toBe('unavailable');
      expect(result.enabled).toBe(false);
      expect(result.provider).toBe('log');
      expect(result.providerAvailable).toBe(false);
      expect(result.fromEmail).toBe('noreply@kloel.com');
      expect(result.fromName).toBe('KLOEL');
      expect(result.mailboxConnectionId).toBeNull();
      expect(result.mailboxProvider).toBeNull();
      expect(result.mailboxStatus).toBeNull();
    });
  });

  describe('sendTest', () => {
    it('calls emailCampaign.sendSingleEmail with HTML body and workspace scoped delivery', async () => {
      readWorkspaceEmailDeliveryMock.mockReturnValue({
        provider: 'resend',
        resendApiKey: 'rk-live',
      });
      isWorkspaceDeliveryReadyMock.mockReturnValue(true);

      channelConfigFindUnique.mockResolvedValue({
        transferCriteria: {},
      });
      sendSingleEmail.mockResolvedValue(true);

      const result = await service.sendTest('ws-3', 'user@kloel.com');

      expect(buildUnsubscribeFooterHtmlMock).toHaveBeenCalledWith({
        email: 'user@kloel.com',
      });
      expect(sendSingleEmail).toHaveBeenCalledWith(
        'user@kloel.com',
        'KLOEL - conexao de email validada',
        expect.stringContaining('Conexao validada'),
        expect.objectContaining({ provider: 'resend' }),
      );
      expect(result).toEqual({
        success: true,
        workspaceId: 'ws-3',
        toEmail: 'user@kloel.com',
        provider: 'resend',
      });
    });

    it('throws BadRequestException when email provider is not ready', async () => {
      readWorkspaceEmailDeliveryMock.mockReturnValue(null);
      isWorkspaceDeliveryReadyMock.mockReturnValue(false);

      channelConfigFindUnique.mockResolvedValue(null);

      await expect(
        service.sendTest('ws-4', 'user@kloel.com'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.sendTest('ws-4', 'user@kloel.com'),
      ).rejects.toThrow('email_provider_not_configured');
    });

    it('throws BadRequestException when recipient email is empty', async () => {
      await expect(
        service.sendTest('ws-4', ''),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.sendTest('ws-4', ''),
      ).rejects.toThrow('email_test_recipient_required');
    });
  });

  describe('tenant isolation', () => {
    it('scopes prisma queries to workspaceId', async () => {
      readWorkspaceEmailDeliveryMock.mockReturnValue(null);
      isWorkspaceDeliveryReadyMock.mockReturnValue(false);

      workspaceFindUnique.mockResolvedValue({
        providerSettings: {},
        name: 'Tenant WS',
      });
      channelConfigFindUnique.mockResolvedValue(null);

      getPrimaryGmailStatus.mockResolvedValue(null);
      getPrimaryMicrosoftStatus.mockResolvedValue(null);
      getPrimaryImapSmtpStatus.mockResolvedValue(null);

      await service.getStatus('ws-tenant');

      expect(workspaceFindUnique).toHaveBeenCalledWith({
        where: { id: 'ws-tenant' },
        select: { providerSettings: true, name: true },
      });
      expect(channelConfigFindUnique).toHaveBeenCalledWith({
        where: {
          workspaceId_channel: {
            workspaceId: 'ws-tenant',
            channel: 'email',
          },
        },
        select: { transferCriteria: true },
      });
    });
  });

  describe('connect', () => {
    it('updates workspace providerSettings with email enabled', async () => {
      workspaceFindUnique.mockResolvedValue({
        providerSettings: { whatsappProvider: 'waha' },
      });
      workspaceUpdate.mockResolvedValue({});

      await service.connect('ws-5', true);

      expect(workspaceUpdate).toHaveBeenCalledWith({
        where: { id: 'ws-5' },
        data: {
          providerSettings: expect.objectContaining({
            email: { enabled: true },
          }),
        },
      });
    });
  });

  describe('disconnect', () => {
    it('sets email enabled to false in providerSettings', async () => {
      workspaceFindUnique.mockResolvedValue({
        providerSettings: {
          whatsappProvider: 'waha',
          email: { enabled: true },
        },
      });
      workspaceUpdate.mockResolvedValue({});

      await service.disconnect('ws-6');

      expect(workspaceUpdate).toHaveBeenCalledWith({
        where: { id: 'ws-6' },
        data: {
          providerSettings: expect.objectContaining({
            email: { enabled: false },
          }),
        },
      });
    });
  });
});
