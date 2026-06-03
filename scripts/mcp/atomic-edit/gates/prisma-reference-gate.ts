/**
 * gates/prisma-reference-gate.ts — the exoneration-free PRISMA MODEL/TABLE REFERENCE fact.
 *
 * Red class #11 (model/column references the type system never sees) has two escape
 * hatches that `tsc` is structurally blind to:
 *
 *   1. The `prismaAny` path. Code that reaches Prisma through an `as unknown as ...`
 *      escape — `prismaAny.<accessor>.<op>(...)` — has erased the generated client's
 *      type, so `prismaAny.memberAreaUpdate.updateMany(...)` type-checks even when no
 *      `MemberAreaUpdate` model exists. tsc says GREEN; the call explodes at runtime.
 *   2. The `$queryRaw` path. A physical table named in a raw-SQL tagged template —
 *      `prisma.$queryRaw\`... FROM "RAC_Message" ...\`` — is just a string to the
 *      compiler. A typo (`"RAC_Mesage"`) is invisible to tsc and dies in Postgres.
 *
 * Both are FACTS extractable from bytes, because the schema is a closed dictionary:
 * `backend/prisma/schema.prisma` enumerates every model (which gives its camelCase
 * client accessor) and every `@@map("…")` physical table name. A `prismaAny.<accessor>`
 * whose accessor is not a real model, or a `$queryRaw FROM "<table>"` whose quoted table
 * is not a real `@@map`, DANGLES — no migration apply, no live DB, no language server.
 *
 * This module is the Prisma analogue of iac-reference-gate.ts: that gate adapts the
 * Terraform/K8s config closure as its dictionary and asserts "an intra-config infra
 * reference resolves"; this gate adapts the schema.prisma model/table index as its
 * dictionary and asserts "a Prisma model/table reference on the type-erased path
 * resolves". The decider is the schema index, exactly as iac's decider is the config
 * closure. (Live column-name existence is cross-checkable read-only via
 * `mcp__postgres__pg_table_describe`, but THIS gate stays `static` — it asserts only
 * the byte-decidable schema edge, never a live-cloud fact.)
 *
 * Mutation-Firewall law (mirrored): this gate is PERCEPTION only. It LOCATES the
 * dangling reference (file + locus + fact); it never writes.
 *
 * Semantics (NEW-reference-only, exoneration-free):
 *  - DICTIONARY = the model→accessor + @@map→table index parsed from schema.prisma
 *    (read via ctx.readFile so the overlay wins if the schema itself is being edited;
 *    the lens reads committed bytes). If the schema cannot be read at all → UNJUDGED
 *    (no dictionary → never red-by-guess).
 *  - NEW-reference-only: a reference token (the `prismaAny.<accessor>` head, or a
 *    quoted `"<table>"` in a $queryRaw template) is judged only when it is present in
 *    the file's NEW content but ABSENT from its prior content (ctx.priorOf). A
 *    pre-existing dangle in a legacy file never blocks an unrelated edit — but no
 *    write may INTRODUCE one. (Mirrors iac/connection-gate's before-set skip.)
 *  - NEW-only DELTA: this gate judges only ctx.changedFiles; it never sweeps the repo.
 *
 * RICE LINE — where this class STOPS being decidable (becomes UNJUDGED / out-of-scope,
 * never red):
 *  - A DYNAMIC accessor — `prismaAny[modelVar]`, `prismaAny[`+'`${x}`'+`]` — is a
 *    computed member; the model name is a runtime value, not a literal. Undecidable
 *    from bytes, so it is out of scope (never extracted, never red). The decidable
 *    hatch is the LITERAL `prismaAny.identifier.op` form only.
 *  - A RUNTIME-BUILT SQL table — a `$queryRaw` template whose FROM/JOIN region carries a
 *    `${...}` interpolation, or a `$queryRawUnsafe(concatenatedString)` — is
 *    undecidable: the table identifier is not a literal in the template. That region is
 *    treated as UNJUDGED rather than reddened. This is the exact Rice boundary the brief
 *    names: a column in a runtime-built SQL string is undecidable.
 *  - An UNQUOTED SQL identifier (`FROM inbound`, `FROM information_schema.columns`,
 *    `FROM customer_client`) is a CTE/subquery alias, a system catalog, or an external
 *    data source — NOT necessarily a Prisma-managed table — so it is out of scope, not
 *    red-by-guess. Only DOUBLE-QUOTED identifiers (Prisma's own quoting style for its
 *    mapped tables) are the closed, decidable case.
 *  - COMMENTS + JS/TS LITERAL TEXT: a `prismaAny.x` reference written inside a comment,
 *    string literal, or template literal text is whitespace after the byte-floor masking
 *    runs first. Executable `${...}` template interpolations remain code and are still
 *    judged. This removes non-code false positives without hiding real runtime access.
 */
