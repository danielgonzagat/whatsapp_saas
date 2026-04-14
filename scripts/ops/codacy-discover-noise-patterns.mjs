#!/usr/bin/env node
/**
 * scripts/ops/codacy-discover-noise-patterns.mjs
 *
 * Phase 0 of the Codacy convergence plan
 * (docs/codacy/synthetic-whistling-meteor.md is the live spec).
 *
 * Reads the byPatternId map from PULSE_CODACY_STATE.json and produces
 * docs/codacy/noise-patterns.json — the ordered list of pattern IDs that
 * scripts/ops/codacy-pattern-overrides.mjs (Phase 1) will PATCH off.
 *
 * "Noise" here means: pattern families that are objectively wrong for this
 * Next.js 16 + NestJS + Vitest + Jest stack. Each entry is justified by:
 *   - Why the rule fires on this stack (tooling intent vs. project reality).
 *   - The expected delta from the live snapshot.
 *   - The Codacy tool UUID that owns it.
 *
 * Output shape:
 *   {
 *     generatedAt: "2026-04-13T...",
 *     totalNoiseIssues: <sum>,
 *     patterns: [
 *       { id, count, toolUuid, toolName, family, justification }
 *     ]
 *   }
 *
 * No mutations — this script is read-only against Codacy's API.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const snapshotPath = path.join(repoRoot, 'PULSE_CODACY_STATE.json');
const toolUuidsPath = path.join(repoRoot, 'docs/codacy/tool-uuids.json');
const outputPath = path.join(repoRoot, 'docs/codacy/noise-patterns.json');

// Stable tool UUID lookup. Discovered via Phase 0 GET /tools call. Pinned
// here so the script is deterministic without a live API call.
const TOOL_UUID = {
  ESLINT_DEPRECATED: 'cf05f3aa-fd23-4586-8cce-5368917ec3e5',
  ESLINT: 'f8b29663-2cb2-498d-b923-a10c6a8c05cd',
  ESLINT9: '2a30ab97-477f-4769-8b88-af596ce7a94c',
  BIOME: '934a97f8-835c-42fc-a6d1-02bdfca3bdfa',
};

// Family detectors. Each detector returns null if the pattern doesn't match
// the family, or { family, toolUuid, justification } if it does.
const FAMILIES = [
  {
    family: 'es-x (ECMAScript compat from eslint-plugin-es)',
    toolUuid: TOOL_UUID.ESLINT_DEPRECATED,
    matches: (id) => /^ESLint8?_es-x_/.test(id),
    justification:
      'eslint-plugin-es targets ES5/legacy compat. Project is Node 20 + Next 16 + ES2024. ' +
      'Rules forbidding `let`/`const`, `import`/`export`, arrow functions, and trailing commas ' +
      'are objectively wrong for the stack and add zero signal.',
  },
  {
    family: 'fp (eslint-plugin-fp)',
    toolUuid: TOOL_UUID.ESLINT_DEPRECATED,
    matches: (id) => /^ESLint8?_fp_/.test(id),
    justification:
      'eslint-plugin-fp forbids `null`/`undefined` and mutation. NestJS controllers, Prisma ' +
      'optional relations, and React props all rely on `null`/`undefined` as domain values. ' +
      'Philosophically incompatible with the stack.',
  },
  {
    family: '@typescript-eslint/no-unsafe-* (mirror local override)',
    toolUuid: TOOL_UUID.ESLINT_DEPRECATED,
    matches: (id) =>
      /^ESLint8?_@typescript-eslint_no-unsafe-(call|assignment|member-access|argument|return)$/.test(
        id,
      ),
    justification:
      'Local backend/frontend/worker eslint.config.mjs files all set ' +
      "'@typescript-eslint/no-explicit-any': 'off' and the no-unsafe-* family is a downstream " +
      'consequence. Codacy ignores the local override because its ESLint8 engine runs separately. ' +
      'Tracked as Phase 3 type-debt; will be re-enabled file-by-file by Ralph Loop after refactor.',
  },
  {
    family: 'Biome nursery (experimental)',
    toolUuid: TOOL_UUID.BIOME,
    matches: (id) => /^Biome_lint_nursery_/.test(id),
    justification:
      'Biome explicitly marks nursery rules as unstable / pre-release. They are not recommended ' +
      'for production use and produce noise on otherwise-correct code.',
  },
  {
    family: 'Biome correctness.noUndeclaredDependencies (monorepo blind)',
    toolUuid: TOOL_UUID.BIOME,
    matches: (id) => id === 'Biome_lint_correctness_noUndeclaredDependencies',
    justification:
      'Biome cannot resolve nested package.json files in this monorepo (root + backend + ' +
      'frontend + worker + e2e). Every legitimate cross-workspace import is flagged. The new ' +
      'biome.json at repo root sets this to "off"; the API-side disable is belt-and-suspenders.',
  },
  {
    family: 'Biome suspicious.noReactSpecificProps (wrong stack)',
    toolUuid: TOOL_UUID.BIOME,
    matches: (id) => id === 'Biome_lint_suspicious_noReactSpecificProps',
    justification:
      'Rule targets non-React frameworks (Solid, Qwik). This is a Next.js 16 codebase where ' +
      '`className`/`htmlFor` are mandatory React props, not antipatterns.',
  },
];

function detectFamily(patternId) {
  for (const fam of FAMILIES) {
    if (fam.matches(patternId)) return fam;
  }
  return null;
}

function main() {
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const tools = JSON.parse(readFileSync(toolUuidsPath, 'utf8'));
  const toolNameByUuid = Object.fromEntries(tools.map((t) => [t.uuid, t.name]));

  const byPatternId = snapshot.byPatternId || {};
  const matched = [];
  let totalNoise = 0;

  for (const [patternId, count] of Object.entries(byPatternId)) {
    const fam = detectFamily(patternId);
    if (!fam) continue;
    matched.push({
      id: patternId,
      count,
      toolUuid: fam.toolUuid,
      toolName: toolNameByUuid[fam.toolUuid] || 'unknown',
      family: fam.family,
      justification: fam.justification,
    });
    totalNoise += count;
  }

  // Stable sort: by tool, then by count desc, then by id.
  matched.sort((a, b) => {
    if (a.toolUuid !== b.toolUuid) return a.toolUuid.localeCompare(b.toolUuid);
    if (b.count !== a.count) return b.count - a.count;
    return a.id.localeCompare(b.id);
  });

  const result = {
    generatedAt: new Date().toISOString(),
    source: 'scripts/ops/codacy-discover-noise-patterns.mjs',
    snapshotSyncedAt: snapshot.syncedAt,
    totalNoiseIssues: totalNoise,
    snapshotTotalIssues: snapshot.totalIssues,
    noisePercentage: Number(((totalNoise / snapshot.totalIssues) * 100).toFixed(1)),
    families: FAMILIES.map((f) => ({ family: f.family, justification: f.justification })),
    patterns: matched,
  };

  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);

  console.log(
    `[noise-discover] Wrote ${path.relative(repoRoot, outputPath)} — ${matched.length} patterns ` +
      `accounting for ${totalNoise} issues (${result.noisePercentage}% of ${snapshot.totalIssues}).`,
  );
  console.log(`[noise-discover] By family:`);
  const byFamily = matched.reduce((acc, p) => {
    acc[p.family] = (acc[p.family] || 0) + p.count;
    return acc;
  }, {});
  for (const [family, count] of Object.entries(byFamily).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(6)}  ${family}`);
  }
  console.log(`[noise-discover] Top 10 patterns:`);
  for (const p of matched.slice(0, 10)) {
    console.log(`  ${p.count.toString().padStart(5)}  ${p.id}`);
  }
}

main();
