#!/usr/bin/env node
/**
 * Proof: supply-chain gate distinguishes code defects from missing install substrate.
 *
 * A newly introduced bare import is RED when node_modules is observable and the
 * package root is absent. The same package absence is UNJUDGED when no
 * node_modules substrate exists anywhere on Node's walk-up path: missing deps are
 * an environment proof debt, not syntax/convergence corruption.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeContext } from '../dist/gates/contract.js';
import gate from '../dist/gates/supply-chain-gate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(here, '..');
const repoRoot = path.resolve(engineRoot, '..', '..', '..');
let failures = 0;

function check(name, condition, detail = {}) {
  console.log(`${condition ? 'ok  ' : 'FAIL'} - ${name}`);
  if (!condition) {
    console.log(JSON.stringify(detail, null, 2));
    failures += 1;
  }
}

function importSource(pkg) {
  return "import x from '" + pkg + "';\nexport const y = x;\n";
}

{
  const rel = 'src/probe.ts';
  const pkg = ['absent-env-only', 'pkg'].join('-');
  const overlay = new Map([[rel, importSource(pkg)]]);
  const virtualRootWithoutNodeModules = path.join(engineRoot, '.virtual-no-node-modules-root');
  const ctx = makeContext(virtualRootWithoutNodeModules, overlay, [rel]);
  const res = await gate.run(ctx);
  check(
    'UNJUDGED when no node_modules substrate is observable',
    res.unjudged === true && res.green === true && res.reds.length === 0 && /node_modules dependency substrate/.test(String(res.unjudgedReason || '')),
    res,
  );
}

{
  const rel = 'scripts/mcp/atomic-edit/gates/__probe__.ts';
  const pkg = ['still-absent-with-substrate', 'pkg'].join('-');
  const overlay = new Map([[rel, importSource(pkg)]]);
  const ctx = makeContext(repoRoot, overlay, [rel]);
  const res = await gate.run(ctx);
  check(
    'RED remains when node_modules substrate is observable and package is absent',
    res.green === false && res.reds.some((r) => r.locus === `bare:${pkg}`),
    res,
  );
}

if (failures > 0) {
  console.log(`\nPROOF FAIL (${failures} assertion(s) failed)`);
  process.exit(1);
}
console.log('\nPROOF PASS');
