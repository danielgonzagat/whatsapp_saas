import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { WorkerError } from '../src/utils/error-handler';

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

const mockPrisma = {
  contact: {
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  workspace: {
    findUnique: vi.fn().mockResolvedValue(null),
  },
  flow: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
};

vi.mock('../db', () => ({ prisma: mockPrisma }));

vi.mock('../utils/async-sequence', () => ({
  forEachSequential: vi.fn(async <T>(items: T[], fn: (item: T) => Promise<void>) => {
    for (const item of items) {
      await fn(item);
    }
  }),
}));

const mockEngine = {
  startFlow: vi.fn().mockResolvedValue(undefined),
  parseFlowDefinition: vi.fn().mockReturnValue({}),
};

vi.mock('../flow-engine-global', () => ({
  FlowEngineGlobal: {
    get: vi.fn(() => mockEngine),
  },
}));

vi.mock('../providers/plan-limits', () => ({
  PlanLimitsProvider: {
    checkMessageLimit: vi.fn().mockResolvedValue({ allowed: true }),
  },
}));

vi.mock('../providers/checkout-social-lead-enrichment', () => ({
  processCheckoutSocialLeadEnrichment: vi.fn().mockResolvedValue(undefined),
}));

// ── Test state ─────────────────────────────────────────────────────────

let WorkerMock: ReturnType<typeof vi.fn>;
let checkIdempotentMock: ReturnType<typeof vi.fn>;
let startJobMock: ReturnType<typeof vi.fn>;
let markCompletedMock: ReturnType<typeof vi.fn>;
let isRetryableErrorMock: ReturnType<typeof vi.fn>;
let engineMock: {
  startFlow: ReturnType<typeof vi.fn>;
  parseFlowDefinition: ReturnType<typeof vi.fn>;
};
let enrichmentMock: ReturnType<typeof vi.fn>;
let planLimitsMock: ReturnType<typeof vi.fn>;

let handler: ((job: Record<string, unknown>) => Promise<unknown>) | undefined;

beforeAll(async () => {
  const bullmq = await import('bullmq');
  WorkerMock = bullmq.Worker as unknown as ReturnType<typeof vi.fn>;

  const pb = await import('../processor-base');
  checkIdempotentMock = pb.checkIdempotent as unknown as ReturnType<typeof vi.fn>;
  markCompletedMock = pb.markCompleted as unknown as ReturnType<typeof vi.fn>;
  startJobMock = pb.startJob as unknown as ReturnType<typeof vi.fn>;

  const eh = await import('../src/utils/error-handler');
  isRetryableErrorMock = eh.isRetryableError as unknown as ReturnType<typeof vi.fn>;

  const fg = await import('../flow-engine-global');
  engineMock = mockEngine;

  const enrichment = await import('../providers/checkout-social-lead-enrichment');
  enrichmentMock = enrichment.processCheckoutSocialLeadEnrichment as unknown as ReturnType<
    typeof vi.fn
  >;

  const pl = await import('../providers/plan-limits');
  planLimitsMock = pl.PlanLimitsProvider.checkMessageLimit as unknown as ReturnType<typeof vi.fn>;

  const mod = await import('../processors/crm-processor');
  expect(mod.ghostCloserWorker).toBeDefined();

  const calls = WorkerMock.mock.calls;
  expect(calls.length).toBeGreaterThanOrEqual(1);
  handler = calls[0][1] as (job: Record<string, unknown>) => Promise<unknown>;
});

describe('crm-processor', () => {
  beforeEach(() => {
    checkIdempotentMock.mockReset();
    startJobMock.mockReset();
    markCompletedMock.mockReset();
    isRetryableErrorMock.mockReset();
    engineMock.startFlow.mockReset();
    engineMock.parseFlowDefinition.mockReset();
    enrichmentMock.mockReset();
    planLimitsMock.mockReset();
    mockPrisma.contact.findMany.mockReset();
    mockPrisma.contact.updateMany.mockReset();
    mockPrisma.workspace.findUnique.mockReset();
    mockPrisma.flow.findFirst.mockReset();

    // Defaults: catch blocks call these even on error paths
    planLimitsMock.mockResolvedValue({ allowed: true });
    enrichmentMock.mockResolvedValue(undefined);
    engineMock.startFlow.mockResolvedValue(undefined);
    engineMock.parseFlowDefinition.mockReturnValue({});
    mockPrisma.contact.findMany.mockResolvedValue([]);
    mockPrisma.contact.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.workspace.findUnique.mockResolvedValue(null);
    mockPrisma.flow.findFirst.mockResolvedValue(null);
  });

  it('creates a Worker named crm-jobs with concurrency 1', () => {
    const calls = WorkerMock.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0]).toBe('crm-jobs');
    expect(calls[0][2]).toMatchObject({ concurrency: 1, lockDuration: 120_000 });
  });

  it('skips when idempotent', async () => {
    checkIdempotentMock.mockResolvedValue(true);
    startJobMock.mockReturnValue({
      correlationId: 'corr-1',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });

    const result = await handler!({
      id: 'job-1',
      name: 'check-inactivity',
      data: { workspaceId: 'ws-1' },
      attemptsMade: 0,
      updateProgress: vi.fn(),
      opts: { attempts: 3 },
    });

    expect(result).toEqual({ ok: true, skipped: true, reason: 'idempotent' });
    expect(mockPrisma.contact.findMany).not.toHaveBeenCalled();
  });

  it('completes check-inactivity on happy path with no leads', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-2',
      workspaceId: 'ws-42',
      start: process.hrtime.bigint(),
    });
    planLimitsMock.mockResolvedValue({ allowed: true });
    mockPrisma.contact.findMany.mockResolvedValue([]);

    const result = await handler!({
      id: 'job-2',
      name: 'check-inactivity',
      data: { workspaceId: 'ws-42' },
      attemptsMade: 0,
      updateProgress: vi.fn(),
      opts: { attempts: 3 },
    });

    expect(result).toBeUndefined();
    expect(markCompletedMock).toHaveBeenCalled();
    expect(mockPrisma.contact.findMany).toHaveBeenCalled();
  });

  it('triggers ghost closer nudge flow for inactive leads', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-3',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });
    planLimitsMock.mockResolvedValue({ allowed: true });
    mockPrisma.contact.findMany.mockResolvedValue([
      { phone: '+5511999999999', id: 'lead-1', customFields: {} },
    ]);
    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-1',
      providerSettings: { nudgeFlowId: 'flow-1' },
    });
    mockPrisma.flow.findFirst.mockResolvedValue({
      id: 'flow-1',
      nodes: [],
      edges: [],
    });
    engineMock.parseFlowDefinition.mockReturnValue({});
    engineMock.startFlow.mockResolvedValue(undefined);

    await handler!({
      id: 'job-3',
      name: 'check-inactivity',
      data: { workspaceId: 'ws-1' },
      attemptsMade: 0,
      updateProgress: vi.fn(),
      opts: { attempts: 3 },
    });

    expect(engineMock.startFlow).toHaveBeenCalled();
    expect(mockPrisma.contact.updateMany).toHaveBeenCalled();
    expect(markCompletedMock).toHaveBeenCalled();
  });

  it('enriches checkout social lead from job data', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-4',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });
    enrichmentMock.mockResolvedValue(undefined);

    await handler!({
      id: 'job-4',
      name: 'checkout-social-lead-enrich',
      data: { leadId: 'lead-9' },
      attemptsMade: 0,
      updateProgress: vi.fn(),
      opts: { attempts: 3 },
    });

    expect(enrichmentMock).toHaveBeenCalledWith('lead-9');
    expect(markCompletedMock).toHaveBeenCalled();
  });

  it('skips enrichment when leadId is empty', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-5',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });

    await handler!({
      id: 'job-5',
      name: 'checkout-social-lead-enrich',
      data: { leadId: '  ' },
      attemptsMade: 0,
      updateProgress: vi.fn(),
      opts: { attempts: 3 },
    });

    expect(enrichmentMock).not.toHaveBeenCalled();
    expect(markCompletedMock).toHaveBeenCalled();
  });

  it('throws CRM_PERMANENT for non-retryable errors', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-6',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });
    isRetryableErrorMock.mockReturnValue(false);
    mockPrisma.contact.findMany.mockRejectedValue(new Error('DB connection refused'));

    await expect(
      handler!({
        id: 'job-6',
        name: 'check-inactivity',
        data: { workspaceId: 'ws-1' },
        attemptsMade: 0,
        updateProgress: vi.fn(),
        opts: { attempts: 3 },
      }),
    ).rejects.toThrow('DB connection refused');
  });

  it('re-throws retryable errors for BullMQ retry', async () => {
    checkIdempotentMock.mockResolvedValue(false);
    startJobMock.mockReturnValue({
      correlationId: 'corr-7',
      workspaceId: 'ws-1',
      start: process.hrtime.bigint(),
    });
    isRetryableErrorMock.mockReturnValue(true);
    mockPrisma.contact.findMany.mockRejectedValue(new Error('ETIMEDOUT'));

    await expect(
      handler!({
        id: 'job-7',
        name: 'check-inactivity',
        data: { workspaceId: 'ws-1' },
        attemptsMade: 0,
        updateProgress: vi.fn(),
        opts: { attempts: 3 },
      }),
    ).rejects.toThrow('ETIMEDOUT');
  });
});
