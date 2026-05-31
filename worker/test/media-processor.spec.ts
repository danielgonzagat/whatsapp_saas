import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────

class MockWorkerLogger {
  public info = vi.fn();
  public warn = vi.fn();
  public error = vi.fn();
  withContext() {
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
}));

vi.mock('../queue', () => ({
  buildQueueOptions: vi.fn(() => ({ connection: {} })),
}));

const findUniqueMock = vi.fn();
const updateManyMock = vi.fn();
const updateMock = vi.fn();
vi.mock('../db', () => ({
  prisma: {
    mediaJob: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      updateMany: (...args: unknown[]) => updateManyMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}));

// ── Test state ─────────────────────────────────────────────────────────

let WorkerMock: ReturnType<typeof vi.fn>;
let checkIdempotentMock: ReturnType<typeof vi.fn>;
let startJobMock: ReturnType<typeof vi.fn>;
let endJobMock: ReturnType<typeof vi.fn>;
let handler: ((job: Record<string, unknown>) => Promise<unknown>) | undefined;

beforeAll(async () => {
  const bullmq = await import('bullmq');
  WorkerMock = bullmq.Worker as ReturnType<typeof vi.fn>;

  const pb = await import('../processor-base');
  checkIdempotentMock = pb.checkIdempotent as ReturnType<typeof vi.fn>;
  startJobMock = pb.startJob as ReturnType<typeof vi.fn>;
  endJobMock = pb.endJob as ReturnType<typeof vi.fn>;

  const mod = await import('../media-processor');
  expect(mod.mediaWorker).toBeDefined();

  const calls = WorkerMock.mock.calls;
  expect(calls.length).toBeGreaterThanOrEqual(1);
  handler = calls[0][1] as (job: Record<string, unknown>) => Promise<unknown>;
});

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    name: 'generate-video',
    queueName: 'media-jobs',
    data: { jobId: 'media-1', prompt: 'a sneaker on mars' },
    updateProgress: vi.fn(),
    ...overrides,
  };
}

describe('media-processor', () => {
  beforeEach(() => {
    checkIdempotentMock.mockReset();
    startJobMock.mockReset();
    endJobMock.mockReset();
    findUniqueMock.mockReset();
    updateManyMock.mockReset();
    updateMock.mockReset();

    startJobMock.mockReturnValue({
      correlationId: 'corr-1',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });
    updateManyMock.mockResolvedValue({ count: 1 });
  });

  it('creates a Worker named media-jobs with concurrency 5', () => {
    const calls = WorkerMock.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0]).toBe('media-jobs');
    expect(calls[0][2]).toMatchObject({ concurrency: 5, lockDuration: 120_000 });
  });

  it('terminates the job FAILED/unavailable without fabricating an output URL', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    findUniqueMock.mockResolvedValue({ workspaceId: 'ws-1' });

    const result = await handler!(makeJob());

    // First updateMany flips to PROCESSING, the terminal one is the honest state.
    const terminalCall = updateManyMock.mock.calls.at(-1);
    expect(terminalCall).toBeDefined();
    const terminalData = (terminalCall![0] as { data: Record<string, unknown> }).data;
    expect(terminalData.status).toBe('FAILED');
    // No fabricated URL — outputUrl must be explicitly cleared (null), never a
    // .mp4 link. The serialized-data check below proves no .mp4 leaks anywhere.
    expect(terminalData.outputUrl).toBeNull();

    expect(result).toEqual({
      ok: false,
      status: 'unavailable',
      reason: 'media_renderer_unavailable',
    });

    // Never reports completion for a job that produced no real media.
    expect(endJobMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'generate-video',
      'failed',
    );
  });

  it('never writes a COMPLETED status nor an .mp4 url anywhere in the success path', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    findUniqueMock.mockResolvedValue({ workspaceId: 'ws-1' });

    await handler!(makeJob());

    for (const call of updateManyMock.mock.calls) {
      const data = (call[0] as { data: Record<string, unknown> }).data;
      expect(data.status).not.toBe('COMPLETED');
      const serialized = JSON.stringify(data);
      expect(serialized).not.toMatch(/\.mp4/);
    }
  });

  it('skips when idempotent', async () => {
    checkIdempotentMock.mockResolvedValue(true);

    const result = await handler!(makeJob({ id: 'job-2' }));

    expect(result).toEqual({ ok: true, skipped: true, reason: 'idempotent' });
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('throws a permanent error and marks FAILED when the media job is missing', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    findUniqueMock.mockResolvedValue(null);
    updateMock.mockResolvedValue({ id: 'media-1' });

    await expect(handler!(makeJob())).rejects.toThrow(/not found/i);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });
});
