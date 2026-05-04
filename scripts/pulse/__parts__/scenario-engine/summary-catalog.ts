/**
 * PULSE Wave 5 — Scenario Evidence Engine
 *
 * Generates executable scenario definitions for every core product flow.
 * Each scenario includes concrete steps (login, navigate, click, type,
 * submit, assert) derived from the behavior graph, execution harness,
 * dataflow engine, and product graph.
 *
 * Persisted to `.pulse/current/PULSE_SCENARIO_EVIDENCE.json`.
 */

import { writeTextFile } from '../../safe-fs';
import type { PulseProductGraph } from '../../types';
import type { Scenario, ScenarioEvidenceState } from '../../types.scenario-engine';
import { loadAllArtifacts, resolveArtifactPath } from './artifact-loaders';
import { getFlowsForSurface } from './artifact-queries';
import { SCENARIO_EVIDENCE_FILENAME } from './constants';
import { buildScenario, resolveScenarioBuildContext } from './scenario-builder';

interface ScenarioSummary {
  total: number;
  passed: number;
  failed: number;
  notRun: number;
  generated: number;
  coreScenarios: number;
  coreScenariosPassed: number;
  byCategory: Record<string, { total: number; passed: number; failed: number; notRun: number }>;
}

function computeSummary(scenarios: Scenario[]): ScenarioSummary {
  const total = scenarios.length;
  const passed = scenarios.filter((s) => s.status === 'passed').length;
  const failed = scenarios.filter((s) => s.status === 'failed').length;
  const notRun = scenarios.filter((s) => s.status === 'not_run').length;
  const generated = scenarios.filter((s) => s.playwrightSpec != null).length;
  const coreScenarios = scenarios.filter((s) => s.preconditions.length > 0 || s.steps.length > 2);
  const coreScenariosPassed = coreScenarios.filter((s) => s.status === 'passed').length;

  const byCategory: Record<
    string,
    { total: number; passed: number; failed: number; notRun: number }
  > = {};
  for (const s of scenarios) {
    const cat = s.category || 'unknown';
    if (!byCategory[cat]) {
      byCategory[cat] = { total: 0, passed: 0, failed: 0, notRun: 0 };
    }
    byCategory[cat].total++;
    if (s.status === 'passed') byCategory[cat].passed++;
    else if (s.status === 'failed') byCategory[cat].failed++;
    else byCategory[cat].notRun++;
  }

  return {
    total,
    passed,
    failed,
    notRun,
    generated,
    coreScenarios: coreScenarios.length,
    coreScenariosPassed,
    byCategory,
  };
}

/**
 * Build the full scenario catalog for every core product flow.
 *
 * Reads the behavior graph, product graph, execution harness, and dataflow
 * engine from `.pulse/current/`, generates executable scenario definitions
 * with concrete steps and Playwright-compatible spec strings, and persists
 * the result to `.pulse/current/PULSE_SCENARIO_EVIDENCE.json`.
 *
 * @param rootDir - Repo root directory.
 * @returns The generated scenario evidence state.
 */
export function buildScenarioCatalog(rootDir: string): ScenarioEvidenceState {
  const artifacts = loadAllArtifacts(rootDir);

  const allScenarios: Scenario[] = [];
  const productGraph: PulseProductGraph | null = artifacts.productGraph;

  if (productGraph) {
    for (const surface of productGraph.surfaces) {
      const ctx = resolveScenarioBuildContext(surface, artifacts);
      const flows = getFlowsForSurface(productGraph, surface.id);

      if (flows.length === 0) {
        allScenarios.push(
          buildScenario(`surface-${surface.id}`, `Surface Map: ${surface.name}`, 'surface-map', {
            ...ctx,
            category: 'surface-map',
          }),
        );
        continue;
      }

      for (const flow of flows) {
        allScenarios.push(buildScenario(flow.id, flow.name, flow.id, ctx));
      }
    }
  }

  const state: ScenarioEvidenceState = {
    generatedAt: new Date().toISOString(),
    summary: computeSummary(allScenarios),
    scenarios: allScenarios,
  };

  const outputPath = resolveArtifactPath(rootDir, SCENARIO_EVIDENCE_FILENAME);
  writeTextFile(outputPath, JSON.stringify(state, null, 2));

  return state;
}
