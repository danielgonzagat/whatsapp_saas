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

  it('uses WAHA_SESSION_ID override for session startup', async () => {
    const fetchMock = jest
      .fn()
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
      2,
      'https://waha.test/api/sessions/start',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'default' }),
      }),
    );
  });

  it('uses workspace session when sending messages', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ id: { _serialized: 'msg-1' } }),
    });
    global.fetch = fetchMock as any;

    const provider = new WhatsAppApiProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
      }),
    );

    const result = await provider.sendMessage(
      'workspace-123',
      '5511999999999',
      'hello',
    );

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://waha.test/api/sendText',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          session: 'workspace-123',
          chatId: '5511999999999@c.us',
          text: 'hello',
        }),
      }),
    );
  });
});
