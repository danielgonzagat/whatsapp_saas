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

  // ── CASE 6: the REWRITE's reason for being — a `from './orphan'` that exists
  //    ONLY inside a comment, a string literal, and a template literal is NOT a
  //    real import edge. The OLD whole-file regex extracted all three as phantom
  //    inbound edges → it would have falsely GREENed the orphan (an exoneration by
  //    prose). The perception organ reads only real `import_statement` nodes, so
  //    none of these textual look-alikes count → the orphan stays RED. This is the
  //    string/comment/template false-positive removed by construction.
  {
    const root = mkrepo({
      'index.ts': "import { u } from './util';\nexport const main = () => u();\n",
      'util.ts': 'export const u = (): number => 1;\n',
      // decoy.ts is a REACHED file (index→util→nothing, but decoy itself is reached
      // by NOTHING — wait: make decoy a root so it is visible+parsed but its mentions
      // of './orphan' are all non-code). decoy is a spec (root) → parsed, visible.
      'decoy.spec.ts':
        "// import { dead } from './orphan';  <- comment look-alike, NOT an import\n" +
        "export const a = \"import { dead } from './orphan'\"; // string look-alike\n" +
        'export const b = `from \'./orphan\'`; // template look-alike\n' +
        'export const run = () => a.length + b.length;\n',
      // orphan.ts: the ONLY textual references to it are the three look-alikes in
      // decoy.spec.ts. No real import anywhere → it must be an orphan island.
      'orphan.ts': 'export const dead = (): number => 42;\n',
    });
    const ctx = makeContext(root, new Map(), ['orphan.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 6 (comment/string/template look-alikes are NOT edges)', r);
    expect(!r.green, 'orphan stays RED despite three textual `from \'./orphan\'` look-alikes');
    expect(
      r.reds.some((x) => x.file === 'orphan.ts' && /0 inbound import edges/.test(x.fact)),
      'perception counts 0 inbound edges — the comment/string/template mentions are NOT phantom edges (old regex FP removed)',
    );
    fs.rmSync(root, { recursive: true, force: true });
  }

  // CASE 7: scripts/ operational entrypoints are roots. This prevents the
  // lens from calling positive executable harness bytes negative, while keeping
  // ordinary helper-looking files red when no root reaches them.
  {
    const root = mkrepo({
      'scripts/mcp/atomic-edit/smoke.mjs': '#!/usr/bin/env node\nimport "./smoke-part-a.js";\n',
      'scripts/mcp/atomic-edit/smoke-part-a.ts': 'export const part = 1;\n',
      'scripts/mcp/atomic-edit/build.mjs': 'console.log("build");\n',
      'scripts/mcp/atomic-edit/advanced-diff.ts': 'export const helper = 1;\n',
    });
    const ctx = makeContext(root, new Map(), [
      'scripts/mcp/atomic-edit/smoke.mjs',
      'scripts/mcp/atomic-edit/smoke-part-a.ts',
      'scripts/mcp/atomic-edit/build.mjs',
      'scripts/mcp/atomic-edit/advanced-diff.ts',
    ]);
    const r = (await gate.run(ctx)) as GateResult;
    const redFiles = new Set(r.reds.map((x) => x.file));
    show('CASE 7 (operational script roots)', r);
    expect(!redFiles.has('scripts/mcp/atomic-edit/smoke.mjs'), 'smoke.mjs is a scripts/ operational root');
    expect(!redFiles.has('scripts/mcp/atomic-edit/smoke-part-a.ts'), 'smoke-part-a.ts is part of the smoke harness root surface');
    expect(!redFiles.has('scripts/mcp/atomic-edit/build.mjs'), 'build.mjs is a scripts/ operational root');
    expect(
      redFiles.has('scripts/mcp/atomic-edit/advanced-diff.ts'),
      'ordinary helper under scripts/ remains RED when no root reaches it',
    );
    fs.rmSync(root, { recursive: true, force: true });
  }

  // CASE 8: GREEN - export-from declarations are dependency edges too.
  // Barrel files that re-export an implementation module keep that module live.
  {
    const im = 'im' + 'port';
    const ex = 'ex' + 'port';
    const from = 'fr' + 'om';
    const barrel = '.' + '/barrel';
    const leaf = '.' + '/leaf';
    const root = mkrepo({
      'index.ts': `${im} { leaf } ${from} '${barrel}';\nexport const run = () => leaf();\n`,
      'barrel.ts': `${ex} { leaf } ${from} '${leaf}';\n`,
      'leaf.ts': 'export const leaf = (): number => 7;\n',
    });
    const ctx = makeContext(root, new Map(), ['leaf.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 8 (export-from edge reaches leaf)', r);
    expect(r.green, 'export-from barrel edge makes leaf.ts reachable');
    expect(r.reds.length === 0, 'no reds when a root reaches a file through export-from');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // CASE 9: GREEN - source files declared in a local build ENTRY manifest
  // are positive build roots even when loaded later through generated dist files.
  {
    const root = mkrepo({
      'scripts/tool/build.mjs': "const ENTRY = ['gates/algebra.ts', 'gates/merge.ts'];\n",
      'scripts/tool/gates/algebra.ts': "export const algebra = 'live';\n",
      'scripts/tool/gates/merge.ts': "export const merge = 'live';\n",
    });
    const ctx = makeContext(root, new Map(), ['scripts/tool/gates/algebra.ts', 'scripts/tool/gates/merge.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 9 (build ENTRY roots)', r);
    expect(r.green, 'build ENTRY source files are GREEN roots');
    expect(r.reds.length === 0, 'no reds when files are declared build inputs');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // CASE 10: Atomic CLI and executable GateModules are roots, but ordinary
  // helper modules under scripts/ still need a real importer or build manifest.
  {
    const root = mkrepo({
      'scripts/mcp/atomic-edit/atomic-cli.mjs': '#!/usr/bin/env node\nconsole.log("atomic cli");\n',
      'scripts/mcp/atomic-edit/gates/insecure-transport-gate.mjs': 'export async function gate(){ return { green: true, reds: [], note: "ok" }; }\n',
      'scripts/mcp/atomic-edit/advanced-diff.ts': 'export const helper = 1;\n',
    });
    const ctx = makeContext(root, new Map(), [
      'scripts/mcp/atomic-edit/atomic-cli.mjs',
      'scripts/mcp/atomic-edit/gates/insecure-transport-gate.mjs',
      'scripts/mcp/atomic-edit/advanced-diff.ts',
    ]);
    const r = (await gate.run(ctx)) as GateResult;
    const redFiles = new Set(r.reds.map((x) => x.file));
    show('CASE 10 (Atomic CLI + executable GateModule roots)', r);
    expect(!redFiles.has('scripts/mcp/atomic-edit/atomic-cli.mjs'), 'atomic-cli.mjs is an operational CLI root');
    expect(!redFiles.has('scripts/mcp/atomic-edit/gates/insecure-transport-gate.mjs'), 'gates/*-gate.mjs is an executable GateModule root');
    expect(redFiles.has('scripts/mcp/atomic-edit/advanced-diff.ts'), 'ordinary advanced helper remains RED without importer or manifest');
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
