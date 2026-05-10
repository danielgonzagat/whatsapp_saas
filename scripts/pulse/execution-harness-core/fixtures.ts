import * as path from 'path';
import type { BehaviorGraph, BehaviorNode } from '../types.behavior-graph';
import type {
  ExecutionFeasibility,
  HarnessFixture,
  HarnessTarget,
} from '../types.execution-harness';
import { safeJoin } from '../safe-path';
import { pathExists, readJsonFile, readTextFile } from '../safe-fs';
import {
  ALL_ARTIFACTS,
  constructorMemberName,
  CONTROLLER_KIND_LABEL,
  SCRIPT_KIND_LABEL,
  SERVICE_KIND_LABEL,
  WEBHOOK_KIND_LABEL,
  WORKER_KIND_LABEL,
} from './grammar';
import {
  CANNOT_EXECUTE_FEASIBILITY,
  EXECUTABLE_FEASIBILITY,
  NEEDS_STAGING_FEASIBILITY,
} from './helpers';
import { isConstructorMemberName } from './grammar';
import {
  AUTH_TOKEN_FIXTURE,
  DB_SEED_FIXTURE,
  ENDPOINT_KIND_LABEL,
  MOCK_SERVICE_FIXTURE,
  QUEUE_MESSAGE_FIXTURE,
  TEST_ENV_FIXTURE,
  WEBHOOK_PAYLOAD_FIXTURE,
} from './grammar';
import { formatTimestamp, parseRouteParameters } from './helpers';

