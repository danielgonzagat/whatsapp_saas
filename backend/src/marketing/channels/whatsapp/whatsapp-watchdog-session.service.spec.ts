import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { WhatsappSessionService } from './whatsapp-session.service';
import { WhatsAppWatchdogRecoveryService } from './whatsapp-watchdog-recovery.service';
import { WhatsAppWatchdogSessionService } from './whatsapp-watchdog-session.service';

describe('WhatsAppWatchdogSessionService', () => {
  let service: WhatsAppWatchdogSessionService;
  let sessionService: {
    getConnectionStatus: jest.Mock;
    persistSessionDiagnostics: jest.Mock;
  };
  let prisma: {
    workspace: { findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let recovery: object;

  beforeEach(async () => {
    sessionService = {
      getConnectionStatus: jest.fn().mockResolvedValue({
        connected: true,
        status: 'CONNECTED',
        phoneNumber: '5511999999999',
      }),
      persistSessionDiagnostics: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      workspace: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
    };
    recovery = {};
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppWatchdogSessionService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsappSessionService, useValue: sessionService },
        { provide: WhatsAppWatchdogRecoveryService, useValue: recovery },
      ],
    }).compile();
    service = module.get(WhatsAppWatchdogSessionService);
  });

  describe('getStats', () => {
    it('returns zeros when no sessions tracked', () => {
      expect(service.getStats()).toEqual({
        totalMonitored: 0,
        connected: 0,
        disconnected: 0,
        withFailures: 0,
      });
    });
  });

  describe('getReconnectBlockReason', () => {
    it('returns null when no blocking signal in providerSettings', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ providerSettings: {} });
      await expect(service.getReconnectBlockReason('ws-1')).resolves.toBeNull();
    });

    it('detects noweb_store_misconfigured from recoveryBlockedReason', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: {
          whatsappWebSession: { recoveryBlockedReason: 'noweb_store_misconfigured' },
        },
      });
      await expect(service.getReconnectBlockReason('ws-1')).resolves.toBe(
        'noweb_store_misconfigured',
      );
    });

    it('detects noweb_store_misconfigured from lastCatchupError fuzzy match', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: {
          whatsappWebSession: {
            lastCatchupError: 'please enable noweb store full_sync to continue',
          },
        },
      });
      await expect(service.getReconnectBlockReason('ws-1')).resolves.toBe(
        'noweb_store_misconfigured',
      );
    });
  });

  describe('persistSessionDiagnostics', () => {
    it('delegates to sessionService.persistSessionDiagnostics', async () => {
      const update = { lastHeartbeatAt: new Date().toISOString() };
      await service.persistSessionDiagnostics('ws-1', update);
      expect(sessionService.persistSessionDiagnostics).toHaveBeenCalledWith('ws-1', update);
    });
  });

  describe('incReconnectCounter', () => {
    it('does not throw on first call', () => {
      expect(() => service.incReconnectCounter('ws-1', 'success')).not.toThrow();
    });
  });
});
