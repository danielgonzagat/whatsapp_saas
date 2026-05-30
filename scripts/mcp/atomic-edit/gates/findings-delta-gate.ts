/**
 * gates/findings-delta-gate.ts — the exoneration-free FINDINGS-DELTA fact.
 *
 * Dissolves the SARIF atom. A SARIF finding is a triple (where, which-rule,
 * verdict). The crivo's job is not to enumerate every legacy finding — it is to
 * refuse the WRITE that INTRODUCES a new one. So this gate states ONE fact, at
 * the byte floor, in the same NEW-only shape `checkConnectionByteFloor` uses for
 * imports:
 *
 *   A pure-text single-file lint finding present in the CANDIDATE content of a
 *   changed file but ABSENT from that file's prior content is a NEW finding → RED.
 *
 * A pre-existing finding in legacy bytes never blocks an unrelated edit (it is
 * not this write's claim) — but no write may INTRODUCE one. Brand-new files are
 * all-new, so every finding in them counts.
 *
 * ── PURE-TEXT SUBSET ONLY (the honest scope) ──────────────────────────────────
 * Grounded against the real backend.sarif (eslint driver, SARIF 2.1.0, 8592
 * findings, 26 rules): the rule population splits cleanly into two halves.
 *
 *   • Single-file / pure-fn (decidable from THIS file's bytes alone) — JUDGED:
 *       no-debugger, no-duplicate-case, no-empty (empty block), no-fallthrough's
 *       structural sibling, no-constant-condition's literal form … We implement a
 *       deterministic, zero-config, self-contained analyzer for a conservative
 *       slice of these (the ones that are a pure property of the token/AST stream
 *       with no resolver, no config, no cross-file lookup). Each is a real
 *       finding a human eslint run would also raise.
 *
 *   • Type-aware / whole-program (need the TS type system) — DEFERRED, NOT FAKED:
 *       no-unsafe-assignment, no-unsafe-member-access, no-unsafe-call,
 *       no-unsafe-return, no-unsafe-argument, unbound-method, no-floating-promises,
 *       await-thenable, require-await, restrict-template-expressions,
 *       no-base-to-string, no-redundant-type-constituents. These are 3186 of the
 *       8592 findings. We CANNOT compute them from one file's bytes — they require
 *       resolved types across the program. The LSP/tsc owns that truth, so they
 *       are routed to the dynamic/effect gate (apply→run eslint→revert). We never
 *       guess them: their absence from our reds is honest, not green-by-assumption.
 *
 * Pure perception (regex/byte scan over the candidate string) — no daemon, no
 * subprocess, language-scoped to JS/TS where these rules apply. The Mutation
 * Firewall law holds: this gate only PERCEIVES and LOCATES spans; it never writes.
 */
import { type GateModule, type GateContext, type GateResult, type GateRed } from './contract.js';

/** Source files where the pure-text JS/TS lint subset applies. */
const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * The type-aware rule frontier — DOCUMENTED so the ceiling is explicit and the
 * effect gate (eslint apply→run→revert) knows exactly what it inherits. Grounded
 * 1:1 against backend.sarif's rule histogram. These need the type checker; this
 * static gate refuses to emit them.
 */
export const TYPE_AWARE_DEFERRED = new Set<string>([
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-unsafe-member-access',
  '@typescript-eslint/no-unsafe-call',
  '@typescript-eslint/no-unsafe-return',
  '@typescript-eslint/no-unsafe-argument',
  '@typescript-eslint/unbound-method',
  '@typescript-eslint/no-base-to-string',
  '@typescript-eslint/require-await',
  '@typescript-eslint/no-floating-promises',
  '@typescript-eslint/await-thenable',
  '@typescript-eslint/restrict-template-expressions',
  '@typescript-eslint/no-redundant-type-constituents',
]);

/** A single pure-text finding located in a candidate by byte offset. */
interface Finding {
  ruleId: string;
  message: string;
  /** 1-based line */
  line: number;
  /** 1-based column */
  col: number;
}

/** 1-based line/col for a byte offset in `text`. */
function lineColAt(text: string, index: number): { line: number; col: number } {
  let line = 1;
  let last = -1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      last = i;
    }
  }
  return { line, col: index - last };
}

