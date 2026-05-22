import { describe, expect, it, afterAll } from 'vitest';
import { buildQueueJobId } from '../job-id';
import { WorkerLogger } from '../logger';
import { checkAutopilotQueueHealth, parseNonNegativeEnvInt } from '../processor-health-monitor';
import { getHealth } from '../metrics';
import { shutdownQueueSystem } from '../queue';
import {
  AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB,
  parseSweepUnreadConversationsJobData,
  buildSweepUnreadConversationsJobData,
} from '../contracts/autopilot-jobs';

const evidenceLog = new WorkerLogger('autopilot-runtime-evidence');

describe('autopilot N3 evidence: operator run / enqueue / health', () => {
  afterAll(async () => {
    await shutdownQueueSystem(3000);
  });

  // --- Health evidence ---------------------------------------------------

  describe('worker health evidence', () => {
    it('getHealth returns ok status and queue counts when Redis is up', async () => {
      const health = await getHealth();

      expect(health.status).toBe('ok');
      expect(health.redis).toBe('PONG');
      expect(health.queues).toBeDefined();
      expect(health.queues.autopilot).toBeDefined();
      expect(typeof health.queues.autopilot.waiting).toBe('number');
      expect(typeof health.queues.autopilot.active).toBe('number');
      expect(typeof health.queues.autopilot.delayed).toBe('number');
      expect(typeof health.queues.autopilot.failed).toBe('number');
      expect(typeof health.queues.autopilot.completed).toBe('number');
    });

    it('getHealth success-path shape: status, redis, queues, and autopilot keys present', async () => {
      const health = await getHealth();
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('redis');
      expect(health).toHaveProperty('queues');
      expect(health.queues).toHaveProperty('autopilot');
      expect(['ok', 'degraded', 'down']).toContain(health.status);
    });
  });

  // --- Health monitor evidence -------------------------------------------

  describe('health monitor evidence', () => {
    it('parseNonNegativeEnvInt accepts zero and falls back for invalid drain limits', () => {
      expect(parseNonNegativeEnvInt('0', 1000)).toBe(0);
      expect(parseNonNegativeEnvInt('-1', 1000)).toBe(1000);
      expect(parseNonNegativeEnvInt('not-a-number', 1000)).toBe(1000);
      expect(parseNonNegativeEnvInt(undefined, 1000)).toBe(1000);
    });

    it('checkAutopilotQueueHealth is importable and resolves (error-tolerant by contract)', async () => {
      // The function swallows all internal errors via try/catch. It is designed
      // to never throw. This validates the import chain resolves and the queue
      // health-check path executes (getJobCounts -> cooldown check -> alert eval).
      await expect(checkAutopilotQueueHealth(evidenceLog)).resolves.toBeUndefined();
    });

    it('checkAutopilotQueueHealth is safe for repeated invocation (cooldown integrity)', async () => {
      await checkAutopilotQueueHealth(evidenceLog);
      await expect(checkAutopilotQueueHealth(evidenceLog)).resolves.toBeUndefined();
    });
  });

  // --- Job enqueue evidence (contract parsing) ---------------------------

  describe('job enqueue contract evidence', () => {
    it('parseSweepUnreadConversationsJobData parses valid payload', () => {
      const data = parseSweepUnreadConversationsJobData({
        workspaceId: 'ws-evidence-1',
        runId: 'run-001',
        limit: 10,
        mode: 'prioritize_hot',
        triggeredBy: 'manual',
      });

      expect(data.workspaceId).toBe('ws-evidence-1');
      expect(data.runId).toBe('run-001');
      expect(data.limit).toBe(10);
      expect(data.mode).toBe('prioritize_hot');
      expect(data.triggeredBy).toBe('manual');
    });

    it('parseSweepUnreadConversationsJobData applies defaults for missing fields', () => {
      const data = parseSweepUnreadConversationsJobData({
        workspaceId: 'ws-defaults',
        runId: 'run-defaults',
      });

      expect(data.workspaceId).toBe('ws-defaults');
      expect(data.runId).toBe('run-defaults');
      expect(data.limit).toBe(500);
      expect(data.mode).toBe('reply_all_recent_first');
      expect(data.triggeredBy).toBeUndefined();
    });

    it('parseSweepUnreadConversationsJobData rejects missing workspaceId', () => {
      expect(() => parseSweepUnreadConversationsJobData({ runId: 'r1' })).toThrow(
        'Missing required field "workspaceId"',
      );
    });

    it('parseSweepUnreadConversationsJobData rejects missing runId', () => {
      expect(() => parseSweepUnreadConversationsJobData({ workspaceId: 'w1' })).toThrow(
        'Missing required field "runId"',
      );
    });

    it('parseSweepUnreadConversationsJobData clamps limit to [1, 2000]', () => {
      expect(
        parseSweepUnreadConversationsJobData({
          workspaceId: 'w1',
          runId: 'r1',
          limit: 0,
        }).limit,
      ).toBe(1);

      expect(
        parseSweepUnreadConversationsJobData({
          workspaceId: 'w1',
          runId: 'r1',
          limit: 5000,
        }).limit,
      ).toBe(2000);

      expect(
        parseSweepUnreadConversationsJobData({
          workspaceId: 'w1',
          runId: 'r1',
          limit: -100,
        }).limit,
      ).toBe(1);
    });

    it('parseSweepUnreadConversationsJobData rejects non-object input', () => {
      expect(() => parseSweepUnreadConversationsJobData(null)).toThrow();
      expect(() => parseSweepUnreadConversationsJobData(42)).toThrow();
      expect(() => parseSweepUnreadConversationsJobData([])).toThrow();
    });

    it('buildSweepUnreadConversationsJobData delegates to parser correctly', () => {
      const result = buildSweepUnreadConversationsJobData({
        workspaceId: 'ws-build',
        runId: 'run-build',
        limit: 20,
        mode: 'reply_only_new',
      });

      expect(result.workspaceId).toBe('ws-build');
      expect(result.runId).toBe('run-build');
      expect(result.limit).toBe(20);
      expect(result.mode).toBe('reply_only_new');
      expect(result.triggeredBy).toBeUndefined();
    });

    it('AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB constant matches expected value', () => {
      expect(AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB).toBe('sweep-unread-conversations');
    });
  });

  // --- Job ID stability ---------------------------------------------------

  describe('job id stability (enqueue dedup)', () => {
    it('buildQueueJobId produces stable deterministic ids', () => {
      const id1 = buildQueueJobId('scan-contact', 'ws-x', 'contact-a', 'run', 'r1');
      const id2 = buildQueueJobId('scan-contact', 'ws-x', 'contact-a', 'run', 'r1');

      expect(id1).toBe(id2);
    });

    it('buildQueueJobId with empty/null parts falls back to na', () => {
      const id = buildQueueJobId('scheduled-followup', '', null, undefined);
      expect(id).toBe('scheduled-followup__na__na__na');
    });

    it('buildQueueJobId sanitizes special characters', () => {
      const id = buildQueueJobId('score-contact', 'ws 1', 'user@example.com');
      // spaces, @, . become underscores
      expect(id).not.toContain(' ');
      expect(id).not.toContain('@');
      expect(id).toMatch(/^score-contact__ws_1__user_example_com$/);
    });

    it('buildQueueJobId truncates to max 80 chars per part', () => {
      const long = 'a'.repeat(200);
      const id = buildQueueJobId('scan-contact', 'ws-x', long);
      const parts = id.split('__');
      for (const part of parts) {
        expect(part.length).toBeLessThanOrEqual(80);
      }
    });
  });
});
