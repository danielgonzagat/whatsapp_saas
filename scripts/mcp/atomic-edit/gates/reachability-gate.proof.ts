/**
 * gates/reachability-gate.proof.ts — standalone tsx proof for the reachability gate.
 *
 * Builds a real on-disk fixture tree (a tmp repo) so the gate's bounded disk walk
 * + the shared resolveRelImport operate on actual bytes — no mock of the
 * resolver, no fake fs. Then asserts:
 *   RED   — a changed non-root source file that NO root reaches over the import
 *           edge closure (an orphan island) is reddened with a precise GateRed.
 *   GREEN — the SAME file, once a root (a test/proof or an index/entrypoint) is
 *           wired to import it, converges green.
 *   GREEN — a pre-existing orphan that is NOT in changedFiles never blocks an
 *           unrelated edit (write-direction: only THIS write's claim is judged).
 *   GREEN — a root file (index/main/spec) is reachable by fiat.
 *
 * Run:  npx tsx scripts/mcp/atomic-edit/gates/reachability-gate.proof.ts
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { makeContext, type GateResult } from './contract.js';
import gate from './reachability-gate.js';

function mkrepo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reach-gate-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

function show(label: string, r: GateResult): void {
  const tag = r.unjudged ? 'UNJUDGED' : r.green ? 'GREEN' : 'RED';
  console.log(`  [${tag}] ${label} — reds=${r.reds.length}${r.reds[0] ? ` :: ${r.reds[0].fact}` : ''}`);
}

let failures = 0;
function expect(cond: boolean, msg: string): void {
  if (!cond) {
    failures += 1;
    console.log(`  ✗ FAIL: ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

async function main(): Promise<void> {
  console.log('reachability-gate proof\n');

  // ── CASE 1: RED — a changed orphan island (no root reaches it) ──
  // index.ts (root) imports util.ts. orphan.ts is a non-root source file that
  // NOTHING in the tree imports → no root can reach it → orphan.
  {
    const root = mkrepo({
      'index.ts': "import { u } from './util';\nexport const main = () => u();\n",
      'util.ts': 'export const u = (): number => 1;\n',
      'orphan.ts': 'export const dead = (): number => 42;\n',
    });
    const ctx = makeContext(root, new Map(), ['orphan.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 1 (orphan changed file)', r);
    expect(!r.green, 'orphan island is RED');
    expect(r.reds.some((x) => x.file === 'orphan.ts'), 'red names orphan.ts');
    expect(r.reds.some((x) => /0 inbound import edges/.test(x.fact)), 'red states 0 inbound edges');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 2: GREEN — the SAME orphan, now reached from a root (index imports it) ──
  {
    const root = mkrepo({
      'index.ts': "import { u } from './util';\nimport { dead } from './orphan';\nexport const main = () => u() + dead();\n",
      'util.ts': 'export const u = (): number => 1;\n',
      'orphan.ts': 'export const dead = (): number => 42;\n',
    });
    const ctx = makeContext(root, new Map(), ['orphan.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 2 (now wired to root)', r);
    expect(r.green, 'root-reached file is GREEN');
    expect(r.reds.length === 0, 'no reds when reachable');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 3: GREEN — a pre-existing orphan NOT in changedFiles never blocks an
  //    unrelated edit (write-direction: only THIS write's claim is judged) ──
  {
    const root = mkrepo({
      'index.ts': "import { u } from './util';\nexport const main = () => u();\n",
      'util.ts': 'export const u = (): number => 1;\n',
      'legacy-orphan.ts': 'export const old = (): number => 7;\n', // pre-existing orphan
    });
    // The write touches util.ts (a reachable file), NOT the legacy orphan.
    const ctx = makeContext(root, new Map([['util.ts', 'export const u = (): number => 2;\n']]), ['util.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 3 (unrelated edit, legacy orphan present)', r);
    expect(r.green, 'unrelated edit GREEN despite a pre-existing orphan');
    expect(!r.reds.some((x) => x.file === 'legacy-orphan.ts'), 'legacy orphan NOT flagged on an unrelated write');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 4: GREEN — a root file itself (a spec) is reachable by fiat ──
  {
    const root = mkrepo({
      'thing.ts': 'export const t = (): number => 3;\n',
      'thing.spec.ts': "import { t } from './thing';\nexport const test = () => t();\n",
    });
    // The spec is a ROOT; even though nothing imports the spec, it is an entry by
    // convention → not an orphan. And thing.ts is reached BY the spec → green too.
    const ctx = makeContext(root, new Map(), ['thing.spec.ts', 'thing.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 4 (root spec + reached impl)', r);
    expect(r.green, 'root spec + its reached impl are GREEN');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 5: RED — a brand-new file introduced via OVERLAY (not yet on disk)
  //    that no root reaches is caught as a newly-introduced orphan ──
  {
    const root = mkrepo({
      'index.ts': "import { u } from './util';\nexport const main = () => u();\n",
      'util.ts': 'export const u = (): number => 1;\n',
    });
    const overlay = new Map([['brandnew.ts', 'export const fresh = (): number => 9;\n']]);
    const ctx = makeContext(root, overlay, ['brandnew.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 5 (brand-new overlay orphan)', r);
    expect(!r.green, 'brand-new overlay-only orphan is RED');
    expect(r.reds.some((x) => x.file === 'brandnew.ts'), 'red names the new file');
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log('');
  if (failures === 0) {
    console.log('PROOF PASS');
    process.exit(0);
  } else {
    console.log(`PROOF FAIL (${failures} assertion(s) failed)`);
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  console.log('PROOF FAIL (threw)');
  process.exit(1);
});
