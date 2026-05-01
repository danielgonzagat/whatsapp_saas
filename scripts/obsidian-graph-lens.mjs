#!/usr/bin/env node

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
const GRAPH_SETTINGS_PATH = resolve(VAULT_ROOT, '.obsidian', 'graph.json');
const STATIC_LENS_PATH = resolve(VAULT_ROOT, '.obsidian', 'graph.lens.static.json');
const RUNTIME_LENS_PATH = resolve(VAULT_ROOT, '.obsidian', 'graph.lens.runtime.json');
const WORKSPACE_GRAPH_SEARCH = '';

const CODE_STATE_COLOR_GROUPS = [
  { query: 'tag:#workspace/dirty', color: { a: 1, rgb: 14724096 } },
  { query: 'tag:#mirror/metadata-only', color: { a: 1, rgb: 8421504 } },
  { query: 'tag:#source/pulse-machine', color: { a: 1, rgb: 10040524 } },
  { query: 'tag:#signal/static-high', color: { a: 1, rgb: 16711680 } },
  { query: 'tag:#signal/hotspot', color: { a: 1, rgb: 16744192 } },
  { query: 'tag:#signal/external', color: { a: 1, rgb: 65535 } },
  { query: 'tag:#graph/risk-critical', color: { a: 1, rgb: 16711680 } },
  { query: 'tag:#graph/risk-high', color: { a: 1, rgb: 16744192 } },
  { query: 'tag:#graph/proof-test', color: { a: 1, rgb: 65280 } },
  { query: 'tag:#graph/runtime-api', color: { a: 1, rgb: 65535 } },
  { query: 'tag:#graph/surface-ui', color: { a: 1, rgb: 255 } },
  { query: 'tag:#graph/surface-backend', color: { a: 1, rgb: 6737151 } },
  { query: 'tag:#graph/surface-worker', color: { a: 1, rgb: 5635925 } },
  { query: 'tag:#graph/surface-source', color: { a: 1, rgb: 11184810 } },
  { query: 'tag:#graph/governance', color: { a: 1, rgb: 10040524 } },
  { query: 'tag:#graph/orphan', color: { a: 1, rgb: 16711935 } },
  { query: 'tag:#graph/molecule', color: { a: 1, rgb: 12632256 } },
];

const LENSES = {
  factory: {
    search: WORKSPACE_GRAPH_SEARCH,
    showOrphans: true,
    hideUnresolved: true,
    colorGroups: CODE_STATE_COLOR_GROUPS,
  },
  runtime: {
    search: WORKSPACE_GRAPH_SEARCH,
    showOrphans: true,
    hideUnresolved: true,
    colorGroups: CODE_STATE_COLOR_GROUPS,
  },
};

function writeJsonAtomic(filePath, value) {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  if (existsSync(filePath) && readFileSync(filePath, 'utf8') === next) {
    return false;
  }
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, next, 'utf8');
  renameSync(tmp, filePath);
  return true;
}

function installLensFiles() {
  writeJsonAtomic(STATIC_LENS_PATH, LENSES.factory);
  writeJsonAtomic(RUNTIME_LENS_PATH, LENSES.runtime);
}

function currentLensName() {
  if (!existsSync(GRAPH_SETTINGS_PATH)) return 'missing';
  const current = JSON.parse(readFileSync(GRAPH_SETTINGS_PATH, 'utf8'));
  const currentKeys = Object.keys(current).sort();
  const colorQueries = (current.colorGroups || []).map((group) => group.query).sort();
  const desiredQueries = CODE_STATE_COLOR_GROUPS.map((group) => group.query).sort();
  if (
    current.search === WORKSPACE_GRAPH_SEARCH &&
    JSON.stringify(colorQueries) === JSON.stringify(desiredQueries)
  ) {
    return 'factory';
  }
  return 'custom';
}

function applyLens(name) {
  const lens = LENSES[name];
  if (!lens) {
    throw new Error(`Unknown lens "${name}". Use static or runtime.`);
  }
  writeJsonAtomic(GRAPH_SETTINGS_PATH, lens);
  installLensFiles();
}

function printStatus() {
  const active = currentLensName();
  console.log(
    JSON.stringify(
      {
        active,
        graphSettingsPath: GRAPH_SETTINGS_PATH,
        staticLensPath: STATIC_LENS_PATH,
        runtimeLensPath: RUNTIME_LENS_PATH,
        available: Object.keys(LENSES),
      },
      null,
      2,
    ),
  );
}

function main() {
  const mode = process.argv[2] || '--status';
  if (mode === '--status') {
    printStatus();
    return;
  }
  if (mode === '--install') {
    installLensFiles();
    printStatus();
    return;
  }
  if (mode === '--factory') {
    applyLens('factory');
    printStatus();
    return;
  }
  if (mode === '--static') {
    applyLens('factory');
    printStatus();
    return;
  }
  if (mode === '--runtime') {
    applyLens('runtime');
    printStatus();
    return;
  }

  console.error(`Usage: node ${process.argv[1]} [--status|--install|--factory|--static|--runtime]`);
  process.exit(1);
}

main();
