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

const addBulkMock = vi.fn();
vi.mock('../queue', () => ({
  buildQueueOptions: vi.fn(() => ({ connection: {} })),
  flowQueue: { addBulk: addBulkMock },
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

const mockPrisma = {
  campaign: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  contact: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
};

vi.mock('../db', () => ({ prisma: mockPrisma }));

vi.mock('../utils/async-sequence', () => ({
  forEachSequential: vi.fn(
    async <T>(items: T[], fn: (item: T) => Promise<void>) => {
      for (const item of items) {
        await fn(item);
      }
    },
  ),
}));

// ── Test state ─────────────────────────────────────────────────────────

let WorkerMock: ReturnType<typeof vi.fn>;
let checkIdempotentMock: ReturnType<typeof vi.fn>;
let startJobMock: ReturnType<typeof vi.fn>;
let markCompletedMock: ReturnType<typeof vi.fn>;
let isRetryableErrorMock: ReturnType<typeof vi.fn>;

let handler: ((job: Record<string, unknown>) => Promise<unknown>) | undefined;

beforeAll(async () => {
  const bullmq = await import('bullmq');
  WorkerMock = bullmq.Worker as unknown as ReturnType<typeof vi.fn>;

  const pb = await import('../processor-base');
  checkIdempotentMock = pb.checkIdempotent as unknown as ReturnType<typeof vi.fn>;
  startJobMock = pb.startJob as unknown as ReturnType<typeof vi.fn>;
  markCompletedMock = pb.markCompleted as unknown as ReturnType<typeof vi.fn>;

  const eh = await import('../src/utils/error-handler');
  isRetryableErrorMock = eh.isRetryableError as unknown as ReturnType<typeof vi.fn>;

  const mod = await import('../campaign-processor');
  expect(mod.campaignWorker).toBeDefined();

  const calls = WorkerMock.mock.calls;
  expect(calls.length).toBeGreaterThanOrEqual(1);
  handler = calls[0][1] as (job: Record<string, unknown>) => Promise<unknown>;
});

describe('campaign-processor', () => {
  beforeEach(() => {
    checkIdempotentMock.mockReset();
    startJobMock.mockReset();
    markCompletedMock.mockReset();
    isRetryableErrorMock.mockReset();
    addBulkMock.mockReset();
    mockPrisma.campaign.findFirst.mockReset();
    mockPrisma.campaign.updateMany.mockReset();
    mockPrisma.contact.findMany.mockReset();
    mockPrisma.contact.updateMany.mockReset();

    // Defaults: catch block calls updateMany even on error paths
    mockPrisma.campaign.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.contact.findMany.mockResolvedValue([]);
    mockPrisma.contact.updateMany.mockResolvedValue({ count: 0 });
    addBulkMock.mockResolvedValue(undefined);
  });

  it('creates a Worker named campaign-jobs with concurrency 5', () => {
    const calls = WorkerMock.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0]).toBe('campaign-jobs');
    expect(calls[0][2]).toMatchObject({ concurrency: 5, lockDuration: 60000 });
  });

  it('dispatches flow template campaign on happy path', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-1',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });

    mockPrisma.campaign.findFirst.mockResolvedValue({
      id: 'camp-1',
      workspaceId: 'ws-1',
      messageTemplate: 'flow:abc123',
      filters: { tags: ['vip'] },
      stats: {},
    });
    mockPrisma.campaign.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: 'c1', phone: '+5511999999999', name: 'Alice', customFields: {} },
    ]);

    const result = await handler!({
      id: 'job-1',
      name: 'run-campaign',
      data: { campaignId: 'camp-1', workspaceId: 'ws-1' },
      attemptsMade: 0,
      updateProgress: vi.fn(),
      opts: { attempts: 3 },
    });

    expect(result).toBeUndefined();
    expect(addBulkMock).toHaveBeenCalledTimes(1);
    const bulkArg = addBulkMock.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(bulkArg).toHaveLength(1);
    expect(bulkArg[0].name).toBe('run-flow');
    expect(bulkArg[0].data.flowId).toBe('abc123');
    expect(mockPrisma.campaign.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'camp-1', workspaceId: 'ws-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
    expect(markCompletedMock).toHaveBeenCalled();
  });

  it('dispatches direct-send campaign when template is not a flow', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-2',
      workspaceId: 'ws-2',
      start: process.hrtime.bigint(),
    });

    mockPrisma.campaign.findFirst.mockResolvedValue({
      id: 'camp-2',
      workspaceId: 'ws-2',
      messageTemplate: 'Hello {{name}}!',
      filters: {},
      stats: {},
    });
    mockPrisma.campaign.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: 'c2', phone: '+5511988888888', name: 'Bob', customFields: {} },
    ]);

    await handler!({
      id: 'job-2',
      name: 'run-campaign',
      data: { campaignId: 'camp-2', workspaceId: 'ws-2' },
      attemptsMade: 0,
      updateProgress: vi.fn(),
      opts: { attempts: 3 },
    });

    expect(addBulkMock).toHaveBeenCalledTimes(1);
    const bulkArg = addBulkMock.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(bulkArg[0].name).toBe('send-message');
    expect(markCompletedMock).toHaveBeenCalled();
  });

  it('skips when idempotent', async () => {
    checkIdempotentMock.mockResolvedValue(true);
    startJobMock.mockReturnValue({
      correlationId: 'corr-3',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });

    const result = await handler!({
      id: 'job-3',
      name: 'run-campaign',
      data: { campaignId: 'camp-1', workspaceId: 'ws-1' },
      attemptsMade: 0,
      updateProgress: vi.fn(),
      opts: { attempts: 3 },
    });

    expect(result).toEqual({ ok: true, skipped: true, reason: 'idempotent' });
    expect(mockPrisma.campaign.findFirst).not.toHaveBeenCalled();
  });

  it('throws permanent error when campaign is not found', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-4',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });
    isRetryableErrorMock.mockReturnValue(false);
    mockPrisma.campaign.findFirst.mockResolvedValue(null);

    await expect(
      handler!({
        id: 'job-4',
        name: 'run-campaign',
        data: { campaignId: 'nonexistent', workspaceId: 'ws-1' },
        attemptsMade: 0,
        updateProgress: vi.fn(),
        opts: { attempts: 3 },
      }),
    ).rejects.toThrow('Campaign nonexistent not found');

    expect(addBulkMock).not.toHaveBeenCalled();
  });

  it('re-throws retryable errors for BullMQ retry', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-5',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });
    isRetryableErrorMock.mockReturnValue(true);
    mockPrisma.campaign.findFirst.mockRejectedValue(new Error('ETIMEDOUT'));

    await expect(
      handler!({
        id: 'job-5',
        name: 'run-campaign',
        data: { campaignId: 'camp-1', workspaceId: 'ws-1' },
        attemptsMade: 0,
        updateProgress: vi.fn(),
        opts: { attempts: 3 },
      }),
    ).rejects.toThrow('ETIMEDOUT');
  });

  it('marks campaign CANCELLED on permanent error in catch block', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-6',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });
    isRetryableErrorMock.mockReturnValue(false);
    mockPrisma.campaign.findFirst.mockRejectedValue(new Error('DB error'));

    await expect(
      handler!({
        id: 'job-6',
        name: 'run-campaign',
        data: { campaignId: 'camp-1', workspaceId: 'ws-1' },
        attemptsMade: 0,
        updateProgress: vi.fn(),
        opts: { attempts: 3 },
      }),
    ).rejects.toThrow('DB error');

    expect(mockPrisma.campaign.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'camp-1', workspaceId: 'ws-1' },
        data: { status: 'CANCELLED' },
      }),
    );
  });
});
