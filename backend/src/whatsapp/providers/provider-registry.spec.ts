import { WhatsAppProviderRegistry } from './provider-registry';

describe('WhatsAppProviderRegistry', () => {
  let prisma: {
    $transaction: jest.Mock;
    workspace: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let whatsappApi: {
    startSession: jest.Mock;
    getSessionConfigDiagnostics: jest.Mock;
    sendMessage: jest.Mock;
    sendMediaFromUrl: jest.Mock;
    isRegisteredUser: jest.Mock;
    ping: jest.Mock;
    getQrCode: jest.Mock;
    restartSession: jest.Mock;
    syncSessionConfig: jest.Mock;
    deleteSession: jest.Mock;
    getClientInfo: jest.Mock;
    getContacts: jest.Mock;
    upsertContactProfile: jest.Mock;
    getChats: jest.Mock;
    getChatMessages: jest.Mock;
    readChatMessages: jest.Mock;
    setPresence: jest.Mock;
    sendTyping: jest.Mock;
    stopTyping: jest.Mock;
    sendSeen: jest.Mock;
    listLidMappings: jest.Mock;
  };
  let registry: WhatsAppProviderRegistry;
  const originalEnv = {
    providerDefault: process.env.WHATSAPP_PROVIDER_DEFAULT,
    wahaApiUrl: process.env.WAHA_API_URL,
    wahaBaseUrl: process.env.WAHA_BASE_URL,
    wahaUrl: process.env.WAHA_URL,
  };

  beforeEach(() => {
    delete process.env.WHATSAPP_PROVIDER_DEFAULT;
    delete process.env.WAHA_API_URL;
    delete process.env.WAHA_BASE_URL;
    delete process.env.WAHA_URL;
    prisma = {
      $transaction: jest.fn((callback: any) => callback(prisma)),
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

    // messageLimit: enforced via PlanLimitsService.trackMessageSend
    whatsappApi = {
      startSession: jest.fn(),
      getSessionConfigDiagnostics: jest.fn(),
      sendMessage: jest.fn(),
      sendMediaFromUrl: jest.fn(),
      isRegisteredUser: jest.fn().mockResolvedValue(true),
      ping: jest.fn().mockResolvedValue(true),
      getQrCode: jest.fn().mockResolvedValue({ success: true, message: 'meta_cloud_has_no_qr' }),
      restartSession: jest.fn().mockResolvedValue({ success: true, message: 'already_connected' }),
      syncSessionConfig: jest.fn().mockResolvedValue(undefined),
      deleteSession: jest.fn().mockResolvedValue(true),
      getClientInfo: jest.fn().mockResolvedValue({ provider: 'meta-cloud' }),
      getContacts: jest.fn().mockResolvedValue([]),
      upsertContactProfile: jest.fn().mockResolvedValue(true),
      getChats: jest.fn().mockResolvedValue([]),
      getChatMessages: jest.fn().mockResolvedValue([]),
      readChatMessages: jest.fn().mockResolvedValue(undefined),
      setPresence: jest.fn().mockResolvedValue(undefined),
      sendTyping: jest.fn().mockResolvedValue(undefined),
      stopTyping: jest.fn().mockResolvedValue(undefined),
      sendSeen: jest.fn().mockResolvedValue(undefined),
      listLidMappings: jest.fn().mockResolvedValue([]),
    };

    registry = new WhatsAppProviderRegistry(
      prisma as unknown as ConstructorParameters<typeof WhatsAppProviderRegistry>[0],
      whatsappApi as unknown as ConstructorParameters<typeof WhatsAppProviderRegistry>[1],
    );
  });

  afterAll(() => {
    if (originalEnv.providerDefault === undefined) {
      delete process.env.WHATSAPP_PROVIDER_DEFAULT;
    } else {
      process.env.WHATSAPP_PROVIDER_DEFAULT = originalEnv.providerDefault;
    }
    if (originalEnv.wahaApiUrl === undefined) {
      delete process.env.WAHA_API_URL;
    } else {
      process.env.WAHA_API_URL = originalEnv.wahaApiUrl;
    }
    if (originalEnv.wahaBaseUrl === undefined) {
      delete process.env.WAHA_BASE_URL;
    } else {
      process.env.WAHA_BASE_URL = originalEnv.wahaBaseUrl;
    }
    if (originalEnv.wahaUrl === undefined) {
      delete process.env.WAHA_URL;
    } else {
      process.env.WAHA_URL = originalEnv.wahaUrl;
    }
  });

  it('normalizes the provider type to meta-cloud and persists it', async () => {
    await expect(registry.getProviderType('ws-1')).resolves.toBe('meta-cloud');
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            whatsappProvider: 'meta-cloud',
          }),
        }),
      }),
    );
  });

  it('maps session diagnostics into the persisted registry snapshot', async () => {
    whatsappApi.getSessionConfigDiagnostics.mockResolvedValue({
      state: 'CONNECTED',
      phoneNumber: '5511999999999',
      pushName: 'Loja Teste',
      authUrl: 'https://meta.test/signup',
      phoneNumberId: 'pnid-1',
      whatsappBusinessId: 'waba-1',
      error: null,
    });

    const result = await registry.getSessionStatus('ws-1');

    expect(result).toEqual({
      connected: true,
      status: 'CONNECTED',
      phoneNumber: '5511999999999',
      pushName: 'Loja Teste',
      selfIds: [],
      authUrl: 'https://meta.test/signup',
      phoneNumberId: 'pnid-1',
      whatsappBusinessId: 'waba-1',
      degradedReason: null,
    });
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            connectionStatus: 'connected',
            whatsappApiSession: expect.objectContaining({
              status: 'connected',
              phoneNumber: '5511999999999',
              pushName: 'Loja Teste',
              authUrl: 'https://meta.test/signup',
              sessionName: 'ws-1',
            }),
          }),
        }),
      }),
    );
  });

  it('ignores malformed persisted snapshot fields when live diagnostics are missing them', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        whatsappProvider: 'whatsapp-api',
        whatsappApiSession: {
          status: { broken: true },
          phoneNumber: { broken: true },
          pushName: { broken: true },
          authUrl: { broken: true },
          phoneNumberId: { broken: true },
          whatsappBusinessId: { broken: true },
        },
      },
    });
    whatsappApi.getSessionConfigDiagnostics.mockResolvedValue({
      state: 'DISCONNECTED',
      phoneNumber: null,
      pushName: null,
      authUrl: null,
      phoneNumberId: null,
      whatsappBusinessId: null,
      error: null,
    });

    const result = await registry.getSessionStatus('ws-1');

    expect(result).toEqual({
      connected: false,
      status: 'DISCONNECTED',
      phoneNumber: undefined,
      pushName: undefined,
      selfIds: [],
      authUrl: undefined,
      phoneNumberId: undefined,
      whatsappBusinessId: undefined,
      degradedReason: null,
    });
  });

  it('persists connection_required when Meta session start needs authentication', async () => {
    whatsappApi.startSession.mockResolvedValue({
      success: true,
      message: 'meta_connection_required',
      authUrl: 'https://meta.test/signup',
    });

    const result = await registry.startSession('ws-1');

    expect(result).toEqual({
      success: true,
      message: 'meta_connection_required',
      authUrl: 'https://meta.test/signup',
    });
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            whatsappApiSession: expect.objectContaining({
              status: 'connection_required',
              authUrl: 'https://meta.test/signup',
              sessionName: 'ws-1',
            }),
          }),
        }),
      }),
    );
  });

  it('delegates text and media sends through the active provider', async () => {
    whatsappApi.sendMessage.mockResolvedValue({
      success: true,
      message: { id: 'msg-1' },
    });
    whatsappApi.sendMediaFromUrl.mockResolvedValue({
      success: true,
      message: { id: 'media-1' },
    });

    await expect(registry.sendMessage('ws-1', '5511999999999', 'Oi')).resolves.toEqual({
      success: true,
      messageId: 'msg-1',
    });
    await expect(
      registry.sendMessage('ws-1', '5511999999999', 'Legenda', {
        mediaUrl: 'https://cdn.kloel.test/image.png',
        mediaType: 'image',
      }),
    ).resolves.toEqual({
      success: true,
      messageId: 'media-1',
    });
  });

  it('marks the local snapshot as disconnected on logout', async () => {
    const result = await registry.logout('ws-1');

    expect(result).toEqual({
      success: true,
      message: 'disconnected',
    });
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
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

  it('preserves WAHA QR-pending state as connecting in the persisted snapshot', async () => {
    process.env.WHATSAPP_PROVIDER_DEFAULT = 'whatsapp-api';
    process.env.WAHA_API_URL = 'https://waha.test';

    const wahaProvider = {
      getSessionStatus: jest.fn().mockResolvedValue({
        success: true,
        state: 'SCAN_QR_CODE',
        message: 'SCAN_QR_CODE',
        phoneNumber: null,
        pushName: null,
        selfIds: [],
      }),
      getQrCode: jest.fn().mockResolvedValue({
        success: true,
        qr: 'data:image/png;base64,qr-live',
      }),
    };

    const wahaRegistry = new WhatsAppProviderRegistry(
      prisma as unknown as ConstructorParameters<typeof WhatsAppProviderRegistry>[0],
      whatsappApi as unknown as ConstructorParameters<typeof WhatsAppProviderRegistry>[1],
      wahaProvider as unknown as ConstructorParameters<typeof WhatsAppProviderRegistry>[2],
    );
    const result = await wahaRegistry.getSessionStatus('ws-1');

    expect(result).toEqual({
      connected: false,
      status: 'SCAN_QR_CODE',
      phoneNumber: undefined,
      pushName: undefined,
      selfIds: [],
    });
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            connectionStatus: 'connecting',
            whatsappApiSession: expect.objectContaining({
              status: 'connecting',
              rawStatus: 'SCAN_QR_CODE',
              disconnectReason: 'SCAN_QR_CODE',
              sessionName: 'ws-1',
            }),
          }),
        }),
      }),
    );
  });
});
