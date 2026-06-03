/**
 * gates/config-key-gate.ts — the exoneration-free CONFIG-KEY MEMBERSHIP fact.
 *
 * A changed TypeScript file reads runtime configuration with a STRING-LITERAL key:
 * `configService.get('LITERAL')` / `config.get<T>('LITERAL')`. The literal key must
 * be a member of the application's DECLARED config key set — the keys of the Joi
 * `validationSchema` passed to `ConfigModule.forRoot(...)` — or, when that schema is
 * CLOSED, Joi rejects the unknown key at boot, the app crash-loops, and the read
 * dangles. That membership is a FACT extractable from bytes: no boot, no env, no
 * language server. This module is the config analogue of connection-gate.ts:
 * connection-gate asserts "a relative import resolves to a real module"; this gate
 * asserts "a literal config key resolves to a declared, validated env contract".
 *
 * Decider it adapts: the closed Joi key set. Read backend/src/config/app-config.module.ts
 * — the `validationSchema: Joi.object({ KEY: Joi.<...> , ... })` block is the single
 * declared contract for every environment variable the backend consumes. The gate
 * resolves THE canonical schema (the unique `Joi.object({...})` reachable in the
 * tree under backend/src/config) and reads (a) its declared key set and (b) whether
 * it is OPEN (`.unknown(true)`) or CLOSED, because closedness is what makes a missing
 * key a real dangle vs a tolerated unknown.
 *
 * Mutation-Firewall law (mirrored): this gate is PERCEPTION only. It LOCATES the
 * unbacked config read (file + locus + fact); it never writes.
 *
 * PERCEPTION CEILING (real, documented) — the regex floor, not a parser:
 *   - The key extractor blanks every JS/TS comment + string-skips via the shared
 *     byte-floor `blankComments` (imported from ../connection-gate, same as the IaC
 *     gate) BEFORE matching `config.get('X')`, so a call written inside a `//` or
 *     `/* … *​/` comment is whitespace and is never extracted — the comment-embedded
 *     false-positive class. After blanking, the call's STRING LITERAL is gone too
 *     (blankComments skips OVER strings, preserving them), so the literal is recovered
 *     from the ORIGINAL bytes at the matched call's index — i.e. we match the
 *     `receiver.get(` head against blanked text (kills comments) but read the literal
 *     argument from raw text (a real string is preserved there). A `get(` whose head
 *     was blanked (it lived in a comment) is never reached.
 *   - RECEIVER discrimination: only receivers literally named `config` or
 *     `configService` are judged. NestJS's DI container `.get<Token>(Token)` and Map/
 *     cache `.get('id')` use other receivers and are NOT a config read — judging them
 *     would be red-by-guess. A ConfigService aliased to some other identifier is the
 *     residual FP/FN a real type-aware binding pass (ts-morph, like binding-gate.ts)
 *     would resolve; this static floor honestly scopes to the two canonical names.
 *
 * Semantics (universal, NEW-key-only, exoneration-free):
 *  - DECIDER = the declared key set of the canonical Joi `validationSchema`, gathered
 *    once across the tree (resolved by scanning backend/src/config for the unique
 *    schema). A literal key IN that set resolves; a literal key NOT in it dangles —
 *    BUT ONLY when the schema is CLOSED.
 *  - NEW-key-only: only literal keys present in a file's NEW content but ABSENT from
 *    its prior on-disk content (`ctx.priorOf(rel)`) are this write's claim (mirrors
 *    connection-gate's beforeSpecs skip). A pre-existing unbacked read in a legacy
 *    file never blocks an unrelated edit — but no write may INTRODUCE one. In the
 *    READ lens, priorOf is '' so every literal key is judged absolutely.
 *
 * THE RICE LINE — exactly where this class stops being decidable (→ unjudged, never red):
 *  1. NON-LITERAL key: `config.get(varName)`, `config.get(`${prefix}_URL`)`, or any
 *     non-string-literal argument — the key is computed at runtime, undecidable from
 *     bytes. Such a call is SKIPPED (not red); if a file's ONLY config reads are
 *     non-literal it contributes nothing.
 *  2. OPEN schema: when the canonical schema is `.unknown(true)` (Joi tolerates
 *     unknown env vars by design — and `@nestjs/config` defaults to
 *     `validationOptions.allowUnknown = true` regardless), a key outside the declared
 *     set is NOT a dangle: Joi passes it through, the app boots, the read returns the
 *     raw env value. Asserting membership against an OPEN schema would be
 *     red-by-guess. So when the resolved schema is open, the gate returns
 *     `unjudged: true` for the run — the membership fact is not decidable because the
 *     contract is intentionally open. (This repo's schema is `.unknown(true)`, so this
 *     gate is honestly UNJUDGED here today; it becomes a hard fact the moment the
 *     contract is closed — which is the production-grade end state the gate is for.)
 *  3. SCHEMA NOT RESOLVABLE: no unique `Joi.object({...})` validationSchema found in
 *     the tree (e.g. a repo with no central config contract) → no closed key set →
 *     unjudged. Never invent a key set.
 *  - CEILING (deferred to the dynamic/effect tier, NOT bytes): whether the env VALUE
 *    is actually SET at runtime (a declared-but-unset optional key returns undefined)
 *    needs a real boot with the real environment — `protocol_hub` / a live probe, not
 *    bytes. This gate is `static` and never claims value-presence; it asserts only the
 *    closed, byte-decidable key⇄declaration edge.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { blankComments } from '../connection-gate.js';
import {
  type GateContext,
  type GateModule,
  type GateRed,
  type GateResult,
} from './contract.js';

// ─────────────────────────── applicability ───────────────────────────

const TS_RE = /\.(ts|tsx|mts|cts)$/;
/** declaration files carry no runtime config reads */
const DTS_RE = /\.d\.ts$/;

