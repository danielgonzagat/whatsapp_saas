/**
 * Operator structural-observation registry.
 *
 * Maps operator scenario ids to their structural observers. Used by the
 * synthetic-actor evaluator to back `playwright-spec`-runner scenarios with a
 * scan-mode observation when no live Playwright run was requested.
 */
import { observeCampaignsAndFlows } from './campaigns-and-flows';
import { observeAutopilotRun } from './autopilot-run';
import type { StructuralCheck } from './structural-checks';

export interface OperatorScenarioObservation {
  passed: boolean;
  summary: string;
  checks: StructuralCheck[];
  truthMode: 'inferred';
}

export type OperatorScenarioObserver = (rootDir: string) => OperatorScenarioObservation;

const OBSERVERS: Record<string, OperatorScenarioObserver> = {
  'operator-campaigns-and-flows': observeCampaignsAndFlows,
  'operator-autopilot-run': observeAutopilotRun,
};

export function getOperatorScenarioObserver(scenarioId: string): OperatorScenarioObserver | null {
  return OBSERVERS[scenarioId] || null;
}

export function listOperatorScenarioIds(): string[] {
  return Object.keys(OBSERVERS).sort();
}
