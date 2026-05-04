/**
 * PULSE Wave 5 — Scenario Evidence Engine (barrel)
 *
 * Generates executable scenario definitions for every core product flow.
 * Each scenario includes concrete steps (login, navigate, click, type,
 * submit, assert) derived from the behavior graph, execution harness,
 * dataflow engine, and product graph.
 *
 * Persisted to `.pulse/current/PULSE_SCENARIO_EVIDENCE.json`.
 *
 * Implementation lives in `scenario-engine/__parts__/`.
 */

import { buildScenarioCatalog } from './scenario-engine/__parts__/builder';

export { buildScenarioCatalog };
