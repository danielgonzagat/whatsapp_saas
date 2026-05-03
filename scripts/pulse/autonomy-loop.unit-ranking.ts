export { toUnitSnapshot } from './__parts__/autonomy-loop.unit-ranking/core';
export { getAiSafeUnits } from './__parts__/autonomy-loop.unit-ranking/core';
export { getAutomationExecutionCost } from './__parts__/autonomy-loop.unit-ranking/core';
export {
  buildStructuralQueueInfluence,
  buildRuntimeRealityQueueInfluence,
} from './__parts__/autonomy-loop.unit-ranking/influence';
export {
  getAutomationSafeUnits,
  getFreshAutomationSafeUnits,
  getPreferredAutomationSafeUnits,
  getStalledUnitIds,
  getUnitHistory,
  hasAdaptiveRetryBeenExhausted,
  selectParallelUnits,
  hasUnitConflict,
  isRiskSafeForAutomation,
} from './__parts__/autonomy-loop.unit-ranking/selection';
export type {
  StructuralQueueInfluence,
  RuntimeRealityUnitMetadata,
} from './__parts__/autonomy-loop.unit-ranking/types';
