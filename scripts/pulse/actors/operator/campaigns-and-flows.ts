/**
 * Operator scenario: `operator-campaigns-and-flows`.
 *
 * Verifies — by structural observation only — that the operator surface for
 * the campaign builder + flow editor is wired end-to-end:
 *   - Frontend campaign + flow builder routes exist.
 *   - Backend `campaigns/*` and `flows/*` controllers + services exist.
 *   - Worker `campaign-processor` and `flow-engine-*` modules exist.
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
  { label: 'frontend-campaigns-route', relPath: 'frontend/src/app/(main)/campaigns' },
  { label: 'frontend-flow-route', relPath: 'frontend/src/app/(main)/flow' },

  // Backend controllers + services + modules
  {
    label: 'backend-campaigns-controller',
    relPath: 'backend/src/campaigns/campaigns.controller.ts',
  },
  { label: 'backend-campaigns-service', relPath: 'backend/src/campaigns/campaigns.service.ts' },
  { label: 'backend-campaigns-module', relPath: 'backend/src/campaigns/campaigns.module.ts' },
  { label: 'backend-flows-controller', relPath: 'backend/src/flows/flows.controller.ts' },
  { label: 'backend-flows-service', relPath: 'backend/src/flows/flows.service.ts' },
  { label: 'backend-flows-module', relPath: 'backend/src/flows/flows.module.ts' },

  // Worker queue handlers (BullMQ campaign + flow engine)
  { label: 'worker-queue', relPath: 'worker/queue.ts' },
  { label: 'worker-campaign-processor', relPath: 'worker/campaign-processor.ts' },
  { label: 'worker-flow-engine-lifecycle', relPath: 'worker/flow-engine-lifecycle.ts' },
  { label: 'worker-flow-engine-global', relPath: 'worker/flow-engine-global.ts' },
];

export interface CampaignsAndFlowsObservation {
  passed: boolean;
  summary: string;
  checks: StructuralCheck[];
  truthMode: 'observed';
}

export function observeCampaignsAndFlows(rootDir: string): CampaignsAndFlowsObservation {
  const checks = checkPaths(rootDir, CHECKS);
  const passed = allPresent(checks);
  const summary = passed
    ? `operator-campaigns-and-flows observed: ${checks.length} structural anchors present (frontend campaign + flow routes, backend campaigns/flows controllers + services, worker campaign-processor + flow-engine modules).`
    : `operator-campaigns-and-flows missing structural anchors: ${summarizeMissing(checks)}.`;
  return { passed, summary, checks, truthMode: 'observed' };
}
