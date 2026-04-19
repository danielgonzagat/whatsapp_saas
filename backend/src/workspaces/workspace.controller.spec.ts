import { WorkspaceController } from './workspace.controller';

describe('WorkspaceController', () => {
  const service = {
    getWorkspace: jest.fn(),
    patchSettings: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sanitizes providerSettings secrets while preserving operational status fields', async () => {
    service.getWorkspace.mockResolvedValue({
      providerSettings: {
        whatsappProvider: 'meta-cloud',
        connectionStatus: 'CONNECTED',
        whatsappApiSession: {
          status: 'CONNECTED',
          authUrl: 'https://meta.example/connect',
          qrCode: 'data:image/png;base64,abc',
          phoneNumberId: 'pn-1',
          whatsappBusinessId: 'waba-1',
          accessToken: 'meta-secret-token',
        },
        calendar: {
          provider: 'google',
          credentials: {
            clientId: 'client-id',
            clientSecret: 'client-secret',
            refreshToken: 'refresh-token',
            accessToken: 'access-token',
          },
        },
        integrations: {
          apiKey: 'api-key',
          nested: {
            secret: 'nested-secret',
            token: 'nested-token',
          },
        },
      },
      jitterMin: 3,
      jitterMax: 9,
      customDomain: 'app.kloel.com',
      branding: { theme: 'terminator' },
    });

    const controller = new WorkspaceController(service);

    await expect(
      controller.getSettings({ user: { workspaceId: 'ws-1' } } as any, 'ws-1'),
    ).resolves.toEqual({
      providerSettings: {
        whatsappProvider: 'meta-cloud',
        connectionStatus: 'connected',
        whatsappApiSession: expect.objectContaining({
          status: 'connected',
          authUrl: 'https://meta.example/connect',
          qrCode: null,
          phoneNumberId: 'pn-1',
          whatsappBusinessId: 'waba-1',
        }),
        calendar: {
          provider: 'google',
          credentials: {
            configured: true,
          },
        },
        integrations: {
          nested: {},
        },
      },
      jitterMin: 3,
      jitterMax: 9,
      customDomain: 'app.kloel.com',
      branding: { theme: 'terminator' },
    });
  });

  it('normalizes legacy runtime disconnect reasons before sending providerSettings back to the browser', async () => {
    service.getWorkspace.mockResolvedValue({
      providerSettings: {
        whatsappProvider: 'whatsapp-api',
        connectionStatus: 'SCAN_QR_CODE',
        whatsappApiSession: {
          status: 'SCAN_QR_CODE',
          rawStatus: 'SCAN_QR_CODE',
          disconnectReason: 'waha_qr_pending',
          qrCode: 'data:image/png;base64,abc',
        },
      },
      jitterMin: 3,
      jitterMax: 9,
      customDomain: 'app.kloel.com',
      branding: { theme: 'terminator' },
    });

    const controller = new WorkspaceController(service);

    await expect(
      controller.getSettings({ user: { workspaceId: 'ws-legacy' } } as any, 'ws-legacy'),
    ).resolves.toEqual(
      expect.objectContaining({
        providerSettings: expect.objectContaining({
          whatsappProvider: 'legacy-runtime',
          whatsappApiSession: expect.objectContaining({
            provider: 'legacy-runtime',
            status: 'connecting',
            disconnectReason: 'legacy_runtime_qr_pending',
            qrCode: null,
          }),
        }),
      }),
    );
  });

  it('sanitizes raw workspace payloads returned by get()', async () => {
    service.getWorkspace.mockResolvedValue({
      id: 'ws-1',
      name: 'Workspace Seguro',
      providerSettings: {
        connectionStatus: 'CONNECTED',
        whatsappApiSession: {
          status: 'CONNECTED',
          authUrl: 'https://meta.example/connect',
          phoneNumberId: 'pn-1',
          accessToken: 'meta-secret-token',
        },
        calendar: {
          provider: 'google',
          credentials: {
            clientSecret: 'client-secret',
          },
        },
      },
    });

    const controller = new WorkspaceController(service);

    await expect(controller.get({ user: { workspaceId: 'ws-1' } } as any, 'ws-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'ws-1',
        name: 'Workspace Seguro',
        providerSettings: expect.objectContaining({
          connectionStatus: 'connected',
          whatsappApiSession: expect.objectContaining({
            authUrl: 'https://meta.example/connect',
            phoneNumberId: 'pn-1',
          }),
          calendar: {
            provider: 'google',
            credentials: {
              configured: true,
            },
          },
        }),
      }),
    );
  });

  it('sanitizes workspace payloads returned by setSettings()', async () => {
    service.patchSettings.mockResolvedValue({
      id: 'ws-1',
      name: 'Workspace Seguro',
      providerSettings: {
        connectionStatus: 'CONNECTED',
        calendar: {
          provider: 'google',
          credentials: {
            refreshToken: 'refresh-token',
          },
        },
        integrations: {
          apiKey: 'api-key',
        },
      },
    });

    const controller = new WorkspaceController(service);

    await expect(
      controller.setSettings(
        { user: { workspaceId: 'ws-1' } } as any,
        'ws-1',
        { calendar: { provider: 'google' } } as any,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'ws-1',
        providerSettings: expect.objectContaining({
          connectionStatus: 'connected',
          calendar: {
            provider: 'google',
            credentials: {
              configured: true,
            },
          },
          integrations: {},
        }),
      }),
    );
  });
});
