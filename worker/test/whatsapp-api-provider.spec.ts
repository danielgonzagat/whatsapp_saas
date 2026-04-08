import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('whatsappApiProvider', () => {
  const originalEnv = {
    BACKEND_URL: process.env.BACKEND_URL,
    API_URL: process.env.API_URL,
    INTERNAL_API_KEY: process.env.INTERNAL_API_KEY,
  };
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.BACKEND_URL;
    delete process.env.API_URL;
    delete process.env.INTERNAL_API_KEY;
  });

  afterEach(() => {
    process.env.BACKEND_URL = originalEnv.BACKEND_URL;
    process.env.API_URL = originalEnv.API_URL;
    process.env.INTERNAL_API_KEY = originalEnv.INTERNAL_API_KEY;
    global.fetch = originalFetch;
  });

  it('throws when backend URL is not configured instead of using a hidden default', async () => {
    const { whatsappApiProvider } = await import('../providers/whatsapp-api-provider');

    await expect(
      whatsappApiProvider.sendText({ id: 'ws-1' }, '5511999999999', 'Oi'),
    ).rejects.toThrow('BACKEND_URL/API_URL not configured');
  });

  it('reads session status from the backend internal runtime endpoint', async () => {
    process.env.BACKEND_URL = 'https://api.kloel.test';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        connected: true,
        status: 'CONNECTED',
        phoneNumber: '+55 11 99999-9999',
      }),
    });
    global.fetch = fetchMock as any;

    const { whatsappApiProvider } = await import('../providers/whatsapp-api-provider');
    const result = await whatsappApiProvider.getStatus('ws-1');

    expect(result.connected).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.kloel.test/internal/whatsapp-runtime/status?workspaceId=ws-1',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('sends text messages through the backend runtime proxy with the internal key', async () => {
    process.env.BACKEND_URL = 'https://api.kloel.test';
    process.env.INTERNAL_API_KEY = 'internal-secret';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        messageId: 'wamid.123',
      }),
    });
    global.fetch = fetchMock as any;

    const { whatsappApiProvider } = await import('../providers/whatsapp-api-provider');
    const result = await whatsappApiProvider.sendText({ id: 'ws-1' }, '5511999999999', 'Oi', {
      quotedMessageId: 'wamid.quote',
    });

    expect(result).toEqual({
      success: true,
      messageId: 'wamid.123',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.kloel.test/internal/whatsapp-runtime/send-text',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Internal-Key': 'internal-secret',
        }),
        body: JSON.stringify({
          workspaceId: 'ws-1',
          to: '5511999999999',
          message: 'Oi',
          quotedMessageId: 'wamid.quote',
          externalId: undefined,
        }),
      }),
    );
  });
});
