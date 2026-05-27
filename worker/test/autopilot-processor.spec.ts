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

vi.mock('../metrics', () => ({
  autopilotDecisionCounter: { inc: vi.fn() },
}));

// Must mock shared before processor import (SHOULD_RUN_AUTOPILOT_WORKER)
vi.mock('../processors/autopilot/shared', () => ({
  SHOULD_RUN_AUTOPILOT_WORKER: true,
}));

const mockRunScanContact = vi.fn();
const mockRunSweepUnread = vi.fn();
const mockRunFollowupContact = vi.fn();
const mockRunCatalogContacts = vi.fn();
const mockRunScoreContact = vi.fn();
const mockRunCiaAction = vi.fn();
const mockRunCiaCycleAll = vi.fn();
const mockRunCiaCycleWorkspace = vi.fn();
const mockRunCiaSelfImproveAll = vi.fn();
const mockRunCiaSelfImproveWorkspace = vi.fn();
const mockRunCiaGlobalLearningAll = vi.fn();
const mockRunCycleAll = vi.fn();
const mockRunCycleWorkspace = vi.fn();

vi.mock('../processors/autopilot/scan', () => ({
  runScanContact: mockRunScanContact,
}));
vi.mock('../processors/autopilot/sweep', () => ({
  runSweepUnreadConversations: mockRunSweepUnread,
}));
vi.mock('../processors/autopilot/followup', () => ({
  runFollowupContact: mockRunFollowupContact,
}));
vi.mock('../processors/autopilot/catalog', () => ({
  runCatalogContacts: mockRunCatalogContacts,
}));
vi.mock('../processors/autopilot/score', () => ({
  runScoreContact: mockRunScoreContact,
}));
vi.mock('../processors/autopilot/cia-action', () => ({
  runCiaAction: mockRunCiaAction,
}));
vi.mock('../processors/autopilot/cia-cycle', () => ({
  runCiaCycleAll: mockRunCiaCycleAll,
  runCiaCycleWorkspace: mockRunCiaCycleWorkspace,
}));
vi.mock('../processors/autopilot/cia-learn', () => ({
  runCiaSelfImproveAll: mockRunCiaSelfImproveAll,
  runCiaSelfImproveWorkspace: mockRunCiaSelfImproveWorkspace,
  runCiaGlobalLearningAll: mockRunCiaGlobalLearningAll,
}));
vi.mock('../processors/autopilot/cycle', () => ({
  runCycleAll: mockRunCycleAll,
  runCycleWorkspace: mockRunCycleWorkspace,
}));

vi.mock('../contracts/autopilot-jobs', () => ({
  AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB: 'sweep-unread-conversations',
}));

// ── Test state ─────────────────────────────────────────────────────────

let WorkerMock: ReturnType<typeof vi.fn>;
let checkIdempotentMock: ReturnType<typeof vi.fn>;
let startJobMock: ReturnType<typeof vi.fn>;
let markCompletedMock: ReturnType<typeof vi.fn>;
let isRetryableErrorMock: ReturnType<typeof vi.fn>;
let decisionCounterMock: { inc: ReturnType<typeof vi.fn> };

let handler: ((job: Record<string, unknown>) => Promise<unknown>) | undefined;

beforeAll(async () => {
  const bullmq = await import('bullmq');
  WorkerMock = bullmq.Worker as ReturnType<typeof vi.fn>;

  const pb = await import('../processor-base');
  checkIdempotentMock = pb.checkIdempotent as ReturnType<typeof vi.fn>;
  startJobMock = pb.startJob as ReturnType<typeof vi.fn>;
  markCompletedMock = pb.markCompleted as ReturnType<typeof vi.fn>;

  const eh = await import('../src/utils/error-handler');
  isRetryableErrorMock = eh.isRetryableError as ReturnType<typeof vi.fn>;

  const m = await import('../metrics');
  decisionCounterMock = m.autopilotDecisionCounter as { inc: ReturnType<typeof vi.fn> };

  const mod = await import('../processors/autopilot-processor');
  expect(mod.autopilotWorker).toBeDefined();

  const calls = WorkerMock.mock.calls;
  expect(calls.length).toBeGreaterThanOrEqual(1);
  handler = calls[0][1] as (job: Record<string, unknown>) => Promise<unknown>;
});