import { blankComments } from '../connection-gate.js';
import { type GateContext, type GateModule, type GateRed, type GateResult } from './contract.js';

// ─────────────────────────── the schema dictionary ───────────────────────────

const SCHEMA_REL = 'backend/prisma/schema.prisma';

interface SchemaIndex {
  /** camelCase client accessors (model name with first letter lowered) */
  accessors: Set<string>;
  /** physical table names: every @@map("…") value, plus the bare model name as fallback */
  tables: Set<string>;
}

/** Prisma's client-accessor rule: the model name with its first character lowercased. */
function accessorOf(modelName: string): string {
  return modelName.length === 0 ? modelName : modelName[0].toLowerCase() + modelName.slice(1);
}

/**
 * Parse schema.prisma into the closed dictionary of model accessors + physical table
 * names. Comments are blanked first (length-preserving) so a commented-out `model X {`
 * or `@@map("Y")` is NOT registered as a real definition (a false GREEN — the inverse
 * of the comment-embedded false-positive class). Robust line/block scan, NOT a full
 * Prisma parser: it keys off `model <Name> {` headers and `@@map("<table>")` lines,
 * which is the entire surface this gate's facts depend on.
 */
function parseSchema(rawSchema: string): SchemaIndex {
  const schema = blankComments(rawSchema);
  const accessors = new Set<string>();
  const tables = new Set<string>();
  // Walk model blocks: header `model <Name> {`, then within the block look for @@map.
  const modelHeaderRe = /(^|\n)\s*model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = modelHeaderRe.exec(schema)) !== null) {
    const modelName = m[2];
    accessors.add(accessorOf(modelName));
    // Locate the balanced body of this model block to find its @@map (if any).
    const openIdx = schema.indexOf('{', m.index);
    if (openIdx === -1) continue;
    const body = sliceBalancedBlock(schema, openIdx);
    const mapM = /@@map\(\s*"([^"]+)"\s*\)/.exec(body);
    // Mapped → physical table is the @@map value; unmapped → Prisma uses the model name.
    tables.add(mapM ? mapM[1] : modelName);
  }
  return { accessors, tables };
}

/** Return the text inside the brace block whose opening `{` is at openIdx. */
function sliceBalancedBlock(body: string, openIdx: number): string {
  let depth = 0;
  for (let i = openIdx; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return body.slice(openIdx + 1, i);
    }
  }
  return body.slice(openIdx + 1); // unbalanced → take the rest (robust, not strict)
}

// ─────────────────────────── reference extraction ───────────────────────────

interface PrismaAnyRef {
  accessor: string;
  token: string; // the full `prismaAny.<accessor>` head, used for NEW-only diffing
  line: number;
}
interface RawTableRef {
  table: string;
  token: string; // the quoted `"<table>"` literal, used for NEW-only diffing
  line: number;
}

function blankAt(out: string[], source: string, idx: number): void {
  if (source[idx] !== '\n' && source[idx] !== '\r') out[idx] = ' ';
}

/**
 * Blank JS/TS string-literal text without changing line numbers. Template literal
 * text is blanked, but executable `${...}` interpolation bodies are scanned as code.
 */
function blankJsLiteralText(source: string): string {
  const out = source.split('');

  function blankQuoted(idx: number, quote: string): number {
    blankAt(out, source, idx);
    let i = idx + 1;
    while (i < source.length) {
      const ch = source[i];
      blankAt(out, source, i);
      i += 1;
      if (ch === '\\') {
        if (i < source.length) {
          blankAt(out, source, i);
          i += 1;
        }
        continue;
      }
      if (ch === quote) break;
    }
    return i;
  }

  function blankTemplate(idx: number): number {
    blankAt(out, source, idx);
    let i = idx + 1;
    while (i < source.length) {
      const ch = source[i];
      if (ch === '\\') {
        blankAt(out, source, i);
        i += 1;
        if (i < source.length) {
          blankAt(out, source, i);
          i += 1;
        }
        continue;
      }
      if (ch === '`') {
        blankAt(out, source, i);
        return i + 1;
      }
      if (ch === '$' && source[i + 1] === '{') {
        blankAt(out, source, i);
        blankAt(out, source, i + 1);
        i = scanTemplateExpression(i + 2);
        if (i < source.length && source[i] === '}') {
          blankAt(out, source, i);
          i += 1;
        }
        continue;
      }
      blankAt(out, source, i);
      i += 1;
    }
    return i;
  }

  function scanTemplateExpression(idx: number): number {
    let depth = 1;
    let i = idx;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === "'" || ch === '"') {
        i = blankQuoted(i, ch);
        continue;
      }
      if (ch === '`') {
        i = blankTemplate(i);
        continue;
      }
      if (ch === '{') {
        depth += 1;
        i += 1;
        continue;
      }
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) return i;
      }
      i += 1;
    }
    return i;
  }

  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "'" || ch === '"') {
      i = blankQuoted(i, ch);
      continue;
    }
    if (ch === '`') {
      i = blankTemplate(i);
      continue;
    }
    i += 1;
  }

  return out.join('');
}

