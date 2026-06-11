/**
 * swarm_lock_* — lease-aware front locks over the SAME .atomic-edit-locks/
 * directory the atomic-edit tools use (mkdir anti-TOCTOU, JSON record),
 * adding what the in-window tools lack: heartbeat renewal, a lease TTL, and
 * stale-only takeover with an audited receipt.
 *
 * Doctrine: a lock is a PROMISE OF LIFE, not a land grab. Owners renew via
 * swarm_lock_heartbeat; a lock whose heartbeat is older than its lease is
 * EXPIRED and may be stolen by anyone — but ONLY then. There is no force
 * flag: stealing a live lock is structurally impossible here, and every
 * steal lands in .atomic/swarm-locks-ledger.jsonl with the full prior record.
 *
 * Compatibility: records carry the same fields atomic_lock_acquire writes
 * (frontId/owner/objective/heartbeatAt/allowedFiles/...), so atomic-edit's
 * listLocks reads swarm locks transparently; swarm adds leaseMs +
 * heartbeatTimestampMs inside the JSON (no separate heartbeat file).
 */
import * as fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, appendLedger, refusal } from './swarm-core.mjs';

export const DEFAULT_LEASE_MS = 15 * 60 * 1000;
const MAX_LEASE_MS = 24 * 60 * 60 * 1000;

function lockRoot() {
  return path.join(REPO_ROOT, '.atomic-edit-locks');
}

export function safeFrontId(frontId) {
  const value = String(frontId ?? '').trim();
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw refusal('swarm_lock refused: frontId must use only letters, numbers, dot, underscore, or dash');
  }
  return value;
}

function lockDir(frontId) {
  return path.join(lockRoot(), safeFrontId(frontId));
}

function lockFile(frontId) {
  return path.join(lockDir(frontId), 'lock');
}

function readRecord(frontId) {
  try {
    return JSON.parse(fs.readFileSync(lockFile(frontId), 'utf8'));
  } catch {
    return null;
  }
}

function writeRecord(frontId, record) {
  const file = lockFile(frontId);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
  fs.renameSync(tmp, file);
}

function clampLease(leaseMs) {
  const value = Number(leaseMs) || DEFAULT_LEASE_MS;
  return Math.max(60_000, Math.min(MAX_LEASE_MS, Math.floor(value)));
}

export function lockAge(record, nowMs = Date.now()) {
  const ts = Number(record?.heartbeatTimestampMs);
  if (Number.isFinite(ts)) return Math.max(0, nowMs - ts);
  const at = Date.parse(String(record?.heartbeatAt ?? ''));
  if (Number.isFinite(at)) return Math.max(0, nowMs - at);
  return null;
}

export function isExpired(record, nowMs = Date.now()) {
  if (!record) return null;
  const age = lockAge(record, nowMs);
  if (age === null) return null; // no provable heartbeat: never auto-expired
  const lease = Number(record.leaseMs);
  if (!Number.isFinite(lease) || lease <= 0) return null; // legacy lock without lease: never auto-expired
  return age > lease;
}

export function lockAcquire({ frontId, owner, objective, leaseMs, allowedFiles, blockedFiles, acceptanceCriteria } = {}) {
  const id = safeFrontId(frontId);
  if (!String(owner ?? '').trim()) throw refusal('swarm_lock_acquire refused: owner is required');
  if (!String(objective ?? '').trim()) throw refusal('swarm_lock_acquire refused: objective is required');
  fs.mkdirSync(lockRoot(), { recursive: true });
  try {
    fs.mkdirSync(lockDir(id)); // atomic mkdir is the anti-TOCTOU primitive
  } catch {
    const current = readRecord(id);
    throw refusal(
      `swarm_lock_acquire refused: front ${id} is already claimed by ${String(current?.owner ?? 'unknown')}` +
        (isExpired(current) ? ' (EXPIRED — use swarm_lock_steal)' : ''),
      { current },
    );
  }
  const nowMs = Date.now();
  const record = {
    frontId: id,
    owner: String(owner),
    objective: String(objective),
    startedAt: new Date(nowMs).toISOString(),
    heartbeatAt: new Date(nowMs).toISOString(),
    heartbeatTimestampMs: nowMs,
    leaseMs: clampLease(leaseMs),
    allowedFiles: Array.isArray(allowedFiles) ? allowedFiles.map(String) : [],
    blockedFiles: Array.isArray(blockedFiles) ? blockedFiles.map(String) : [],
    acceptanceCriteria: Array.isArray(acceptanceCriteria) ? acceptanceCriteria.map(String) : [],
    status: 'claimed',
    lockKind: 'swarm-lease',
  };
  writeRecord(id, record);
  appendLedger('swarm-locks-ledger.jsonl', { tool: 'swarm_lock_acquire', frontId: id, owner: record.owner, leaseMs: record.leaseMs });
  return { ok: true, lock: record };
}

