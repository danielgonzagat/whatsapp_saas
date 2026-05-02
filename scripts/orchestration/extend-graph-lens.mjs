#!/usr/bin/env node

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
const GRAPH_SETTINGS_PATH = join(VAULT_ROOT, '.obsidian', 'graph.json');

const SEVERITY_COLOR_GROUPS = [
  { query: 'tag:#findings/severity-critical', color: { a: 1, rgb: 16711680 } },
  { query: 'tag:#findings/severity-high', color: { a: 1, rgb: 16724736 } },
  { query: 'tag:#findings/severity-medium', color: { a: 1, rgb: 14724096 } },
  { query: 'tag:#findings/severity-low', color: { a: 1, rgb: 255 } },
];

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

function main() {
  if (!existsSync(GRAPH_SETTINGS_PATH)) {
    process.stderr.write(
      `extend-graph-lens: ${GRAPH_SETTINGS_PATH} does not exist — run graph-lens --factory first\n`,
    );
    process.exit(2);
  }

  let settings;
  try {
    settings = JSON.parse(readFileSync(GRAPH_SETTINGS_PATH, 'utf8'));
  } catch (e) {
    process.stderr.write(`extend-graph-lens: cannot parse ${GRAPH_SETTINGS_PATH}: ${e.message}\n`);
    process.exit(2);
  }

  const existing = settings.colorGroups || [];
  const existingQueries = new Set(existing.map((g) => g.query));

  let added = 0;
  for (const group of SEVERITY_COLOR_GROUPS) {
    if (!existingQueries.has(group.query)) {
      existing.push(group);
      added++;
    }
  }

  if (added === 0) {
    process.stderr.write(
      'extend-graph-lens: severity color groups already present, nothing to do\n',
    );
    return;
  }

  settings.colorGroups = existing;
  const changed = writeJsonAtomic(GRAPH_SETTINGS_PATH, settings);
  process.stderr.write(
    `extend-graph-lens: merged ${added} severity color groups into ${GRAPH_SETTINGS_PATH} (changed=${changed})\n`,
  );
}

main();
