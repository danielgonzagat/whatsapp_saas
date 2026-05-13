import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();

describe('notifyOps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DLQ_WEBHOOK_URL;
    delete process.env.OPS_WEBHOOK_URL;
    process.env.NODE_ENV = 'test';
    vi.stubGlobal('fetch', mockFetch);
  });

  it('returns early when no webhook URL is configured', async () => {
    const { notifyOps } = await import('../queue-dlq-notifier');
    await notifyOps({ queue: 'autopilot-jobs' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns early when fetch is not globally available', async () => {
    process.env.DLQ_WEBHOOK_URL = 'https://hooks.slack.com/test';
    vi.stubGlobal('fetch', undefined);
    const { notifyOps } = await import('../queue-dlq-notifier');
    await notifyOps({ queue: 'autopilot-jobs' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends Slack-formatted payload to hooks.slack.com', async () => {
    process.env.DLQ_WEBHOOK_URL = 'https://hooks.slack.com/services/TEST/BOT';
    mockFetch.mockResolvedValue({ ok: true });
    const { notifyOps } = await import('../queue-dlq-notifier');
    await notifyOps({
      queue: 'autopilot-jobs',
      jobId: '123',
      jobName: 'scan-contact',
      reason: 'timeout',
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://hooks.slack.com/services/TEST/BOT');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body.text).toContain('autopilot-jobs');
    expect(body.text).toContain('scan-contact');
    expect(body.text).toContain('timeout');
  });

  it('sends Teams-formatted payload to office.com webhook', async () => {
    process.env.DLQ_WEBHOOK_URL = 'https://outlook.office.com/webhook/test';
    mockFetch.mockResolvedValue({ ok: true });
    const { notifyOps } = await import('../queue-dlq-notifier');
    await notifyOps({
      queue: 'send-message',
      jobId: '456',
      jobName: 'send-text',
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body['@type']).toBe('MessageCard');
    expect(body.summary).toBe('DLQ Event');
    expect(body.sections[0].facts[0].value).toBe('send-text');
  });

  it('sends Teams-formatted payload to office365.com webhook', async () => {
    process.env.DLQ_WEBHOOK_URL = 'https://outlook.office365.com/webhook/test';
    mockFetch.mockResolvedValue({ ok: true });
    const { notifyOps } = await import('../queue-dlq-notifier');
    await notifyOps({ queue: 'test-dlq', reason: 'permanent_error' });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body['@type']).toBe('MessageCard');
  });

  it('sends generic payload to unknown webhook host', async () => {
    process.env.DLQ_WEBHOOK_URL = 'https://api.example.com/webhook';
    mockFetch.mockResolvedValue({ ok: true });
    const { notifyOps } = await import('../queue-dlq-notifier');
    await notifyOps({
      queue: 'dlq-jobs',
      jobId: '789',
      reason: 'max_retries',
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.type).toBe('dlq_event');
    expect(body.queue).toBe('dlq-jobs');
    expect(body.jobId).toBe('789');
    expect(body.reason).toBe('max_retries');
  });

  it('uses OPS_WEBHOOK_URL when DLQ_WEBHOOK_URL is not set', async () => {
    process.env.OPS_WEBHOOK_URL = 'https://hooks.slack.com/services/OPS/BOT';
    mockFetch.mockResolvedValue({ ok: true });
    const { notifyOps } = await import('../queue-dlq-notifier');
    await notifyOps({ queue: 'ops-test' });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://hooks.slack.com/services/OPS/BOT',
      expect.any(Object),
    );
  });

  it('handles fetch errors gracefully', async () => {
    process.env.DLQ_WEBHOOK_URL = 'https://hooks.slack.com/services/TEST';
    mockFetch.mockRejectedValue(new Error('network error'));
    const { notifyOps } = await import('../queue-dlq-notifier');
    await expect(
      notifyOps({ queue: 'test', jobId: '1' }),
    ).resolves.toBeUndefined();
  });

  it('handles non-Error fetch rejections', async () => {
    process.env.DLQ_WEBHOOK_URL = 'https://hooks.slack.com/services/TEST';
    mockFetch.mockRejectedValue('ECONNREFUSED');
    const { notifyOps } = await import('../queue-dlq-notifier');
    await expect(
      notifyOps({ queue: 'test', jobId: '2' }),
    ).resolves.toBeUndefined();
  });
});
