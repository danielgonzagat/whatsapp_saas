import type { HarnessTarget, HarnessFixture } from '../../types.execution-harness';
import { parseRouteParameters, formatTimestamp } from './helpers';

/**
 * Generate required fixtures for a given target.
 *
 * Analyzes the target's dependencies and characteristics to determine which
 * fixtures are needed for isolation testing. Fixture kinds include DB seeds,
 * mock services, test environment, queue messages, webhook payloads, and
 * auth tokens.
 *
 * @param target - The harness target to generate fixtures for
 * @param _rootDir - Repository root directory
 * @returns Array of required harness fixtures
 */
export function generateFixturesForTarget(
  target: HarnessTarget,
  _rootDir: string,
): HarnessFixture[] {
  const fixtures: HarnessFixture[] = [];

  // Test environment fixture — always required
  fixtures.push({
    kind: 'test_env',
    name: 'pulse-test-env',
    description: 'PULSE test environment with isolated database and Redis',
    data: { dbPrefix: 'pulse_test', redisPrefix: 'pulse_test' },
    ['required']: true,
    generated: false,
  });

  // Auth token fixture — required when target requires authentication
  if (target.requiresAuth) {
    fixtures.push({
      kind: 'auth_token',
      name: 'pulse-auth-token',
      description: 'Credential context material for discovered guard boundaries',
      data: {
        targetId: target.targetId,
        ['guardBoundaryRequired']: true,
        routeParameters: target.routePattern ? parseRouteParameters(target.routePattern) : [],
        credentialClaims: {
          subject: '__pulse_subject__',
          context: target.requiresTenant ? '__pulse_context__' : null,
        },
      },
      ['required']: true,
      generated: false,
    });
  }

  // DB seed fixture — required for targets with persistence dependencies
  const hasDbDependency =
    target.dependencies.some((d) => /prisma|database|repository|model/i.test(d)) ||
    target.kind === 'service' ||
    target.kind === 'endpoint';

  if (hasDbDependency) {
    fixtures.push({
      kind: 'db_seed',
      name: 'pulse-db-seed',
      description: `Database seed for target ${target.targetId}`,
      data: {
        targetId: target.targetId,
        requiredModels: target.dependencies.filter((d) => /^[A-Z]/.test(d)),
      },
      ['required']: false,
      generated: false,
    });
  }

  // Queue message fixture — for worker targets
  if (target.kind === 'worker') {
    fixtures.push({
      kind: 'queue_message',
      name: `pulse-queue-payload:${target.targetId}`,
      description: `Sample BullMQ job payload for ${target.name}`,
      data: {
        queueName: target.name.split('/')[0] || 'unknown',
        jobName: target.methodName || 'unknown-job',
        payload: {
          context: target.requiresTenant ? '__pulse_context__' : null,
          testMode: true,
          pulseRun: 'harness-discovery',
        },
      },
      ['required']: true,
      generated: false,
    });
  }

  // Webhook payload fixture — for webhook targets
  if (target.kind === 'webhook') {
    fixtures.push({
      kind: 'webhook_payload',
      name: `pulse-webhook-payload:${target.targetId}`,
      description: `Sample webhook payload for ${target.name}`,
      data: {
        ['event']: 'pulse.test.event',
        timestamp: formatTimestamp(),
        data: { id: 'pulse-test-id', testMode: true },
      },
      ['required']: true,
      generated: false,
    });
  }

  // Mock service fixtures — for dependent services
  for (const dep of target.dependencies) {
    const depName = dep.replace(/^service:/, '');
    if (!fixtures.some((f) => f.kind === 'mock_service' && f.name === depName)) {
      fixtures.push({
        kind: 'mock_service',
        name: depName,
        description: `Mock for ${depName} used by ${target.targetId}`,
        data: { targetId: target.targetId, dependency: depName },
        ['required']: true,
        generated: false,
      });
    }
  }

  return fixtures;
}