/**
 * Every LITERAL `prismaAny.<accessor>` reference (optionally `this.prismaAny.…`) in a
 * source body, with its 1-based line. Comments and JS/TS literal text are blanked first
 * so non-code `prismaAny.x` bytes are whitespace. Executable template interpolations
 * remain code. A computed member (`prismaAny[…]`) is deliberately NOT matched — that is
 * the dynamic Rice-line case (out of scope, never red).
 */
function collectPrismaAnyRefs(rawBody: string): PrismaAnyRef[] {
  const body = blankJsLiteralText(blankComments(rawBody));
  const out: PrismaAnyRef[] = [];
  // (?:this\.)? prismaAny . <identifier>  — the literal-accessor hatch only.
  const re = /\bprismaAny\.([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push({ accessor: m[1], token: m[0], line: lineOf(body, m.index) });
  }
  return out;
}

/**
 * Every DOUBLE-QUOTED physical table reference in a `$queryRaw` / `$queryRawUnsafe`
 * tagged-template or call, with its 1-based line — but ONLY when the surrounding raw-SQL
 * region carries no `${…}` interpolation that builds the table name dynamically (that is
 * the runtime-built-SQL Rice line — unjudged, not red).
 *
 * Strategy: blank comments first, then for each `$queryRaw`/`$queryRawUnsafe`
 * occurrence, take the SQL region that follows it up to the matching backtick (template)
 * or closing paren (call). Within that region, find `FROM "X"` / `JOIN "X"` quoted
 * identifiers. If the SAME region contains a `${` interpolation, the region is dynamic,
 * so it is counted as a dynamic region and its literals are NOT reddened (the gate is
 * honest that the exact table may be the interpolated one).
 */
function collectRawTableRefs(rawBody: string): { refs: RawTableRef[]; dynamicRegions: number } {
  const body = blankComments(rawBody);
  // Locate REAL `$queryRaw` tags only. A `$queryRaw` token embedded INSIDE an outer
  // string/template literal — a test fixture (`'… $queryRaw`…`'`), a doc example —
  // is not a live query; it must never be reddened. So find the tag token in the
  // literal-blanked LOCATOR (where such embedded tokens are whitespace), but read the
  // SQL region from `body` (literals preserved) so a genuine tagged-template's SQL
  // stays intact. `blankJsLiteralText` is length-preserving, so locator/body indices
  // align. Mirrors collectPrismaAnyRefs, which already blanks literal text first.
  const locator = blankJsLiteralText(body);
  const out: RawTableRef[] = [];
  let dynamicRegions = 0;
  const rawTagRe = /\$queryRaw(?:Unsafe)?/g;
  let m: RegExpExecArray | null;
  while ((m = rawTagRe.exec(locator)) !== null) {
    const region = sqlRegionAfter(body, m.index + m[0].length);
    if (region === null) continue;
    const { text, start } = region;
    const isDynamic = text.includes('${');
    // FROM/JOIN "<quoted-table>" — Prisma quotes its mapped tables with double quotes.
    const tableRe = /\b(?:FROM|JOIN)\s+"([A-Za-z_][A-Za-z0-9_]*)"/gi;
    let tm: RegExpExecArray | null;
    let anyHere = false;
    while ((tm = tableRe.exec(text)) !== null) {
      anyHere = true;
      if (isDynamic) {
        // a literal table sitting in a region whose name-building is dynamic is honestly
        // undecidable as "this exact table" — defer rather than red the literal.
        continue;
      }
      out.push({
        table: tm[1],
        token: tm[0],
        line: lineOf(body, start + tm.index),
      });
    }
    if (isDynamic && anyHere) dynamicRegions += 1;
  }
  return { refs: out, dynamicRegions };
}

/**
 * Given an index just past a `$queryRaw`/`$queryRawUnsafe`, return the SQL string region
 * that follows: a backtick template region (from the first backtick to its match) or a
 * parenthesised string-arg region (from the first `(` to its matching `)`). Returns the
 * region text and its absolute start offset, or null if neither shape is found nearby.
 */
function sqlRegionAfter(body: string, idx: number): { text: string; start: number } | null {
  // skip whitespace
  let i = idx;
  while (
    i < body.length &&
    (body[i] === ' ' || body[i] === '\t' || body[i] === '\n' || body[i] === '\r')
  )
    i += 1;
  // generic type arg like $queryRaw<{...}[]>` — skip a balanced <…> if present
  if (body[i] === '<') {
    let depth = 0;
    for (; i < body.length; i += 1) {
      if (body[i] === '<') depth += 1;
      else if (body[i] === '>') {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          break;
        }
      }
    }
    while (
      i < body.length &&
      (body[i] === ' ' || body[i] === '\t' || body[i] === '\n' || body[i] === '\r')
    )
      i += 1;
  }
  if (body[i] === '`') {
    // template literal region up to the matching (unescaped) backtick
    let j = i + 1;
    while (j < body.length && body[j] !== '`') {
      if (body[j] === '\\') j += 1;
      j += 1;
    }
    return { text: body.slice(i + 1, j), start: i + 1 };
  }
  if (body[i] === '(') {
    // call form: balanced parens region
    let depth = 0;
    for (let j = i; j < body.length; j += 1) {
      if (body[j] === '(') depth += 1;
      else if (body[j] === ')') {
        depth -= 1;
        if (depth === 0) return { text: body.slice(i + 1, j), start: i + 1 };
      }
    }
    return { text: body.slice(i + 1), start: i + 1 };
  }
  return null;
}

