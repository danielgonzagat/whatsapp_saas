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
      getResolvedSessionId: jest.fn().mockImplementation((workspaceId) => workspaceId),
      getSessionStatus: jest.fn(),
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

  it('keeps the workspace connected when WAHA reports FAILED but the persisted snapshot is connected', async () => {
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

    expect(result.connected).toBe(true);
    expect(result.status).toBe('CONNECTED');
    expect(result.phoneNumber).toBe('556792369752@c.us');
    expect(result.pushName).toBe('Alice');
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
});
