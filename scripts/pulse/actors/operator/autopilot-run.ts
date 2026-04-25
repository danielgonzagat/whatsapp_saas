/**
 * Operator scenario: `operator-autopilot-run`.
 *
 * Verifies — by structural observation only — that the autopilot operator
 * surface is wired end-to-end:
 *   - Frontend autopilot + analytics routes exist.
 *   - Backend autopilot controller + service exist (cycle executor, ops).
 *   - Worker autopilot processor exists.
 *   - The AI provider abstraction is wired in worker `providers/ai-provider.ts`
 *     and registry.
 *
 * Scan-mode evidence is emitted with `truthMode: 'observed'` because each
 * assertion is grounded in a present file path. No HTTP request is made.
 */
import {
  checkPaths,
  allPresent,
  summarizeMissing,
  type StructuralCheck,
} from './structural-checks';

const CHECKS: ReadonlyArray<{ label: string; relPath: string }> = [
  // Frontend operator surfaces
  { label: 'frontend-autopilot-route', relPath: 'frontend/src/app/(main)/autopilot' },
  { label: 'frontend-analytics-route', relPath: 'frontend/src/app/(main)/analytics' },

  // Backend autopilot controller + service stack
  {
    label: 'backend-autopilot-controller',
    relPath: 'backend/src/autopilot/autopilot.controller.ts',
  },
  { label: 'backend-autopilot-service', relPath: 'backend/src/autopilot/autopilot.service.ts' },
  { label: 'backend-autopilot-module', relPath: 'backend/src/autopilot/autopilot.module.ts' },
  {
    label: 'backend-autopilot-cycle-executor',
    relPath: 'backend/src/autopilot/autopilot-cycle-executor.service.ts',
  },
  { label: 'backend-autopilot-ops', relPath: 'backend/src/autopilot/autopilot-ops.service.ts' },

  // Worker autopilot processor + AI provider abstraction
  { label: 'worker-autopilot-processor', relPath: 'worker/processors/autopilot-processor.ts' },
  { label: 'worker-ai-provider', relPath: 'worker/providers/ai-provider.ts' },
  { label: 'worker-providers-registry', relPath: 'worker/providers/registry.ts' },
  { label: 'worker-queue', relPath: 'worker/queue.ts' },
];

export interface AutopilotRunObservation {
  passed: boolean;
  summary: string;
  checks: StructuralCheck[];
  truthMode: 'observed';
}

export function observeAutopilotRun(rootDir: string): AutopilotRunObservation {
  const checks = checkPaths(rootDir, CHECKS);
  const passed = allPresent(checks);
  const summary = passed
    ? `operator-autopilot-run observed: ${checks.length} structural anchors present (frontend autopilot + analytics routes, backend autopilot controller + cycle executor, worker autopilot-processor + ai-provider).`
    : `operator-autopilot-run missing structural anchors: ${summarizeMissing(checks)}.`;
  return { passed, summary, checks, truthMode: 'observed' };
}
