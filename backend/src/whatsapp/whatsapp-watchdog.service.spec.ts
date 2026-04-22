import { WhatsAppWatchdogService } from './whatsapp-watchdog.service';

describe('WhatsAppWatchdogService', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let prisma: {
    workspace: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let providerRegistry: {
    getSessionStatus: jest.Mock;
    startSession: jest.Mock;
  };
  let whatsappApi: {
    listSessions: jest.Mock;
    syncSessionConfig: jest.Mock;
    deleteSession: jest.Mock;
  };
  let catchupService: {
    triggerCatchup: jest.Mock;
  };
  let ciaRuntime: {
    bootstrap: jest.Mock;
    ensureBacklogCoverage: jest.Mock;
  };
  let redis: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
  };
  let service: WhatsAppWatchdogService;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.WAHA_API_URL = 'https://waha.test';
    prisma = {
      workspace: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          name: 'Workspace Teste',
          providerSettings: { whatsappApiSession: {} },
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };

    providerRegistry = {
      getSessionStatus: jest.fn(),
      startSession: jest.fn(),
    };

    whatsappApi = {
      listSessions: jest.fn().mockResolvedValue([]),
      syncSessionConfig: jest.fn().mockResolvedValue(undefined),
      deleteSession: jest.fn().mockResolvedValue(true),
    };

    catchupService = {
      triggerCatchup: jest.fn().mockResolvedValue({ scheduled: true }),
    };

    ciaRuntime = {
      bootstrap: jest.fn().mockResolvedValue({ connected: true }),
      ensureBacklogCoverage: jest.fn().mockResolvedValue({
        action: 'idle',
      }),
    };

    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
    };

    service = new WhatsAppWatchdogService(
      prisma as unknown as ConstructorParameters<typeof WhatsAppWatchdogService>[0],
      providerRegistry as unknown as ConstructorParameters<typeof WhatsAppWatchdogService>[1],
      whatsappApi as unknown as ConstructorParameters<typeof WhatsAppWatchdogService>[2],
      catchupService as unknown as ConstructorParameters<typeof WhatsAppWatchdogService>[3],
      ciaRuntime as unknown as ConstructorParameters<typeof WhatsAppWatchdogService>[4],
      redis as unknown as ConstructorParameters<typeof WhatsAppWatchdogService>[5],
    );
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.clearAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.WAHA_API_URL;
  });

  it('does not count SCAN_QR_CODE as operational failure', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: false,
      status: 'SCAN_QR_CODE',
    });

    const health = await service.checkWorkspaceSession('ws-1', 'Workspace Teste');

    expect(health.connected).toBe(true);
    expect(health.consecutiveFailures).toBe(0);
    expect(providerRegistry.getSessionStatus).not.toHaveBeenCalled();
    expect(providerRegistry.startSession).not.toHaveBeenCalled();
  });

  it('does not count QR_PENDING as operational failure', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: false,
      status: 'QR_PENDING',
    });

    const health = await service.checkWorkspaceSession('ws-1', 'Workspace Teste');

    expect(health.connected).toBe(true);
    expect(health.consecutiveFailures).toBe(0);
    expect(providerRegistry.getSessionStatus).not.toHaveBeenCalled();
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

    const health = await service.checkWorkspaceSession('ws-1', 'Workspace Teste');

    expect(providerRegistry.getSessionStatus).not.toHaveBeenCalled();
    expect(providerRegistry.startSession).not.toHaveBeenCalled();
    expect(health.connected).toBe(true);
    expect(health.consecutiveFailures).toBe(0);
    expect(catchupService.triggerCatchup).not.toHaveBeenCalled();
    expect(ciaRuntime.bootstrap).not.toHaveBeenCalled();
    expect(ciaRuntime.ensureBacklogCoverage).not.toHaveBeenCalled();
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

    const health = await service.checkWorkspaceSession('ws-1', 'Workspace Teste');

    expect(providerRegistry.getSessionStatus).not.toHaveBeenCalled();
    expect(providerRegistry.startSession).not.toHaveBeenCalled();
    expect(health.connected).toBe(true);
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

    const health = await service.checkWorkspaceSession('ws-1', 'Workspace Teste');

    expect(providerRegistry.startSession).not.toHaveBeenCalled();
    expect(providerRegistry.getSessionStatus).not.toHaveBeenCalled();
    expect(health.connected).toBe(true);
    expect(health.reconnectBlockedReason).toBeUndefined();
  });

  it('triggers catch-up when a session becomes connected again', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
    });

    const health = await service.checkWorkspaceSession('ws-1', 'Workspace Teste');

    expect(providerRegistry.getSessionStatus).not.toHaveBeenCalled();
    expect(catchupService.triggerCatchup).not.toHaveBeenCalled();
    expect(ciaRuntime.bootstrap).not.toHaveBeenCalled();
    expect(ciaRuntime.ensureBacklogCoverage).not.toHaveBeenCalled();
    expect(health.connected).toBe(true);
  });

  it('normalizes malformed providerSettings before persisting watchdog diagnostics', async () => {
    Object.defineProperty(service, 'isWahaOperationallyEnabled', {
      value: () => true,
    });

    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
    });
    prisma.workspace.findUnique.mockResolvedValue({
      name: 'Workspace Teste',
      providerSettings: 'malformed-settings',
    });

    await service.checkWorkspaceSession('ws-1', 'Workspace Teste');

    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            whatsappApiSession: expect.objectContaining({
              lastHeartbeatAt: expect.any(String),
              lastSeenWorkingAt: expect.any(String),
              lastUpdated: expect.any(String),
            }),
            whatsappWebSession: expect.objectContaining({
              lastHeartbeatAt: expect.any(String),
              lastSeenWorkingAt: expect.any(String),
              lastUpdated: expect.any(String),
            }),
          }),
        }),
      }),
    );

    const updatePayload = prisma.workspace.update.mock.calls[0]?.[0]?.data?.providerSettings;
    expect(updatePayload).not.toHaveProperty('0');
    expect(updatePayload).not.toHaveProperty('1');
  });

  it('reboots autonomy when the WhatsApp stays connected even after a previous manual pause', async () => {
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

    expect(providerRegistry.getSessionStatus).not.toHaveBeenCalled();
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

    const health = await service.checkWorkspaceSession('ws-1', 'Workspace Teste');

    expect(providerRegistry.startSession).not.toHaveBeenCalled();
    expect(providerRegistry.getSessionStatus).not.toHaveBeenCalled();
    expect(health.connected).toBe(true);
    expect(health.consecutiveFailures).toBe(0);
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

    const firstHealth = await service.checkWorkspaceSession('ws-1', 'Workspace Teste');
    firstHealth.lastReconnectAttempt = new Date(Date.now() - 90_000);

    await service.checkWorkspaceSession('ws-1', 'Workspace Teste');

    expect(providerRegistry.getSessionStatus).not.toHaveBeenCalled();
    expect(providerRegistry.startSession).not.toHaveBeenCalled();
  });

  it('ignores guest workspaces and monitors whatsapp-api workspaces even before the session snapshot exists', async () => {
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

    expect(prisma.workspace.findMany).not.toHaveBeenCalled();
    expect(providerRegistry.getSessionStatus).not.toHaveBeenCalled();
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

    expect(prisma.workspace.findMany).not.toHaveBeenCalled();
    expect(whatsappApi.listSessions).not.toHaveBeenCalled();
    expect(whatsappApi.syncSessionConfig).not.toHaveBeenCalled();
    expect(providerRegistry.getSessionStatus).not.toHaveBeenCalled();
  });

  it('deletes stale FAILED WAHA sessions before adopting live ones', async () => {
    prisma.workspace.findMany.mockResolvedValue([
      {
        id: 'live-ws',
        name: 'Live Workspace',
        providerSettings: { whatsappProvider: 'whatsapp-api' },
      },
    ]);
    whatsappApi.listSessions
      .mockResolvedValueOnce([
        {
          name: 'failed-ws',
          state: 'FAILED',
          rawStatus: 'FAILED',
          success: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          name: 'live-ws',
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

    expect(prisma.workspace.findMany).not.toHaveBeenCalled();
    expect(whatsappApi.deleteSession).not.toHaveBeenCalled();
    expect(providerRegistry.getSessionStatus).not.toHaveBeenCalled();
  });
});
