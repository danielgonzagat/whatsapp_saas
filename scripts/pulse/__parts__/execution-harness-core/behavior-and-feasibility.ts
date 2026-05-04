import * as path from 'path';
import type { BehaviorGraph, BehaviorNode } from '../../types.behavior-graph';
import type { ExecutionFeasibility, HarnessTarget } from '../../types.execution-harness';
import { safeJoin } from '../../safe-path';
import { pathExists, readJsonFile, readTextFile } from '../../safe-fs';
import { constructorMemberName, isConstructorMemberName } from './grammar';

function behaviorGraphArtifactPath(): string {
  return '.pulse/current/PULSE_BEHAVIOR_GRAPH.json';
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
      feasibility: 'cannot_execute',
      reason: 'No callable method or function identified — may be a class scaffold',
    };
  }

  // ── Check 2: browser-only UI handlers ──
  if (
    target.kind === 'script' ||
    target.kind === 'controller' ||
    (target.filePath.toLowerCase().includes('/frontend/') &&
      !target.filePath.toLowerCase().includes('/api/'))
  ) {
    return {
      feasibility: 'cannot_execute',
      reason: `Target kind "${target.kind}" requires browser interaction or is frontend-only`,
    };
  }

  // ── Look up behavior node for richer context ──
  const behaviorNode = behaviorNodes.get(targetLookupId);

  // ── Check 3: behavior graph requires governed staging execution ──
  if (behaviorNode && behaviorNode.executionMode === 'human_required') {
    return {
      feasibility: 'needs_staging',
      reason: `Behavior graph requires governed staging execution for "${behaviorNode.name}" before this can become observed proof.`,
    };
  }

  // ── Check 4: external API calls ──
  if (behaviorNode?.externalCalls && behaviorNode.externalCalls.length > 0) {
    const upstreamNames = [...new Set(behaviorNode.externalCalls.map((c) => c.provider))];
    return {
      feasibility: 'needs_staging',
      reason: `Behavior graph detects external calls to: ${upstreamNames.join(', ')}`,
    };
  }

  const targetSource = rootDir ? readHarnessTargetSource(rootDir, target.filePath) : '';

  if (targetSource && externalCallShape().test(targetSource)) {
    return {
      feasibility: 'needs_staging',
      reason:
        'Source contains an outbound HTTP call shape that requires network-controlled staging',
    };
  }

  // ── Check 5: queue/event infrastructure boundaries ──
  if (targetSource && infrastructureBoundaryShape().test(targetSource)) {
    return {
      feasibility: 'needs_staging',
      reason: 'Source contains queue/event infrastructure shape that requires staging services',
    };
  }

  if (target.kind === 'worker' || target.kind === 'webhook') {
    return {
      feasibility: 'needs_staging',
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
      feasibility: 'needs_staging',
      reason: `Target performs destructive DB writes on: ${behaviorNode.stateAccess.map((s) => s.model).join(', ')}`,
    };
  }
  if (targetSource && destructiveStateAccessShape().test(targetSource)) {
    return {
      feasibility: 'needs_staging',
      reason: 'Source contains destructive persistent-state access that requires sandboxed staging',
    };
  }

  // ── Default: executable ──
  const supports = behaviorNode
    ? `behavior-graph confirms ${behaviorNode.kind} (${behaviorNode.executionMode})`
    : 'no external deps or infrastructure detected';

  return {
    feasibility: 'executable',
    reason: `Target is self-contained: ${supports}`,
  };
}

function readHarnessTargetSource(rootDir: string, sourceLocator: string): string {
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