// ─── Fixture Generation ─────────────────────────────────────────────────────

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
    kind: TEST_ENV_FIXTURE,
    name: 'pulse-test-env',
    description: 'PULSE test environment with isolated database and Redis',
    data: { dbPrefix: 'pulse_test', redisPrefix: 'pulse_test' },
    ['required']: true,
    generated: false,
  });

  // Auth token fixture — required when target requires authentication
  if (target.requiresAuth) {
    fixtures.push({
      kind: AUTH_TOKEN_FIXTURE,
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
    target.kind === SERVICE_KIND_LABEL ||
    target.kind === ENDPOINT_KIND_LABEL;

  if (hasDbDependency) {
    fixtures.push({
      kind: DB_SEED_FIXTURE,
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
  if (target.kind === WORKER_KIND_LABEL) {
    fixtures.push({
      kind: QUEUE_MESSAGE_FIXTURE,
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
  if (target.kind === WEBHOOK_KIND_LABEL) {
    fixtures.push({
      kind: WEBHOOK_PAYLOAD_FIXTURE,
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
    if (!fixtures.some((f) => f.kind === MOCK_SERVICE_FIXTURE && f.name === depName)) {
      fixtures.push({
        kind: MOCK_SERVICE_FIXTURE,
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

// ─── Behavior Graph Integration ────────────────────────────────────────────

export function behaviorGraphArtifactPath(): string {
  return `.pulse/current/${ALL_ARTIFACTS.behaviorGraph}`;
}

function externalCallShape(): RegExp {
  return /\b(?:fetch|axios|httpService|request)\s*(?:<[^>]*>)?\s*\(|\.(?:get|post|put|patch|delete)\s*\(\s*['"`]https?:\/\//i;
}

function infrastructureBoundaryShape(): RegExp {
  return /@\s*(?:Processor|Process|Cron|OnQueue\w*)\b|\b(?:new\s+Queue|QueueEvents|EventEmitter|emit|publish|subscribe)\s*\(/i;
}

function destructiveStateAccessShape(): RegExp {
  return /\.(?:delete|deleteMany|upsert)\s*\(/i;
}

/**
 * Load the behavior graph artifact produced by behavior-graph.ts.
 *
 * Behavior nodes carry per-function analysis (inputs, outputs, state access,
 * external calls, risk level, execution mode) used to classify harness
 * targets for execution feasibility.
 */
export function readBehaviorGraph(rootDir: string): BehaviorGraph | null {
  const behaviorGraphFile = safeJoin(rootDir, behaviorGraphArtifactPath());
  if (!pathExists(behaviorGraphFile)) {
    return null;
  }
  try {
    return readJsonFile<BehaviorGraph>(behaviorGraphFile);
  } catch {
    return null;
  }
}

// ─── Execution Feasibility Classification ────────────────────────────────────

/**
 * Classify a harness target's execution feasibility.
 *
 * Rules (in priority order):
 *   1. cannot_execute — no method to call, or browser-only UI handlers
 *   2. needs_staging — external API calls, queues, webhooks, real DB required
 *   3. executable     — everything else: pure logic, internal services, DB-only
 *
 * Behavior graph nodes are consulted when available to surface external calls
 * and state access that regex-based discovery cannot fully resolve.
 */
export function classifyExecutionFeasibility(
  target: HarnessTarget,
  behaviorNodes: Map<string, BehaviorNode>,
  rootDir?: string,
): { feasibility: ExecutionFeasibility; reason: string } {
  const targetLookupId = `${target.filePath}:${target.methodName ?? constructorMemberName()}`;

  // ── Check 1: no method means we cannot execute ──
  if (!target.methodName || isConstructorMemberName(target.methodName)) {
    return {
      feasibility: CANNOT_EXECUTE_FEASIBILITY,
      reason: 'No callable method or function identified — may be a class scaffold',
    };
  }

  // ── Check 2: browser-only UI handlers ──
  if (
    target.kind === SCRIPT_KIND_LABEL ||
    target.kind === CONTROLLER_KIND_LABEL ||
    (target.filePath.toLowerCase().includes('/frontend/') &&
      !target.filePath.toLowerCase().includes('/api/'))
  ) {
    return {
      feasibility: CANNOT_EXECUTE_FEASIBILITY,
      reason: `Target kind "${target.kind}" requires browser interaction or is frontend-only`,
    };
  }

  // ── Look up behavior node for richer context ──
  const behaviorNode = behaviorNodes.get(targetLookupId);

  // ── Check 3: behavior graph requires governed staging execution ──
  if (behaviorNode && behaviorNode.executionMode === 'human_required') {
    return {
      feasibility: NEEDS_STAGING_FEASIBILITY,
      reason: `Behavior graph requires governed staging execution for "${behaviorNode.name}" before this can become observed proof.`,
    };
  }

  // ── Check 4: external API calls ──
  if (behaviorNode?.externalCalls && behaviorNode.externalCalls.length > 0) {
    const upstreamNames = [...new Set(behaviorNode.externalCalls.map((c) => c.provider))];
    return {
      feasibility: NEEDS_STAGING_FEASIBILITY,
      reason: `Behavior graph detects external calls to: ${upstreamNames.join(', ')}`,
    };
  }

  const targetSource = rootDir ? readHarnessTargetSource(rootDir, target.filePath) : '';

  if (targetSource && externalCallShape().test(targetSource)) {
    return {
      feasibility: NEEDS_STAGING_FEASIBILITY,
      reason:
        'Source contains an outbound HTTP call shape that requires network-controlled staging',
    };
  }

  // ── Check 5: queue/event infrastructure boundaries ──
  if (targetSource && infrastructureBoundaryShape().test(targetSource)) {
    return {
      feasibility: NEEDS_STAGING_FEASIBILITY,
      reason: 'Source contains queue/event infrastructure shape that requires staging services',
    };
  }

  if (target.kind === WORKER_KIND_LABEL || target.kind === WEBHOOK_KIND_LABEL) {
    return {
      feasibility: NEEDS_STAGING_FEASIBILITY,
      reason: `Target kind "${target.kind}" requires queue infrastructure or inbound webhook endpoint`,
    };
  }

  // ── Check 6: destructive DB writes ──
  if (
    behaviorNode?.stateAccess &&
    behaviorNode.stateAccess.length > 0 &&
    behaviorNode.stateAccess.some((s) => s.operation === 'delete' || s.operation === 'upsert')
  ) {
    return {
      feasibility: NEEDS_STAGING_FEASIBILITY,
      reason: `Target performs destructive DB writes on: ${behaviorNode.stateAccess.map((s) => s.model).join(', ')}`,
    };
  }
  if (targetSource && destructiveStateAccessShape().test(targetSource)) {
    return {
      feasibility: NEEDS_STAGING_FEASIBILITY,
      reason: 'Source contains destructive persistent-state access that requires sandboxed staging',
    };
  }

  // ── Default: executable ──
  const supports = behaviorNode
    ? `behavior-graph confirms ${behaviorNode.kind} (${behaviorNode.executionMode})`
    : 'no external deps or infrastructure detected';

  return {
    feasibility: EXECUTABLE_FEASIBILITY,
    reason: `Target is self-contained: ${supports}`,
  };
}

export function readHarnessTargetSource(rootDir: string, sourceLocator: string): string {
  const absoluteSourceFile = path.isAbsolute(sourceLocator)
    ? sourceLocator
    : safeJoin(rootDir, sourceLocator);
  if (!pathExists(absoluteSourceFile)) {
    return '';
  }
  try {
    return readTextFile(absoluteSourceFile);
  } catch {
    return '';
  }
}
