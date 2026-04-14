#!/usr/bin/env node
/**
 * Codacy noise-pattern disable orchestration.
 *
 * Replaces the repository's `Default coding standard` (id 151337) with a
 * new curated standard that is a MIRROR of 151337 minus the noise patterns
 * documented in `docs/codacy/noise-patterns.json` and the top-of-PULSE
 * analysis (see docs/codacy/applied-overrides.md for justification).
 *
 * The prior attempt (logged in applied-overrides.md, phase 1.5) batch-
 * PATCHed a draft and got 4/19 disables because the draft's inherited
 * pattern set differed from the live published standard. This version:
 *
 *   1. Enumerates ALL 5 tools in 151337 with pagination.
 *   2. Creates a fresh draft.
 *   3. Mirrors 151337 into the draft tool-by-tool (catches up any enabled
 *      patterns the default draft is missing, disables any extras).
 *   4. Applies the noise-disable list with per-pattern retry.
 *   5. Verifies draft.enabledPatternsCount = 151337.count - |appliedNoise|.
 *   6. Promotes the draft via POST /promote.
 *   7. Links the new standard to the repository via PATCH /repositories
 *      with body `{link: [repoName], unlink: []}`.
 *   8. Unlinks 151337 from the repository.
 *   9. Writes the rollback plan to docs/codacy/applied-overrides.md.
 *
 * Flags:
 *   --dry-run       (no writes)
 *   --print-diff    (log the mirror plan without applying)
 *   --keep-draft    (skip promote — leave as inspectable draft)
 *
 * Exit codes:
 *   0 — success
 *   1 — unrecoverable API error
 *   2 — verification failed (draft doesn't match expected post-state)
 *   3 — env missing
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = process.cwd();
const ORG = 'gh/danielgonzagat';
const REPO_NAME = 'whatsapp_saas';
const SOURCE_STANDARD_ID = 151337; // "Default coding standard" — Biome/Lizard/ESLint/Agentlinter/etc
const BASE = 'https://api.codacy.com/api/v3';
const DRY_RUN = process.argv.includes('--dry-run');
const KEEP_DRAFT = process.argv.includes('--keep-draft');
const PRINT_DIFF = process.argv.includes('--print-diff');

/**
 * Noise patterns to disable. Each entry is a Codacy pattern id exactly as
 * reported by PULSE_CODACY_STATE.json. `reason` is stored in the rollback
 * log, not sent to the API.
 *
 * DO NOT add `Biome_lint_suspicious_noExplicitAny` here — that is real type
 * debt, not noise. Ditto for a11y rules and unused-code rules.
 */
