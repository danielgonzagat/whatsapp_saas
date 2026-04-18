import { ConfigService } from '@nestjs/config';
import { WahaProvider } from './waha.provider';

function createConfig(values: Record<string, string>) {
  return {
    get(key: string) {
      return values[key];
    },
  } as ConfigService;
}

function createJsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: jest.fn().mockResolvedValue(payload),
    text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
  } as unknown as Response;
}

describe('WahaProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('ignores malformed WAHA session identity fields instead of stringifying objects', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      createJsonResponse({
        engine: { state: 'WORKING' },
        me: {
          id: { broken: true },
          phone: { broken: true },
          pushName: { broken: true },
          name: { broken: true },
          lid: { broken: true },
          _serialized: { broken: true },
        },
        phone: { broken: true },
        phoneNumber: { broken: true },
      }),
    ) as typeof global.fetch;

    const provider = new WahaProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
      }),
    );

    await expect(provider.getSessionStatus('ws-1')).resolves.toEqual({
      success: true,
      state: 'CONNECTED',
      message: 'WORKING',
      phoneNumber: null,
      pushName: null,
      selfIds: [],
    });
  });

  it('drops malformed WAHA session names when listing sessions', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      createJsonResponse([
        {
          name: { broken: true },
          state: 'CONNECTED',
        },
        {
          name: 'session-valid',
          me: {
            id: { broken: true },
            pushName: { broken: true },
          },
          state: 'CONNECTED',
        },
      ]),
    ) as typeof global.fetch;

    const provider = new WahaProvider(
      createConfig({
        WAHA_API_URL: 'https://waha.test',
      }),
    );

    await expect(provider.listSessions()).resolves.toEqual([
      {
        name: 'session-valid',
        success: true,
        rawStatus: 'CONNECTED',
        state: 'CONNECTED',
        phoneNumber: null,
        pushName: null,
      },
    ]);
  });
});
