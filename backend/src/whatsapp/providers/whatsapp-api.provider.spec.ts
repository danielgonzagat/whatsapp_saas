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
});
