import { WhatsAppProviderRegistry } from './provider-registry';

describe('WhatsAppProviderRegistry', () => {
  let prisma: any;
  let whatsappApi: any;
  let registry: WhatsAppProviderRegistry;

  beforeEach(() => {
    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          providerSettings: {
            whatsappProvider: 'whatsapp-api',
            whatsappApiSession: {},
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    whatsappApi = {
      getResolvedSessionId: jest
        .fn()
        .mockImplementation((workspaceId) => workspaceId),
      getSessionStatus: jest.fn(),
      startSession: jest.fn(),
      listSessions: jest.fn().mockResolvedValue([]),
      syncSessionConfig: jest.fn().mockResolvedValue(undefined),
      getQrCode: jest.fn(),
      terminateSession: jest.fn(),
      logoutSession: jest.fn(),
    };

    registry = new WhatsAppProviderRegistry(prisma, whatsappApi);
  });

  it('returns QR state without mutating session flow', async () => {
    whatsappApi.getSessionStatus.mockResolvedValue({
      success: true,
      state: 'SCAN_QR_CODE',
      message: 'SCAN_QR_CODE',
      phoneNumber: null,
      pushName: null,
    });
    whatsappApi.getQrCode.mockResolvedValue({
      success: true,
      qr: 'data:image/png;base64,qr',
    });

    const result = await registry.getSessionStatus('ws-1');

    expect(result.connected).toBe(false);
    expect(result.status).toBe('SCAN_QR_CODE');
    expect(result.qrCode).toBe('data:image/png;base64,qr');
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            whatsappApiSession: expect.objectContaining({
              status: 'qr_pending',
              qrCode: 'data:image/png;base64,qr',
            }),
          }),
        }),
      }),
    );
  });

  it('persists connected session metadata from WAHA status', async () => {
    whatsappApi.getSessionStatus.mockResolvedValue({
      success: true,
      state: 'CONNECTED',
      message: 'WORKING',
      phoneNumber: '5511999999999@c.us',
      pushName: 'Loja Teste',
    });

    const result = await registry.getSessionStatus('ws-1');

    expect(result.connected).toBe(true);
    expect(result.phoneNumber).toBe('5511999999999@c.us');
    expect(result.pushName).toBe('Loja Teste');
    expect(whatsappApi.syncSessionConfig).toHaveBeenCalledWith('ws-1');
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            whatsappApiSession: expect.objectContaining({
              status: 'connected',
              phoneNumber: '5511999999999@c.us',
              pushName: 'Loja Teste',
            }),
          }),
        }),
      }),
    );
  });

  it('treats WAHA FAILED as disconnected even with persisted connected metadata', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        whatsappProvider: 'whatsapp-api',
        whatsappApiSession: {
          status: 'connected',
          phoneNumber: '556792369752@c.us',
          pushName: 'Alice',
        },
      },
    });
    whatsappApi.getSessionStatus.mockResolvedValue({
      success: true,
      state: 'FAILED',
      message: 'FAILED',
      phoneNumber: '556792369752@c.us',
      pushName: 'Alice',
    });
    whatsappApi.getQrCode.mockResolvedValue({ success: false });

    const result = await registry.getSessionStatus('ws-1');

    expect(result.connected).toBe(false);
    expect(result.status).toBe('FAILED');
    expect(result.phoneNumber).toBeUndefined();
    expect(result.pushName).toBeUndefined();
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            connectionStatus: 'failed',
            whatsappApiSession: expect.objectContaining({
              status: 'failed',
              phoneNumber: null,
              pushName: null,
              connectedAt: null,
            }),
          }),
        }),
      }),
    );
  });

  it('marks missing WAHA sessions as disconnected and clears stale identity', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        whatsappProvider: 'whatsapp-api',
        whatsappApiSession: {
          status: 'connected',
          phoneNumber: '556792369752@c.us',
          pushName: 'Alice',
          qrCode: 'stale-qr',
        },
      },
    });
    whatsappApi.getSessionStatus.mockResolvedValue({
      success: false,
      state: null,
      message: 'Session "ws-1" does not exist',
    });

    const result = await registry.getSessionStatus('ws-1');

    expect(result).toEqual({
      connected: false,
      status: 'DISCONNECTED',
      phoneNumber: undefined,
      pushName: undefined,
      qrCode: undefined,
    });
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            connectionStatus: 'disconnected',
            whatsappApiSession: expect.objectContaining({
              status: 'disconnected',
              phoneNumber: null,
              pushName: null,
              qrCode: null,
              connectedAt: null,
              disconnectReason: 'Session "ws-1" does not exist',
            }),
          }),
        }),
      }),
    );
  });

  it('recovers a rotated WAHA session by matching the same phone number', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        whatsappProvider: 'whatsapp-api',
        whatsappApiSession: {
          status: 'connected',
          sessionName: 'old-session',
          phoneNumber: '556282944223@c.us',
          pushName: 'Ana Julia Atendimento',
          qrCode: 'stale-qr',
        },
      },
    });
    whatsappApi.getSessionStatus.mockResolvedValue({
      success: false,
      state: null,
      message: 'Session "ws-1" does not exist',
    });
    whatsappApi.listSessions.mockResolvedValue([
      {
        name: '7730136a-e16d-481a-9548-6e801f8e0622',
        success: true,
        rawStatus: 'WORKING',
        state: 'CONNECTED',
        phoneNumber: '556282944223@c.us',
        pushName: 'Ana Julia Atendimento',
      },
    ]);

    const result = await registry.getSessionStatus('ws-1');

    expect(result).toEqual({
      connected: true,
      status: 'CONNECTED',
      phoneNumber: '556282944223@c.us',
      pushName: 'Ana Julia Atendimento',
      qrCode: undefined,
    });
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            whatsappApiSession: expect.objectContaining({
              sessionName: '7730136a-e16d-481a-9548-6e801f8e0622',
              status: 'connected',
              phoneNumber: '556282944223@c.us',
            }),
          }),
        }),
      }),
    );
  });

  it('delegates logout to the WAHA provider and resets snapshot', async () => {
    whatsappApi.logoutSession.mockResolvedValue({
      success: true,
      message: 'session_logged_out',
    });

    const result = await registry.logout('ws-1');

    expect(result.success).toBe(true);
    expect(whatsappApi.logoutSession).toHaveBeenCalledWith('ws-1');
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            whatsappApiSession: expect.objectContaining({
              status: 'disconnected',
              qrCode: null,
            }),
          }),
        }),
      }),
    );
  });

  it('does not restart an already connected WAHA session', async () => {
    whatsappApi.getSessionStatus.mockResolvedValue({
      success: true,
      state: 'CONNECTED',
      message: 'WORKING',
      phoneNumber: '5511999999999@c.us',
      pushName: 'Loja Teste',
    });

    const result = await registry.startSession('ws-1');

    expect(result).toEqual({
      success: true,
      qrCode: undefined,
      message: 'already_connected',
    });
    expect(whatsappApi.startSession).not.toHaveBeenCalled();
  });

  it('starts the persisted WAHA session name instead of forcing the workspace id', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        whatsappProvider: 'whatsapp-api',
        whatsappApiSession: {
          sessionName: '7730136a-e16d-481a-9548-6e801f8e0622',
        },
      },
    });
    whatsappApi.getSessionStatus
      .mockResolvedValueOnce({
        success: false,
        state: null,
        message: 'session_missing',
      })
      .mockResolvedValueOnce({
        success: false,
        state: 'STARTING',
        message: 'STARTING',
      });
    whatsappApi.startSession.mockResolvedValue({
      success: true,
      message: 'session_start_requested',
    });

    const result = await registry.startSession('ws-1');

    expect(whatsappApi.startSession).toHaveBeenCalledWith(
      '7730136a-e16d-481a-9548-6e801f8e0622',
    );
    expect(result).toEqual({
      success: true,
      qrCode: undefined,
      message: 'session_start_requested',
    });
  });
});
