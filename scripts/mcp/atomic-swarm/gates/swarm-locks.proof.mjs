#!/usr/bin/env node
// Gate: swarm_lock_* — lease-aware acquire/heartbeat/steal/release semantics.
// Runs against an isolated fixture root (no real .atomic-edit-locks touched).
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, `.proof-swarm-locks-${process.pid}`);
fs.rmSync(fixtureRoot, { recursive: true, force: true });
fs.mkdirSync(fixtureRoot, { recursive: true });
process.env.ATOMIC_SWARM_REPO_ROOT = fixtureRoot;

const { lockAcquire, lockHeartbeat, lockStatus, lockSteal, lockRelease, isExpired } = await import(
  `../swarm-locks.mjs?proof=${Date.now()}`
);

const results = [];
function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

const FRONT = 'fixture-front';
const OWNER = 'owner-a';
const lockFile = path.join(fixtureRoot, '.atomic-edit-locks', FRONT, 'lock');

try {
  // 1. acquire creates the lock dir (mkdir anti-TOCTOU), clamps the lease, stamps heartbeatTimestampMs.
  const acquired = lockAcquire({ frontId: FRONT, owner: OWNER, objective: 'prove the lock lattice', leaseMs: 1000 });
  let reacquireRefused = false;
  try {
    lockAcquire({ frontId: FRONT, owner: 'owner-b', objective: 'land grab attempt' });
  } catch (error) {
    reacquireRefused = error?.swarmRefusal === true;
  }
  record(
    'acquire creates lock with clamped lease + heartbeatTimestampMs; second acquire refused',
    acquired.ok === true &&
      fs.existsSync(lockFile) &&
      acquired.lock.leaseMs === 60_000 && // 1000ms clamped up to the 60s floor
      Number.isFinite(acquired.lock.heartbeatTimestampMs) &&
      reacquireRefused,
    { lock: acquired.lock, reacquireRefused },
  );

  // 2. status lists the lock with a numeric heartbeat age and a live (non-expired) verdict.
  const status = lockStatus();
  const entry = status.locks.find((lock) => lock.frontId === FRONT);
  record(
    'status lists the lock with numeric heartbeatAgeMs and expired === false',
    status.ok === true && entry?.readable === true && Number.isFinite(entry?.heartbeatAgeMs) && entry?.expired === false,
    { entry },
  );

  // 3. heartbeat: wrong owner refused; right owner strictly advances heartbeatTimestampMs.
  let wrongOwnerHeartbeatRefused = false;
  try {
    lockHeartbeat({ frontId: FRONT, owner: 'owner-impostor' });
  } catch (error) {
    wrongOwnerHeartbeatRefused = error?.swarmRefusal === true;
  }
  const beforeMs = Number(acquired.lock.heartbeatTimestampMs);
  await new Promise((resolve) => setTimeout(resolve, 15)); // guarantee a strictly later clock tick
  const renewed = lockHeartbeat({ frontId: FRONT, owner: OWNER });
  record(
    'heartbeat refused for wrong owner; right owner strictly renews heartbeatTimestampMs',
    wrongOwnerHeartbeatRefused && renewed.ok === true && Number(renewed.lock.heartbeatTimestampMs) > beforeMs,
    { beforeMs, afterMs: renewed.lock.heartbeatTimestampMs, wrongOwnerHeartbeatRefused },
  );

  // 4. stealing a live lease is structurally impossible.
  let liveStealRefused = false;
  let liveStealMessage = '';
  try {
    lockSteal({ frontId: FRONT, newOwner: 'owner-thief' });
  } catch (error) {
    liveStealRefused = error?.swarmRefusal === true;
    liveStealMessage = String(error?.message ?? '');
  }
  record(
    'steal of a live lease is refused',
    liveStealRefused && (liveStealMessage.includes('structurally impossible') || liveStealMessage.includes('still live')),
    { liveStealMessage },
  );

  // 5. synthetic staleness: heartbeat two hours old vs a 60s lease → steal succeeds with audited receipt.
  const staleRecord = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  staleRecord.heartbeatTimestampMs = Date.now() - 7_200_000; // two hours ago, computed here
  staleRecord.heartbeatAt = new Date(staleRecord.heartbeatTimestampMs).toISOString();
  staleRecord.leaseMs = 60_000;
  fs.writeFileSync(lockFile, JSON.stringify(staleRecord, null, 2));
  const stolen = lockSteal({ frontId: FRONT, newOwner: 'owner-b', objective: 'recover the abandoned front' });
  const ledgerFile = path.join(fixtureRoot, '.atomic', 'swarm-locks-ledger.jsonl');
  const ledgerEntries = fs
    .readFileSync(ledgerFile, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const stealEntry = ledgerEntries.find((row) => row.tool === 'swarm_lock_steal');
  record(
    'provably stale lock is stolen: stolenFrom carries prior owner + ledger has priorRecord',
    stolen.ok === true &&
      stolen.lock.owner === 'owner-b' &&
      stolen.lock.stolenFrom?.owner === OWNER &&
      stealEntry?.priorRecord?.owner === OWNER,
    { stolenFrom: stolen.lock.stolenFrom, stealEntry: Boolean(stealEntry) },
  );

  // 6. legacy lock (no leaseMs, no heartbeatTimestampMs): never auto-expires, steal refused.
  const legacyFront = 'legacy-front';
  const legacyDir = path.join(fixtureRoot, '.atomic-edit-locks', legacyFront);
  fs.mkdirSync(legacyDir, { recursive: true });
  const legacyRecord = {
    frontId: legacyFront,
    owner: 'owner-legacy',
    objective: 'pre-lease era lock',
    heartbeatAt: '2020-01-01T00:00:00.000Z',
  };
  fs.writeFileSync(path.join(legacyDir, 'lock'), JSON.stringify(legacyRecord, null, 2));
  let legacyStealRefused = false;
  let legacyStealMessage = '';
  try {
    lockSteal({ frontId: legacyFront, newOwner: 'owner-thief' });
  } catch (error) {
    legacyStealRefused = error?.swarmRefusal === true;
    legacyStealMessage = String(error?.message ?? '');
  }
  record(
    'legacy lock without lease/heartbeatTimestampMs: isExpired null + steal refused',
    isExpired(legacyRecord) === null && legacyStealRefused && legacyStealMessage.includes('legacy lock'),
    { legacyStealMessage },
  );

  // 7. release: wrong owner refused; right owner removes the lock dir.
  let wrongOwnerReleaseRefused = false;
  try {
    lockRelease({ frontId: FRONT, owner: 'owner-impostor' });
  } catch (error) {
    wrongOwnerReleaseRefused = error?.swarmRefusal === true;
  }
  const released = lockRelease({ frontId: FRONT, owner: 'owner-b' });
  record(
    'release refused for wrong owner; right owner removes the lock dir',
    wrongOwnerReleaseRefused &&
      released.ok === true &&
      released.changed === true &&
      !fs.existsSync(path.join(fixtureRoot, '.atomic-edit-locks', FRONT)),
    { wrongOwnerReleaseRefused, released },
  );
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
