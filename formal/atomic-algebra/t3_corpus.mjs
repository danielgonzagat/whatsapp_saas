// FASE-2 T3 — run the verified-edit algebra over a LARGE external OSS corpus the atomic team
// did NOT write, and INDEPENDENTLY cross-check every commute verdict with a second, separately
// written import-reachability oracle. 0 disagreements => the algebra's independence judgments
// are correct on real external code; byte-confluence of independent (different-file) pairs is
// order-independent by construction (asserted: the files genuinely differ).
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPOS = process.argv.slice(2);
const A = await import(path.resolve('scripts/mcp/atomic-edit/dist/gates/algebra.js'));
const { commute, buildEditFact, closureOf } = A;

// Independent oracle: a from-scratch transitive import-reachability over the repo (NOT reusing
// algebra's closureOf), so agreement is a real cross-check, not a tautology.
const IMP = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g;
function resolveRel(repo, fromRel, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  const cands = [base, base + '.ts', base + '.tsx', base + '/index.ts'];
  for (const c of cands) if (fs.existsSync(path.join(repo, c))) return c;
  return null;
}
const _impCache = new Map();
function directImports(repo, rel) {
  const key = repo + '::' + rel;
  if (_impCache.has(key)) return _impCache.get(key);
  const out = new Set();
  try {
    const txt = fs.readFileSync(path.join(repo, rel), 'utf8');
    for (const m of txt.matchAll(IMP)) {
      const t = resolveRel(repo, rel, m[1]);
      if (t) out.add(t);
    }
  } catch { /* skip */ }
  _impCache.set(key, out);
  return out;
}
function reaches(repo, src, dst) {
  // does src transitively import dst?
  const seen = new Set([src]);
  const stack = [src];
  while (stack.length) {
    const cur = stack.pop();
    for (const t of directImports(repo, cur)) {
      if (t === dst) return true;
      if (!seen.has(t)) { seen.add(t); stack.push(t); }
    }
  }
  return false;
}

const summary = [];
for (const repo of REPOS) {
  const name = path.basename(repo);
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!/node_modules|\.git|dist|build/.test(e.name)) walk(p); }
      else if (/\.tsx?$/.test(e.name)) files.push(path.relative(repo, p));
    }
  };
  walk(repo);
  // one EditFact per file (whole-file span — sound/conservative; cross-file commute depends on closure).
  const facts = files.map((f) => {
    const sz = fs.statSync(path.join(repo, f)).size;
    return buildEditFact(repo, { file: f, modifiedZones: [{ byteStart: 0, byteEnd: sz }] });
  });
  let pairs = 0, comm = 0, disagree = 0, byteConfl = 0;
  const examples = [];
  for (let i = 0; i < facts.length; i++)
    for (let j = i + 1; j < facts.length; j++) {
      pairs++;
      const v = commute(facts[i], facts[j]).commute;
      if (!v) continue;
      comm++;
      // ORACLE (soundness direction): the algebra is a SOUND over-approximation — it may call
      // COUPLED where no import path exists (coarser closure), but it must NEVER call INDEPENDENT
      // where the oracle finds a path. Only check the pairs it called independent.
      const a = facts[i].file, b = facts[j].file;
      if (reaches(repo, a, b) || reaches(repo, b, a)) { disagree++; if (examples.length < 5) examples.push(`${a} <-> ${b}`); }
      if (a !== b) byteConfl++; // different files => disjoint bytes => order-independent
    }
  const r = { repo: name, files: files.length, pairs, commuteRate: +(comm / pairs * 100).toFixed(2), falseIndependence: disagree, byteConfluentIndependentPairs: byteConfl };
  summary.push(r);
  console.log(JSON.stringify(r));
  if (examples.length) console.log('  FALSE-INDEPENDENCE EXAMPLES:', examples);
}
const totalPairs = summary.reduce((a, r) => a + r.pairs, 0);
const totalFalse = summary.reduce((a, r) => a + r.falseIndependence, 0);
console.log(`\nTOTAL: ${totalPairs} real external pairs, false-independence (UNSOUND) = ${totalFalse}`);
fs.writeFileSync('.z3-scratch/t3_result.json', JSON.stringify({ summary, totalPairs, totalFalse }, null, 2));
process.exit(totalFalse === 0 ? 0 : 1);
