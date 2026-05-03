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

export { buildScenarioCatalog } from './__parts__/scenario-engine/summary-catalog';
