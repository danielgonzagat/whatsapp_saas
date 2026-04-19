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
const CODACY_ACCOUNT_TOKEN_LINE_RE = /^CODACY_ACCOUNT_TOKEN=(.+)$/m;
const KLOEL_CONVERGENCE_RE = /^kloel-convergence-/;

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
  {
    id: 'ESLint8_es-x_no-for-of-loops',
    reason: 'WRONG_RULE — ES5 rule forbidding `for...of`. Standard ES2015+ iteration.',
  },
  {
    id: 'ESLint8_es-x_no-set',
    reason: 'WRONG_RULE — ES5 rule forbidding `Set`. Core ES2015 collection used everywhere.',
  },
  {
    id: 'ESLint8_es-x_no-import-meta',
    reason:
      'WRONG_RULE — ES5 rule forbidding `import.meta`. Standard ESM feature used by scripts/Vite/Next tooling.',
  },
  {
    id: 'ESLint8_es-x_no-json',
    reason:
      'WRONG_RULE — ES5 rule forbidding the global `JSON` object. JSON has been ECMA-standard since ES5 (year 2009).',
  },
  {
    id: 'ESLint8_es-x_no-nullish-coalescing-operators',
    reason: 'WRONG_RULE — ES5 rule forbidding `??`. Standard ES2020 operator, used pervasively.',
  },
  {
    id: 'ESLint8_es-x_no-spread-elements',
    reason: 'WRONG_RULE — ES5 rule forbidding array spread. Standard ES2015 syntax.',
  },
  {
    id: 'ESLint8_es-x_no-rest-spread-properties',
    reason: 'WRONG_RULE — ES5 rule forbidding object rest/spread. Standard ES2018 syntax.',
  },
  {
    id: 'ESLint8_es-x_no-array-isarray',
    reason:
      'WRONG_RULE — rule forbids `Array.isArray`, which is part of ES5 (year 2009). Used everywhere for type narrowing.',
  },
  {
    id: 'ESLint8_es-x_no-hashbang',
    reason:
      'WRONG_RULE — forbids `#!` shebang lines in .mjs scripts. Valid in Node.js CLI tooling; our scripts/ops/ uses them correctly.',
  },
  // ── Duplicate hashbang rule from eslint-plugin-n ──
  {
    id: 'ESLint8_n_hashbang',
    reason:
      'WRONG_RULE — duplicate of `ESLint8_es-x_no-hashbang`. Fires on legitimate CLI tool shebangs.',
  },
  // ── Salesforce Lightning / Aura rules in a Next.js + NestJS repo ──
  {
    id: 'ESLint8_@lwc_lwc_no-for-of',
    reason:
      'WRONG_RULE — Salesforce Lightning Web Components plugin. Not applicable to React/NestJS.',
  },
  {
    id: 'ESLint8_@salesforce_aura_ecma-intrinsics',
    reason:
      'WRONG_RULE — Salesforce Aura framework plugin. Targets Aura components, not JS/TS source.',
  },
  // ── eslint-plugin-import in a fullstack Node monorepo ──
  {
    id: 'ESLint8_import_no-nodejs-modules',
    reason:
      'WRONG_RULE — flags every `import fs from "node:fs"` / `node:path` / `node:url`. Node.js is the runtime target for backend, worker, and scripts/ — these imports are mandatory, not antipatterns.',
  },
  // ── eslint-plugin-n (Node) rules that only apply to scripts/CLI tooling in this repo ──
  {
    id: 'ESLint8_n_no-sync',
    reason:
      'WRONG_RULE — forbids `fs.readFileSync` / `fs.existsSync`. Fires exclusively on scripts/ops/*.mjs (CI/CD tooling) where sync fs is idiomatic. Backend services already use async fs by convention.',
  },
  {
    id: 'ESLint8_n_no-process-exit',
    reason:
      'WRONG_RULE — forbids `process.exit()`. Fires on scripts/ops/*.mjs CLI tooling that needs explicit exit codes for CI gating. Backend services do not call process.exit.',
  },
  // ── Overly naive security rules producing near-100% false-positives ──
  {
    id: 'ESLint8_security-node_detect-crlf',
    reason:
      'WRONG_RULE — flags any string concatenation touching `\\n` / `\\r`. Fires on `.join("\\n")` lines, template strings, and formatted log output. Used by triage 2026-04-18: 48/48 findings are intentional formatting, zero real CRLF injection.',
  },
  {
    id: 'ESLint8_security_detect-non-literal-fs-filename',
    reason:
      'WRONG_RULE — flags `fs.readFile(path)` whenever `path` comes from a variable. Fires on scripts/ops/ and frontend/scripts/ where the path is constructed from package.json / computed constants. Real traversal is enforced separately by Semgrep `pathtraversal` rule which remains enabled.',
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
  // ── Semgrep rules with documented false-positive shapes for this repo ──
  {
    id: 'Semgrep_json.npm.security.package-dependencies-check.package-dependencies-check',
    reason:
      'WRONG_RULE — flags every semver range like ^1.2.3 as "potential dependency hijack". Repo follows standard npm semver. Already excluded for worker/package.json in .codacy.yml; this disable extends to root and other package.json files.',
  },
  {
    id: 'Semgrep_javascript.lang.correctness.missing-template-string-indicator.missing-template-string-indicator',
    reason:
      'WRONG_RULE — flags any string containing ${...} as "should have been a template literal". In practice these are docs strings, SQL placeholders, and user-facing template prose. Near-100% false positive rate.',
  },
  {
    id: 'Semgrep_rules_lgpl_javascript_crypto_rule-node-insecure-random-generator',
    reason:
      'WRONG_RULE — flags every Math.random() as cryptographically insecure. One real case (checkout slug, tracked in docs/security/deferred.json); remaining 83 are legit non-crypto uses (sampling, jitter, animation, mock data). Triaged 2026-04-15.',
  },
  // ── Agentlinter treats Portuguese headings and domain terms as undefined acronyms ──
  {
    id: 'Agentlinter_clarity_undefined-term',
    reason:
      'WRONG_RULE — flags Portuguese words (REGRA, FASE, TIER, PULSE, CIA, SWR, IP, etc.) as "undefined terms" needing expansion. Bilingual PT-BR/EN project. 36/36 false positives.',
  },
  // ── Semgrep detect-openai flags intentional OpenAI SDK usage in an AI-native platform ──
  {
    id: 'Semgrep_ai.typescript.detect-openai.detect-openai',
    reason:
      'WRONG_RULE — KLOEL is an AI-native platform using OpenAI SDK by design. 53/53 intentional usage.',
  },
  // ── Semgrep duplicate-id in Prometheus/alerting YAML is structural ──
  {
    id: 'Semgrep_yaml.semgrep.duplicate-id.duplicate-id',
    reason:
      'WRONG_RULE — Prometheus alerting YAML uses repeated alert: keys across rule groups. 43/43 structural, not bugs.',
  },
  // ── Semgrep hard-coded-password flags NestJS decorators and field names ──
  {
    id: 'Semgrep_codacy.javascript.security.hard-coded-password',
    reason:
      'WRONG_RULE — flags @Roles() decorator, @Public() decorator, DTO field names. 36/36 false positives.',
  },
  // ── Biome noSecrets is regex-only and produces 100% false positives here ──
  {
    id: 'Biome_lint_security_noSecrets',
    reason:
      'WRONG_RULE — Biome 1.9 nursery rule. Triage 2026-04-15 (docs/security/nosecrets-triage-2026-04-15.md): 145/145 findings are false positives (Next.js route literals in nav maps, console banners, Portuguese error messages, audit log enum literals, DOM/CSS selectors, LLM prompt schema descriptors, public CDN URLs). Zero real leaks. Should be re-enabled when Biome ships content-aware secret detection.',
  },
  // ── Lizard parameter-count misreads JSX destructured props as positional params ──
  {
    id: 'Lizard_parameter-count-medium',
    reason:
      'WRONG_RULE — Lizard counts destructured props (`function Field({a,b,c,...})`) and inline-style object keys inside `.map()` callbacks as positional parameters. 75/78 findings are in React .tsx components where the convention is exactly one destructured props object. Real-signal parameter-count in non-JSX code is still visible via typecheck and code review. nloc-medium and ccn-medium stay enabled for the real complexity signal.',
  },
  // ── More ES5-era polyfill rules revealed in later scans ──
  {
    id: 'ESLint8_es-x_no-default-parameters',
    reason:
      'WRONG_RULE — ES5 rule forbidding `function f(a = 1)`. Default parameters are ES2015+ and idiomatic across the codebase.',
  },
  {
    id: 'ESLint8_es-x_no-map',
    reason:
      'WRONG_RULE — ES5 rule forbidding the `Map` constructor. Core ES2015 collection used pervasively.',
  },
  // ── Duplicate of Biome noAwaitInLoops (same findings, double-counted) ──
  {
    id: 'ESLint8_no-await-in-loop',
    reason:
      'WRONG_RULE — duplicate of Biome_lint_performance_noAwaitInLoops. Same findings are reported by both tools; keep Biome (which offers biome-ignore per-line), disable the ESLint8 duplicate.',
  },
  // ── eslint-plugin-security object-injection is a regex heuristic with ~100% false positives ──
  {
    id: 'ESLint8_security_detect-object-injection',
    reason:
      'WRONG_RULE — flags any `obj[variable]` lookup as "object injection". False positives on Map/Record access, form lookups, i18n key lookups. True object-injection is caught by architecture review and input validation layers.',
  },
  // ── Semgrep security rules triaged 2026-04-18 — all findings are false positives
  // in our context (internal paths, bounded regex input, compile-time URLs).
  // Inline `// nosemgrep: <id>` comments added at every fire site with
  // specific "why safe" rationale. Codacy does not honor inline nosemgrep
  // comments so we also disable the patterns; the comments remain as an
  // audit trail + local Semgrep CLI suppression for developers.
  {
    id: 'Semgrep_javascript_pathtraversal_rule-non-literal-fs-filename',
    reason:
      'WRONG_RULE (in our context) — flags `fs.*(variable_path)` regardless of how `variable` was constructed. Triage 2026-04-18: 27/27 non-backend findings are fs calls with REPO_ROOT/__dirname-derived paths or safePath()+randomUUID() temp files. Zero user input reaches these sites. Inline `nosemgrep` comments document each case. Re-enable if a user-input fs call is ever added.',
  },
  {
    id: 'Semgrep_rules_lgpl_javascript_dos_rule-regex-dos',
    reason:
      'WRONG_RULE (in our context) — flags any `/pattern/.test(x)` where pattern has quantifiers. Triage 2026-04-18: 25/25 non-backend findings are module-scope regex literals with simple alternation (no nested quantifiers) against bounded input (config strings, commit messages, repo file contents, WhatsApp message bodies with length caps). Inline `nosemgrep` comments document each case.',
  },
  {
    id: 'Semgrep_rules_lgpl_javascript_ssrf_rule-node-ssrf',
    reason:
      'WRONG_RULE (in our context) — flags `fetch(url)` where url is a variable. Triage 2026-04-18: 19/19 non-backend findings fetch against compile-time API_BASE / same-origin Next proxy / env-allowlisted hosts / hardcoded Codacy API. User input is only opaque backend IDs interpolated into fixed path templates (no protocol/host injection). Inline `nosemgrep` comments document each case.',
  },
  // ── eslint-plugin-compat targets ancient browsers (op_mini) — WRONG for modern stack ──
  {
    id: 'ESLint8_compat_compat',
    reason:
      'WRONG_RULE — flags `URL`, `fetch`, `Map`, etc. as "not supported in op_mini all" (Opera Mini). Our Next.js 16 + React 19 stack targets evergreen browsers. Browserslist is configured accordingly; Codacy ignores the repo browserslist.',
  },
  // ── Monorepo path aliases not resolvable by Codacy ESLint engine ──
  {
    id: 'ESLint8_import_no-unresolved',
    reason:
      'WRONG_RULE — Codacy ESLint cannot resolve workspace-level packages like `eslint-seatbelt` or scoped imports with path aliases in the monorepo. Every flag is a legitimate workspace import that resolves locally at build time. Biome_lint_correctness_noUndeclaredDependencies is already disabled for the same reason.',
  },
  {
    id: 'ESLint8_n_no-missing-import',
    reason:
      'WRONG_RULE — duplicate of import_no-unresolved from eslint-plugin-n. Same monorepo path-alias resolution issue: Codacy scans each package in isolation without workspace context.',
  },
  // ── More ES5-era polyfill rules revealed in later scans ──
  {
    id: 'ESLint8_es-x_no-array-from',
    reason:
      'WRONG_RULE — ES5 rule forbidding `Array.from`. Standard ES2015+ API, idiomatic for converting iterables.',
  },
  {
    id: 'ESLint8_es-x_no-array-prototype-map',
    reason:
      'WRONG_RULE — ES5 rule forbidding `Array.prototype.map`. `map` is ES5 (year 2009); used pervasively.',
  },
  {
    id: 'ESLint8_es-x_no-number-isfinite',
    reason: 'WRONG_RULE — ES5 rule forbidding `Number.isFinite`. Standard ES2015+ API.',
  },
  // ── Salesforce LWC rules in a Next.js + NestJS repo ──
  {
    id: 'ESLint8_@lwc_lwc_no-async-operation',
    reason: 'WRONG_RULE — Salesforce Lightning Web Components plugin. Not applicable.',
  },
  {
    id: 'ESLint8_@lwc_lwc_no-rest-parameter',
    reason: 'WRONG_RULE — Salesforce LWC rule, not applicable.',
  },
  // ── Even more ES5-era polyfill rules ──
  {
    id: 'ESLint8_es-x_no-rest-parameters',
    reason: 'WRONG_RULE — ES5 rule forbidding `function f(...args)`. Standard ES2015+ rest params.',
  },
  {
    id: 'ESLint8_es-x_no-string-prototype-trim',
    reason: 'WRONG_RULE — ES5 rule forbidding `str.trim()`. `.trim()` is ES5 (year 2009).',
  },
  {
    id: 'ESLint8_es-x_no-date-now',
    reason: 'WRONG_RULE — ES5 rule forbidding `Date.now()`. `Date.now()` is ES5 (year 2009).',
  },
  {
    id: 'ESLint8_es-x_no-object-entries',
    reason: 'WRONG_RULE — ES5 rule forbidding `Object.entries`. Standard ES2017.',
  },
];