// ─────────────────────────── shared ───────────────────────────

function lineOf(body: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < body.length; i += 1) if (body[i] === '\n') line += 1;
  return line;
}

const SRC_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

// ─────────────────────────── the gate ───────────────────────────

const prismaReferenceGate: GateModule = {
  name: 'prisma-reference',
  kind: 'static',
  appliesTo(rel: string): boolean {
    return SRC_RE.test(rel) && !rel.endsWith('.d.ts');
  },
  run(ctx: GateContext): GateResult {
    const note =
      'every type-erased Prisma reference (prismaAny.<model> accessor; $queryRaw FROM/JOIN "<table>") resolves to a model/@@map in schema.prisma';

    // ── load the closed dictionary; no schema → UNJUDGED (never red-by-guess) ──
    const rawSchema = ctx.readFile(SCHEMA_REL);
    if (rawSchema === null) {
      return { gate: this.name, green: true, reds: [], note, unjudged: true };
    }
    const index = parseSchema(rawSchema);
    // A degenerate/empty schema parse is also undecidable rather than mass-red.
    if (index.accessors.size === 0 && index.tables.size === 0) {
      return { gate: this.name, green: true, reds: [], note, unjudged: true };
    }

    const reds: GateRed[] = [];
    let sawDynamic = false;
    let sawAnyApplicable = false;

    for (const rel of ctx.changedFiles) {
      if (!this.appliesTo(rel)) continue;
      // Never judge the schema file itself or generated client typings.
      if (rel === SCHEMA_REL) continue;
      const body = ctx.readFile(rel);
      if (body === null) continue;
      const prior = ctx.priorOf(rel);

      // ── prismaAny.<accessor> path ──
      const beforeAccessorTokens = new Set(collectPrismaAnyRefs(prior).map((r) => r.token));
      for (const ref of collectPrismaAnyRefs(body)) {
        sawAnyApplicable = true;
        if (beforeAccessorTokens.has(ref.token)) continue; // not this write's claim
        if (!index.accessors.has(ref.accessor)) {
          reds.push({
            file: rel,
            locus: `L${ref.line}`,
            fact: `prismaAny.${ref.accessor} references no Prisma model (accessor "${ref.accessor}") declared in schema.prisma`,
          });
        }
      }

      // ── $queryRaw FROM/JOIN "<table>" path ──
      const beforeRaw = collectRawTableRefs(prior);
      const beforeTableTokens = new Set(beforeRaw.refs.map((r) => `${r.table}|${r.token}`));
      const cur = collectRawTableRefs(body);
      if (cur.dynamicRegions > 0) sawDynamic = true;
      for (const ref of cur.refs) {
        sawAnyApplicable = true;
        if (beforeTableTokens.has(`${ref.table}|${ref.token}`)) continue; // pre-existing → not this write's claim
        if (!index.tables.has(ref.table)) {
          reds.push({
            file: rel,
            locus: `L${ref.line}`,
            fact: `$queryRaw references physical table "${ref.table}", which is not a model @@map nor a model name in schema.prisma`,
          });
        }
      }
    }

    // If nothing decidable was even present AND the only thing we saw was a dynamic
    // (runtime-built) SQL region, be honest: we could not assert a fact → UNJUDGED.
    if (reds.length === 0 && !sawAnyApplicable && sawDynamic) {
      return { gate: this.name, green: true, reds: [], note, unjudged: true };
    }

    return { gate: this.name, green: reds.length === 0, reds, note };
  },
};

export default prismaReferenceGate;
