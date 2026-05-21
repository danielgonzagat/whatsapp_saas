import { FacebookCAPIService } from './facebook-capi.service';

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
}));

jest.mock('../common/trace-headers', () => ({
  getTraceHeaders: jest.fn().mockReturnValue({ 'X-Request-ID': 'test-id' }),
}));

const makeEventData = (
  overrides: Partial<{
    pixelId: string;
    accessToken: string;
    eventName: string;
    email: string;
    phone: string;
    amount: number;
    currency: string;
    productId: string;
    ip: string;
    userAgent: string;
  }> = {},
) => ({
  pixelId: '1234567890',
  accessToken: 'test-access-token',
  eventName: 'Purchase',
  amount: 5000,
  currency: 'BRL',
  ...overrides,
});

describe('FacebookCAPIService', () => {
  let service: FacebookCAPIService;
  let fetchSpy: jest.Mock;

  beforeEach(() => {
    fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy;
    jest.clearAllMocks();
    service = new FacebookCAPIService();
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).fetch;
  });

  describe('sendEvent', () => {
    it('sends event successfully when fetch returns ok', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
      });

      const result = await service.sendEvent(makeEventData());

      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toContain('graph.facebook.com/v18.0/1234567890/events');
      const body = JSON.parse(init.body);
      expect(body.data[0].event_name).toBe('Purchase');
    });

    it('returns false on HTTP error', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      });

      const result = await service.sendEvent(makeEventData());

      expect(result).toBe(false);
    });

    it('returns false and never throws on network error', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.sendEvent(makeEventData());

      expect(result).toBe(false);
    });

    it('hashes email and phone with SHA-256', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
      });

      await service.sendEvent(makeEventData({ email: 'Test@Example.com', phone: '5511999999999' }));

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(init.body);
      const userData = body.data[0].user_data;
      expect(userData.em).toHaveLength(1);
      expect(userData.em[0]).toHaveLength(64); // SHA-256 hex
      expect(userData.em[0]).not.toBe('Test@Example.com');
      expect(userData.ph).toHaveLength(1);
      expect(userData.ph[0]).toHaveLength(64);
      expect(userData.ph[0]).not.toBe('5511999999999');
    });

    it('converts amount from cents to currency units', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
      });

      await service.sendEvent(makeEventData({ amount: 15000 }));

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.data[0].custom_data.value).toBe(150);
    });

    it('sets client_ip_address and client_user_agent when provided', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
      });

      await service.sendEvent(makeEventData({ ip: '1.2.3.4', userAgent: 'Chrome/120' }));

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(init.body);
      const userData = body.data[0].user_data;
      expect(userData.client_ip_address).toBe('1.2.3.4');
      expect(userData.client_user_agent).toBe('Chrome/120');
    });

    it('includes content_ids when productId is provided', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
      });

      await service.sendEvent(makeEventData({ productId: 'prod-123' }));

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.data[0].custom_data.content_ids).toEqual(['prod-123']);
    });

    it('sends empty content_ids array when productId is absent', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
      });

      await service.sendEvent(makeEventData({ productId: undefined }));

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.data[0].custom_data.content_ids).toEqual([]);
    });
  });
});