export function lockHeartbeat({ frontId, owner } = {}) {
  const id = safeFrontId(frontId);
  const record = readRecord(id);
  if (!record) throw refusal(`swarm_lock_heartbeat refused: no readable lock for front ${id}`);
  if (record.owner !== String(owner)) {
    throw refusal(`swarm_lock_heartbeat refused: lock owned by ${String(record.owner)}, not ${String(owner)}`);
  }
  const nowMs = Date.now();
  record.heartbeatAt = new Date(nowMs).toISOString();
  record.heartbeatTimestampMs = nowMs;
  writeRecord(id, record);
  return { ok: true, lock: record, renewedForMs: Number(record.leaseMs) || null };
}

export function lockStatus() {
  const root = lockRoot();
  if (!fs.existsSync(root)) return { ok: true, locks: [] };
  const nowMs = Date.now();
  const locks = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const record = readRecord(entry.name);
    locks.push({
      frontId: entry.name,
      record,
      heartbeatAgeMs: record ? lockAge(record, nowMs) : null,
      expired: record ? isExpired(record, nowMs) : null,
      readable: record !== null,
    });
  }
  return { ok: true, locks };
}

export function lockSteal({ frontId, newOwner, objective, leaseMs } = {}) {
  const id = safeFrontId(frontId);
  if (!String(newOwner ?? '').trim()) throw refusal('swarm_lock_steal refused: newOwner is required');
  const record = readRecord(id);
  if (!record) {
    throw refusal(
      `swarm_lock_steal refused: no readable JSON record for front ${id}; an unreadable lock is not provably stale — resolve it manually`,
    );
  }
  const expired = isExpired(record);
  if (expired !== true) {
    throw refusal(
      expired === null
        ? `swarm_lock_steal refused: lock ${id} has no lease/heartbeat to prove staleness (legacy lock) — negotiate with the owner or use the in-window release`
        : `swarm_lock_steal refused: lock ${id} lease is still live (age ${lockAge(record)}ms <= lease ${record.leaseMs}ms); stealing a live lock is structurally impossible`,
      { current: record },
    );
  }
  const nowMs = Date.now();
  const next = {
    ...record,
    owner: String(newOwner),
    objective: String(objective ?? record.objective),
    heartbeatAt: new Date(nowMs).toISOString(),
    heartbeatTimestampMs: nowMs,
    leaseMs: clampLease(leaseMs ?? record.leaseMs),
    status: 'claimed',
    lockKind: 'swarm-lease',
    stolenFrom: { owner: record.owner, heartbeatAt: record.heartbeatAt, leaseMs: record.leaseMs },
    stolenAt: new Date(nowMs).toISOString(),
  };
  writeRecord(id, next);
  const receipt = appendLedger('swarm-locks-ledger.jsonl', {
    tool: 'swarm_lock_steal',
    frontId: id,
    newOwner: next.owner,
    priorRecord: record,
    provenStaleByMs: lockAge(record, nowMs) - Number(record.leaseMs),
  });
  return { ok: true, lock: next, receipt };
}

export function lockRelease({ frontId, owner } = {}) {
  const id = safeFrontId(frontId);
  const dir = lockDir(id);
  if (!fs.existsSync(dir)) return { ok: true, changed: false, note: 'lock already absent' };
  const record = readRecord(id);
  if (record && record.owner !== String(owner)) {
    throw refusal(`swarm_lock_release refused: lock owned by ${String(record.owner)}, not ${String(owner)} (no force here; steal requires proven staleness)`);
  }
  fs.rmSync(dir, { recursive: true, force: false });
  appendLedger('swarm-locks-ledger.jsonl', { tool: 'swarm_lock_release', frontId: id, owner: String(owner) });
  return { ok: true, changed: true };
}
