import { HealthCheckError } from '@nestjs/terminus';
import { EmailHealthIndicator } from './email.health-indicator';

describe('EmailHealthIndicator', () => {
  const originalFetch = global.fetch;
  let indicator: EmailHealthIndicator;

  const buildJsonResponse = (status: number, ok = status >= 200 && status < 300) => ({
    ok,
    status,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    indicator = new EmailHealthIndicator();
    process.env.RESEND_API_KEY = 'test-resend-key';
    process.env.SENDGRID_API_KEY = '';
    process.env.SMTP_HOST = '';
    process.env.SMTP_PORT = '';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.RESEND_API_KEY = '';
    process.env.SENDGRID_API_KEY = '';
    process.env.SMTP_HOST = '';
    process.env.SMTP_PORT = '';
  });

  it('fails when no email provider is configured', async () => {
    process.env.RESEND_API_KEY = '';

    await expect(indicator.isHealthy('email')).rejects.toThrow(HealthCheckError);
    await expect(indicator.isHealthy('email')).rejects.toMatchObject({
      message: 'Email provider not configured',
    });
  });

  it('returns healthy when resend returns 200', async () => {
    const fetchMock = jest.fn().mockResolvedValue(buildJsonResponse(200));
    global.fetch = fetchMock as never;

    const result = await indicator.isHealthy('email');

    expect(result.email.status).toBe('up');
    expect(result.email.provider).toBe('resend');
    expect(result.email.connectivity).toBe('HTTP 200');
    expect(result.email.attempts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on transient HTTP errors and returns healthy after retry', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('connectivity temporary'))
      .mockResolvedValueOnce(buildJsonResponse(200));
    global.fetch = fetchMock as never;

    const result = await indicator.isHealthy('email');

    expect(result.email.status).toBe('up');
    expect(result.email.connectivity).toBe('HTTP 200');
    expect(result.email.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('marks health degraded when provider returns non-2xx', async () => {
    const fetchMock = jest.fn().mockResolvedValue(buildJsonResponse(403, false));
    global.fetch = fetchMock as never;

    const result = await indicator.isHealthy('email');

    expect(result.email.status).toBe('down');
    expect(result.email.connectivity).toBe('HTTP 403');
  });

  it('returns false after all retries are exhausted when request fails', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('connection reset'));
    global.fetch = fetchMock as never;

    const result = await indicator.isHealthy('email');

    expect(result.email.status).toBe('down');
    expect(result.email.attempts).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
