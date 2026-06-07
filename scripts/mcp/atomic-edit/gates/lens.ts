/**
 * gates/lens.ts — the READ-direction crivo (the atomic reading lens).
 *
 * Same gate registry as the write direction, swept over a whole scope: it reads
 * 100% of the source bytes and reports ONLY the red — every wire that is not
 * correct-by-construction — with atomic precision (gate, file, locus, fact). A
 * context-bounded agent gets just the dangling wires to fix, never the whole tree.
 *
 * Absolute vs delta. Gates that judge a whole-file/graph PROPERTY report
 * absolutely here: reachability (orphan files no root reaches) and binding
 * (unbound names) light up over committed bytes. The DELTA gates
 * (supply-chain/contract/telemetry/iac/findings/render) are write-direction by
 * nature — over already-committed bytes there is no NEW wire — so in the lens they
 * confirm the tree introduced nothing and fire at write time instead. Completing
 * absolute-mode for the delta gates is a uniform follow-up (route their prior
 * read through the context so the lens can supply an empty prior).
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LENS_GATES, runGates, type UnifiedRed, type UnifiedUnjudged } from './registry.js';

const SKIP = new Set(['node_modules', '.git', '.atomic', '.claude', '.mcp-cache', '.next', '.turbo', '.cache', 'build', 'coverage', 'dist', 'vendor']);
const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const LOCUS_RE = /L(\d+)(?::(\d+))?/;
const SNIPPET_LIMIT = 240;
const ADVERSARIAL_FIXTURE_FACTS = [
  /introduces a hardcoded /,
  /references no Prisma model/,
  /references physical table /,
] as const;
const REGEXP_SOURCE_MARKERS = ['new RegExp', '(?:', '(?=', '(?!', '[^', '\\b', '\\s', '\\.'] as const;

type EvidenceClassification =
  | 'negative'
  | 'contained-negative-fixture'
  | 'contained-generated-code'
  | 'contained-regexp-source';
type RecommendedAction =
  | 'repair-negative-byte'
  | 'preserve-proof-fixture'
  | 'preserve-generated-code-template'
  | 'preserve-regexp-source';

interface EvidenceAdmission {
  classification: EvidenceClassification;
  recommendedAction: RecommendedAction;
  containmentProof: string | null;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function enumerateSource(repoRoot: string, scopeAbs: string, cap = 8000): string[] {
  const out: string[] = [];
  const walk = (absDir: string): void => {
    if (out.length >= cap) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= cap) return;
      if (SKIP.has(e.name)) continue;
      const abs = path.join(absDir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (SOURCE_RE.test(e.name)) {
        out.push(path.relative(repoRoot, abs).replaceAll('\\', '/'));
      }
    }
  };
  walk(scopeAbs);
  return out;
}

export interface NegativeByteEvidence {
  redIndex: number;
  gate: string;
  file: string;
  locus: string | undefined;
  classification: EvidenceClassification;
  recommendedAction: RecommendedAction;
  containmentProof: string | null;
  reason: string;
  precision: 'token' | 'line' | 'file' | 'unreadable-file';
  line: number | null;
  column: number | null;
  byteStart: number;
  byteEnd: number;
  byteLength: number;
  lineSha256: string | null;
  snippet: string;
}

export interface LensReport {
  scanned: number;
  reds: UnifiedRed[];
  negativeByteEvidence: NegativeByteEvidence[];
  actionableNegativeByteEvidence: NegativeByteEvidence[];
  containedNegativeFixtureEvidence: NegativeByteEvidence[];
  containedGeneratedCodeEvidence: NegativeByteEvidence[];
  containedRegExpSourceEvidence: NegativeByteEvidence[];
  unjudged: string[];
  unjudgedEvidence?: UnifiedUnjudged[];
  ran: string[];
}

interface ParsedLocus {
  line: number;
  column: number | null;
}

interface LineRange {
  line: number;
  startChar: number;
  endChar: number;
  text: string;
}

function parseLocus(locus: string | undefined): ParsedLocus | null {
  if (!locus) return null;
  const match = LOCUS_RE.exec(locus);
  if (!match) return null;
  const line = Number(match[1]);
  if (!Number.isInteger(line) || line < 1) return null;
  const column = match[2] ? Number(match[2]) : null;
  return { line, column: column !== null && Number.isInteger(column) && column >= 1 ? column : null };
}

function lineRanges(content: string): LineRange[] {
  const lineEnds = [...content.matchAll(/\n/g)].map((match) => match.index ?? 0);
  const endChars = [...lineEnds, content.length];
  return endChars.map((endChar, index) => {
    const startChar = index === 0 ? 0 : endChars[index - 1] + 1;
    return { line: index + 1, startChar, endChar, text: content.slice(startChar, endChar) };
  });
}

function snippetFor(text: string): string {
  return text.length > SNIPPET_LIMIT ? `${text.slice(0, SNIPPET_LIMIT)}...` : text;
}

function isProofFixtureFile(file: string): boolean {
  return /\.(proof|test|spec)\.(mjs|cjs|js|jsx|ts|tsx)$/.test(file);
}

function containmentProofForRed(red: UnifiedRed): string | null {
  if (!isProofFixtureFile(red.file)) return null;
  if (!ADVERSARIAL_FIXTURE_FACTS.some((pattern) => pattern.test(red.fact))) return null;
  return `${red.file} is a proof/test fixture and the red fact is an adversarial gate input; preserve these bytes as positive proof material, not repair debt.`;
}

function isPropertyGateGeneratedDriverTemplate(file: string, content: string, lineRange: LineRange | undefined): boolean {
  if (!lineRange) return false;
  if (file !== 'property-gate.ts' && !file.endsWith('/property-gate.ts')) return false;
  const marker = 'return `/* ephemeral property-gate driver';
  const open = content.lastIndexOf(marker, lineRange.startChar);
  if (open < 0) return false;
  const close = content.indexOf('\n`;', open);
  return close < 0 || lineRange.startChar < close;
}

function generatedCodeContainmentProof(red: UnifiedRed, content: string | undefined, lineRange: LineRange | undefined): string | null {
  if (!content) return null;
  if (!red.fact.startsWith('no-useless-escape:')) return null;
  if (!isPropertyGateGeneratedDriverTemplate(red.file, content, lineRange)) return null;
  return `${red.file}${red.locus ? `:${red.locus}` : ''} is inside the property-gate generated-driver template; these escape bytes are required in the generated runtime regex and must be preserved.`;
}

function isStringRawRegExpSource(lineRange: LineRange | undefined): boolean {
  if (!lineRange) return false;
  if (!lineRange.text.includes('String.raw`')) return false;
  return REGEXP_SOURCE_MARKERS.some((marker) => lineRange.text.includes(marker));
}

function regExpSourceContainmentProof(red: UnifiedRed, lineRange: LineRange | undefined): string | null {
  if (!red.fact.startsWith('no-useless-escape:')) return null;
  if (!isStringRawRegExpSource(lineRange)) return null;
  return `${red.file}${red.locus ? `:${red.locus}` : ''} is inside a String.raw RegExp source; preserving the escape bytes preserves the exact runtime pattern used by Atomic gates/hooks.`;
}

function evidenceAdmissionForRed(red: UnifiedRed, content?: string, lineRange?: LineRange): EvidenceAdmission {
  const fixtureProof = containmentProofForRed(red);
  if (fixtureProof) {
    return { classification: 'contained-negative-fixture', recommendedAction: 'preserve-proof-fixture', containmentProof: fixtureProof };
  }
  const generatedProof = generatedCodeContainmentProof(red, content, lineRange);
  if (generatedProof) {
    return { classification: 'contained-generated-code', recommendedAction: 'preserve-generated-code-template', containmentProof: generatedProof };
  }
  const regExpSourceProof = regExpSourceContainmentProof(red, lineRange);
  if (regExpSourceProof) {
    return { classification: 'contained-regexp-source', recommendedAction: 'preserve-regexp-source', containmentProof: regExpSourceProof };
  }
  return { classification: 'negative', recommendedAction: 'repair-negative-byte', containmentProof: null };
}

function exactQuotedTokenForRed(red: UnifiedRed): string | null {
  if (
    !red.fact.startsWith("referenced name '") &&
    !red.fact.startsWith("@typescript-eslint/no-unused-vars: '")
  ) {
    return null;
  }
  const match = red.fact.match(/'([^']+)'/);
  return match?.[1] ?? null;
}

interface FocusedTokenSpan {
  startChar: number;
  endChar: number;
  text: string;
}

function focusedTokenSpanForRed(red: UnifiedRed, parsed: ParsedLocus, lineRange: LineRange): FocusedTokenSpan | null {
  const token = exactQuotedTokenForRed(red);
  if (!token) return null;
  const preferredStart = parsed.column === null ? 0 : Math.max(0, parsed.column - 1);
  const afterColumn = lineRange.text.indexOf(token, preferredStart);
  const fallback = afterColumn === -1 ? lineRange.text.indexOf(token) : afterColumn;
  if (fallback === -1) return null;
  return {
    startChar: lineRange.startChar + fallback,
    endChar: lineRange.startChar + fallback + token.length,
    text: token,
  };
}

function negativeByteEvidenceForRed(repoRoot: string, red: UnifiedRed, redIndex: number): NegativeByteEvidence {
  const abs = path.resolve(repoRoot, red.file);
  let content: string;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch {
    return {
      redIndex,
      gate: red.gate,
      file: red.file,
      locus: red.locus,
      ...evidenceAdmissionForRed(red),
      reason: red.fact,
      precision: 'unreadable-file',
      line: null,
      column: null,
      byteStart: 0,
      byteEnd: 0,
      byteLength: 0,
      lineSha256: null,
      snippet: '',
    };
  }

  const parsed = parseLocus(red.locus);
  const lineRange = parsed ? lineRanges(content).find((range) => range.line === parsed.line) : undefined;
  if (parsed && lineRange) {
    const lineByteStart = byteLength(content.slice(0, lineRange.startChar));
    const lineByteLength = byteLength(lineRange.text);
    const focusedToken = focusedTokenSpanForRed(red, parsed, lineRange);
    const byteStart = focusedToken ? byteLength(content.slice(0, focusedToken.startChar)) : lineByteStart;
    const byteEnd = focusedToken ? byteLength(content.slice(0, focusedToken.endChar)) : lineByteStart + lineByteLength;
    return {
      redIndex,
      gate: red.gate,
      file: red.file,
      locus: red.locus,
      ...evidenceAdmissionForRed(red, content, lineRange),
      reason: red.fact,
      precision: focusedToken ? 'token' : 'line',
      line: parsed.line,
      column: parsed.column,
      byteStart,
      byteEnd,
      byteLength: byteEnd - byteStart,
      lineSha256: sha256(lineRange.text),
      snippet: snippetFor(focusedToken ? focusedToken.text : lineRange.text),
    };
  }

  const fileByteLength = byteLength(content);
  return {
    redIndex,
    gate: red.gate,
    file: red.file,
    locus: red.locus,
    ...evidenceAdmissionForRed(red, content),
    reason: red.fact,
    precision: 'file',
    line: null,
    column: null,
    byteStart: 0,
    byteEnd: fileByteLength,
    byteLength: fileByteLength,
    lineSha256: null,
    snippet: snippetFor(content),
  };
}

function negativeByteEvidence(repoRoot: string, reds: UnifiedRed[]): NegativeByteEvidence[] {
  return reds.map((red, redIndex) => negativeByteEvidenceForRed(repoRoot, red, redIndex));
}

/**
 * Resolve a scope to the repo-relative source files to scan. Accepts a directory
 * (recursed), a single source file, or a comma-separated list of files/dirs — so
 * loose top-level files can be scanned IN PLACE (their real node_modules / relative
 * imports resolve), never relocated to a temp dir (which fabricated supply-chain FPs).
 */
