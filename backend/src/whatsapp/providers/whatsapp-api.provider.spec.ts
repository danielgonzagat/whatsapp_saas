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

  it('uses default session when single-session mode is explicitly enabled', async () => {
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
      'https://waha.test/api/sessions/default',
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
        text: async () => JSON.stringify({ status: 'STOPPED' }),
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
      3,
      'https://waha.test/api/sessions/default/start',
      expect.objectContaining({
        method: 'POST',
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