describe('autopilot-processor', () => {
  beforeEach(() => {
    checkIdempotentMock.mockReset();
    startJobMock.mockReset();
    markCompletedMock.mockReset();
    isRetryableErrorMock.mockReset();
    decisionCounterMock.inc.mockReset();
    mockRunScanContact.mockReset();
    mockRunSweepUnread.mockReset();
    mockRunFollowupContact.mockReset();
    mockRunCatalogContacts.mockReset();
    mockRunScoreContact.mockReset();
    mockRunCiaAction.mockReset();
    mockRunCiaCycleAll.mockReset();
    mockRunCiaCycleWorkspace.mockReset();
    mockRunCiaSelfImproveAll.mockReset();
    mockRunCiaSelfImproveWorkspace.mockReset();
    mockRunCiaGlobalLearningAll.mockReset();
    mockRunCycleAll.mockReset();
    mockRunCycleWorkspace.mockReset();
  });

  it('creates a Worker named autopilot-jobs with concurrency 4', () => {
    const calls = WorkerMock.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0]).toBe('autopilot-jobs');
    expect(calls[0][2]).toMatchObject({ concurrency: 4, lockDuration: 60000 });
  });

  it('executes scan-contact on happy path', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-1',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });
    mockRunScanContact.mockResolvedValue(undefined);

    const jobData = { phone: '+5511999999999', workspaceId: 'ws-1' };
    const result = await handler!({
      id: 'job-1',
      name: 'scan-contact',
      data: jobData,
      attemptsMade: 0,
      updateProgress: vi.fn(),
      opts: { attempts: 3 },
    });

    expect(result).toBeUndefined();
    expect(mockRunScanContact).toHaveBeenCalledWith(jobData);
    expect(markCompletedMock).toHaveBeenCalled();
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
      name: 'scan-contact',
      data: { workspaceId: 'ws-1' },
      attemptsMade: 0,
      updateProgress: vi.fn(),
      opts: { attempts: 3 },
    });

    expect(result).toEqual({ ok: true, skipped: true, reason: 'idempotent' });
    expect(mockRunScanContact).not.toHaveBeenCalled();
  });

  it('handles cycle-all job name', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-3',
      workspaceId: 'unknown',
      start: process.hrtime.bigint(),
    });
    mockRunCycleAll.mockResolvedValue(undefined);

    await handler!({
      id: 'job-3',
      name: 'cycle-all',
      data: {},
      attemptsMade: 0,
      updateProgress: vi.fn(),
      opts: { attempts: 3 },
    });

    expect(mockRunCycleAll).toHaveBeenCalled();
    expect(markCompletedMock).toHaveBeenCalled();
  });

  it('handles sweep-unread-conversations via constant import', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-4',
      workspaceId: 'ws-2',
      start: process.hrtime.bigint(),
    });
    mockRunSweepUnread.mockResolvedValue(undefined);

    const jobData = { workspaceId: 'ws-2', runId: 'run-1' };
    await handler!({
      id: 'job-4',
      name: 'sweep-unread-conversations',
      data: jobData,
      attemptsMade: 0,
      updateProgress: vi.fn(),
      opts: { attempts: 3 },
    });

    expect(mockRunSweepUnread).toHaveBeenCalledWith(jobData);
    expect(markCompletedMock).toHaveBeenCalled();
  });

  it('throws AUTOPILOT_PERMANENT for non-retryable errors', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-5',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });
    isRetryableErrorMock.mockReturnValue(false);
    mockRunScanContact.mockRejectedValue(new Error('Bad input'));

    await expect(
      handler!({
        id: 'job-5',
        name: 'scan-contact',
        data: { workspaceId: 'ws-1' },
        attemptsMade: 0,
        updateProgress: vi.fn(),
        opts: { attempts: 3 },
      }),
    ).rejects.toThrow('Bad input');

    expect(decisionCounterMock.inc).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'error' }),
    );
  });

  it('re-throws retryable errors for BullMQ retry', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-6',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });
    isRetryableErrorMock.mockReturnValue(true);
    mockRunScanContact.mockRejectedValue(new Error('ETIMEDOUT'));

    await expect(
      handler!({
        id: 'job-6',
        name: 'scan-contact',
        data: { workspaceId: 'ws-1' },
        attemptsMade: 0,
        updateProgress: vi.fn(),
        opts: { attempts: 3 },
      }),
    ).rejects.toThrow('ETIMEDOUT');
  });
});