// ─────────────────────────── the Joi schema decider ───────────────────────────

/**
 * Where the canonical config contract lives. The gate resolves the schema relative
 * to repoRoot. Backend monorepo layout: backend/src/config/app-config.module.ts.
 * The gate scans this directory for the unique `Joi.object({...})` validationSchema
 * rather than hard-coding the filename, so a rename of the module file does not
 * silently turn every config read unjudged.
 */
const CONFIG_DIR = 'backend/src/config';

interface SchemaContract {
  /** declared key set (the validationSchema's top-level Joi.object keys) */
  keys: Set<string>;
  /** true = `.unknown(true)` present → Joi tolerates unknown env → membership is NOT a dangle fact */
  open: boolean;
  /** repo-relative file the schema was read from (for diagnostics) */
  file: string;
}

/**
 * Length-NON-preserving (we only need keys + openness, not loci) extraction of the
 * Joi validationSchema's declared key set and openness from a config module body.
 * Comments are blanked first (so a commented-out `FOO: Joi.string()` is not counted
 * as declared); strings are preserved by `blankComments` but we read no strings here.
 *
 * We locate the `validationSchema:` property, then the `Joi.object({ … })` argument,
 * take the balanced-brace block, and read every `IDENT: Joi.` (or `IDENT: <ref>`)
 * key at the object's top level. Openness = presence of `.unknown(true)` applied to
 * that same schema expression (the `.unknown(false)` / absent case is CLOSED — Joi's
 * own default for a validateSync without allowUnknown rejects unknowns; we treat the
 * explicit `.unknown(true)` marker as the only OPEN signal because that is the byte we
 * can read deterministically).
 */
function parseSchema(rawBody: string, file: string): SchemaContract | null {
  const body = blankComments(rawBody);
  const anchor = body.indexOf('validationSchema');
  if (anchor < 0) return null;
  const objIdx = body.indexOf('Joi.object', anchor);
  if (objIdx < 0) return null;
  const openParen = body.indexOf('(', objIdx);
  if (openParen < 0) return null;
  const openBrace = body.indexOf('{', openParen);
  if (openBrace < 0) return null;
  const inner = sliceBalancedBraces(body, openBrace);
  if (inner === null) return null;

  const keys = collectTopLevelKeys(inner);
  if (keys.size === 0) return null; // not a real key-listing schema → don't invent a set

  // openness: `.unknown(true)` applied to the schema. We search the chained tail
  // after the closing brace of the Joi.object — the region where `.unknown(...)`,
  // `.custom(...)` etc. are applied — within the same statement (up to the next
  // top-level `})` that closes ConfigModule.forRoot, bounded to a safe window).
  const tail = body.slice(openBrace, openBrace + inner.length + 600);
  const open = /\.unknown\s*\(\s*true\s*\)/.test(tail);

  return { keys, open, file };
}

