import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────

class MockWorkerLogger {
  public info = vi.fn();
  public warn = vi.fn();
  public error = vi.fn();
  constructor(_context: string) {
    // no-op
  }

  withContext(_correlationId: string, _workspaceId?: string) {
    return {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  }
}

vi.mock('../logger', () => ({ WorkerLogger: MockWorkerLogger }));

vi.mock('bullmq', () => ({
  Worker: vi.fn(),
}));

vi.mock('../processor-base', () => ({
  checkIdempotent: vi.fn(),
  startJob: vi.fn(),
  endJob: vi.fn(),
  logError: vi.fn(),
  markCompleted: vi.fn(),
}));

vi.mock('../queue', () => ({
  buildQueueOptions: vi.fn(() => ({ connection: {} })),
}));

vi.mock('../src/utils/error-handler', () => ({
  throwIfRetryable: vi.fn(),
}));

vi.mock('../utils/ssrf-protection', () => ({
  validateUrl: vi.fn(),
}));

const axiosPostMock = vi.fn();
vi.mock('axios', () => ({
  default: { post: axiosPostMock },
}));

// ── Test state ─────────────────────────────────────────────────────────

let WorkerMock: ReturnType<typeof vi.fn>;
let checkIdempotentMock: ReturnType<typeof vi.fn>;
let startJobMock: ReturnType<typeof vi.fn>;
let endJobMock: ReturnType<typeof vi.fn>;
let logErrorMock: ReturnType<typeof vi.fn>;
let markCompletedMock: ReturnType<typeof vi.fn>;
let throwIfRetryableMock: ReturnType<typeof vi.fn>;
let validateUrlMock: ReturnType<typeof vi.fn>;

let handler: ((job: Record<string, unknown>) => Promise<unknown>) | undefined;

beforeAll(async () => {
  const bullmq = await import('bullmq');
  WorkerMock = bullmq.Worker as unknown as ReturnType<typeof vi.fn>;

  const pb = await import('../processor-base');
  checkIdempotentMock = pb.checkIdempotent as unknown as ReturnType<typeof vi.fn>;
  startJobMock = pb.startJob as unknown as ReturnType<typeof vi.fn>;
  endJobMock = pb.endJob as unknown as ReturnType<typeof vi.fn>;
  logErrorMock = pb.logError as unknown as ReturnType<typeof vi.fn>;
  markCompletedMock = pb.markCompleted as unknown as ReturnType<typeof vi.fn>;

  const eh = await import('../src/utils/error-handler');
  throwIfRetryableMock = eh.throwIfRetryable as unknown as ReturnType<typeof vi.fn>;

  const ssrf = await import('../utils/ssrf-protection');
  validateUrlMock = ssrf.validateUrl as unknown as ReturnType<typeof vi.fn>;

  const mod = await import('../processors/webhook-processor');
  expect(mod.webhookWorker).toBeDefined();

  const calls = WorkerMock.mock.calls;
  expect(calls.length).toBeGreaterThanOrEqual(1);
  handler = calls[0][1] as (job: Record<string, unknown>) => Promise<unknown>;
});

describe('webhook-processor', () => {
  beforeEach(() => {
    checkIdempotentMock.mockReset();
    startJobMock.mockReset();
    endJobMock.mockReset();
    logErrorMock.mockReset();
    markCompletedMock.mockReset();
    throwIfRetryableMock.mockReset();
    validateUrlMock.mockReset();
    axiosPostMock.mockReset();
  });

  it('creates a Worker named webhook-jobs with concurrency 20', () => {
    const calls = WorkerMock.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0]).toBe('webhook-jobs');
    expect(calls[0][2]).toMatchObject({ concurrency: 20, lockDuration: 60_000 });
  });

