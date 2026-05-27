import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

class MockWorkerLogger {
  public info = vi.fn();
  public warn = vi.fn();
  public error = vi.fn();
  constructor(_context: string) {
    // no-op: mock
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
  flowQueue: { addBulk: vi.fn() },
}));

vi.mock('../src/utils/error-handler', () => ({
  isRetryableError: vi.fn(),
  WorkerError: class WorkerError extends Error {
    public code: string;
    public retryable: boolean;
    constructor(message: string, code: string, retryable: boolean) {
      super(message);
      this.code = code;
      this.retryable = retryable;
    }
  },
}));

// The module imports eagerly; get references to mocks before tests run
let WorkerMock: ReturnType<typeof vi.fn>;
let checkIdempotentMock: ReturnType<typeof vi.fn>;
let startJobMock: ReturnType<typeof vi.fn>;
let endJobMock: ReturnType<typeof vi.fn>;
let logErrorMock: ReturnType<typeof vi.fn>;
let markCompletedMock: ReturnType<typeof vi.fn>;
let addBulkMock: ReturnType<typeof vi.fn>;
let isRetryableErrorMock: ReturnType<typeof vi.fn>;

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

  const q = await import('../queue');
  addBulkMock = (q.flowQueue as { addBulk: ReturnType<typeof vi.fn> }).addBulk;

  const eh = await import('../src/utils/error-handler');
  isRetryableErrorMock = eh.isRetryableError as unknown as ReturnType<typeof vi.fn>;

  // Import the processor — this triggers Worker constructor with the handler
  const mod = await import('../processors/mass-send-processor');
  expect(mod.massSendWorker).toBeDefined();

  // Extract handler from Worker mock calls
  const calls = WorkerMock.mock.calls;
  expect(calls.length).toBeGreaterThanOrEqual(1);
  handler = calls[0][1] as (job: Record<string, unknown>) => Promise<unknown>;
});

describe('mass-send-processor', () => {
  beforeEach(() => {
    // Clear per-test mocks but preserve Worker constructor history
    checkIdempotentMock.mockReset();
    startJobMock.mockReset();
    endJobMock.mockReset();
    logErrorMock.mockReset();
    markCompletedMock.mockReset();
    addBulkMock.mockReset();
    isRetryableErrorMock.mockReset();
  });

  it('creates a Worker named mass-send with concurrency 5', () => {
    // Worker was constructed in beforeAll before any clearAllMocks
    const calls = WorkerMock.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0]).toBe('mass-send');
    expect(calls[0][2]).toMatchObject({ concurrency: 5 });
  });

  it('dispatches send-message jobs via flowQueue.addBulk on happy path', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-1',
      workspaceId: 'ws-1',
      startTime: Date.now(),
    });
    endJobMock.mockReturnValue(100);

    const result = await handler!({
      id: 'job-1',
      name: 'dispatch',
      data: {
        workspaceId: 'ws-1',
        user: 'admin',
        numbers: ['+5511999999999', '+5511988888888'],
        message: 'Hello',
      },
      attemptsMade: 0,
      updateProgress: vi.fn(),
      opts: { attempts: 3 },
    });

    expect(addBulkMock).toHaveBeenCalledTimes(1);
    const bulkArg = addBulkMock.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(bulkArg).toHaveLength(2);
    expect(bulkArg[0].name).toBe('send-message');
    expect(bulkArg[0].data).toMatchObject({
      workspaceId: 'ws-1',
      to: '+5511999999999',
      message: 'Hello',
    });
    expect(bulkArg[1].data).toMatchObject({
      workspaceId: 'ws-1',
      to: '+5511988888888',
      message: 'Hello',
    });
    expect(result).toEqual({ ok: true, dispatched: 2 });
    expect(markCompletedMock).toHaveBeenCalled();
  });

  it('skips when idempotent', async () => {
    checkIdempotentMock.mockResolvedValue(true);
    startJobMock.mockReturnValue({
      correlationId: 'corr-2',
      workspaceId: 'ws-1',
      startTime: Date.now(),
    });
    endJobMock.mockReturnValue(50);

    const result = await handler!({
      id: 'job-2',
      name: 'dispatch',
      data: {
        workspaceId: 'ws-1',
        user: 'admin',
        numbers: ['+5511999999999'],
        message: 'Hello',
      },
      attemptsMade: 0,
      updateProgress: vi.fn(),
      opts: { attempts: 3 },
    });

    expect(result).toEqual({ ok: true, skipped: true, reason: 'idempotent' });
    expect(addBulkMock).not.toHaveBeenCalled();
  });

  it('throws permanent error for empty numbers', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-3',
      workspaceId: 'ws-1',
      startTime: Date.now(),
    });
    isRetryableErrorMock.mockReturnValue(false);

    await expect(
      handler!({
        id: 'job-3',
        name: 'dispatch',
        data: {
          workspaceId: 'ws-1',
          user: 'admin',
          numbers: [],
          message: 'Hello',
        },
        attemptsMade: 0,
        updateProgress: vi.fn(),
        opts: { attempts: 3 },
      }),
    ).rejects.toThrow('No recipients in mass-send job');

    expect(addBulkMock).not.toHaveBeenCalled();
  });

  it('re-throws retryable errors for BullMQ retry', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-4',
      workspaceId: 'ws-1',
      startTime: Date.now(),
    });
    isRetryableErrorMock.mockReturnValue(true);
    addBulkMock.mockRejectedValue(new Error('Redis connection failed'));

    await expect(
      handler!({
        id: 'job-4',
        name: 'dispatch',
        data: {
          workspaceId: 'ws-1',
          user: 'admin',
          numbers: ['+5511999999999'],
          message: 'Hello',
        },
        attemptsMade: 0,
        updateProgress: vi.fn(),
        opts: { attempts: 3 },
      }),
    ).rejects.toThrow('Redis connection failed');
  });
});