/** Return the text strictly inside the brace block whose opening `{` is at openIdx, or null if unbalanced. */
function sliceBalancedBraces(body: string, openIdx: number): string | null {
  let depth = 0;
  for (let i = openIdx; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return body.slice(openIdx + 1, i);
    }
  }
  return null; // unbalanced → refuse to guess a key set
}

/**
 * Top-level `KEY:` identifiers inside the Joi.object body. We only count a key when
 * it sits at brace-depth 0 of the object body (so a nested `Joi.object({ inner: ... })`
 * field's inner keys are not mistaken for top-level env vars), and is followed by a
 * value (`:`). Identifiers may be SCREAMING_SNAKE (env vars) — that is the dominant
 * shape — but we accept any JS identifier so a non-env config key is still recognised.
 */
function collectTopLevelKeys(inner: string): Set<string> {
  const keys = new Set<string>();
  let depth = 0;
  let i = 0;
  const n = inner.length;
  let atKeyPosition = true; // start of object, and right after a top-level comma
  while (i < n) {
    const ch = inner[i];
    if (ch === '{' || ch === '(' || ch === '[') {
      depth += 1;
      atKeyPosition = false;
      i += 1;
      continue;
    }
    if (ch === '}' || ch === ')' || ch === ']') {
      depth -= 1;
      i += 1;
      continue;
    }
    if (depth === 0 && ch === ',') {
      atKeyPosition = true;
      i += 1;
      continue;
    }
    if (depth === 0 && atKeyPosition) {
      const m = /^[ \t\r\n]*([A-Za-z_$][A-Za-z0-9_$]*)\s*:/.exec(inner.slice(i));
      if (m) {
        keys.add(m[1]);
        i += m[0].length;
        atKeyPosition = false;
        continue;
      }
      // quoted key form: "KEY": ...  /  'KEY': ...
      const qm = /^[ \t\r\n]*["']([A-Za-z_$][A-Za-z0-9_$]*)["']\s*:/.exec(inner.slice(i));
      if (qm) {
        keys.add(qm[1]);
        i += qm[0].length;
        atKeyPosition = false;
        continue;
      }
    }
    if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') atKeyPosition = false;
    i += 1;
  }
  return keys;
}

/**
 * Resolve THE canonical schema for the repo. Scans CONFIG_DIR (non-recursively, then
 * one level) for a .ts file whose body parses into a non-empty key-listing schema.
 * Returns the first such; null if none (→ the run is unjudged). Reading from disk
 * directly (not the overlay) is correct: the schema is the repo's committed contract,
 * not part of the changed write — and if the schema FILE is itself the changed file,
 * the overlay-aware read below picks that up.
 */
function resolveSchema(ctx: GateContext): SchemaContract | null {
  const dirAbs = path.join(ctx.repoRoot, CONFIG_DIR);
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dirAbs);
  } catch {
    return null;
  }
  // prefer app-config.module.ts if present, else any non-spec .ts in the dir.
  const ordered = entries
    .filter((f) => /\.ts$/.test(f) && !/\.spec\.ts$/.test(f) && !/\.d\.ts$/.test(f))
    .sort((a, b) => (a.includes('app-config') ? -1 : b.includes('app-config') ? 1 : a.localeCompare(b)));
  for (const f of ordered) {
    const rel = `${CONFIG_DIR}/${f}`;
    const body = ctx.readFile(rel); // overlay-aware: a changed schema is seen
    if (body === null) continue;
    const parsed = parseSchema(body, rel);
    if (parsed) return parsed;
  }
  return null;
}

// ─────────────────────────── config-read extraction ───────────────────────────

interface ConfigRead {
  key: string;
  line: number;
  col: number;
  callText: string; // for the NEW-only diff key (e.g. "config.get('FOO')")
}