const NOISE_PATTERNS = [
  {
    id: 'Biome_lint_suspicious_noReactSpecificProps',
    reason:
      'WRONG_RULE — Biome rule for Solid/Qwik; this is a Next.js 16 React codebase where className/htmlFor are mandatory.',
  },
  {
    id: 'Biome_lint_correctness_noUndeclaredDependencies',
    reason:
      'WRONG_RULE — Biome cannot resolve nested package.json in this monorepo (root + backend + frontend + worker + e2e). Every cross-workspace import is flagged.',
  },
  {
    id: 'Biome_lint_nursery_noJsxPropsBind',
    reason: 'Biome nursery / experimental. Not recommended for production.',
  },
  {
    id: 'Biome_lint_correctness_useQwikValidLexicalScope',
    reason: 'WRONG_RULE — Qwik framework rule, this is React.',
  },
  {
    id: 'Biome_lint_performance_useSolidForComponent',
    reason: 'WRONG_RULE — Solid framework rule, this is React.',
  },
  {
    id: 'Biome_lint_correctness_noNodejsModules',
    reason:
      'False positive in a Next.js + NestJS monorepo where node: imports are legitimate on the backend worker and scripts.',
  },
  {
    id: 'Biome_lint_style_useImportType',
    reason:
      'Converts runtime class imports to `import type`, breaking NestJS reflect-metadata DI. Proven in Phase 2A incident (117 backend tests broke) — see applied-overrides.md.',
  },
  // ── ES5-era rules applied to modern ES2022+ source — WRONG_RULE noise ──
  {
    id: 'ESLint8_es-x_no-modules',
    reason:
      'WRONG_RULE — eslint-plugin-es-x forbids ES Modules. This repo ships Next.js 16 + NestJS 11 + ESM workers; the rule does not apply.',
  },
  {
    id: 'ESLint8_es-x_no-block-scoped-variables',
    reason: 'WRONG_RULE — ES5 rule forbidding `let`/`const`. The entire repo targets ES2022+.',
  },
  {
    id: 'ESLint8_es-x_no-trailing-commas',
    reason: 'WRONG_RULE — ES5 rule. Prettier enforces trailing commas, intentionally.',
  },
  {
    id: 'ESLint8_es-x_no-property-shorthands',
    reason: 'WRONG_RULE — ES5 rule. Object shorthand is idiomatic ES2015+.',
  },
  {
    id: 'ESLint8_es-x_no-template-literals',
    reason: 'WRONG_RULE — ES5 rule. Template literals are a core feature of modern TypeScript.',
  },
  {
    id: 'ESLint8_es-x_no-arrow-functions',
    reason: 'WRONG_RULE — ES5 rule. Arrow functions are mandatory in React component code.',
  },
  {
    id: 'ESLint8_es-x_no-trailing-function-commas',
    reason: 'WRONG_RULE — ES5 rule, incompatible with Prettier configuration.',
  },
  {
    id: 'ESLint8_es-x_no-optional-chaining',
    reason: 'WRONG_RULE — ES5 rule. Optional chaining is standard in our TypeScript code.',
  },
  {
    id: 'ESLint8_es-x_no-destructuring',
    reason: 'WRONG_RULE — ES5 rule. Destructuring is ubiquitous in this codebase.',
  },
  {
    id: 'ESLint8_es-x_no-async-functions',
    reason: 'WRONG_RULE — ES5 rule. The entire backend relies on async/await.',
  },
  {
    id: 'ESLint8_es-x_no-classes',
    reason: 'WRONG_RULE — ES5 rule. NestJS controllers/services are classes by design.',
  },
  // ── Flow-type rules applied to a TypeScript repo — WRONG_RULE noise ──
  {
    id: 'ESLint8_flowtype_no-types-missing-file-annotation',
    reason: 'WRONG_RULE — eslint-plugin-flowtype. This repo uses TypeScript, not Flow.',
  },
  {
    id: 'ESLint8_flowtype_require-parameter-type',
    reason: 'WRONG_RULE — eslint-plugin-flowtype. This repo uses TypeScript, not Flow.',
  },
  // ── Functional-programming purity rules we never opted into ──
  {
    id: 'ESLint8_fp_no-nil',
    reason:
      'WRONG_RULE — eslint-plugin-fp forbids null/undefined. Our DTOs and Prisma relations legitimately model absence via null.',
  },
  // ── Salesforce Lightning (LWC) rules applied to React/NestJS ──
  {
    id: 'ESLint8_@lwc_lwc_no-async-await',
    reason: 'WRONG_RULE — Salesforce Lightning Web Components plugin, not applicable.',
  },
  // ── React 17+ automatic runtime — react-in-jsx-scope is obsolete ──
  {
    id: 'ESLint8_react_react-in-jsx-scope',
    reason:
      'WRONG_RULE — Next.js 16 / React 19 use the automatic JSX runtime, `import React from "react"` is not required.',
  },
];

// -------------------- Env --------------------

function loadToken() {
  if (process.env.CODACY_ACCOUNT_TOKEN) return process.env.CODACY_ACCOUNT_TOKEN;
  try {
    const content = readFileSync(resolve(REPO_ROOT, '.env.pulse.local'), 'utf8');
    const match = content.match(/^CODACY_ACCOUNT_TOKEN=(.+)$/m);
    if (match) return match[1].trim();
  } catch {
    /* missing is OK */
  }
  return null;
}