function resolveScope(repoRoot: string, scopeRel: string): string[] {
  const parts = scopeRel.split(',').map((s) => s.trim()).filter(Boolean);
  const out = new Set<string>();
  for (const part of parts) {
    const abs = path.resolve(repoRoot, part);
    let st: fs.Stats | null = null;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      for (const f of enumerateSource(repoRoot, abs)) out.add(f);
    } else if (SOURCE_RE.test(abs) && !abs.endsWith('.proof.ts')) {
      out.add(path.relative(repoRoot, abs).replaceAll('\\', '/'));
    }
  }
  return [...out];
}

/** Sweep the lens over a repo-relative scope. Empty overlay → gates read committed bytes. */
export async function runLens(repoRoot: string, scopeRel: string): Promise<LensReport> {
  const files = resolveScope(repoRoot, scopeRel);
  const run = await runGates(LENS_GATES, repoRoot, new Map<string, string>(), files, true);
  const evidence = negativeByteEvidence(repoRoot, run.reds);
  return {
    scanned: files.length,
    reds: run.reds,
    negativeByteEvidence: evidence,
    actionableNegativeByteEvidence: evidence.filter((entry) => entry.classification === 'negative'),
    containedNegativeFixtureEvidence: evidence.filter((entry) => entry.classification === 'contained-negative-fixture'),
    containedGeneratedCodeEvidence: evidence.filter((entry) => entry.classification === 'contained-generated-code'),
    containedRegExpSourceEvidence: evidence.filter((entry) => entry.classification === 'contained-regexp-source'),
    unjudged: run.unjudged,
    unjudgedEvidence: run.unjudgedEvidence ?? [],
    ran: run.ran,
  };
}

