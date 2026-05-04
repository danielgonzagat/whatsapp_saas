import type { PulseProductCapability, PulseProductGraph, PulseProductSurface } from '../../types';
import type { BehaviorGraph, BehaviorNode } from '../../types.behavior-graph';
import type { DataflowState, EntityLifecycle } from '../../types.dataflow-engine';
import type { HarnessEvidence, HarnessTarget } from '../../types.execution-harness';
import type { ScenarioCategory, ScenarioRole } from '../../types.scenario-engine';

const DEFAULT_STEP_TIMEOUT = 15000;
const LONG_STEP_TIMEOUT = 30000;

const BEHAVIOR_GRAPH_FILENAME = 'PULSE_BEHAVIOR_GRAPH.json';
const DATAFLOW_STATE_FILENAME = 'PULSE_DATAFLOW_STATE.json';
const HARNESS_EVIDENCE_FILENAME = 'PULSE_HARNESS_EVIDENCE.json';
const PRODUCT_GRAPH_FILENAME = 'PULSE_PRODUCT_GRAPH.json';
const SCENARIO_EVIDENCE_FILENAME = 'PULSE_SCENARIO_EVIDENCE.json';

interface ScenarioBuildContext {
  category: ScenarioCategory;
  primarySurfaceId: string;
  role: ScenarioRole;
  productGraph: PulseProductGraph | null;
  behaviorGraph: BehaviorGraph | null;
  harnessEvidence: HarnessEvidence | null;
  dataflowState: DataflowState | null;
  endpoints: BehaviorNode[];
  harnessTargets: HarnessTarget[];
  entities: EntityLifecycle[];
  primaryEntity: EntityLifecycle | null;
}

function getSurface(
  productGraph: PulseProductGraph | null,
  surfaceId: string,
): PulseProductSurface | null {
  return productGraph?.surfaces.find((s) => s.id === surfaceId) || null;
}

function getCapabilitiesForSurface(
  productGraph: PulseProductGraph | null,
  surfaceId: string,
): PulseProductCapability[] {
  if (!productGraph) return [];
  return productGraph.capabilities.filter((c) => c.surfaceId === surfaceId);
}

export type { ScenarioBuildContext };
export { getSurface, getCapabilitiesForSurface };
export {
  DEFAULT_STEP_TIMEOUT,
  LONG_STEP_TIMEOUT,
  BEHAVIOR_GRAPH_FILENAME,
  DATAFLOW_STATE_FILENAME,
  HARNESS_EVIDENCE_FILENAME,
  PRODUCT_GRAPH_FILENAME,
  SCENARIO_EVIDENCE_FILENAME,
};
