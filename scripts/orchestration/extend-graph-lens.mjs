#!/usr/bin/env node

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
const GRAPH_SETTINGS_PATH = join(VAULT_ROOT, '.obsidian', 'graph.json');

const KLOEL_HUD_COLOR_GROUPS = [
  { query: 'tag:#findings/severity-critical', color: { a: 1, rgb: 16711680 } },
  { query: 'tag:#findings/severity-high', color: { a: 1, rgb: 16724736 } },
  { query: 'tag:#findings/severity-medium', color: { a: 1, rgb: 14724096 } },
  { query: 'tag:#findings/severity-low', color: { a: 1, rgb: 255 } },

  { query: 'tag:#kloel/tier-1', color: { a: 1, rgb: 16744576 } },
  { query: 'tag:#kloel/tier-2', color: { a: 1, rgb: 16766208 } },
  { query: 'tag:#kloel/tier-3', color: { a: 1, rgb: 14741250 } },
  { query: 'tag:#kloel/tier-4', color: { a: 1, rgb: 9614528 } },

  { query: 'tag:#kloel/phase-0', color: { a: 1, rgb: 10040524 } },
  { query: 'tag:#kloel/phase-1', color: { a: 1, rgb: 8388863 } },
  { query: 'tag:#kloel/phase-2', color: { a: 1, rgb: 6724351 } },
  { query: 'tag:#kloel/phase-3', color: { a: 1, rgb: 4849407 } },
  { query: 'tag:#kloel/phase-4', color: { a: 1, rgb: 4587519 } },
  { query: 'tag:#kloel/phase-5', color: { a: 1, rgb: 4587775 } },
  { query: 'tag:#kloel/phase-6', color: { a: 1, rgb: 65535 } },

  { query: 'tag:#coverage/below-threshold', color: { a: 1, rgb: 16776960 } },

  { query: 'tag:#ci/failing', color: { a: 1, rgb: 16711680 } },
  { query: 'tag:#ci/passing', color: { a: 1, rgb: 65280 } },

  { query: 'tag:#provider/down', color: { a: 1, rgb: 0 } },
  { query: 'tag:#provider/degraded', color: { a: 1, rgb: 16753920 } },
  { query: 'tag:#provider/healthy', color: { a: 1, rgb: 4521796 } },
  { query: 'tag:#provider/unknown', color: { a: 1, rgb: 8421504 } },
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
  const args = process.argv.slice(2);
  const show = args.includes('--show');
  const dry = args.includes('--dry');

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
  const ourQueries = new Set(KLOEL_HUD_COLOR_GROUPS.map((g) => g.query));
  const base = existing.filter((g) => !ourQueries.has(g.query));
  settings.colorGroups = [...base, ...KLOEL_HUD_COLOR_GROUPS];

  const summary = {
    base: base.length,
    kloel_added: KLOEL_HUD_COLOR_GROUPS.length,
    total: settings.colorGroups.length,
  };

  if (show) {
    process.stderr.write(`extend-graph-lens: colorGroups ${JSON.stringify(summary)}\n`);
  }

  if (dry) {
    process.stderr.write(`extend-graph-lens: dry run, would produce ${JSON.stringify(summary)}\n`);
    return;
  }

  const changed = writeJsonAtomic(GRAPH_SETTINGS_PATH, settings);
  process.stderr.write(
    `extend-graph-lens: written ${JSON.stringify(summary)} (changed=${changed})\n`,
  );
}

main();