const self = fileURLToPath(import.meta.url);
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
function ancestorDirs(start: string, limit = 12): string[] {
  if (limit <= 0) return [start];
  const up = path.dirname(start);
  if (up === start) return [start];
  return [start, ...ancestorDirs(up, limit - 1)];
}
function findRepoRoot(start: string): string {
  return ancestorDirs(start).find((candidate) => fs.existsSync(path.join(candidate, '.git'))) ?? start;
}
if (invoked === self || invoked === self.replace(/\.ts$/, '.js')) {
  const repoRoot = findRepoRoot(path.dirname(self));
  const scope = process.argv[2] ?? 'scripts/mcp/atomic-edit/gates';
  runLens(repoRoot, scope)
    .then((r) => {
      process.stdout.write(`\nATOMIC LENS — scanned ${r.scanned} source file(s) in ${scope}\n`);
      process.stdout.write(`gates ran: ${r.ran.join(', ') || '(none)'}\n`);
      if (r.unjudged.length) process.stdout.write(`unjudged (honest): ${r.unjudged.join(', ')}\n`);
      if (r.reds.length === 0) {
        process.stdout.write('\nGREEN — every wire in scope resolves; no non-correct-by-construction byte.\n');
        return;
      }
      process.stdout.write(
        `\n${r.actionableNegativeByteEvidence.length} actionable negative evidence record(s), ` +
          `${r.containedNegativeFixtureEvidence.length} contained fixture record(s), ` +
          `${r.containedGeneratedCodeEvidence.length} contained generated-code record(s), ` +
          `${r.containedRegExpSourceEvidence.length} contained regexp-source record(s):\n`,
      );
      for (const red of r.reds.slice(0, 200)) {
        process.stdout.write(`  [${red.gate}] ${red.file}${red.locus ? `:${red.locus}` : ''} — ${red.fact}\n`);
        const evidence = r.negativeByteEvidence.find((entry) => entry.redIndex === r.reds.indexOf(red));
        if (evidence) {
          process.stdout.write(
            `      ${evidence.classification} bytes ${evidence.byteStart}..${evidence.byteEnd} ` +
              `(${evidence.precision}, sha=${evidence.lineSha256 ?? 'n/a'})\n`,
          );
        }
      }
      if (r.reds.length > 200) process.stdout.write(`  … +${r.reds.length - 200} more\n`);
    })
    .catch((e: unknown) => {
      process.stderr.write(`lens error: ${e instanceof Error ? e.stack : String(e)}\n`);
      process.exit(1);
    });
}