  it('dispatches webhook successfully on happy path', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-1',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });
    validateUrlMock.mockResolvedValue({ valid: true });
    axiosPostMock.mockResolvedValue({ status: 200 });

    const job = {
      id: 'job-1',
      name: 'dispatch-webhook',
      data: {
        url: 'https://example.com/hook',
        payload: { key: 'value' },
        secret: 'shh',
        event: 'order.created',
      },
      attemptsMade: 0,
      updateProgress: vi.fn(),
      opts: { attempts: 3 },
    };

    const result = await handler!(job);

    expect(validateUrlMock).toHaveBeenCalledWith('https://example.com/hook');
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    const axiosCall = axiosPostMock.mock.calls[0];
    expect(axiosCall[0]).toBe('https://example.com/hook');
    expect(axiosCall[1]).toMatchObject({
      event: 'order.created',
      data: { key: 'value' },
    });
    expect(axiosCall[2].headers['X-Webhook-Signature']).toBeTruthy();
    expect(axiosCall[2].headers['X-Webhook-Event']).toBe('order.created');
    expect(markCompletedMock).toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('skips when idempotent', async () => {
    checkIdempotentMock.mockResolvedValue(true);
    startJobMock.mockReturnValue({
      correlationId: 'corr-2',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });

    const result = await handler!({
      id: 'job-2',
      name: 'dispatch-webhook',
      data: {
        url: 'https://example.com/hook',
        payload: {},
        secret: '',
        event: 'test',
      },
      attemptsMade: 0,
      updateProgress: vi.fn(),
      opts: { attempts: 3 },
    });

    expect(result).toEqual({ ok: true, skipped: true, reason: 'idempotent' });
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it('throws when SSRF validation blocks the URL', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-3',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });
    validateUrlMock.mockResolvedValue({ valid: false, error: 'private IP blocked' });
    throwIfRetryableMock.mockImplementation((err: Error, _ctx: string) => {
      throw err;
    });

    await expect(
      handler!({
        id: 'job-3',
        name: 'dispatch-webhook',
        data: {
          url: 'http://10.0.0.1/admin',
          payload: {},
          secret: '',
          event: 'test',
        },
        attemptsMade: 0,
        updateProgress: vi.fn(),
        opts: { attempts: 3 },
      }),
    ).rejects.toThrow('SSRF blocked: private IP blocked');

    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it('classifies non-retryable errors via throwIfRetryable', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-4',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });
    validateUrlMock.mockResolvedValue({ valid: true });
    axiosPostMock.mockRejectedValue(new Error('Request failed with status code 404'));
    throwIfRetryableMock.mockImplementation(() => {
      throw new Error('PERMANENT: 404');
    });

    await expect(
      handler!({
        id: 'job-4',
        name: 'dispatch-webhook',
        data: {
          url: 'https://example.com/hook',
          payload: {},
          secret: '',
          event: 'test',
        },
        attemptsMade: 0,
        updateProgress: vi.fn(),
        opts: { attempts: 3 },
      }),
    ).rejects.toThrow('PERMANENT: 404');

    expect(throwIfRetryableMock).toHaveBeenCalled();
  });

  it('re-throws retryable errors for BullMQ retry', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-5',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });
    validateUrlMock.mockResolvedValue({ valid: true });
    axiosPostMock.mockRejectedValue(new Error('socket hang up'));
    throwIfRetryableMock.mockImplementation((err: Error, _ctx: string) => {
      throw err;
    });

    await expect(
      handler!({
        id: 'job-5',
        name: 'dispatch-webhook',
        data: {
          url: 'https://example.com/hook',
          payload: {},
          secret: '',
          event: 'test',
        },
        attemptsMade: 0,
        updateProgress: vi.fn(),
        opts: { attempts: 3 },
      }),
    ).rejects.toThrow('socket hang up');
  });

  it('handles webhook without secret (empty signature)', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-6',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });
    validateUrlMock.mockResolvedValue({ valid: true });
    axiosPostMock.mockResolvedValue({ status: 200 });

    await handler!({
      id: 'job-6',
      name: 'dispatch-webhook',
      data: {
        url: 'https://example.com/hook',
        payload: { key: 'value' },
        secret: '',
        event: 'no-secret',
      },
      attemptsMade: 0,
      updateProgress: vi.fn(),
      opts: { attempts: 3 },
    });

    const axiosCall = axiosPostMock.mock.calls[0];
    expect(axiosCall[2].headers['X-Webhook-Signature']).toBe('');
  });
});
