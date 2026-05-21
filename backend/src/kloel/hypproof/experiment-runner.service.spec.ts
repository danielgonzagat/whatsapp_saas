import { ExperimentRunnerService } from './experiment-runner.service';
import type { MicroExperiment } from './types';

function makeExperiment(
  overrides: Partial<MicroExperiment> = {},
): MicroExperiment {
  return {
    id: 'exp-1',
    hypothesisId: 'hyp-1',
    workspaceId: 'ws-1',
    description: 'Test experiment',
    riskAssessment: 'safe',
    targetMetric: 'test_metric',
    evidenceThreshold: 3,
    maxDurationMs: 60000,
    designedAt: new Date().toISOString(),
    correlationId: 'corr-1',
    ...overrides,
  };
}

function makeObservedEvents(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    eventName: 'commerce.lead.replied',
    workspaceId: 'ws-1',
    truthMode: 'observed' as const,
    occurredAt: new Date(Date.now() + i * 1000).toISOString(),
  }));
}

describe('ExperimentRunnerService (service)', () => {
  let svc: ExperimentRunnerService;

  beforeEach(() => {
    svc = new ExperimentRunnerService();
  });

  describe('run()', () => {
    it('starts a run with experiment and observed events', () => {
      const experiment = makeExperiment();
      const events = makeObservedEvents(3);
      const run = svc.run(experiment, events);

      expect(run).not.toBeNull();
      expect(run!.experimentId).toBe('exp-1');
      expect(run!.hypothesisId).toBe('hyp-1');
      expect(run!.workspaceId).toBe('ws-1');
      expect(run!.correlationId).toBe('corr-1');
      expect(run!.status).toBe('running');
      expect(run!.startedAt).toBeDefined();
      expect(run!.completedAt).toBeNull();
      expect(run!.error).toBeNull();
    });

    it('returns null when observed events array is empty', () => {
      const experiment = makeExperiment();
      const run = svc.run(experiment, []);

      expect(run).toBeNull();
    });

    it('is idempotent: same correlationId + experimentId returns existing run', () => {
      const experiment = makeExperiment();
      const events = makeObservedEvents(3);

      const run1 = svc.run(experiment, events);
      const run2 = svc.run(experiment, events);

      expect(run2).not.toBeNull();
      expect(run2!.id).toBe(run1!.id);
    });

    it('creates distinct runs for different correlationIds', () => {
      const exp1 = makeExperiment({ id: 'exp-1', correlationId: 'corr-a' });
      const exp2 = makeExperiment({ id: 'exp-2', correlationId: 'corr-b' });
      const events = makeObservedEvents(3);

      const run1 = svc.run(exp1, events);
      const run2 = svc.run(exp2, events);

      expect(run1).not.toBeNull();
      expect(run2).not.toBeNull();
      expect(run1!.id).not.toBe(run2!.id);
    });

    it('creates distinct runs for different experiment IDs with same correlationId', () => {
      const exp1 = makeExperiment({ id: 'exp-a', correlationId: 'corr-same' });
      const exp2 = makeExperiment({ id: 'exp-b', correlationId: 'corr-same' });
      const events = makeObservedEvents(3);

      const run1 = svc.run(exp1, events);
      const run2 = svc.run(exp2, events);

      expect(run1).not.toBeNull();
      expect(run2).not.toBeNull();
      expect(run1!.id).not.toBe(run2!.id);
    });

    it('allows re-run after previous run failed', () => {
      const experiment = makeExperiment();
      const events = makeObservedEvents(3);

      const run1 = svc.run(experiment, events)!;
      svc.fail(run1.id, 'ws-1', 'transient error');

      const run2 = svc.run(experiment, events);
      expect(run2).not.toBeNull();
      expect(run2!.id).not.toBe(run1.id);
      expect(run2!.status).toBe('running');
    });
  });

  describe('complete()', () => {
    it('completes a running experiment', () => {
      const experiment = makeExperiment();
      const events = makeObservedEvents(2);
      const run = svc.run(experiment, events)!;

      const completed = svc.complete(run.id, 'ws-1');
      expect(completed).not.toBeNull();
      expect(completed!.status).toBe('completed');
      expect(completed!.completedAt).not.toBeNull();
    });

    it('is idempotent: completing an already completed run returns same state', () => {
      const experiment = makeExperiment();
      const events = makeObservedEvents(2);
      const run = svc.run(experiment, events)!;

      const first = svc.complete(run.id, 'ws-1');
      const second = svc.complete(run.id, 'ws-1');

      expect(second).not.toBeNull();
      expect(second!.status).toBe('completed');
      expect(second!.completedAt).toBe(first!.completedAt);
    });
  });

  describe('fail()', () => {
    it('marks a run as failed with error message', () => {
      const experiment = makeExperiment();
      const events = makeObservedEvents(2);
      const run = svc.run(experiment, events)!;

      const failed = svc.fail(run.id, 'ws-1', 'infrastructure timeout');
      expect(failed).not.toBeNull();
      expect(failed!.status).toBe('failed');
      expect(failed!.error).toBe('infrastructure timeout');
      expect(failed!.completedAt).not.toBeNull();
    });

    it('returns null for non-existent run ID', () => {
      const result = svc.fail('nonexistent', 'ws-1', 'error');
      expect(result).toBeNull();
    });
  });

  describe('getRun()', () => {
    it('returns null for unknown run ID', () => {
      expect(svc.getRun('nonexistent')).toBeNull();
    });

    it('returns the run for known ID', () => {
      const experiment = makeExperiment();
      const events = makeObservedEvents(1);
      const run = svc.run(experiment, events)!;

      const found = svc.getRun(run.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(run.id);
    });
  });

  describe('listByWorkspace()', () => {
    it('filters runs by workspace', () => {
      const expWs1 = makeExperiment({ id: 'exp-a', workspaceId: 'ws-1', correlationId: 'c1' });
      const expWs2 = makeExperiment({ id: 'exp-b', workspaceId: 'ws-2', correlationId: 'c2' });
      const events = makeObservedEvents(1);

      svc.run(expWs1, events);
      svc.run(expWs2, events);

      const ws1Runs = svc.listByWorkspace('ws-1');
      expect(ws1Runs).toHaveLength(1);
      expect(ws1Runs[0]!.workspaceId).toBe('ws-1');

      const ws2Runs = svc.listByWorkspace('ws-2');
      expect(ws2Runs).toHaveLength(1);
      expect(ws2Runs[0]!.workspaceId).toBe('ws-2');
    });

    it('returns empty array for workspace with no runs', () => {
      expect(svc.listByWorkspace('empty-ws')).toHaveLength(0);
    });
  });

  describe('workspace isolation', () => {
    it('rejects complete with mismatched workspace', () => {
      const experiment = makeExperiment({ workspaceId: 'ws-1' });
      const events = makeObservedEvents(2);
      const run = svc.run(experiment, events)!;

      const result = svc.complete(run.id, 'ws-2');
      expect(result).toBeNull();
    });

    it('returns null on fail with mismatched workspace', () => {
      const experiment = makeExperiment({ workspaceId: 'ws-1' });
      const events = makeObservedEvents(2);
      const run = svc.run(experiment, events)!;

      const result = svc.fail(run.id, 'ws-2', 'error');
      expect(result).toBeNull();
    });
  });
});
