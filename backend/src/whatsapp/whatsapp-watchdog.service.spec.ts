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

    const health = await service.checkWorkspaceSession(
      'ws-1',
      'Workspace Teste',
    );

    expect(health.consecutiveFailures).toBe(0);
    expect(providerRegistry.startSession).not.toHaveBeenCalled();
  });

  it('does not count QR_PENDING as operational failure', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: false,
      status: 'QR_PENDING',
    });

    const health = await service.checkWorkspaceSession(
      'ws-1',
      'Workspace Teste',
    );

    expect(health.consecutiveFailures).toBe(0);
    expect(providerRegistry.startSession).not.toHaveBeenCalled();
  });

  it('attempts reconnect for disconnected sessions only after WAHA confirms connection', async () => {
    providerRegistry.getSessionStatus
      .mockResolvedValueOnce({
        connected: false,
        status: 'FAILED',
      })
      .mockResolvedValueOnce({
        connected: true,
        status: 'CONNECTED',
      });
    providerRegistry.startSession.mockResolvedValue({
      success: true,
      message: 'session_started',
    });

    const health = await service.checkWorkspaceSession(
      'ws-1',
      'Workspace Teste',
    );

    expect(providerRegistry.startSession).toHaveBeenCalledWith('ws-1');
    expect(health.connected).toBe(true);
    expect(health.consecutiveFailures).toBe(0);
    expect(catchupService.triggerCatchup).toHaveBeenCalledWith(
      'ws-1',
      'watchdog_reconnected',
    );
  });

  it('does not mark reconnect as connected when WAHA is still waiting for QR', async () => {
    providerRegistry.getSessionStatus
      .mockResolvedValueOnce({
        connected: false,
        status: 'FAILED',
      })
      .mockResolvedValueOnce({
        connected: false,
        status: 'SCAN_QR_CODE',
      });
    providerRegistry.startSession.mockResolvedValue({
      success: true,
      message: 'session_started',
    });

    const health = await service.checkWorkspaceSession(
      'ws-1',
      'Workspace Teste',
    );

    expect(providerRegistry.startSession).toHaveBeenCalledWith('ws-1');
    expect(health.connected).toBe(false);
    expect(health.consecutiveFailures).toBe(0);
    expect(catchupService.triggerCatchup).not.toHaveBeenCalled();
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

    const health = await service.checkWorkspaceSession(
      'ws-1',
      'Workspace Teste',
    );

    expect(providerRegistry.startSession).not.toHaveBeenCalled();
    expect(health.reconnectBlockedReason).toBe('noweb_store_misconfigured');
  });

  it('triggers catch-up when a session becomes connected again', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
    });

    const health = await service.checkWorkspaceSession(
      'ws-1',
      'Workspace Teste',
    );

    expect(catchupService.triggerCatchup).toHaveBeenCalledWith(
      'ws-1',
      'watchdog_reconnected',
    );
    expect(health.connected).toBe(true);
  });

  it('ignores guest workspaces and workspaces without a WAHA session snapshot during the health sweep', async () => {
    prisma.workspace.findMany.mockResolvedValue([
      {
        id: 'guest-ws',
        name: 'Guest Workspace',
        providerSettings: {
          guestMode: true,
          whatsappProvider: 'whatsapp-api',
          whatsappApiSession: { status: 'qr_pending' },
        },
      },
      {
        id: 'cold-ws',
        name: 'Cold Workspace',
        providerSettings: { whatsappProvider: 'whatsapp-api' },
      },
      {
        id: 'live-ws',
        name: 'Live Workspace',
        providerSettings: { whatsappApiSession: { status: 'connected' } },
      },
    ]);
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
    });

    await service.runHealthCheck();

    expect(providerRegistry.getSessionStatus).toHaveBeenCalledTimes(1);
    expect(providerRegistry.getSessionStatus).toHaveBeenCalledWith('live-ws');
  });
});
