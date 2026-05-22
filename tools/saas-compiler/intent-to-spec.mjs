#!/usr/bin/env node
// tools/saas-compiler/intent-to-spec.mjs
//
// Intent .md → executable spec .json.
//
// CLI: node tools/saas-compiler/intent-to-spec.mjs intents/<file>.md
//
// Pipeline:
//   1. Read the intent markdown.
//   2. Pull repo context: Prisma models, NestJS modules, existing services,
//      relevant ADRs/memory (via CodeGraph + graphify-plus shards).
//   3. Compose a system prompt that includes the codebase contract (CLAUDE.md
//      excerpts, naming conventions, workspace isolation, idempotency rules).
//   4. Call the LLM; expect a structured JSON spec.
//   5. Validate the spec against a schema; write to
//      intents/<file>.spec.json.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { argv } from 'node:process';
import { dirname, basename, join } from 'node:path';
import { chat, extractJsonBlock, provider } from './llm-client.mjs';

const ROOT = process.cwd();
const intentArg = argv[2];

if (!intentArg) {
  console.error('usage: intent-to-spec.mjs <intents/file.md>');
  process.exit(2);
}

const intentPath = intentArg.startsWith('/') ? intentArg : join(ROOT, intentArg);
const specPath = intentPath.replace(/\.md$/, '.spec.json');

async function main() {
  const intent = await readFile(intentPath, 'utf8');
  const ctx = await buildContext();
  const llmProvider = provider();
  if (!llmProvider) {
    console.error('[intent-to-spec] no LLM key — emitting deterministic fallback spec');
    await writeFile(specPath, JSON.stringify(deterministicSpec(intent), null, 2));
    console.log(`[intent-to-spec] wrote ${specPath} (fallback)`);
    return;
  }
  const system = SYSTEM_PROMPT(ctx);
  const user = `# Intent\n\n${intent}\n\nProduce the executable spec as a single JSON block. Adhere strictly to the schema in the system prompt.`;
  console.log(`[intent-to-spec] calling ${llmProvider}…`);
  const reply = await chat({ system, user, maxTokens: 8192, temperature: 0.1 });
  const spec = extractJsonBlock(reply);
  const errs = validateSpec(spec);
  if (errs.length) {
    console.error(`[intent-to-spec] spec invalid:`, errs);
    process.exit(1);
  }
  await writeFile(specPath, JSON.stringify(spec, null, 2));
  console.log(`[intent-to-spec] wrote ${specPath}`);
}

function SYSTEM_PROMPT(ctx) {
  return `You compile high-level product intents into executable specs for a NestJS+Prisma+Next.js SaaS named KLOEL.

The repo facts you must respect:
- Backend: NestJS in backend/src, Prisma in backend/prisma/schema.prisma.
- Frontend: Next.js app router in frontend/src/app.
- Worker: BullMQ in worker/.
- Every backend query MUST filter by workspaceId.
- Money is bigint cents; no floats.
- Webhooks are idempotent via externalId.
- Use Logger; never console.log.
- WhatsApp adapter is workspace-scoped (WAHA or Meta Cloud).
- Stripe is the sole payment infra (Connect Custom Accounts).

EXISTING ENTITIES (from Prisma): ${ctx.entities.join(', ')}
EXISTING NEST MODULES (top): ${ctx.modules.slice(0, 20).join(', ')}
EXISTING BULLMQ QUEUES: ${ctx.queues.join(', ')}

Output JSON SCHEMA:
{
  "name": "kebab-case-feature-id",
  "summary": "one-sentence summary",
  "entities": [{"name":"PascalCase","fields":[{"name":"camelCase","type":"prisma scalar or relation","nullable":false}]}],
  "flows": [{"id":"kebab","trigger":"...","action":"...","side_effects":["..."]}],
  "invariants": ["plain-language statement enforced by code"],
  "metrics": {"primary":"name","direction":"up|down","target":"...","guardrail":"..."},
  "fingerprint_test": "Given/When/Then in plain text",
  "files_to_create": ["backend/src/<module>/<file>.ts","frontend/src/app/<route>/page.tsx",...],
  "files_to_modify": ["backend/prisma/schema.prisma","backend/src/app.module.ts",...],
  "feature_flag": "kebab-case-flag (omit if always-on)"
}

Be conservative: only propose changes that respect existing entity names; reuse existing services where possible; never invent integrations not present in the codebase context.`;
}

async function buildContext() {
  const out = { entities: [], modules: [], queues: [] };
  const schema = await readSafe(join(ROOT, 'backend/prisma/schema.prisma'));
  if (schema) {
    out.entities = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
  }
  // Light scan for NestJS modules
  const modRegex = /backend\/src\/.*?\/(\w+)\.module\.ts$/;
  const enriched = await readSafe(join(ROOT, 'graphify-out/enriched-graph.json'));
  if (enriched) {
    try {
      const data = JSON.parse(enriched);
      for (const n of data.nodes || []) {
        if (n.file && modRegex.test(n.file)) out.modules.push(n.file.match(modRegex)[1]);
      }
      for (const n of data.nodes || []) {
        if (n.type === 'bullmq-queue' && n.label) out.queues.push(n.label);
      }
    } catch { /* ignore */ }
  }
  out.modules = [...new Set(out.modules)];
  out.queues = [...new Set(out.queues)];
  return out;
}

async function readSafe(path) {
  if (!existsSync(path)) return null;
  try { return await readFile(path, 'utf8'); } catch { return null; }
}

function validateSpec(spec) {
  const errs = [];
  if (!spec || typeof spec !== 'object') return ['root not object'];
  if (!spec.name || !/^[a-z][a-z0-9-]+$/.test(spec.name)) errs.push('name must be kebab-case');
  if (!spec.summary) errs.push('summary required');
  if (!Array.isArray(spec.entities)) errs.push('entities must be array');
  if (!Array.isArray(spec.flows)) errs.push('flows must be array');
  if (!Array.isArray(spec.invariants)) errs.push('invariants must be array');
  if (!spec.metrics || typeof spec.metrics !== 'object') errs.push('metrics required');
  if (!spec.fingerprint_test) errs.push('fingerprint_test required');
  if (!Array.isArray(spec.files_to_create)) errs.push('files_to_create must be array');
  return errs;
}

function deterministicSpec(intent) {
  // Minimal fallback when no LLM available — extracts name from H1 + echoes
  // the intent text verbatim under `summary`.
  const m = intent.match(/^#\s+(.+)$/m);
  const name = (m ? m[1] : 'unnamed').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 60);
  return {
    name,
    summary: (intent.split('\n').find((l) => l.trim() && !l.startsWith('#')) || 'no summary').slice(0, 240),
    entities: [],
    flows: [],
    invariants: [],
    metrics: { primary: 'TBD', direction: 'up', target: 'TBD', guardrail: 'TBD' },
    fingerprint_test: 'TBD (no LLM available)',
    files_to_create: [],
    files_to_modify: [],
  };
}

await main();
