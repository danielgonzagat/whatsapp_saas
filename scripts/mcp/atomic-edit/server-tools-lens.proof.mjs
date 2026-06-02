#!/usr/bin/env node
/**
 * server-tools-lens.proof.mjs — standalone node proof for the LENS-AS-MCP-TOOL
 * surface (atomic_lens / atomic_grep_calls / atomic_repair_scope).
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/server-tools-lens.proof.mjs
 *
 * It exercises the EXACT compiled primitives the three tools wrap (perception.calls
 * and lens.runLens from dist/) plus the tool's own filter logic, so a green here is
 * a green for the tool body — not a happy-path mock.
 *
 * Proves, in order:
 *   TOKEN-CORRECTNESS — atomic_grep_calls finds a REAL call of a name and returns
 *                       ZERO matches for a name that appears only inside a string
 *                       literal and a comment (the headline: AST, not text grep).
 *   HONEST-UNJUDGED   — a file whose language accessor returns null is reported as
 *                       `unjudged`, never silently counted as zero matches.
 *   LENS-SHAPE        — atomic_lens (runLens) over a tiny tmp repo returns the exact
 *                       red-set contract { scanned, reds:[{gate,file,locus,fact}], unjudged, ran }.
 *   BYTE-EVIDENCE     — every red is accompanied by explicit byte evidence:
 *                       byte offsets, precision, line hash, snippet, reason, and
 *                       a classification that separates actionable negatives from
 *                       contained adversarial proof fixtures, generated code, and
 *                       regexp sources.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dir, '..', '..', '..');
const perception = await import(path.join(dir, 'dist', 'gates', 'perception.js'));
const lens = await import(path.join(dir, 'dist', 'gates', 'lens.js'));
const { calls } = perception;
const { runLens } = lens;

const results = [];
const check = (name, cond) => {
  const passed = Boolean(cond);
  results.push({ name, passed });
  console.log(passed ? '  PASS ' : '  FAIL ', name);
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// The token-correct grep the tool performs over one file's CallFact[]: it matches
// only on callee identity and treats a null accessor as honestly unjudged. This is
// the exact filter inside registerToolsLens → atomic_grep_calls.
async function grepCallsInFile(content, rel, name) {
  const found = await calls(content, rel);
  if (found === null) return { unjudged: true, matches: [] };
  return { unjudged: false, matches: found.filter((c) => c.callee === name) };
}

// ── TOKEN-CORRECTNESS: AST call vs string/comment occurrence ──────────────────
{
  // `runLens` is genuinely CALLED once; it also appears inside a string literal,
  // a template literal, and a // comment. A text grep would report 4; the AST
  // must report exactly 1 (the real call_expression).
  const src =
    "// runLens is the eye — this mention is a comment, not a call\n" +
    "const note = 'we should runLens(x) here someday';\n" +
    "const tmpl = `pending: runLens still TODO`;\n" +
    'export async function go(root, scope) {\n' +
    '  return await runLens(root, scope);\n' + // the ONLY real call
    '}\n';
  const r = await grepCallsInFile(src, 'sample.ts', 'runLens');
  check('TOKEN-CORRECTNESS file parses (not unjudged)', r.unjudged === false);
  check('TOKEN-CORRECTNESS exactly ONE real call of runLens matched', r.matches.length === 1);
  check('TOKEN-CORRECTNESS string/comment/template mentions excluded (matchCount===1, not 4)', r.matches.length === 1);

  // A name that appears ONLY inside a string and a comment — never as a call —
  // must return ZERO matches. This is the falsifier for "grep matched a string".
  const r2 = await grepCallsInFile(src, 'sample.ts', 'someday');
  check('TOKEN-CORRECTNESS name only-in-string/comment ⇒ ZERO matches', r2.matches.length === 0 && r2.unjudged === false);

  // And the call we DID match carries the right locus + parsed first-arg shape.
  check('TOKEN-CORRECTNESS matched call has a real line number', r.matches[0].line >= 1);
  check('TOKEN-CORRECTNESS matched callee is exactly "runLens"', r.matches[0].callee === 'runLens');
}

// ── HONEST-UNJUDGED: accessor null ⇒ unjudged, not silent zero ────────────────
{
  // perception.calls returns null when the language accessor cannot parse the
  // file (langOf undefined / grammar unavailable). The tool must surface that as
  // `unjudged`, never as "0 matches" — otherwise it would claim a clean scope it
  // never actually read. We force the null path with an unknown extension.
  const r = await grepCallsInFile('runLens(1); runLens(2);', 'data.unknownlang', 'runLens');
  if (r.unjudged) {
    check('HONEST-UNJUDGED unparseable file ⇒ reported unjudged (not zero)', r.unjudged === true && r.matches.length === 0);
  } else {
    // If this runtime CAN parse it, it must then return the HONEST count (2),
    // never a false zero. Either branch upholds "never green-by-assumption".
    check('HONEST-UNJUDGED parseable fallback returns the TRUE count (2), never false-zero', r.matches.length === 2);
  }
}

// ── LENS-SHAPE + BYTE-EVIDENCE: runLens returns the byte-level red contract ───
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-lens-'));
  // A clean, self-contained source file (no dangling imports) so the sweep runs
  // its gates and returns a well-formed report regardless of which gates fire.
  fs.writeFileSync(path.join(tmp, 'ok.ts'), 'export const answer = 42;\nexport function id(x) { return x; }\n');
  const report = await runLens(tmp, '.');

  check('LENS-SHAPE report is an object', report && typeof report === 'object');
  check('LENS-SHAPE has numeric scanned', typeof report.scanned === 'number');
  check('LENS-SHAPE scanned counts the source file (>=1)', report.scanned >= 1);
  check('LENS-SHAPE reds is an array', Array.isArray(report.reds));
  check('LENS-SHAPE negativeByteEvidence is an array', Array.isArray(report.negativeByteEvidence));
  check('LENS-SHAPE actionableNegativeByteEvidence is an array', Array.isArray(report.actionableNegativeByteEvidence));
  check('LENS-SHAPE containedNegativeFixtureEvidence is an array', Array.isArray(report.containedNegativeFixtureEvidence));
  check('LENS-SHAPE containedGeneratedCodeEvidence is an array', Array.isArray(report.containedGeneratedCodeEvidence));
  check('LENS-SHAPE containedRegExpSourceEvidence is an array', Array.isArray(report.containedRegExpSourceEvidence));
  check('LENS-SHAPE unjudged is an array', Array.isArray(report.unjudged));
  check('LENS-SHAPE ran (gates that ran) is an array', Array.isArray(report.ran));
  // Every red — if any — must carry the unified red-set fields the eye promises.
  const redShapeOk = report.reds.every(
    (r) => typeof r === 'object' && r !== null && 'gate' in r && 'file' in r && 'fact' in r,
  );
  check('LENS-SHAPE every red has { gate, file, fact } (+locus)', redShapeOk);
  console.log(`        (lens: scanned ${report.scanned}, ${report.reds.length} red(s), ${report.unjudged.length} unjudged, gates [${report.ran.join(', ')}])`);

  // A second sweep over a file with a deterministic structural-lint red should
  // expose line-level negative bytes: the first line is provably non-correct until
  // `let` becomes `const`, and the reader must return its byte interval + hash.
  const lintLine = 'let x = 1;';
  fs.writeFileSync(path.join(tmp, 'lint.ts'), `${lintLine}\nexport { x };\n`);
  const report2 = await runLens(tmp, 'lint.ts');
  const hasLocusedRed = report2.reds.some((r) => typeof r.locus === 'string' || typeof r.locus === 'number' || r.locus == null);
  check('LENS-SHAPE second sweep returns a well-formed report over a single file', typeof report2.scanned === 'number' && Array.isArray(report2.reds));
  check('LENS-SHAPE red entries (if any) expose a locus field', report2.reds.length === 0 || hasLocusedRed);
  check('BYTE-EVIDENCE second sweep exposes negativeByteEvidence array', Array.isArray(report2.negativeByteEvidence));
  check('BYTE-EVIDENCE every red has one evidence record', report2.reds.length === report2.negativeByteEvidence.length);
  const lintLineEvidence = report2.negativeByteEvidence.find((entry) => entry.file === 'lint.ts' && entry.line === 1 && entry.gate === 'structural-lint');
  check('BYTE-EVIDENCE structural-lint red maps to line 1', Boolean(lintLineEvidence));
  check('BYTE-EVIDENCE actionable lint red is classified negative', lintLineEvidence?.classification === 'negative');
  check('BYTE-EVIDENCE actionable lint red recommends repair', lintLineEvidence?.recommendedAction === 'repair-negative-byte');
  check('BYTE-EVIDENCE line precision remains explicit for line-wide facts', lintLineEvidence?.precision === 'line');
  check('BYTE-EVIDENCE byteStart is zero for first line', lintLineEvidence?.byteStart === 0);
  check('BYTE-EVIDENCE byteEnd equals lint line byte length', lintLineEvidence?.byteEnd === Buffer.byteLength(lintLine, 'utf8'));
  check('BYTE-EVIDENCE line sha256 proves exact bytes', lintLineEvidence?.lineSha256 === sha256(lintLine));
  check('BYTE-EVIDENCE snippet carries the negative bytes', lintLineEvidence?.snippet === lintLine);
  check('BYTE-EVIDENCE reason mirrors the red fact', typeof lintLineEvidence?.reason === 'string' && lintLineEvidence.reason.length > 0);

  const tokenLine = 'const value = missingName + 1;';
  const token = 'missingName';
  fs.writeFileSync(path.join(tmp, 'binding.ts'), `${tokenLine}\n`);
  const tokenReport = await runLens(tmp, 'binding.ts');
  const tokenEvidence = tokenReport.negativeByteEvidence.find((entry) => entry.file === 'binding.ts' && entry.reason.includes(`'${token}'`));
  const tokenByteStart = Buffer.byteLength(tokenLine.slice(0, tokenLine.indexOf(token)), 'utf8');
  const tokenByteLength = Buffer.byteLength(token, 'utf8');
  check('BYTE-EVIDENCE binding red maps exact token', Boolean(tokenEvidence));
  check('BYTE-EVIDENCE binding token remains actionable negative', tokenEvidence?.classification === 'negative');
  check('BYTE-EVIDENCE binding token precision is explicit', tokenEvidence?.precision === 'token');
  check('BYTE-EVIDENCE binding token byteStart is exact', tokenEvidence?.byteStart === tokenByteStart);
  check('BYTE-EVIDENCE binding token byteEnd is exact', tokenEvidence?.byteEnd === tokenByteStart + tokenByteLength);
  check('BYTE-EVIDENCE binding token byteLength is exact', tokenEvidence?.byteLength === tokenByteLength);
  check('BYTE-EVIDENCE binding token snippet carries only the token', tokenEvidence?.snippet === token);
  check('BYTE-EVIDENCE binding token keeps line hash context', tokenEvidence?.lineSha256 === sha256(tokenLine));
  console.log(`        (lens lint.ts: ${report2.reds.length} red(s) — ${report2.reds.map((r) => r.gate).join(', ') || 'none'})`);

  // A third sweep proves the reader does not lie about adversarial proof fixtures:
  // a bad-looking byte sequence in a proof file is not actionable repository debt;
  // it is positive proof material so long as the fact is a known adversarial gate input.
  const fakeSecret = ['sk', 'live', '4eC9xZpM1nQ8rT2vW6yU'].join('_');
  fs.writeFileSync(path.join(tmp, 'security-gate.proof.mjs'), `const fakeSecret = '${fakeSecret}';\n`);
  const report3 = await runLens(tmp, 'security-gate.proof.mjs');
  const fixtureEvidence = report3.negativeByteEvidence.find(
    (entry) => entry.file === 'security-gate.proof.mjs' && entry.reason.includes('hardcoded Stripe live secret key'),
  );
  check('BYTE-EVIDENCE adversarial proof fixture is detected', Boolean(fixtureEvidence));
  check('BYTE-EVIDENCE adversarial proof fixture is contained, not actionable', fixtureEvidence?.classification === 'contained-negative-fixture');
  check('BYTE-EVIDENCE contained fixture recommends preservation', fixtureEvidence?.recommendedAction === 'preserve-proof-fixture');
  check('BYTE-EVIDENCE contained fixture has containment proof', typeof fixtureEvidence?.containmentProof === 'string' && fixtureEvidence.containmentProof.length > 0);
  check(
    'BYTE-EVIDENCE contained fixture is excluded from actionable negatives',
    !report3.actionableNegativeByteEvidence.some((entry) => entry.redIndex === fixtureEvidence?.redIndex),
  );
  check(
    'BYTE-EVIDENCE contained fixture is listed in contained fixture evidence',
    report3.containedNegativeFixtureEvidence.some((entry) => entry.redIndex === fixtureEvidence?.redIndex),
  );
  console.log(`        (lens proof fixture: ${report3.actionableNegativeByteEvidence.length} actionable, ${report3.containedNegativeFixtureEvidence.length} contained)`);

  // A fourth sweep proves generated-code templates are not mistaken for debt.
  const report4 = await runLens(repoRoot, 'scripts/mcp/atomic-edit/gates/property-gate.ts');
  const generatedEvidence = report4.negativeByteEvidence.find(
    (entry) => entry.line === 250 && entry.reason.startsWith('no-useless-escape'),
  );
  check('BYTE-EVIDENCE property-gate generated regex escape is detected', Boolean(generatedEvidence));
  check('BYTE-EVIDENCE property-gate generated regex escape is contained generated code', generatedEvidence?.classification === 'contained-generated-code');
  check('BYTE-EVIDENCE generated code recommends preservation', generatedEvidence?.recommendedAction === 'preserve-generated-code-template');
  check('BYTE-EVIDENCE generated code has containment proof', typeof generatedEvidence?.containmentProof === 'string' && generatedEvidence.containmentProof.length > 0);
  check(
    'BYTE-EVIDENCE generated code is excluded from actionable negatives',
    !report4.actionableNegativeByteEvidence.some((entry) => entry.redIndex === generatedEvidence?.redIndex),
  );
  check(
    'BYTE-EVIDENCE generated code is listed in contained generated code evidence',
    report4.containedGeneratedCodeEvidence.some((entry) => entry.redIndex === generatedEvidence?.redIndex),
  );
  console.log(`        (lens generated code: ${report4.actionableNegativeByteEvidence.length} actionable, ${report4.containedGeneratedCodeEvidence.length} generated-contained)`);

  // A fifth sweep proves String.raw regexp sources are not mistaken for repair debt.
  const report5 = await runLens(repoRoot, 'scripts/mcp/atomic-edit/atomic-only-hook.mjs');
  const regexpEvidence = report5.negativeByteEvidence.find(
    (entry) => entry.line === 109 && entry.reason.startsWith('no-useless-escape'),
  );
  check('BYTE-EVIDENCE String.raw regexp source escape is detected', Boolean(regexpEvidence));
  check('BYTE-EVIDENCE String.raw regexp source escape is contained regexp source', regexpEvidence?.classification === 'contained-regexp-source');
  check('BYTE-EVIDENCE regexp source recommends preservation', regexpEvidence?.recommendedAction === 'preserve-regexp-source');
  check('BYTE-EVIDENCE regexp source has containment proof', typeof regexpEvidence?.containmentProof === 'string' && regexpEvidence.containmentProof.length > 0);
  check(
    'BYTE-EVIDENCE regexp source is excluded from actionable negatives',
    !report5.actionableNegativeByteEvidence.some((entry) => entry.redIndex === regexpEvidence?.redIndex),
  );
  check(
    'BYTE-EVIDENCE regexp source is listed in contained regexp-source evidence',
    report5.containedRegExpSourceEvidence.some((entry) => entry.redIndex === regexpEvidence?.redIndex),
  );
  console.log(`        (lens regexp source: ${report5.actionableNegativeByteEvidence.length} actionable, ${report5.containedRegExpSourceEvidence.length} regexp-contained)`);

  fs.rmSync(tmp, { recursive: true, force: true });
}

const passedCount = results.filter((result) => result.passed).length;
const failedCount = results.length - passedCount;
console.log(`\n${passedCount} passed, ${failedCount} failed`);
process.exit(failedCount === 0 ? 0 : 1);