/**
 * Receivers we treat as a ConfigService. Only `config` / `configService` — the two
 * canonical NestJS injection names in this codebase (verified: 41 `config:` + 12
 * `configService:` ConfigService fields). NestJS DI `module.get(Token)` and Map
 * `.get('id')` use other receivers and are deliberately NOT matched (red-by-guess
 * otherwise). `this.` / optional prefix is allowed.
 */
const READ_RE =
  /\b(?:this\.)?(config|configService)\s*\.\s*get\s*(?:<[^>]*>)?\s*\(\s*(['"])([^'"]*)\2/g;

/**
 * Extract literal-key config reads. Comments are blanked first (so a call in a
 * comment is gone); the literal argument is read from the SAME blanked text — and a
 * real string literal is PRESERVED by `blankComments`, so the key text survives while
 * a commented-out call's `get(` head is whitespace and never matches. Non-literal
 * arguments (`config.get(varName)`, template literals) never match this regex, so
 * they are silently skipped — the Rice line: undecidable keys are unjudged, not red.
 */
function collectReads(rawBody: string): ConfigRead[] {
  const body = blankComments(rawBody);
  const out: ConfigRead[] = [];
  let m: RegExpExecArray | null;
  READ_RE.lastIndex = 0;
  while ((m = READ_RE.exec(body)) !== null) {
    const idx = m.index;
    out.push({
      key: m[3],
      line: lineOf(body, idx),
      col: colOf(body, idx),
      callText: m[0],
    });
  }
  return out;
}

function lineOf(body: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < body.length; i += 1) if (body[i] === '\n') line += 1;
  return line;
}
function colOf(body: string, idx: number): number {
  let col = 1;
  for (let i = idx - 1; i >= 0 && body[i] !== '\n'; i -= 1) col += 1;
  return col;
}

// ─────────────────────────── the gate ───────────────────────────

const configKeyGate: GateModule = {
  name: 'config-key',
  kind: 'static',
  appliesTo(rel: string): boolean {
    return TS_RE.test(rel) && !DTS_RE.test(rel);
  },
  run(ctx: GateContext): GateResult {
    const note =
      'every literal configService.get(\'KEY\') read resolves to a key declared in the Joi validationSchema (closed-schema membership)';

    const candidateReads: { rel: string; reads: ConfigRead[] }[] = [];
    for (const rel of ctx.changedFiles) {
      if (!this.appliesTo(rel)) continue;
      const body = ctx.readFile(rel);
      if (body === null) continue;
      // NEW-key-only: the call texts present BEFORE this write are not its claim.
      const before = new Set(collectReads(ctx.priorOf(rel)).map((r) => r.callText));
      const reads = collectReads(body).filter(
        (read) => !before.has(read.callText) && read.key !== '',
      );
      if (reads.length > 0) candidateReads.push({ rel, reads });
    }

    if (candidateReads.length === 0) {
      return { gate: this.name, green: true, reds: [], note, notApplicable: true };
    }

    // ── resolve the closed key set; the Rice line: open/missing schema → unjudged ──
    const schema = resolveSchema(ctx);
    if (schema === null) {
      // No canonical Joi validationSchema reachable → no closed key set to assert
      // membership against → honestly undecidable, never invent a contract.
      return { gate: this.name, green: true, reds: [], note, unjudged: true };
    }
    if (schema.open) {
      // `.unknown(true)` (and @nestjs/config's default allowUnknown) → Joi tolerates
      // unknown env vars: a key outside the declared set is NOT a dangle. Asserting
      // membership here would be red-by-guess, so the membership fact is honestly
      // undecidable for an OPEN contract. Becomes a hard fact when the schema closes.
      return { gate: this.name, green: true, reds: [], note, unjudged: true };
    }

    // ── CLOSED schema: a literal key outside the declared set crashes Joi at boot ──
    const reds: GateRed[] = [];
    for (const { rel, reads } of candidateReads) {
      for (const read of reads) {
        if (!schema.keys.has(read.key)) {
          reds.push({
            file: rel,
            locus: `L${read.line}:${read.col}`,
            fact: `config key '${read.key}' is read but not declared in the closed Joi validationSchema (${schema.file}) — Joi rejects it at boot`,
          });
        }
      }
    }

    return { gate: this.name, green: reds.length === 0, reds, note };
  },
};

export default configKeyGate;
