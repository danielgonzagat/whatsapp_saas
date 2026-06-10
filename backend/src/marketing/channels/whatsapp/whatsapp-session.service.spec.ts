import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, GoneException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OpsAlertService } from '../../../observability/ops-alert.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppApiProvider } from './providers/whatsapp-api.provider';
import { WhatsappSessionService } from './whatsapp-session.service';

jest.mock('../../../queue/queue', () => ({
  flowQueue: { add: jest.fn().mockResolvedValue(undefined) },
  autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

async function expectMetaOnlyGone(operation: () => unknown, feature: string) {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(GoneException);
    const response = error instanceof GoneException ? error.getResponse() : null;
    expect(response).toEqual(
      expect.objectContaining({
        feature,
        notSupported: true,
        provider: 'meta-cloud',
      }),
    );
    return;
  }

  throw new Error(`Expected ${feature} to be rejected`);
}

describe('WhatsappSessionService', () => {
  let service: WhatsappSessionService;
  let providerRegistry: {
    startSession: jest.Mock;
    getQrCode: jest.Mock;
    getSessionStatus: jest.Mock;
    getSessionDiagnostics: jest.Mock;
    deleteSession: jest.Mock;
    disconnect: jest.Mock;
    setPresence: jest.Mock;
    sendTyping: jest.Mock;
    stopTyping: jest.Mock;
    readChatMessages: jest.Mock;
    getProviderType: jest.Mock;
    extractPhoneFromChatId: jest.Mock;
    upsertContactProfile: jest.Mock;
  };
  let whatsappApi: { getRuntimeConfigDiagnostics: jest.Mock };
  let prisma: { contact: { findUnique: jest.Mock } };

  beforeEach(async () => {
    providerRegistry = {
      startSession: jest.fn().mockResolvedValue({ success: true }),
      getQrCode: jest.fn().mockResolvedValue({ success: true, qr: 'qr-data' }),
      getSessionStatus: jest.fn().mockResolvedValue({
        connected: true,
        status: 'CONNECTED',
        phoneNumber: '5511999991234',
      }),
      getSessionDiagnostics: jest.fn().mockResolvedValue({
        available: true,
        configMismatch: false,
        webhookConfigured: true,
        inboundEventsConfigured: true,
        storeEnabled: true,
      }),
      deleteSession: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      setPresence: jest.fn().mockResolvedValue(undefined),
      sendTyping: jest.fn().mockResolvedValue(undefined),
      stopTyping: jest.fn().mockResolvedValue(undefined),
      readChatMessages: jest.fn().mockResolvedValue(undefined),
      getProviderType: jest.fn().mockResolvedValue('meta-cloud'),
      extractPhoneFromChatId: jest.fn().mockReturnValue('5511999991234'),
      upsertContactProfile: jest.fn(),
    };
    whatsappApi = {
      getRuntimeConfigDiagnostics: jest.fn().mockReturnValue({
        webhookConfigured: true,
        inboundEventsConfigured: true,
      }),
    };
    prisma = {
      contact: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappSessionService,
        { provide: WhatsAppProviderRegistry, useValue: providerRegistry },
        { provide: WhatsAppApiProvider, useValue: whatsappApi },
        { provide: PrismaService, useValue: prisma },
        { provide: OpsAlertService, useValue: { alertOnCriticalError: jest.fn() } },
      ],
    }).compile();
    service = module.get(WhatsappSessionService);
  });

  describe('createSession', () => {
    it('returns Meta connected session details when the phone is active', async () => {
      const result = await service.createSession('ws-1');
      expect(result).toEqual({
        status: 'already_connected',
        authUrl: undefined,
        phoneNumber: '5511999991234',
        phoneNumberId: undefined,
        provider: 'meta-cloud',
        whatsappBusinessId: undefined,
      });
    });

    it('returns error when session start fails', async () => {
      providerRegistry.startSession.mockResolvedValue({ success: false, message: 'error' });
      const result = await service.createSession('ws-1');
      expect(result).toEqual({ error: true, message: 'error' });
    });

    it('returns Meta authorization guidance when the phone still needs connection', async () => {
      providerRegistry.startSession.mockResolvedValue({
        success: true,
        authUrl: 'https://meta.test/signup',
      });
      providerRegistry.getSessionStatus.mockResolvedValueOnce({
        connected: false,
        status: 'CONNECTION_INCOMPLETE',
        authUrl: 'https://meta.test/status-signup',
        phoneNumberId: 'phone-id',
        whatsappBusinessId: 'biz-id',
      });

      const result = await service.createSession('ws-1');
      expect(result).toEqual({
        status: 'CONNECTION_INCOMPLETE',
        authUrl: 'https://meta.test/signup',
        phoneNumber: undefined,
        phoneNumberId: 'phone-id',
        provider: 'meta-cloud',
        whatsappBusinessId: 'biz-id',
      });
    });
  });

  describe('recreateSessionIfInvalid', () => {
    it('returns connected Meta status when diagnostics are good', async () => {
      const result = await service.recreateSessionIfInvalid('ws-1');
      expect(result).toEqual({
        recreated: false,
        reason: 'meta_session_connected',
        diagnostics: result.diagnostics,
        status: {
          connected: true,
          status: 'CONNECTED',
          phoneNumber: '5511999991234',
        },
      });
      expect(result.diagnostics).toBeDefined();
    });

    it('keeps mismatched legacy config under official Meta auth management', async () => {
      providerRegistry.getSessionDiagnostics.mockResolvedValue({
        available: true,
        configMismatch: true,
        webhookConfigured: true,
        inboundEventsConfigured: true,
        storeEnabled: true,
      });
      providerRegistry.getSessionStatus.mockResolvedValueOnce({
        connected: false,
        status: 'CONNECTION_INCOMPLETE',
      });

      const result = await service.recreateSessionIfInvalid('ws-1');
      expect(providerRegistry.deleteSession).not.toHaveBeenCalled();
      expect(providerRegistry.startSession).not.toHaveBeenCalled();
      expect(result).toEqual({
        recreated: false,
        reason: 'meta_connection_managed_by_official_auth',
        diagnostics: result.diagnostics,
        status: {
          connected: false,
          status: 'CONNECTION_INCOMPLETE',
        },
      });
    });
  });

  describe('getSession', () => {
    it('returns workspace info', () => {
      const result = service.getSession('ws-1');
      expect(result).toEqual({ workspaceId: 'ws-1', provider: 'meta-cloud' });
    });
  });

  describe('getConnectionStatus', () => {
    it('returns session status with connected flag from provider', async () => {
      const result = await service.getConnectionStatus('ws-1');
      expect(result).toEqual({
        connected: true,
        status: 'CONNECTED',
        phoneNumber: '5511999991234',
        authUrl: undefined,
        phoneNumberId: undefined,
        provider: 'meta-cloud',
        whatsappBusinessId: undefined,
      });
    });
  });

  describe('getQrCode', () => {
    it('rejects legacy QR requests with Meta-only guidance', async () => {
      await expectMetaOnlyGone(() => service.getQrCode('ws-1'), 'legacy_session_qr');
    });
  });

  describe('disconnect', () => {
    it('rejects legacy disconnect requests with Meta-only guidance', async () => {
      await expectMetaOnlyGone(() => service.disconnect('ws-1'), 'legacy_session_disconnect');
      expect(providerRegistry.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('setPresence', () => {
    it('sets typing via providerRegistry', async () => {
      const result = await service.setPresence('ws-1', '5511@c.us', 'typing');
      expect(providerRegistry.sendTyping).toHaveBeenCalled();
      expect(result.presence).toBe('typing');
    });

    it('sets available via providerRegistry', async () => {
      await service.setPresence('ws-1', '5511@c.us', 'available');
      expect(providerRegistry.setPresence).toHaveBeenCalled();
    });

    it('throws on invalid presence', async () => {
      await expect(service.setPresence('ws-1', '5511@c.us', 'invalid' as 'typing')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateWorkspaceProvider', () => {
    it('returns empty for meta-cloud', () => {
      expect(service.validateWorkspaceProvider({ whatsappProvider: 'meta-cloud' })).toEqual([]);
    });

    it('returns error for non-meta-cloud', () => {
      expect(service.validateWorkspaceProvider({ whatsappProvider: 'waha-web' })).toEqual([
        'whatsapp_provider',
      ]);
    });
  });

  describe('persistSessionDiagnostics', () => {
    let _prisma: {
      workspace: { findUnique: jest.Mock; update: jest.Mock };
      $transaction: jest.Mock;
    };

    beforeEach(async () => {
      _prisma = {
        workspace: {
          findUnique: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue({}),
        },
        $transaction: jest
          .fn()
          .mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(_prisma)),
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WhatsappSessionService,
          { provide: WhatsAppProviderRegistry, useValue: providerRegistry },
          { provide: WhatsAppApiProvider, useValue: whatsappApi },
          { provide: PrismaService, useValue: _prisma },
          { provide: OpsAlertService, useValue: { alertOnCriticalError: jest.fn() } },
        ],
      }).compile();
      service = module.get(WhatsappSessionService);
    });

    it('no-ops when workspace not found', async () => {
      await service.persistSessionDiagnostics('missing', {
        lastHeartbeatAt: new Date().toISOString(),
      });
      expect(_prisma.workspace.update).not.toHaveBeenCalled();
    });

    it('updates both whatsappApiSession and whatsappWebSession with diagnostics', async () => {
      _prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { whatsappWebSession: { phoneNumber: '+5511' } },
      });
      const heartbeat = new Date('2026-05-12T00:00:00Z').toISOString();
      await service.persistSessionDiagnostics('ws-1', {
        lastHeartbeatAt: heartbeat,
        lastWatchdogDisconnectedAt: null,
      });
      type ProviderSession = { lastHeartbeatAt?: string };
      type WorkspaceUpdateArg = {
        data: {
          providerSettings: {
            whatsappApiSession: ProviderSession;
            whatsappWebSession: ProviderSession;
          };
        };
      };
      const update = (_prisma.workspace.update.mock.calls[0] as [WorkspaceUpdateArg])[0];
      expect(update.data.providerSettings.whatsappApiSession.lastHeartbeatAt).toBe(heartbeat);
      expect(update.data.providerSettings.whatsappWebSession.lastHeartbeatAt).toBe(heartbeat);
    });

    it('swallows transaction errors and logs', async () => {
      _prisma.$transaction.mockRejectedValue(new Error('DB error'));
      await expect(
        service.persistSessionDiagnostics('ws-1', { lastHeartbeatAt: 'x' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('collectMessagingRuntimeIssues', () => {
    it('returns empty issues when everything is healthy', async () => {
      const result = await service.collectMessagingRuntimeIssues('ws-1', {
        whatsappProvider: 'meta-cloud',
      });
      expect(result.issues).toEqual([]);
      expect(result.diagnostics).toBeDefined();
    });

    it('reports missing webhook when required', async () => {
      whatsappApi.getRuntimeConfigDiagnostics.mockReturnValue({
        webhookConfigured: false,
        inboundEventsConfigured: true,
      });
      const result = await service.collectMessagingRuntimeIssues(
        'ws-1',
        { whatsappProvider: 'meta-cloud' },
        { requireInboundWebhook: true },
      );
      expect(result.issues).toContain('meta_webhook_missing');
    });

    it('reports session issue when not connected', async () => {
      providerRegistry.getSessionStatus.mockResolvedValue({
        connected: false,
        status: 'DISCONNECTED',
      });
      const result = await service.collectMessagingRuntimeIssues('ws-1', {
        whatsappProvider: 'meta-cloud',
      });
      expect(result.issues.some((i) => i.includes('session'))).toBe(true);
    });
  });
});
