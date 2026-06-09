#!/usr/bin/env node
/**
 * Proof #5 — capability monotonicity. Verifies the security-invariants engine:
 *   1. real engine invariants are all > 0 (the surface is actually measured)
 *   2. measuring a temp copy equals measuring the real engine (stable measure)
 *   3. a STRENGTHENING (extra WRITE_GATE in a temp copy) raises the measured count
 *   4-8. each distinct WEAKENING lowers its measured invariant (so the max()
 *        ratchet would refuse it: cur < stored):
 *        - remove a WRITE_GATES entry
 *        - drop an exec FORBIDDEN law
 *        - drop a native-edit ban
 *        - remove a byte-floor guard call
 *   9. assertSecurityMonotonicity THROWS when current < an injected-high baseline
 *      (the live refusal path), proven by pointing it at a temp engine whose
 *      measured surface is below the real persisted high-water mark.
 *
 * Operates on isolated temp copies of the engine files; never writes the real
 * baseline down.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  measureSecurityInvariants,
  assertSecurityMonotonicity,
} from '../security-invariants.mjs';

const jsonMode = process.argv.includes('--json');
const dir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(dir, '..');
const FILES = ['gates/registry.ts', 'server-tools-exec.ts', 'atomic-only-hook.mjs', 'server-helpers-io.ts'];

function makeTemp() {
  const tmp = path.join(sourceDir, `.security-mono-proof-${process.pid}-${Date.now()}-${Math.floor(performance.now())}`);
  fs.mkdirSync(path.join(tmp, 'gates'), { recursive: true });
  for (const f of FILES) fs.copyFileSync(path.join(sourceDir, f), path.join(tmp, f));
  return tmp;
}

function measureWeakened(file, mutate) {
  const tmp = makeTemp();
  try {
    const before = measureSecurityInvariants(tmp);
    const p = path.join(tmp, file);
    fs.writeFileSync(p, mutate(fs.readFileSync(p, 'utf8')));
    const after = measureSecurityInvariants(tmp);
    return { before, after };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const results = [];
  const rec = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

  const real = measureSecurityInvariants(sourceDir);
  // Count-agnostic: invariants only grow monotonically, so a lower bound is the
  // honest check; every invariant must still be measured > 0.
  rec('real engine invariants all > 0', Object.values(real).length >= 4 && Object.values(real).every((v) => v > 0), real);

  const tmp = makeTemp();
  try {
    const copyMeasure = measureSecurityInvariants(tmp);
    rec('temp copy measures equal to real engine', JSON.stringify(copyMeasure) === JSON.stringify(real), { copyMeasure, real });
    const regPath = path.join(tmp, 'gates/registry.ts');
    fs.writeFileSync(regPath, fs.readFileSync(regPath, 'utf8').replace(/(WRITE_GATES[^=]*=\s*\[\n)/, `$1  extraStrongGate,\n`));
    rec('strengthening raises measured writeGates', measureSecurityInvariants(tmp).writeGates === real.writeGates + 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const w1 = measureWeakened('gates/registry.ts', (s) => s.replace(/\n\s*[A-Za-z0-9_]+Gate,(?=\s*\n)/, ''));
  rec('removing a WRITE_GATES entry lowers writeGates', w1.after.writeGates < w1.before.writeGates, w1);
  const w2 = measureWeakened('server-tools-exec.ts', (s) => s.replace(/re:\s*\//, 'xx: /'));
  rec('dropping an exec FORBIDDEN law lowers forbiddenExecLaws', w2.after.forbiddenExecLaws < w2.before.forbiddenExecLaws, w2);
  const w3 = measureWeakened('atomic-only-hook.mjs', (s) => s.replace(/'NotebookEdit'/, ''));
  rec('dropping a native-edit ban lowers nativeEditBans', w3.after.nativeEditBans < w3.before.nativeEditBans, w3);
  const w4 = measureWeakened('server-helpers-io.ts', (s) => s.replace(/assertSelfExpansionAdmission\(/, 'assertSelfExpansionAdmissionDISABLED('));
  rec('removing a byte-floor guard lowers byteFloorGuards', w4.after.byteFloorGuards < w4.before.byteFloorGuards, w4);

  // 9. live refusal path: a temp engine measuring BELOW its own current
  // high-water baseline throws. The baseline is written inside the temp fixture,
  // not the repo, so this stays robust when the real lattice has already grown
  // above the persisted production baseline.
  {
    const tmp2 = makeTemp();
    try {
      fs.writeFileSync(path.join(tmp2, '.security-baseline.json'), JSON.stringify(real, null, 2) + '\n');
      const execPath = path.join(tmp2, 'server-tools-exec.ts');
      fs.writeFileSync(execPath, fs.readFileSync(execPath, 'utf8').replace(/re:\s*\//, 'xx: /'));
      let threw = false;
      let msg = '';
      try {
        assertSecurityMonotonicity(tmp2);
      } catch (e) {
        threw = true;
        msg = e instanceof Error ? e.message : String(e);
      }
      rec('assertSecurityMonotonicity THROWS on a sub-baseline engine', threw && /security monotonicity/i.test(msg), { threw, msg: msg.slice(0, 140) });
    } finally {
      fs.rmSync(tmp2, { recursive: true, force: true });
    }
  }

  return { ok: results.every((r) => r.ok), results };
}

let payload;
try {
  payload = main();
} catch (e) {
  payload = { ok: false, error: e instanceof Error ? e.message : String(e) };
}
if (jsonMode) console.log(JSON.stringify(payload, null, 2));
else if (!payload.ok) console.error(JSON.stringify(payload, null, 2));
process.exit(payload.ok ? 0 : 1);