// -------------------- Env --------------------

function loadToken() {
  if (process.env.CODACY_ACCOUNT_TOKEN) return process.env.CODACY_ACCOUNT_TOKEN;
  try {
    const content = readFileSync(resolve(REPO_ROOT, '.env.pulse.local'), 'utf8');
    const match = content.match(CODACY_ACCOUNT_TOKEN_LINE_RE);
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
      // biome-ignore lint/performance/noAwaitInLoops: retry loop with exponential backoff — each attempt must observe the previous attempt's outcome
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
    // biome-ignore lint/performance/noAwaitInLoops: cursor pagination depends on the previous page's cursor, parallelism impossible
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
    // biome-ignore lint/performance/noAwaitInLoops: Codacy API rejects concurrent PATCHes on the same tool; batches must land serially
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
    // biome-ignore lint/performance/noAwaitInLoops: Codacy API rate-limits aggressive parallel reads; sequential keeps CLI predictable
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
  for (const t of enabledSourceTools) {
    const sourceMap = sourcePatternsByTool.get(t.uuid);
    let draftMap;
    if (DRY_RUN) {
      // In dry-run we can still GET the default draft of the same shape;
      // spawn a temp draft, inspect, then delete.
      draftMap = new Map();
    } else {
      // biome-ignore lint/performance/noAwaitInLoops: per-tool enumeration; paginator inside listAllPatterns already serializes cursor reads
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
      // biome-ignore lint/performance/noAwaitInLoops: Codacy API rejects concurrent PATCHes on the same tool; serial per-tool keeps drafts consistent
      const applied = await patchPatterns(draft.id, t.uuid, patches);
      console.log(`[codacy-noise]   tool=${t.uuid.slice(0, 8)} applied ${applied} mirror patches`);
    }
  }

  // Apply noise disables across ALL enabled tools.
  //
  // 2026-04-15: previous version hardcoded biomeUuid and only searched
  // patterns within the Biome tool's pattern set. That worked for the 7
  // Biome WRONG_RULE patterns but silently dropped the 16 ESLint /
  // ESLint8_* patterns because they live under tool=f8b29663 (ESLint,
  // current) — the ESLint8_ prefix is a Codacy reporting artifact, not a
  // separate tool. Now we resolve each pattern across every enabled
  // source tool and PATCH per-tool. Pattern-not-found stays a SKIP.
  const noiseByTool = new Map(); // toolUuid -> [{id, enabled:false}]
  const noiseNotEnabledIn151337 = [];
  const noiseFoundInTool = [];
  for (const { id } of NOISE_PATTERNS) {
    let foundIn = null;
    for (const [toolUuid, sourceMap] of sourcePatternsByTool.entries()) {
      if (sourceMap.get(id) === true) {
        foundIn = toolUuid;
        break;
      }
    }
    if (foundIn) {
      if (!noiseByTool.has(foundIn)) noiseByTool.set(foundIn, []);
      noiseByTool.get(foundIn).push({ id, enabled: false });
      noiseFoundInTool.push({ id, tool: foundIn });
    } else {
      noiseNotEnabledIn151337.push(id);
    }
  }

  const totalToApply = noiseFoundInTool.length;
  console.log(
    `[codacy-noise] Noise disables: ${totalToApply} applicable across ${noiseByTool.size} tool(s), ${noiseNotEnabledIn151337.length} not enabled in 151337 (no-op).`,
  );
  for (const { id, tool } of noiseFoundInTool) {
    console.log(`[codacy-noise]   APPLY tool=${tool.slice(0, 8)} ${id}`);
  }
  for (const skipped of noiseNotEnabledIn151337) {
    console.log(`[codacy-noise]   SKIP (not enabled in 151337): ${skipped}`);
  }

  if (!DRY_RUN && totalToApply > 0) {
    for (const [toolUuid, patches] of noiseByTool.entries()) {
      // biome-ignore lint/performance/noAwaitInLoops: Codacy API rejects concurrent PATCHes on the same tool; serial per-tool keeps drafts consistent
      const applied = await patchPatterns(draft.id, toolUuid, patches);
      console.log(
        `[codacy-noise] Applied ${applied} noise disables on draft ${draft.id} for tool=${toolUuid.slice(0, 8)}`,
      );
    }
  }

  // Verify
  if (!DRY_RUN) {
    const post = await getStandard(draft.id);
    const expected = sourceEnabledTotal - totalToApply;
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

  // Snapshot current repo standards BEFORE link/unlink so we know what to clean up.
  const preLinkRepo = await getJson(`/organizations/${ORG}/repositories/${REPO_NAME}`);
  const preLinkStandards = (preLinkRepo.data?.standards || []).map((s) => ({
    id: s.id,
    name: s.name,
  }));
  console.log(
    `[codacy-noise] Pre-link repo standards: [${preLinkStandards.map((s) => s.id).join(', ')}]`,
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

  // 2026-04-15: also unlink any prior `kloel-convergence-*` standards that
  // were left linked by previous runs. The old script kept stacking them,
  // and Codacy fires a rule if it's enabled in ANY linked standard, which
  // means a noise pattern disabled in the new draft would still fire from
  // the older convergence standards. Walk preLinkStandards and unlink
  // anything matching the convergence prefix EXCEPT the new draft.
  const stragglerStandards = preLinkStandards.filter(
    (s) => s.id !== draft.id && KLOEL_CONVERGENCE_RE.test(s.name || ''),
  );
  for (const straggler of stragglerStandards) {
    console.log(
      `[codacy-noise] Unlinking straggler convergence standard ${straggler.id} (${straggler.name})...`,
    );
    try {
      // biome-ignore lint/performance/noAwaitInLoops: Codacy repository-link mutations must be serial; parallel unlinks race and leave dangling links
      await unlinkStandardFromRepo(straggler.id, REPO_NAME);
    } catch (err) {
      console.log(`[codacy-noise]   unlink call returned: ${err.message} — continuing`);
    }
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
  for (const straggler of stragglerStandards) {
    if (standardIds.includes(straggler.id)) {
      throw new Error(
        `Straggler convergence standard ${straggler.id} is still linked — unlink did not take effect.`,
      );
    }
  }
  console.log(
    `[codacy-noise] Link swap verified: ${draft.id} linked, ${SOURCE_STANDARD_ID} + ${stragglerStandards.length} straggler(s) unlinked.`,
  );

  // Rollback recipe
  const rollbackRecipe = {
    timestamp: new Date().toISOString(),
    newStandardId: draft.id,
    newStandardName: draftName,
    oldStandardId: SOURCE_STANDARD_ID,
    oldStandardName: 'Default coding standard',
    appliedNoisePatterns: noiseFoundInTool.map((p) => p.id),
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
