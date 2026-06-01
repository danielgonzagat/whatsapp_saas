#!/usr/bin/env node
/**
 * config-key-gate.proof.mjs — standalone node proof for the CONFIG-KEY MEMBERSHIP gate.
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/gates/config-key-gate.proof.mjs
 *
 * (node, not tsx — it imports the COMPILED gate from dist/, so it runs anywhere the
 * server runs.) Every assertion is in-memory over a throwaway temp repo whose
 * backend/src/config/app-config.module.ts is a synthetic Joi schema; no real repo
 * source is ever written. It proves the gate in BOTH polarities plus the honesty
 * properties the doctrine demands — and pins the Rice line:
 *
 *   RED       — CLOSED schema: a NEW `config.get('GHOST_KEY')` whose key is NOT in the
 *               declared key set → unbacked config read → dangle.
 *   GREEN     — CLOSED schema: `config.get('DATABASE_URL')` whose key IS declared → resolves.
 *   DELTA     — CLOSED schema: a PRE-EXISTING unbacked read on disk is NOT this write's
 *               claim (NEW-key-only) → not reddened.
 *   NOT_APPLICABLE — no literal config read is introduced → no config-key fact exists.
 *   UNJUDGED1 — OPEN schema (`.unknown(true)`): even a key outside the declared set is
 *               tolerated by Joi → membership is not a dangle fact → unjudged, never red.
 *   UNJUDGED2 — NON-LITERAL key (`config.get(envVar)`): undecidable from bytes → the
 *               call is skipped (the only read in the file) → CLOSED schema yet GREEN
 *               with zero reds (no red-by-guess on a computed key).
 *   UNJUDGED3 — NO schema reachable (no backend/src/config) → no closed key set → unjudged.
 *   RECEIVER  — a NestJS DI `module.get(SomeToken)` / Map `cache.get('id')` is NOT a
 *               config read (wrong receiver) → never reddened (no red-by-guess).
 *   COMMENT   — a `config.get('IN_A_COMMENT')` living inside a // comment is blanked →
 *               not extracted → not reddened (comment-embedded FP class closed).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const { makeContext } = await import(path.join(dir, '..', 'dist', 'gates', 'contract.js'));
const gate = (await import(path.join(dir, '..', 'dist', 'gates', 'config-key-gate.js'))).default;

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass += 1;
    console.log('  PASS ', name);
  } else {
    fail += 1;
    console.log('  FAIL ', name);
  }
}

const CONFIG_REL = 'backend/src/config/app-config.module.ts';

/** A CLOSED Joi schema: declares DATABASE_URL + JWT_SECRET, NO `.unknown(true)`. */
const CLOSED_SCHEMA = [
  "import { Module } from '@nestjs/common';",
  "import { ConfigModule } from '@nestjs/config';",
  "import * as Joi from 'joi';",
  '@Module({',
  '  imports: [',
  '    ConfigModule.forRoot({',
  '      isGlobal: true,',
  '      validationSchema: Joi.object({',
  '        DATABASE_URL: Joi.string().required(),',
  "        JWT_SECRET: Joi.string().required(),",
  "        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),",
  '      }),',
  '    }),',
  '  ],',
  '})',
  'export class AppConfigModule {}',
  '',
].join('\n');

/** An OPEN Joi schema: same keys, but `.unknown(true)` → Joi tolerates unknowns. */
const OPEN_SCHEMA = [
  "import { Module } from '@nestjs/common';",
  "import { ConfigModule } from '@nestjs/config';",
  "import * as Joi from 'joi';",
  '@Module({',
  '  imports: [',
  '    ConfigModule.forRoot({',
  '      isGlobal: true,',
  '      validationSchema: Joi.object({',
  '        DATABASE_URL: Joi.string().required(),',
  "        JWT_SECRET: Joi.string().required(),",
  '      })',
  '        .unknown(true),',
  '    }),',
  '  ],',
  '})',
  'export class AppConfigModule {}',
  '',
].join('\n');

