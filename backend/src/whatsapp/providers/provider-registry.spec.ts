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

    registry = new WhatsAppProviderRegistry(prisma, whatsappApi);
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
      message: 'Meta WhatsApp channel marked as disconnected locally',
    });
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            whatsappApiSession: expect.objectContaining({
              status: 'disconnected',
              disconnectReason: 'disconnected_by_user',
              qrCode: null,
            }),
          }),
        }),
      }),
    );
  });
});
