import { WhatsAppWatchdogService } from './whatsapp-watchdog.service';

describe('WhatsAppWatchdogService', () => {
  let prisma: any;
  let providerRegistry: any;
  let service: WhatsAppWatchdogService;

  beforeEach(() => {
    prisma = {
      workspace: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ name: 'Workspace Teste' }),
      },
    };

    providerRegistry = {
      getSessionStatus: jest.fn(),
      startSession: jest.fn(),
    };

    service = new WhatsAppWatchdogService(prisma, providerRegistry);
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.clearAllMocks();
  });

  it('does not count SCAN_QR_CODE as operational failure', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: false,
      status: 'SCAN_QR_CODE',
    });

    const health = await service.checkWorkspaceSession('ws-1', 'Workspace Teste');

    expect(health.consecutiveFailures).toBe(0);
    expect(providerRegistry.startSession).not.toHaveBeenCalled();
  });

  it('attempts reconnect for disconnected sessions', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: false,
      status: 'FAILED',
    });
    providerRegistry.startSession.mockResolvedValue({
      success: true,
      message: 'session_started',
    });

    const health = await service.checkWorkspaceSession('ws-1', 'Workspace Teste');

    expect(providerRegistry.startSession).toHaveBeenCalledWith('ws-1');
    expect(health.connected).toBe(true);
    expect(health.consecutiveFailures).toBe(0);
  });
});