/** Build a temp repo with an optional config schema file written to disk. */
function mkRepo(schemaBody) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-config-gate-'));
  if (schemaBody !== null) {
    fs.mkdirSync(path.join(root, 'backend', 'src', 'config'), { recursive: true });
    fs.writeFileSync(path.join(root, CONFIG_REL), schemaBody, 'utf8');
  }
  return root;
}
/** Write a consumer file's PRIOR bytes to disk (so priorOf reflects the real prior). */
function writePrior(root, rel, body) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf8');
}
function judge(root, overlay, changed) {
  return gate.run(makeContext(root, new Map(Object.entries(overlay)), changed));
}
function rm(root) {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

// 1) RED — CLOSED schema, a NEW read of an UNDECLARED key dangles.
{
  const root = mkRepo(CLOSED_SCHEMA);
  const rel = 'backend/src/svc.ts';
  const body = "export const v = config.get<string>('GHOST_KEY');\n";
  const res = judge(root, { [rel]: body }, [rel]);
  check('RED: undeclared key in CLOSED schema reddens', res.green === false && !res.unjudged && res.reds.some((r) => r.fact.includes('GHOST_KEY')));
  check('RED: red carries an L<line>:<col> locus', !!res.reds[0] && /^L\d+:\d+$/.test(res.reds[0].locus || ''));
  if (res.reds[0]) console.log(`        GateRed → ${res.reds[0].file}:${res.reds[0].locus} — ${res.reds[0].fact}`);
  rm(root);
}

// 2) GREEN — CLOSED schema, a read of a DECLARED key resolves.
{
  const root = mkRepo(CLOSED_SCHEMA);
  const rel = 'backend/src/svc.ts';
  const body = "export const v = config.get('DATABASE_URL');\nexport const j = configService.get<string>('JWT_SECRET');\n";
  const res = judge(root, { [rel]: body }, [rel]);
  check('GREEN: declared keys (DATABASE_URL, JWT_SECRET) resolve', res.green === true && res.reds.length === 0 && !res.unjudged);
  rm(root);
}

// 3) DELTA — CLOSED schema, a PRE-EXISTING undeclared read is not this write's claim.
{
  const root = mkRepo(CLOSED_SCHEMA);
  const rel = 'backend/src/legacy.ts';
  const prior = "export const old = config.get('LEGACY_GHOST');\n"; // already on disk, already dangling
  writePrior(root, rel, prior);
  // The write only APPENDS a valid declared read; the legacy dangling line is untouched.
  const next = prior + "export const ok = config.get('NODE_ENV');\n";
  const res = judge(root, { [rel]: next }, [rel]);
  check('DELTA: pre-existing undeclared read NOT reddened (NEW-key-only)', !res.reds.some((r) => r.fact.includes('LEGACY_GHOST')));
  check('DELTA: the appended declared read is green', res.green === true && res.reds.length === 0 && !res.unjudged);
  rm(root);
}

// 4) NOT_APPLICABLE — CLOSED schema, but this write introduces no literal config read.
{
  const root = mkRepo(CLOSED_SCHEMA);
  const rel = 'backend/src/no-config-read.ts';
  const body = 'export const clean = 1;\n';
  const res = judge(root, { [rel]: body }, [rel]);
  check('NOT_APPLICABLE: no literal config read introduced → no config-key fact', res.notApplicable === true && res.green === true && !res.unjudged && res.reds.length === 0);
  rm(root);
}

// 5) UNJUDGED1 — OPEN schema (`.unknown(true)`): even an undeclared key is tolerated.
{
  const root = mkRepo(OPEN_SCHEMA);
  const rel = 'backend/src/svc.ts';
  const body = "export const v = config.get('TOTALLY_UNKNOWN_KEY');\n";
  const res = judge(root, { [rel]: body }, [rel]);
  check('UNJUDGED1: OPEN schema → unjudged, never red (membership not a dangle fact)', res.unjudged === true && res.green === true && res.reds.length === 0);
  rm(root);
}

// 5) UNJUDGED2 — NON-LITERAL key under a CLOSED schema: computed key is skipped, no red-by-guess.
{
  const root = mkRepo(CLOSED_SCHEMA);
  const rel = 'backend/src/svc.ts';
  // The ONLY config read is a variable-keyed get → undecidable → skipped → green w/ no reds.
  const body = 'export function read(key: string) {\n  return config.get<string>(key);\n}\n';
  const res = judge(root, { [rel]: body }, [rel]);
  check('UNJUDGED2: non-literal key (config.get(key)) is skipped, not red-by-guess', res.green === true && res.reds.length === 0 && !res.unjudged);
  rm(root);
}

// 6) UNJUDGED3 — NO reachable schema → no closed key set → unjudged.
{
  const root = mkRepo(null); // no backend/src/config dir at all
  const rel = 'src/svc.ts';
  const body = "export const v = config.get('ANYTHING');\n";
  const res = judge(root, { [rel]: body }, [rel]);
  check('UNJUDGED3: no Joi validationSchema reachable → unjudged (never invent a contract)', res.unjudged === true && res.green === true && res.reds.length === 0);
  rm(root);
}

// 7) RECEIVER — a DI / Map `.get` is NOT a config read (wrong receiver) → never reddened.
{
  const root = mkRepo(CLOSED_SCHEMA);
  const rel = 'backend/src/svc.ts';
  // moduleRef.get(Token), a Map cache.get('id'), and this.repo.get('NOT_CONFIG') — none
  // are `config`/`configService` receivers, so none are judged.
  const body = [
    "const svc = moduleRef.get(SomeService);",
    "const c = cache.get('GHOST_NOT_CONFIG');",
    "const r = this.repo.get('ALSO_NOT_CONFIG');",
    "const ok = config.get('NODE_ENV');", // the only real config read, and it is declared
  ].join('\n') + '\n';
  const res = judge(root, { [rel]: body }, [rel]);
  check('RECEIVER: DI/Map .get on a non-config receiver is not judged', !res.reds.some((r) => r.fact.includes('NOT_CONFIG')));
  check('RECEIVER: gate is GREEN (only the real config.get(NODE_ENV) is judged, and resolves)', res.green === true && res.reds.length === 0 && !res.unjudged);
  rm(root);
}

// 8) COMMENT — a config.get inside a // comment is blanked → not extracted → not red.
{
  const root = mkRepo(CLOSED_SCHEMA);
  const rel = 'backend/src/svc.ts';
  const body = [
    "// const dead = config.get('COMMENTED_GHOST');  <- commented out, must NOT be extracted",
    "/* const dead2 = config.get('BLOCK_GHOST'); */",
    "const ok = config.get('JWT_SECRET');",
  ].join('\n') + '\n';
  const res = judge(root, { [rel]: body }, [rel]);
  check('COMMENT: // comment-embedded config.get is NOT extracted (FP class closed)', !res.reds.some((r) => r.fact.includes('COMMENTED_GHOST')));
  check('COMMENT: /* */ comment-embedded config.get is NOT extracted', !res.reds.some((r) => r.fact.includes('BLOCK_GHOST')));
  check('COMMENT: gate is GREEN (only the real, declared JWT_SECRET read)', res.green === true && res.reds.length === 0 && !res.unjudged);
  rm(root);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
