/**
 * PULSE Universal Execution Harness Engine
 *
 * Discovers all executable targets in the codebase and produces a complete
 * harness catalog — what needs to be tested, how, and with what fixtures.
 * Does NOT actually execute targets (that is done by external test runners).
 *
 * Stores artifact at `.pulse/current/PULSE_HARNESS_EVIDENCE.json`.
 */

export { buildExecutionHarness } from './__parts__/execution-harness-core/harness-builder';
export { generateTestHarnessCode } from './__parts__/execution-harness-core/harness-code-gen';
export {
  buildFixtureDataStructures,
  loadHarnessResults,
} from './__parts__/execution-harness-core/harness-fixtures';
export { discoverEndpoints } from './__parts__/execution-harness-core/discover-endpoints';
export { discoverServices } from './__parts__/execution-harness-core/discover-services';
export { discoverWorkers } from './__parts__/execution-harness-core/discover-workers';
export { discoverCrons } from './__parts__/execution-harness-core/discover-crons';
export { discoverWebhooks } from './__parts__/execution-harness-core/discover-webhooks';
export { generateFixturesForTarget } from './__parts__/execution-harness-core/generate-fixtures';
export {
  readBehaviorGraph,
  classifyExecutionFeasibility,
} from './__parts__/execution-harness-core/behavior-and-feasibility';
export { isCriticalHarnessTarget } from './__parts__/execution-harness-core/helpers';
