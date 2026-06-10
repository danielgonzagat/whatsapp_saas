#!/usr/bin/env node
/**
 * Proof #5 - capability monotonicity. Verifies the security-invariants engine:
 *   1. real engine invariant counts are all > 0;
 *   2. real engine behavior fixtures are all green;
 *   3. measuring a temp copy equals measuring the real engine;
 *   4. a STRENGTHENING raises the measured writeGates count;
 *   5-8. each distinct count weakening lowers its measured invariant;
 *   9. assertSecurityMonotonicity throws when current < an injected baseline;
 *   10-13. same-count behavior weakenings are refused by behavior fixtures:
 *        - inert FORBIDDEN regex with the same `re:/` count;
 *        - swapped native edit tool with the same set cardinality;
 *        - swapped WRITE_GATES entry with the same Gate-token count;
 *        - swapped SYNC_WRITE_GATES entry with the same Gate-token count.
 *
 * Operates on isolated temp copies of the engine files; never writes the real
 * baseline down.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  measureSecurityInvariants,
  measureSecurityInvariantEvidence,
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

function summarizeEvidence(evidence) {
  return Object.fromEntries(
    Object.entries(evidence).map(([key, value]) => [
      key,
      {
        value: value.value,
        behaviorSha256: value.behaviorSha256,
        fixtureCount: value.fixtures.length,
        failures: value.failures.map((f) => f.id),
      },
    ]),
  );
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

function mutateRequiredSource(src, oldText, newText) {
  if (!src.includes(oldText)) throw new Error(`fixture source did not contain required text: ${oldText}`);
  return src.replace(oldText, newText);
}

function sameCountBehaviorRefusal(file, key, mutate) {
  const tmp = makeTemp();
  try {
    const before = measureSecurityInvariants(tmp);
    assertSecurityMonotonicity(tmp, { persist: true });
    const p = path.join(tmp, file);
    fs.writeFileSync(p, mutate(fs.readFileSync(p, 'utf8')));
    const after = measureSecurityInvariants(tmp);
    const evidenceAfter = measureSecurityInvariantEvidence(tmp)[key];
    let threw = false;
    let msg = '';
    try {
      assertSecurityMonotonicity(tmp);
    } catch (e) {
      threw = true;
      msg = e instanceof Error ? e.message : String(e);
    }
    return {
      sameCount: before[key] === after[key],
      threw,
      msg: msg.slice(0, 240),
      before: before[key],
      after: after[key],
      failures: evidenceAfter.failures.map((f) => f.id),
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const results = [];
  const rec = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

  const real = measureSecurityInvariants(sourceDir);
  const realEvidence = measureSecurityInvariantEvidence(sourceDir);
  // Count-agnostic: invariants only grow monotonically, so a lower bound is the
  // honest check; every invariant must still be measured > 0.
  rec('real engine invariant counts all > 0', Object.values(real).length >= 4 && Object.values(real).every((v) => v > 0), real);
  rec(
    'real engine behavior fixtures all green',
    Object.values(realEvidence).every((value) => value.failures.length === 0),
    summarizeEvidence(realEvidence),
  );

  const tmp = makeTemp();
  try {
    const copyMeasure = measureSecurityInvariants(tmp);
    const copyEvidence = summarizeEvidence(measureSecurityInvariantEvidence(tmp));
    rec('temp copy measures equal to real engine', JSON.stringify(copyMeasure) === JSON.stringify(real), { copyMeasure, real });
    rec(
      'temp copy behavior evidence equals real engine',
      JSON.stringify(copyEvidence) === JSON.stringify(summarizeEvidence(realEvidence)),
      { copyEvidence, realEvidence: summarizeEvidence(realEvidence) },
    );
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

  // 9. live refusal path: a temp engine measuring BELOW its own current high-water
  // baseline throws. The baseline is written inside the temp fixture, not the repo.
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

  const s1 = sameCountBehaviorRefusal('server-tools-exec.ts', 'forbiddenExecLaws', (src) =>
    mutateRequiredSource(src, 're: /\\bgit\\s+restore\\b/', 're: /__atomic_never_matches__/'),
  );
  rec(
    'same-count inert FORBIDDEN regex is refused by behavior fixtures',
    s1.sameCount && s1.threw && s1.failures.includes('forbidden-command:git-restore'),
    s1,
  );

  const s2 = sameCountBehaviorRefusal('atomic-only-hook.mjs', 'nativeEditBans', (src) =>
    mutateRequiredSource(src, "'NotebookEdit'", "'NotebookRead'"),
  );
  rec(
    'same-count native edit ban swap is refused by behavior fixtures',
    s2.sameCount && s2.threw && s2.failures.includes('native-edit-ban:NotebookEdit'),
    s2,
  );

  const s3 = sameCountBehaviorRefusal('gates/registry.ts', 'writeGates', (src) =>
    mutateRequiredSource(src, '  securityGate,', '  securityFloorGate,'),
  );
  rec(
    'same-count WRITE_GATES swap is refused by behavior fixtures',
    s3.sameCount && s3.threw && s3.failures.includes('write-gate:securityGate'),
    s3,
  );

  const s4 = sameCountBehaviorRefusal('server-helpers-io.ts', 'syncByteFloorGates', (src) =>
    mutateRequiredSource(
      src,
      'const SYNC_WRITE_GATES: GateModule[] = [typeSoundnessGate, iacReferenceGate, securityGate];',
      'const SYNC_WRITE_GATES: GateModule[] = [typeSoundnessGate, iacReferenceGate, securityFloorGate];',
    ),
  );
  rec(
    'same-count SYNC_WRITE_GATES swap is refused by behavior fixtures',
    s4.sameCount && s4.threw && s4.failures.includes('sync-write-gate:securityGate'),
    s4,
  );

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