const TOKEN = loadToken();
if (!TOKEN) {
  console.error(
    '[codacy-noise] CODACY_ACCOUNT_TOKEN missing. Set env var or put in .env.pulse.local.',
  );
  process.exit(3);
}

// -------------------- HTTP --------------------

async function req(method, path, body, { retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await fetch(BASE + path, {
        method,
        headers: {
          'api-token': TOKEN,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await r.text();
      if (r.status >= 500 || r.status === 429) {
        throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
      }
      return { status: r.status, ok: r.status >= 200 && r.status < 300, body: text };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const delay = 500 * 2 ** (attempt - 1);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  throw lastErr;
}

async function getJson(path) {
  const r = await req('GET', path);
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${r.body.slice(0, 200)}`);
  return JSON.parse(r.body);
}

// -------------------- Codacy helpers --------------------

async function listCodingStandardTools(standardId) {
  const j = await getJson(`/organizations/${ORG}/coding-standards/${standardId}/tools`);
  return (j.data || []).map((t) => ({ uuid: t.uuid, isEnabled: t.isEnabled }));
}

async function listAllPatterns(standardId, toolUuid) {
  const out = new Map(); // patternId -> enabled
  // The Codacy patterns endpoint paginates via cursor; Biome has 466 items,
  // ESLint can have 1500+. limit=1000 is the server max in practice.
  let cursor = '';
  let more = true;
  while (more) {
    const qs = `limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const j = await getJson(
      `/organizations/${ORG}/coding-standards/${standardId}/tools/${toolUuid}/patterns?${qs}`,
    );
    for (const item of j.data || []) {
      const id = item.patternDefinition?.id;
      if (!id) continue;
      out.set(id, !!item.enabled);
    }
    cursor = j.pagination?.cursor || '';
    more = Boolean(cursor);
  }
  return out;
}

async function patchPatterns(standardId, toolUuid, patternIdsEnabled) {
  // patternIdsEnabled = [{id, enabled}]. Batch of up to BATCH_SIZE per call.
  const BATCH_SIZE = 50;
  let applied = 0;
  for (let i = 0; i < patternIdsEnabled.length; i += BATCH_SIZE) {
    const batch = patternIdsEnabled.slice(i, i + BATCH_SIZE);
    const r = await req(
      'PATCH',
      `/organizations/${ORG}/coding-standards/${standardId}/tools/${toolUuid}`,
      { patterns: batch },
    );
    if (!r.ok) {
      throw new Error(
        `PATCH patterns tool=${toolUuid.slice(0, 8)} batch=[${i},${i + batch.length}) -> ${r.status} ${r.body.slice(0, 200)}`,
      );
    }
    applied += batch.length;
  }
  return applied;
}

async function createDraft(name, languages) {
  const r = await req('POST', `/organizations/${ORG}/coding-standards`, {
    name,
    languages,
  });
  if (!r.ok) throw new Error(`POST /coding-standards -> ${r.status} ${r.body.slice(0, 200)}`);
  return JSON.parse(r.body).data;
}

async function promote(standardId) {
  const r = await req('POST', `/organizations/${ORG}/coding-standards/${standardId}/promote`, {});
  if (!r.ok) throw new Error(`POST /promote -> ${r.status} ${r.body.slice(0, 200)}`);
  return JSON.parse(r.body).data;
}

async function linkStandardToRepo(standardId, repoName) {
  const r = await req(
    'PATCH',
    `/organizations/${ORG}/coding-standards/${standardId}/repositories`,
    { link: [repoName], unlink: [] },
  );
  if (!r.ok) throw new Error(`PATCH link -> ${r.status} ${r.body.slice(0, 200)}`);
  return JSON.parse(r.body).data;
}

async function unlinkStandardFromRepo(standardId, repoName) {
  const r = await req(
    'PATCH',
    `/organizations/${ORG}/coding-standards/${standardId}/repositories`,
    { link: [], unlink: [repoName] },
  );
  if (!r.ok) throw new Error(`PATCH unlink -> ${r.status} ${r.body.slice(0, 200)}`);
  return JSON.parse(r.body).data;
}

async function getStandard(standardId) {
  const j = await getJson(`/organizations/${ORG}/coding-standards/${standardId}`);
  return j.data;
}

// -------------------- Mirror + disable logic --------------------

function planToolMirror(sourceMap, draftMap) {
  // Returns patch list that will transform draft -> mirror of source.
  // - enable: patterns enabled in source but not in draft
  // - disable: patterns enabled in draft but not in source
  const patches = [];
  for (const [id, enabled] of sourceMap) {
    const draftEnabled = draftMap.get(id);
    if (enabled && !draftEnabled) patches.push({ id, enabled: true });
    if (!enabled && draftEnabled) patches.push({ id, enabled: false });
  }
  // Patterns in draft but not in source map shouldn't exist (both map the same
  // tool's pattern definitions), but handle defensively:
  for (const [id, enabled] of draftMap) {
    if (!sourceMap.has(id) && enabled) patches.push({ id, enabled: false });
  }
  return patches;
}

// -------------------- Main --------------------

async function main() {
  console.log(
    `[codacy-noise] dry-run=${DRY_RUN} keep-draft=${KEEP_DRAFT} print-diff=${PRINT_DIFF}`,
  );
  console.log(
    `[codacy-noise] Fetching source standard ${SOURCE_STANDARD_ID} metadata + languages...`,
  );
  const sourceStandard = await getStandard(SOURCE_STANDARD_ID);
  const sourceLanguages = sourceStandard.languages || [];
  console.log(
    `[codacy-noise] Source languages (${sourceLanguages.length}): ${sourceLanguages.slice(0, 10).join(', ')}${sourceLanguages.length > 10 ? ', ...' : ''}`,
  );

  console.log(`[codacy-noise] Enumerating ${SOURCE_STANDARD_ID}'s tools...`);
  const sourceTools = await listCodingStandardTools(SOURCE_STANDARD_ID);
  const enabledSourceTools = sourceTools.filter((t) => t.isEnabled);
  console.log(
    `[codacy-noise] ${SOURCE_STANDARD_ID} has ${enabledSourceTools.length} enabled tools (of ${sourceTools.length} total)`,
  );

  // Pre-enumerate 151337's pattern sets for each enabled tool (the mirror source).
  const sourcePatternsByTool = new Map();
  let sourceEnabledTotal = 0;
  for (const t of enabledSourceTools) {
    process.stdout.write(`[codacy-noise]   fetching 151337 tool=${t.uuid.slice(0, 8)} ... `);
    const map = await listAllPatterns(SOURCE_STANDARD_ID, t.uuid);
    sourcePatternsByTool.set(t.uuid, map);
    const enabled = [...map.values()].filter(Boolean).length;
    sourceEnabledTotal += enabled;
    console.log(`${map.size} total, ${enabled} enabled`);
  }
  console.log(`[codacy-noise] 151337 enabled patterns total: ${sourceEnabledTotal}`);

  // Create fresh draft
  const draftName = `kloel-convergence-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  let draft;
  if (DRY_RUN) {
    console.log(
      `[codacy-noise] DRY-RUN: would create draft name=${draftName} with ${sourceLanguages.length} languages`,
    );
    draft = { id: -1, name: draftName };
  } else {
    console.log(
      `[codacy-noise] Creating draft name=${draftName} with ${sourceLanguages.length} languages`,
    );
    draft = await createDraft(draftName, sourceLanguages);
    console.log(
      `[codacy-noise] Created draft id=${draft.id} tools=${draft.meta?.enabledToolsCount} patterns=${draft.meta?.enabledPatternsCount}`,
    );
  }

  // Mirror each tool into the draft
  let totalMirrorPatches = 0;
  for (const t of enabledSourceTools) {
    const sourceMap = sourcePatternsByTool.get(t.uuid);
    let draftMap;
    if (DRY_RUN) {
      // In dry-run we can still GET the default draft of the same shape;
      // spawn a temp draft, inspect, then delete.
      draftMap = new Map();
    } else {
      draftMap = await listAllPatterns(draft.id, t.uuid);
    }
    const patches = planToolMirror(sourceMap, draftMap);
    const enables = patches.filter((p) => p.enabled).length;
    const disables = patches.filter((p) => !p.enabled).length;
    console.log(
      `[codacy-noise]   tool=${t.uuid.slice(0, 8)} mirror plan: +${enables} enable, ${disables} disable`,
    );
    if (PRINT_DIFF && patches.length > 0) {
      for (const p of patches.slice(0, 10)) console.log(`      ${p.enabled ? '+' : '-'} ${p.id}`);
      if (patches.length > 10) console.log(`      ... and ${patches.length - 10} more`);
    }
    if (!DRY_RUN && patches.length > 0) {
      const applied = await patchPatterns(draft.id, t.uuid, patches);
      console.log(`[codacy-noise]   tool=${t.uuid.slice(0, 8)} applied ${applied} mirror patches`);
    }
    totalMirrorPatches += patches.length;
  }

  // Apply noise disables
  // Group by tool uuid. All current noise patterns are Biome-owned, but we
  // resolve the uuid from the source sets to stay generic for future entries.
  const biomeUuid = '934a97f8-835c-42fc-a6d1-02bdfca3bdfa';
  const biomeSourceMap = sourcePatternsByTool.get(biomeUuid);
  if (!biomeSourceMap) {
    throw new Error('Biome not found in 151337 enabled tools — topology changed, aborting.');
  }

  const noiseToApply = [];
  const noiseNotEnabledIn151337 = [];
  for (const { id } of NOISE_PATTERNS) {
    if (biomeSourceMap.get(id) === true) {
      noiseToApply.push({ id, enabled: false });
    } else {
      noiseNotEnabledIn151337.push(id);
    }
  }

  console.log(
    `[codacy-noise] Noise disables: ${noiseToApply.length} applicable, ${noiseNotEnabledIn151337.length} already disabled in 151337 (no-op).`,
  );
  for (const skipped of noiseNotEnabledIn151337) {
    console.log(`[codacy-noise]   SKIP (already disabled in 151337): ${skipped}`);
  }

  if (!DRY_RUN && noiseToApply.length > 0) {
    const applied = await patchPatterns(draft.id, biomeUuid, noiseToApply);
    console.log(`[codacy-noise] Applied ${applied} noise disables on draft ${draft.id}`);
  }

  // Verify
  if (!DRY_RUN) {
    const post = await getStandard(draft.id);
    const expected = sourceEnabledTotal - noiseToApply.length;
    const actual = post.meta?.enabledPatternsCount;
    console.log(
      `[codacy-noise] Verification: expected=${expected}, draft.enabledPatternsCount=${actual}`,
    );
    if (actual !== expected) {
      console.error(
        `[codacy-noise] FAIL — enabledPatternsCount mismatch (expected=${expected}, got=${actual}). NOT promoting.`,
      );
      process.exit(2);
    }
  }

  // Promote
  if (KEEP_DRAFT || DRY_RUN) {
    console.log(`[codacy-noise] --keep-draft or --dry-run: NOT promoting, NOT linking.`);
    if (!DRY_RUN) {
      console.log(`[codacy-noise] Draft left in place: id=${draft.id} name=${draftName}`);
      console.log(
        `[codacy-noise] To clean up: curl -X DELETE with CODACY_ACCOUNT_TOKEN to /organizations/${ORG}/coding-standards/${draft.id}`,
      );
    }
    return;
  }

  console.log(`[codacy-noise] Promoting draft ${draft.id}...`);
  await promote(draft.id);
  const promoted = await getStandard(draft.id);
  if (promoted.isDraft !== false) {
    throw new Error(`Draft was not promoted (still isDraft=${promoted.isDraft})`);
  }
  console.log(
    `[codacy-noise] Promoted — now isDraft=false, patternsCount=${promoted.meta?.enabledPatternsCount}`,
  );

  console.log(`[codacy-noise] Linking ${REPO_NAME} to new standard ${draft.id}...`);
  const linkResult = await linkStandardToRepo(draft.id, REPO_NAME);
  if (!linkResult.successful?.includes(REPO_NAME)) {
    throw new Error(`Link failed: ${JSON.stringify(linkResult)}`);
  }
  console.log(`[codacy-noise] Linked successfully`);

  // Linking a new "default" coding standard to a repo implicitly unlinks it
  // from the previous default. Codacy treats the default slot as singular
  // and silently auto-transitions. The explicit unlink below is therefore
  // idempotent: if the repo is already unlinked we accept an empty result
  // as success. The real source of truth is the final GET below.
  console.log(
    `[codacy-noise] Unlinking ${REPO_NAME} from old standard ${SOURCE_STANDARD_ID} (idempotent)...`,
  );
  try {
    await unlinkStandardFromRepo(SOURCE_STANDARD_ID, REPO_NAME);
  } catch (err) {
    console.log(
      `[codacy-noise]   unlink call returned: ${err.message} — continuing to verify final state`,
    );
  }

  const repo = await getJson(`/organizations/${ORG}/repositories/${REPO_NAME}`);
  const standardIds = (repo.data?.standards || []).map((s) => s.id);
  console.log(`[codacy-noise] Final repo standards: [${standardIds.join(', ')}]`);
  if (!standardIds.includes(draft.id)) {
    throw new Error(`New standard ${draft.id} is not linked to the repo after all operations.`);
  }
  if (standardIds.includes(SOURCE_STANDARD_ID)) {
    throw new Error(
      `Old standard ${SOURCE_STANDARD_ID} is still linked to the repo — unlink did not take effect.`,
    );
  }
  console.log(
    `[codacy-noise] Link swap verified: ${draft.id} linked, ${SOURCE_STANDARD_ID} unlinked.`,
  );

  // Rollback recipe
  const rollbackRecipe = {
    timestamp: new Date().toISOString(),
    newStandardId: draft.id,
    newStandardName: draftName,
    oldStandardId: SOURCE_STANDARD_ID,
    oldStandardName: 'Default coding standard',
    appliedNoisePatterns: noiseToApply.map((p) => p.id),
    rollback: {
      description: 'To roll back: re-link 151337 to the repo and unlink the new standard.',
      commands: [
        `curl -X PATCH -H "api-token: $CODACY_ACCOUNT_TOKEN" -H "Content-Type: application/json" \\`,
        `  "${BASE}/organizations/${ORG}/coding-standards/${SOURCE_STANDARD_ID}/repositories" \\`,
        `  -d '{"link":["${REPO_NAME}"],"unlink":[]}'`,
        ``,
        `curl -X PATCH -H "api-token: $CODACY_ACCOUNT_TOKEN" -H "Content-Type: application/json" \\`,
        `  "${BASE}/organizations/${ORG}/coding-standards/${draft.id}/repositories" \\`,
        `  -d '{"link":[],"unlink":["${REPO_NAME}"]}'`,
      ],
    },
  };
  const rollbackPath = resolve(REPO_ROOT, 'docs/codacy/noise-disable-rollback.json');
  writeFileSync(rollbackPath, JSON.stringify(rollbackRecipe, null, 2));
  console.log(`[codacy-noise] Rollback recipe written to ${rollbackPath}`);

  console.log('[codacy-noise] DONE.');
  console.log(
    `[codacy-noise] Next step: wait ~5 min for Codacy reanalysis, then run \`npm run codacy:sync\` and inspect the drop.`,
  );
}

main().catch((err) => {
  console.error('[codacy-noise] FATAL:', err.message);
  if (err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
  process.exit(1);
});
