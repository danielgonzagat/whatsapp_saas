import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppApiProvider } from './providers/whatsapp-api.provider';
import { WhatsappSessionService } from './whatsapp-session.service';

jest.mock('../queue/queue', () => ({
  flowQueue: { add: jest.fn().mockResolvedValue(undefined) },
  autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

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
    it('returns qr_pending when QR code is available', async () => {
      const result = await service.createSession('ws-1');
      expect(result).toEqual({ status: 'qr_pending', code: 'qr-data', qrCode: 'qr-data' });
    });

    it('returns error when session start fails', async () => {
      providerRegistry.startSession.mockResolvedValue({ success: false, message: 'error' });
      const result = await service.createSession('ws-1');
      expect(result).toEqual({ error: true, message: 'error' });
    });

    it('returns already_connected when session exists and no QR', async () => {
      providerRegistry.getQrCode.mockResolvedValue({ success: false });
      const result = await service.createSession('ws-1');
      expect(result).toEqual({ status: 'already_connected', qrCode: undefined });
    });
  });

  describe('recreateSessionIfInvalid', () => {
    it('returns healthy when diagnostics are good', async () => {
      const result = await service.recreateSessionIfInvalid('ws-1');
      expect(result).toEqual({
        recreated: false,
        reason: 'session_config_healthy',
        diagnostics: expect.any(Object),
      });
    });

    it('recreates session when config is mismatched', async () => {
      providerRegistry.getSessionDiagnostics.mockResolvedValue({
        available: true,
        configMismatch: true,
        webhookConfigured: true,
        inboundEventsConfigured: true,
        storeEnabled: true,
      });
      const result = await service.recreateSessionIfInvalid('ws-1');
      expect(providerRegistry.deleteSession).toHaveBeenCalled();
      expect(providerRegistry.startSession).toHaveBeenCalled();
      expect(result.recreated).toBe(true);
    });
  });

  describe('getSession', () => {
    it('returns workspace info', () => {
      const result = service.getSession('ws-1');
      expect(result).toEqual({ workspaceId: 'ws-1', provider: 'dynamic' });
    });
  });

  describe('getConnectionStatus', () => {
    it('returns session status from provider', async () => {
      const result = await service.getConnectionStatus('ws-1');
      expect(result).toEqual({
        status: 'CONNECTED',
        phoneNumber: '5511999991234',
        qrCode: undefined,
      });
    });
  });

  describe('getQrCode', () => {
    it('returns QR when available', async () => {
      const result = await service.getQrCode('ws-1');
      expect(result).toBe('qr-data');
    });

    it('returns null when QR fetch fails', async () => {
      providerRegistry.getQrCode.mockResolvedValue({ success: false });
      const result = await service.getQrCode('ws-1');
      expect(result).toBeNull();
    });
  });

  describe('disconnect', () => {
    it('calls providerRegistry.disconnect', async () => {
      await service.disconnect('ws-1');
      expect(providerRegistry.disconnect).toHaveBeenCalledWith('ws-1');
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
      await expect(
        service.setPresence('ws-1', '5511@c.us', 'invalid' as 'typing'),
      ).rejects.toThrow(BadRequestException);
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

  describe('collectMessagingRuntimeIssues', () => {
    it('returns empty issues when everything is healthy', async () => {
      const result = await service.collectMessagingRuntimeIssues('ws-1', { whatsappProvider: 'meta-cloud' });
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
      const result = await service.collectMessagingRuntimeIssues('ws-1', { whatsappProvider: 'meta-cloud' });
      expect(result.issues.some((i) => i.includes('session'))).toBe(true);
    });
  });
});
