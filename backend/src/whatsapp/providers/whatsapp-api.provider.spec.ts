import { ConfigService } from '@nestjs/config';
import { WhatsAppApiProvider } from './whatsapp-api.provider';

describe('WhatsAppApiProvider', () => {
  const originalFetch = global.fetch;

  const createConfig = (overrides: Record<string, string | undefined> = {}) =>
    ({
      get: (key: string) => overrides[key],
    }) as ConfigService;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('fails fast when WAHA base URL is missing', () => {
    expect(
      () =>
        new WhatsAppApiProvider(
          createConfig({
            WAHA_API_KEY: 'secret',
          }),
        ),
    ).toThrow('WAHA_API_URL/WAHA_BASE_URL/WAHA_URL not configured');
  });

  it('uses workspace session by default for WAHA Plus compatible setups', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ status: 'WORKING' }),
    });
    global.fetch = fetchMock as any;

    const provider = new WhatsAppApiProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
        WAHA_API_KEY: 'secret',
      }),
    );

    const result = await provider.getSessionStatus('workspace-123');

    expect(result.state).toBe('CONNECTED');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://waha.test/api/sessions/workspace-123',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-Api-Key': 'secret',
        }),
      }),
    );
  });

  it('prioritizes a connected engine state over a conflicting FAILED top-level status', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          status: 'FAILED',
          engine: { state: 'WORKING' },
          me: { id: '556792369752@c.us', pushName: 'Alice' },
        }),
    });
    global.fetch = fetchMock as any;

    const provider = new WhatsAppApiProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
      }),
    );

    const result = await provider.getSessionStatus('workspace-123');

    expect(result.success).toBe(true);
    expect(result.state).toBe('CONNECTED');
    expect(result.message).toBe('WORKING');
    expect(result.phoneNumber).toBe('556792369752@c.us');
    expect(result.pushName).toBe('Alice');
  });

  it('ignores the legacy connected boolean when the normalized WAHA state is disconnected', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          status: 'DISCONNECTED',
          connected: true,
          me: { id: '556792369752@c.us', pushName: 'Alice' },
        }),
    });
    global.fetch = fetchMock as any;

    const provider = new WhatsAppApiProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
      }),
    );

    const result = await provider.getSessionStatus('workspace-123');

    expect(result.success).toBe(true);
    expect(result.state).toBe('DISCONNECTED');
    expect(result.message).toBe('DISCONNECTED');
  });

  it('keeps using the workspace session even when single-session mode is enabled', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ status: 'WORKING' }),
    });
    global.fetch = fetchMock as any;

    const provider = new WhatsAppApiProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
        WAHA_SINGLE_SESSION: 'true',
      }),
    );

    const result = await provider.getSessionStatus('workspace-123');

    expect(result.state).toBe('CONNECTED');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://waha.test/api/sessions/workspace-123',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('ignores default overrides when the workspace session is available', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ status: 'WORKING' }),
    });
    global.fetch = fetchMock as any;

    const provider = new WhatsAppApiProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
        WAHA_SESSION_ID: 'default',
        WHATSAPP_HOOK_URL: 'https://api.kloel.com/webhooks/whatsapp-api',
      }),
    );

    const result = await provider.getSessionStatus('workspace-123');

    expect(result.state).toBe('CONNECTED');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://waha.test/api/sessions/workspace-123',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('starts sessions through the granular WAHA endpoint after ensuring the session exists', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'STOPPED' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({}),
      });
    global.fetch = fetchMock as any;

    const provider = new WhatsAppApiProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
        WAHA_SESSION_ID: 'default',
        WHATSAPP_HOOK_URL: 'https://api.kloel.com/webhooks/whatsapp-api',
      }),
    );

    const result = await provider.startSession('workspace-123');

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://waha.test/api/sessions/workspace-123/start',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('updates an existing session with webhook config instead of leaving stale settings', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'STOPPED' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({}),
      });
    global.fetch = fetchMock as any;

    const provider = new WhatsAppApiProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
        WHATSAPP_HOOK_URL: 'https://api.kloel.com/webhooks/whatsapp-api',
        WHATSAPP_HOOK_EVENTS: 'message,message.any,session.status',
        WHATSAPP_API_WEBHOOK_SECRET: 'hook-secret',
      }),
    );

    const result = await provider.startSession('workspace-123');

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://waha.test/api/sessions/workspace-123',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          config: {
            webhooks: [
              {
                url: 'https://api.kloel.com/webhooks/whatsapp-api',
                events: ['message', 'message.any', 'session.status'],
                hmac: undefined,
                customHeaders: [
                  { name: 'X-Api-Key', value: 'hook-secret' },
                ],
              },
            ],
            store: {
              enabled: true,
              fullSync: true,
              full_sync: true,
            },
            noweb: {
              store: {
                enabled: true,
                fullSync: true,
                full_sync: true,
              },
            },
          },
        }),
      }),
    );
  });

  it('derives the WAHA webhook URL from the public backend domain when the hook env is missing', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'STOPPED' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({}),
      });
    global.fetch = fetchMock as any;

    const provider = new WhatsAppApiProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
        BACKEND_URL: 'http://backend:3001',
        RAILWAY_PUBLIC_DOMAIN: 'whatsappsaas-copy-production.up.railway.app',
      }),
    );

    const result = await provider.startSession('workspace-123');

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://waha.test/api/sessions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'workspace-123',
          config: {
            webhooks: [
              {
                url: 'https://whatsappsaas-copy-production.up.railway.app/webhooks/whatsapp-api',
                events: [
                  'session.status',
                  'message',
                  'message.any',
                  'message.ack',
                ],
                hmac: undefined,
                customHeaders: undefined,
              },
            ],
            store: {
              enabled: true,
              fullSync: true,
              full_sync: true,
            },
            noweb: {
              store: {
                enabled: true,
                fullSync: true,
                full_sync: true,
              },
            },
          },
        }),
      }),
    );
  });

  it('allows explicitly internal webhook URLs only when the override env is enabled', async () => {
    const provider = new WhatsAppApiProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
        WHATSAPP_HOOK_URL: 'http://backend:3001/webhooks/whatsapp-api',
        WAHA_ALLOW_INTERNAL_WEBHOOK_URL: 'true',
      }),
    );

    expect(provider.getRuntimeConfigDiagnostics()).toEqual({
      webhookUrl: 'http://backend:3001/webhooks/whatsapp-api',
      webhookConfigured: true,
      inboundEventsConfigured: true,
      events: ['session.status', 'message', 'message.any', 'message.ack'],
      secretConfigured: false,
      storeEnabled: true,
      storeFullSync: true,
      allowSessionWithoutWebhook: false,
      allowInternalWebhookUrl: true,
    });
  });

  it('honors NOWEB store env aliases when building the WAHA session config', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'STOPPED' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({}),
      });
    global.fetch = fetchMock as any;

    const provider = new WhatsAppApiProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
        WAHA_NOWEB_STORE_ENABLED: 'true',
        WAHA_NOWEB_STORE_FULL_SYNC: 'false',
        WAHA_ALLOW_SESSION_WITHOUT_WEBHOOK: 'true',
      }),
    );

    const result = await provider.startSession('workspace-123');

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://waha.test/api/sessions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'workspace-123',
          config: {
            webhooks: undefined,
            store: {
              enabled: true,
              fullSync: false,
              full_sync: false,
            },
            noweb: {
              store: {
                enabled: true,
                fullSync: false,
                full_sync: false,
              },
            },
          },
        }),
      }),
    );
  });

  it('prefers POST auth/qr and converts returned images to data URLs', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (header: string) =>
          header.toLowerCase() === 'content-type' ? 'image/png' : null,
      },
      arrayBuffer: async () => Buffer.from('png-bytes'),
      text: async () => '',
    });
    global.fetch = fetchMock as any;

    const provider = new WhatsAppApiProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
      }),
    );

    const result = await provider.getQrCode('workspace-123');

    expect(result.success).toBe(true);
    expect(result.qr).toMatch(/^data:image\/png;base64,/);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://waha.test/api/workspace-123/auth/qr',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'image/png, application/json',
        }),
      }),
    );
  });

  it('lists WAHA sessions and normalizes their engine state', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([
          {
            name: 'live-session',
            status: 'FAILED',
            engine: { state: 'WORKING' },
            me: { id: '5511999999999@c.us', pushName: 'Loja Teste' },
          },
          {
            name: 'qr-session',
            status: 'SCAN_QR_CODE',
          },
        ]),
    });
    global.fetch = fetchMock as any;

    const provider = new WhatsAppApiProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
      }),
    );

    const sessions = await provider.listSessions();

    expect(sessions).toEqual([
      {
        name: 'live-session',
        success: true,
        rawStatus: 'WORKING',
        state: 'CONNECTED',
        phoneNumber: '5511999999999@c.us',
        pushName: 'Loja Teste',
      },
      {
        name: 'qr-session',
        success: true,
        rawStatus: 'SCAN_QR_CODE',
        state: 'SCAN_QR_CODE',
        phoneNumber: null,
        pushName: null,
      },
    ]);
  });

  it('skips the slow chats overview endpoint for a while after it fails once', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        text: async () => JSON.stringify({ message: 'timeout' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify([{ id: 'chat-1', unreadCount: 1 }]),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify([{ id: 'chat-2', unreadCount: 2 }]),
      });
    global.fetch = fetchMock as any;

    const provider = new WhatsAppApiProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
      }),
    );

    const first = await provider.getChats('workspace-123');
    const second = await provider.getChats('workspace-123');

    expect(first).toEqual([{ id: 'chat-1', unreadCount: 1 }]);
    expect(second).toEqual([{ id: 'chat-2', unreadCount: 2 }]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://waha.test/api/workspace-123/chats/overview',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://waha.test/api/workspace-123/chats',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://waha.test/api/workspace-123/chats',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('accepts WAHA_BASE_URL and WAHA_API_TOKEN legacy aliases', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ status: 'WORKING' }),
    });
    global.fetch = fetchMock as any;

    const provider = new WhatsAppApiProvider(
      createConfig({
        WAHA_BASE_URL: 'https://legacy-waha.test',
        WAHA_API_TOKEN: 'legacy-secret',
      }),
    );

    const result = await provider.getSessionStatus('workspace-legacy');

    expect(result.state).toBe('CONNECTED');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://legacy-waha.test/api/sessions/workspace-legacy',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-Api-Key': 'legacy-secret',
        }),
      }),
    );
  });

  it('exposes runtime diagnostics for webhook and store configuration', () => {
    const provider = new WhatsAppApiProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
        WHATSAPP_HOOK_URL: 'https://api.kloel.com/webhooks/whatsapp-api',
        WHATSAPP_HOOK_EVENTS: 'message,message.any,session.status',
        WHATSAPP_API_WEBHOOK_SECRET: 'hook-secret',
      }),
    );

    expect(provider.getRuntimeConfigDiagnostics()).toEqual({
      webhookUrl: 'https://api.kloel.com/webhooks/whatsapp-api',
      webhookConfigured: true,
      inboundEventsConfigured: true,
      events: ['message', 'message.any', 'session.status'],
      secretConfigured: true,
      storeEnabled: true,
      storeFullSync: true,
      allowSessionWithoutWebhook: false,
      allowInternalWebhookUrl: false,
    });
  });

  it('fails to start a session when no public webhook is configured', async () => {
    const provider = new WhatsAppApiProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
      }),
    );

    await expect(provider.startSession('workspace-123')).rejects.toThrow(
      'WAHA webhook URL not configured or not publicly reachable',
    );
  });
});
