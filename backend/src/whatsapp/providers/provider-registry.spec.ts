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
      getSessionStatus: jest.fn(),
      restartSession: jest.fn(),
      getQrCode: jest.fn(),
    };

    registry = new WhatsAppProviderRegistry(prisma, whatsappApi);
  });

  it('does not restart session while QR scan is pending', async () => {
    whatsappApi.getSessionStatus.mockResolvedValue({
      success: true,
      state: 'SCAN_QR_CODE',
      message: 'SCAN_QR_CODE',
    });
    whatsappApi.getQrCode.mockResolvedValue({
      success: true,
      qr: 'data:image/png;base64,qr',
    });

    const result = await registry.getSessionStatus('ws-1');

    expect(result.connected).toBe(false);
    expect(result.status).toBe('SCAN_QR_CODE');
    expect(result.qrCode).toBe('data:image/png;base64,qr');
    expect(whatsappApi.restartSession).not.toHaveBeenCalled();
  });

  it('restarts disconnected sessions outside the protected QR states', async () => {
    whatsappApi.getSessionStatus
      .mockResolvedValueOnce({
        success: true,
        state: 'FAILED',
        message: 'FAILED',
      })
      .mockResolvedValueOnce({
        success: true,
        state: 'CONNECTED',
        message: 'WORKING',
      });
    whatsappApi.getQrCode.mockResolvedValue({ success: false, qr: undefined });
    whatsappApi.restartSession.mockResolvedValue({
      success: true,
      message: 'session_started',
    });

    const result = await registry.getSessionStatus('ws-1');

    expect(whatsappApi.restartSession).toHaveBeenCalledWith('ws-1');
    expect(result.connected).toBe(true);
    expect(result.status).toBe('CONNECTED');
  });
});
