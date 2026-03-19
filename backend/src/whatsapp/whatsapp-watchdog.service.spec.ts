import { WhatsAppWatchdogService } from './whatsapp-watchdog.service';

describe('WhatsAppWatchdogService', () => {
  let prisma: any;
  let providerRegistry: any;
  let catchupService: any;
  let service: WhatsAppWatchdogService;

  beforeEach(() => {
    prisma = {
      workspace: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          name: 'Workspace Teste',
          providerSettings: { whatsappApiSession: {} },
        }),
      },
    };

    providerRegistry = {
      getSessionStatus: jest.fn(),
      startSession: jest.fn(),
    };

    catchupService = {
      triggerCatchup: jest.fn().mockResolvedValue({ scheduled: true }),
    };

    service = new WhatsAppWatchdogService(
      prisma,
      providerRegistry,
      catchupService,
    );
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

  it('does not attempt reconnect when a structural NOWEB store failure is persisted', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: false,
      status: 'FAILED',
    });
    prisma.workspace.findUnique.mockResolvedValue({
      name: 'Workspace Teste',
      providerSettings: {
        whatsappApiSession: {
          recoveryBlockedReason: 'noweb_store_misconfigured',
        },
      },
    });

    const health = await service.checkWorkspaceSession('ws-1', 'Workspace Teste');

    expect(providerRegistry.startSession).not.toHaveBeenCalled();
    expect(health.reconnectBlockedReason).toBe(
      'noweb_store_misconfigured',
    );
  });

  it('triggers catch-up when a session becomes connected again', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
    });

    const health = await service.checkWorkspaceSession('ws-1', 'Workspace Teste');

    expect(catchupService.triggerCatchup).toHaveBeenCalledWith(
      'ws-1',
      'watchdog_reconnected',
    );
    expect(health.connected).toBe(true);
  });
});
