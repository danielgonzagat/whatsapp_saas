#!/usr/bin/env node
/**
 * PULSE Bridge Emitter — reads PULSE static auditor outputs and creates
 * synthetic `kloel.findings.v1` sidecar entries (engine="pulse") that
 * flow into the HUD findings pipeline.
 *
 * Signal sources (read-only on PULSE artifacts):
 *   PULSE_PARITY_GAPS.json     → back_without_front, front_without_back, ui_without_persistence
 *   PULSE_STRUCTURAL_GRAPH.json → shell/façade nodes (no persistence connection)
 *   PULSE_PRODUCT_GRAPH.json   → phantomCapabilities, latentCapabilities
 *   PULSE_SCOPE_STATE.json     → orphan files (dead_handler candidates)
 *   PULSE_REPORT.md            → "phantom surface", "shell or façade" text signals
 *
 * Idempotent: removes old engine="pulse" entries before writing new ones.
 * Atomic writes: tmp + rename.
 *
 * CLI:
 *   node scripts/orchestration/pulse-bridge-emitter.mjs          # default emit
 *   node scripts/orchestration/pulse-bridge-emitter.mjs --dry    # dry-run, stderr JSON
 *   node scripts/orchestration/pulse-bridge-emitter.mjs --summary # markdown table to stdout
 */
export * from './pulse-bridge-emitter/__parts__/core.mjs';
export * from './pulse-bridge-emitter/__parts__/main.mjs';
import { main } from './pulse-bridge-emitter/__parts__/main.mjs';
main();
