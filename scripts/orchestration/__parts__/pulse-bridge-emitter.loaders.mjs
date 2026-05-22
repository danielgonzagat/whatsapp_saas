// PULSE artifact loaders — extracted from pulse-bridge-emitter.mjs so the
// main script stays below the architecture-guard line budget.

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(join(import.meta.dirname, '..', '..', '..'));
const PULSE_CURRENT_DIR = join(REPO_ROOT, '.pulse', 'current');
const PULSE_PARITY_GAPS_PATH = join(PULSE_CURRENT_DIR, 'PULSE_PARITY_GAPS.json');
const PULSE_STRUCTURAL_GRAPH_PATH = join(PULSE_CURRENT_DIR, 'PULSE_STRUCTURAL_GRAPH.json');
const PULSE_PRODUCT_GRAPH_PATH = join(PULSE_CURRENT_DIR, 'PULSE_PRODUCT_GRAPH.json');
const PULSE_SCOPE_STATE_PATH = join(PULSE_CURRENT_DIR, 'PULSE_SCOPE_STATE.json');
const PULSE_REPORT_PATH = join(REPO_ROOT, 'PULSE_REPORT.md');

export function loadJSON(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function loadPULSEParityGaps() {
  const data = loadJSON(PULSE_PARITY_GAPS_PATH);
  return data?.gaps || [];
}

export function loadStructuralGraphNodes() {
  const data = loadJSON(PULSE_STRUCTURAL_GRAPH_PATH);
  return data?.nodes || [];
}

export function loadProductGraph() {
  return loadJSON(PULSE_PRODUCT_GRAPH_PATH);
}

export function loadScopeState() {
  return loadJSON(PULSE_SCOPE_STATE_PATH);
}

export function loadPULSEReportText() {
  if (!existsSync(PULSE_REPORT_PATH)) return '';
  return readFileSync(PULSE_REPORT_PATH, 'utf8');
}
