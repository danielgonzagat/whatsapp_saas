import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppWatchdogRecoveryService } from './whatsapp-watchdog-recovery.service';
import { WhatsAppWatchdogSessionService } from './whatsapp-watchdog-session.service';

describe('WhatsAppWatchdogSessionService', () => {
  let service: WhatsAppWatchdogSessionService;
  let prisma: {
    workspace: { findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let recovery: object;

  beforeEach(async () => {
    prisma = {
      workspace: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
        cb(prisma),
      ),
    };
    recovery = {};
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppWatchdogSessionService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppProviderRegistry, useValue: {} },
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
    it('no-ops when workspace not found', async () => {
      prisma.workspace.findUnique.mockResolvedValue(null);
      await service.persistSessionDiagnostics('missing', {
        lastHeartbeatAt: new Date().toISOString(),
      });
      expect(prisma.workspace.update).not.toHaveBeenCalled();
    });

    it('updates both whatsappApiSession and whatsappWebSession with diagnostics', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { whatsappWebSession: { phoneNumber: '+5511' } },
      });
      const heartbeat = new Date('2026-05-12T00:00:00Z').toISOString();
      await service.persistSessionDiagnostics('ws-1', {
        lastHeartbeatAt: heartbeat,
        lastWatchdogDisconnectedAt: null,
      });
      const update = prisma.workspace.update.mock.calls[0][0];
      expect(update.data.providerSettings.whatsappApiSession.lastHeartbeatAt).toBe(heartbeat);
      expect(update.data.providerSettings.whatsappWebSession.lastHeartbeatAt).toBe(heartbeat);
    });

    it('swallows transaction errors and logs', async () => {
      prisma.$transaction.mockRejectedValue(new Error('DB error'));
      await expect(
        service.persistSessionDiagnostics('ws-1', { lastHeartbeatAt: 'x' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('incReconnectCounter', () => {
    it('does not throw on first call', () => {
      expect(() => service.incReconnectCounter('ws-1', 'success')).not.toThrow();
    });
  });
});
