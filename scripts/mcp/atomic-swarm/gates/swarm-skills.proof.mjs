#!/usr/bin/env node
// Gate: swarm_skill_* — register/load round-trip + poisoned-skill refusal.
// Runs against an isolated fixture root (no real manifests touched).
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, `.proof-swarm-skills-${process.pid}`);
fs.rmSync(fixtureRoot, { recursive: true, force: true });
fs.mkdirSync(fixtureRoot, { recursive: true });
process.env.ATOMIC_SWARM_REPO_ROOT = fixtureRoot;

const { skillRegister, skillLoad, skillVerify, skillList } = await import(
  `../swarm-skills.mjs?proof=${Date.now()}`
);

const results = [];
function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

const skillDir = path.join(fixtureRoot, 'fixture-skill');
fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# fixture skill\n\nbody v1\n');
fs.writeFileSync(path.join(skillDir, 'references', 'extra.md'), 'reference material\n');

try {
  // 1. register hashes every file and persists a manifest with a merkle root.
  const registered = skillRegister({ name: 'fixture-skill', dir: skillDir });
  record(
    'register persists manifest with per-file sha256 + merkle root',
    registered.ok === true &&
      registered.manifest.files.length === 2 &&
      /^[0-9a-f]{64}$/.test(registered.manifest.merkleRoot) &&
      fs.existsSync(path.join(fixtureRoot, '.atomic', 'skills', 'fixture-skill.manifest.json')),
    { receipt: registered.receipt },
  );

  // 2. load serves content only after re-verifying every hash.
  const loaded = skillLoad({ name: 'fixture-skill' });
  record(
    'load re-verifies and serves SKILL.md with receipt',
    loaded.ok === true && loaded.content.includes('body v1') && loaded.receipt.verifiedFiles === 2,
    { receipt: loaded.receipt },
  );

  // 3. byte drift in ANY file is a fail-closed refusal with the exact delta.
  fs.appendFileSync(path.join(skillDir, 'references', 'extra.md'), 'poisoned line\n');
  let driftRefused = false;
  let driftDetail = null;
  try {
    skillLoad({ name: 'fixture-skill' });
  } catch (error) {
    driftRefused = error?.swarmRefusal === true;
    driftDetail = error?.drift ?? null;
  }
  record(
    'drifted skill refused as poisoned with per-file delta',
    driftRefused && driftDetail?.changed?.includes('references/extra.md'),
    { drift: driftDetail },
  );

  // 4. verify reports the same drift read-only; list carries the verdict.
  const verification = skillVerify('fixture-skill');
  const listing = skillList();
  record(
    'verify + list report drift without serving content',
    verification.ok === false &&
      listing.skills.length === 1 &&
      listing.skills[0].ok === false,
    { verification: verification.drift, listing: listing.skills },
  );

  // 5. re-register over the new bytes restores loadability (drift is not permanent damage).
  skillRegister({ name: 'fixture-skill', dir: skillDir });
  const reloaded = skillLoad({ name: 'fixture-skill', file: 'references/extra.md' });
  record(
    're-register restores verified loads',
    reloaded.ok === true && reloaded.content.includes('poisoned line'),
    { receipt: reloaded.receipt },
  );

  // 6. unregistered skill and out-of-manifest file are refusals.
  let unknownRefused = false;
  try {
    skillLoad({ name: 'never-registered' });
  } catch (error) {
    unknownRefused = error?.swarmRefusal === true;
  }
  let escapeRefused = false;
  try {
    skillLoad({ name: 'fixture-skill', file: '../outside.md' });
  } catch (error) {
    escapeRefused = error?.swarmRefusal === true;
  }
  record('unknown skill and out-of-manifest path are refused', unknownRefused && escapeRefused, {});
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.ok);
if (jsonMode) {
  console.log(JSON.stringify({ ok: failed.length === 0, total: results.length, failed, results }, null, 2));
} else {
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`);
}
process.exit(failed.length > 0 ? 1 : 0);