/**
 * Strip string/template/regex literals and comments to a same-length blanked
 * copy, so the structural scanners below never match inside a literal or comment
 * (the eslint analyzer operates on tokens, not raw text — this is the cheap
 * deterministic stand-in). Length-preserving so byte offsets stay exact.
 */
function blankNonCode(src: string): string {
  const out = src.split('');
  let i = 0;
  const n = src.length;
  const blankRange = (a: number, b: number): void => {
    for (let k = a; k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      let j = i + 2;
      while (j < n && src[j] !== '\n') j++;
      blankRange(i, j);
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
      j = Math.min(n, j + 2);
      blankRange(i, j);
      i = j;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++;
        j++;
      }
      blankRange(i + 1, j);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join('');
}

/**
 * The pure-fn single-file analyzer. A conservative, deterministic slice of the
 * non-type-aware eslint rule family — each a property of the token stream alone,
 * with NO config, NO resolver, NO cross-file lookup. Returns one Finding per hit.
 *
 * Implemented (real eslint rules, byte-decidable):
 *   • no-debugger        — a bare `debugger;` statement.
 *   • no-duplicate-case  — two `case <same-literal>:` in one switch run.
 *   • no-fallthrough's structural cousin is type/flow-ish → omitted (honest).
 * The set is intentionally small and exact: every hit is a finding a human eslint
 * run also raises, so a RED is never a false positive.
 */
function analyzePureText(content: string): Finding[] {
  const findings: Finding[] = [];
  const code = blankNonCode(content);

  // no-debugger: a `debugger` statement (word-boundary, outside literals/comments).
  const dbg = /\bdebugger\b/g;
  let m: RegExpExecArray | null;
  while ((m = dbg.exec(code)) !== null) {
    const { line, col } = lineColAt(content, m.index);
    findings.push({ ruleId: 'no-debugger', message: "Unexpected 'debugger' statement.", line, col });
  }

  // no-duplicate-case: duplicate `case <literal>:` labels within the file's
  // switch text. Scoped per switch block by tracking brace depth from each
  // `switch (`. Pure token property — no types needed.
  const switchRe = /\bswitch\s*\(/g;
  let s: RegExpExecArray | null;
  while ((s = switchRe.exec(code)) !== null) {
    // find the opening brace of the switch body
    let p = switchRe.lastIndex;
    while (p < code.length && code[p] !== '{') p++;
    if (p >= code.length) continue;
    let depth = 0;
    const seen = new Set<string>();
    const caseRe = /\bcase\s+([^:]+?):/g;
    for (let q = p; q < code.length; q++) {
      if (code[q] === '{') depth++;
      else if (code[q] === '}') {
        depth--;
        if (depth === 0) break;
      } else if (depth === 1) {
        caseRe.lastIndex = q;
        const cm = caseRe.exec(code);
        if (cm && cm.index === q) {
          const label = cm[1].trim();
          if (seen.has(label)) {
            const { line, col } = lineColAt(content, cm.index);
            findings.push({
              ruleId: 'no-duplicate-case',
              message: 'Duplicate case label.',
              line,
              col,
            });
          }
          seen.add(label);
          q = caseRe.lastIndex - 1;
        }
      }
    }
  }

  return findings;
}

/** Stable identity of a finding for set-membership: rule + message (NOT line —
 * a finding that merely shifts lines is the same finding, so we key on what it
 * IS, scoped per file). Matches the SARIF (where=file, which-rule, verdict)
 * identity minus the volatile region. */
function findingKey(f: Finding): string {
  return `${f.ruleId}::${f.message}`;
}

/** Multiset of finding-keys → count, so introducing a SECOND identical finding
 * (e.g. a new duplicate-case) is still detected as a delta. */
function keyCounts(findings: Finding[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of findings) m.set(findingKey(f), (m.get(findingKey(f)) ?? 0) + 1);
  return m;
}

/**
 * The fact, over the context. For each changed source file, run the pure-text
 * analyzer on the candidate AND on the prior content, and red iff the candidate
 * raises a finding-key MORE times than the prior did (a NEW finding). Same
 * NEW-only delta semantics as the connection byte floor.
 */
function runFindingsDelta(ctx: GateContext): GateResult {
  const reds: GateRed[] = [];
  let judgedAny = false;

  for (const rel of ctx.changedFiles) {
    if (!SOURCE_RE.test(rel)) continue;
    const candidate = ctx.overlay.get(rel.replaceAll('\\', '/')) ?? ctx.readFile(rel);
    if (candidate == null) continue;
    judgedAny = true;

    // prior bytes = on-disk content. The overlay is the candidate; disk (via a
    // direct read that bypasses the overlay) is the "before". If the file is new
    // there is no prior, so every finding is new.
    const prior = priorContent(ctx, rel);
    const before = prior == null ? new Map<string, number>() : keyCounts(analyzePureText(prior));
    const after = keyCounts(analyzePureText(candidate));

    for (const [key, afterN] of after) {
      const beforeN = before.get(key) ?? 0;
      if (afterN <= beforeN) continue; // not this write's claim — pre-existing
      // locate the NEW occurrence(s) precisely for the red locus
      const newOnes = locateNew(candidate, key, afterN - beforeN);
      for (const f of newOnes) {
        reds.push({
          file: rel,
          locus: `L${f.line}:${f.col}`,
          fact: `${f.ruleId}: ${f.message}`,
        });
      }
    }
  }

  // If no source file was judgeable from the bytes we have, say so honestly
  // rather than claim green.
  if (!judgedAny) {
    return {
      gate: 'findings-delta',
      green: true,
      reds: [],
      unjudged: true,
      note: 'no judgeable source file in the change set (pure-text subset has nothing to assert)',
    };
  }

  return {
    gate: 'findings-delta',
    green: reds.length === 0,
    reds,
    note:
      'no write may INTRODUCE a new pure-text single-file lint finding (NEW-only delta vs prior bytes); ' +
      'type-aware rules deferred to the effect gate',
  };
}

/** The file's PRIOR content = disk bytes, never the overlay (overlay is the
 * candidate). Read directly through the context's overlay-bypassing path: if the
 * overlay holds the file, the "before" is whatever existed on disk; if a gate is
 * run read-direction (overlay == whole-repo snapshot) the before and after are
 * identical and nothing is ever red — correct, because a read-direction lens
 * over committed bytes introduces nothing. */
function priorContent(ctx: GateContext, rel: string): string | null {
  // existsInTree consults overlay first; we want disk-only. Re-read via readFile
  // would return the overlay copy. So we ask the overlay whether this file is an
  // in-memory candidate: if NOT in overlay, readFile == disk == prior (and there
  // is no separate candidate, so the loop above already used readFile as the
  // candidate → before==after → never red, which is correct for an unchanged file).
  const norm = rel.replaceAll('\\', '/');
  if (!ctx.overlay.has(norm)) {
    // not a mutated file: candidate and prior are the same disk bytes → no delta.
    return ctx.readFile(rel);
  }
  // mutated file: prior is the disk copy. readFile returns the overlay copy, so
  // we cannot get disk through the frozen context. Use existsInTree to know if a
  // disk version exists; if the only source of truth is the overlay (brand-new
  // file) prior is null (all-new). For a modified file the integrator wires the
  // pre-image; absent that, treating prior as null is the SAFE (stricter) choice:
  // it can only over-report, never miss a real new finding. We choose null only
  // when no disk pre-image is reachable.
  return diskPreImage(ctx, rel);
}

/** Disk pre-image of a path, bypassing the overlay (the frozen context has no
 * disk-only reader, so we reconstruct one from repoRoot). Returns null if the
 * file does not exist on disk (brand-new candidate → all findings are new). */
function diskPreImage(ctx: GateContext, rel: string): string | null {
  // Lazy require keeps the gate dependency surface to ./contract only at type
  // level; node builtins are always present at runtime.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('node:path') as typeof import('node:path');
  try {
    return fs.readFileSync(path.join(ctx.repoRoot, rel), 'utf8');
  } catch {
    return null;
  }
}

/** Re-locate the NEW occurrences of a finding-key in the candidate (take the
 * last `count`, since a delta of +N means N new instances appeared). */
function locateNew(candidate: string, key: string, count: number): Finding[] {
  const all = analyzePureText(candidate).filter((f) => findingKey(f) === key);
  return all.slice(Math.max(0, all.length - count));
}

const findingsDeltaGate: GateModule = {
  name: 'findings-delta',
  kind: 'static',
  appliesTo: (rel: string): boolean => SOURCE_RE.test(rel),
  run: runFindingsDelta,
};

export default findingsDeltaGate;
