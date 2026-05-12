import { FacebookCAPIService } from './facebook-capi.service';

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
}));

describe('FacebookCAPIService', () => {
  let service: FacebookCAPIService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new FacebookCAPIService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('hashes email and phone with sha256 in user_data', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    global.fetch = fetchMock as unknown as typeof fetch;

    await service.sendEvent({
      pixelId: 'pix-1',
      accessToken: 'tok',
      eventName: 'Purchase',
      email: 'TEST@Example.com',
      phone: '+5511999991234',
      amount: 5000,
      currency: 'BRL',
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.data[0].user_data.em[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(body.data[0].user_data.ph[0]).toMatch(/^[a-f0-9]{64}$/);
    // sha256 lowercase-trimmed test@example.com
    expect(body.data[0].user_data.em[0]).toBe(
      '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b',
    );
  });

  it('converts cents to currency in custom_data.value', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    global.fetch = fetchMock as unknown as typeof fetch;
    await service.sendEvent({
      pixelId: 'pix',
      accessToken: 'tok',
      eventName: 'Purchase',
      amount: 12345,
      currency: 'BRL',
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.data[0].custom_data.value).toBe(123.45);
  });

  it('returns true on 200 OK and false on non-OK', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' })
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'bad' }) as unknown as typeof fetch;

    const ok = await service.sendEvent({
      pixelId: 'p',
      accessToken: 't',
      eventName: 'Purchase',
      amount: 100,
      currency: 'BRL',
    });
    const fail = await service.sendEvent({
      pixelId: 'p',
      accessToken: 't',
      eventName: 'Purchase',
      amount: 100,
      currency: 'BRL',
    });

    expect(ok).toBe(true);
    expect(fail).toBe(false);
  });

  it('swallows fetch errors and returns false (never throws)', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const result = await service.sendEvent({
      pixelId: 'p',
      accessToken: 't',
      eventName: 'Purchase',
      amount: 100,
      currency: 'BRL',
    });
    expect(result).toBe(false);
  });

  it('targets the correct Meta Graph endpoint with the pixel id in URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    global.fetch = fetchMock as unknown as typeof fetch;
    await service.sendEvent({
      pixelId: 'my-pixel',
      accessToken: 'tok',
      eventName: 'Purchase',
      amount: 100,
      currency: 'BRL',
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://graph.facebook.com/v18.0/my-pixel/events',
    );
  });
});
