import { WhatsAppWatchdogService } from './whatsapp-watchdog.service';

describe('WhatsAppWatchdogService', () => {
  let prisma: any;
  let providerRegistry: any;
  let whatsappApi: any;
  let catchupService: any;
  let ciaRuntime: any;
  let redis: any;
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

    whatsappApi = {
      listSessions: jest.fn().mockResolvedValue([]),
      syncSessionConfig: jest.fn().mockResolvedValue(undefined),
    };

    catchupService = {
      triggerCatchup: jest.fn().mockResolvedValue({ scheduled: true }),
    };

    ciaRuntime = {
      bootstrap: jest.fn().mockResolvedValue({ connected: true }),
    };

    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
    };

    service = new WhatsAppWatchdogService(
      prisma,
      providerRegistry,
      whatsappApi,
      catchupService,
      ciaRuntime,
      redis,
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
    expect(ciaRuntime.bootstrap).toHaveBeenCalledWith('ws-1');
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
    expect(ciaRuntime.bootstrap).toHaveBeenCalledWith('ws-1');
    expect(health.connected).toBe(true);
  });

  it('does not auto-bootstrap when autonomy was manually paused', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
    });
    prisma.workspace.findUnique.mockResolvedValue({
      name: 'Workspace Teste',
      providerSettings: {
        whatsappApiSession: { status: 'connected' },
        autonomy: { reason: 'manual_pause' },
        ciaRuntime: { state: 'PAUSED' },
      },
    });

    await service.checkWorkspaceSession('ws-1', 'Workspace Teste');

    expect(ciaRuntime.bootstrap).not.toHaveBeenCalled();
  });

  it('skips the watchdog sweep when another instance already holds the global lock', async () => {
    redis.set.mockResolvedValueOnce(null);

    await service.runHealthCheck();

    expect(prisma.workspace.findMany).not.toHaveBeenCalled();
    expect(providerRegistry.getSessionStatus).not.toHaveBeenCalled();
  });

  it('does not attempt reconnect when another instance already locked the workspace reconnect', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: false,
      status: 'FAILED',
    });
    redis.set.mockResolvedValueOnce(null);

    const health = await service.checkWorkspaceSession(
      'ws-1',
      'Workspace Teste',
    );

    expect(providerRegistry.startSession).not.toHaveBeenCalled();
    expect(health.connected).toBe(false);
    expect(health.consecutiveFailures).toBe(1);
  });

  it('backs off reconnect attempts exponentially after repeated failures', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: false,
      status: 'FAILED',
    });
    providerRegistry.startSession.mockResolvedValue({
      success: false,
      message: 'session_start_failed',
    });

    const firstHealth = await service.checkWorkspaceSession(
      'ws-1',
      'Workspace Teste',
    );
    firstHealth.lastReconnectAttempt = new Date(Date.now() - 90_000);

    await service.checkWorkspaceSession('ws-1', 'Workspace Teste');

    expect(providerRegistry.startSession).toHaveBeenCalledTimes(1);
  });

  it('ignores guest workspaces and workspaces without a WAHA snapshot when no live WAHA session is detected', async () => {
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

  it('adopts live WAHA sessions by workspace id before the watchdog sweep', async () => {
    prisma.workspace.findMany.mockResolvedValue([
      {
        id: '20db67c5-873c-40ff-9eaf-4eb36cf6a6a0',
        name: 'Live Workspace',
        providerSettings: { whatsappProvider: 'whatsapp-api' },
      },
    ]);
    whatsappApi.listSessions.mockResolvedValue([
      {
        name: '20db67c5-873c-40ff-9eaf-4eb36cf6a6a0',
        state: 'CONNECTED',
        rawStatus: 'WORKING',
        success: true,
      },
    ]);
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
    });

    await service.runHealthCheck();

    expect(whatsappApi.listSessions).toHaveBeenCalledTimes(1);
    expect(whatsappApi.syncSessionConfig).toHaveBeenCalledWith(
      '20db67c5-873c-40ff-9eaf-4eb36cf6a6a0',
    );
    expect(providerRegistry.getSessionStatus).toHaveBeenCalledTimes(2);
    expect(providerRegistry.getSessionStatus).toHaveBeenNthCalledWith(
      1,
      '20db67c5-873c-40ff-9eaf-4eb36cf6a6a0',
    );
    expect(providerRegistry.getSessionStatus).toHaveBeenNthCalledWith(
      2,
      '20db67c5-873c-40ff-9eaf-4eb36cf6a6a0',
    );
  });
});
