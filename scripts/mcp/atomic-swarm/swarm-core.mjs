/**
 * atomic-swarm core — shared substrate for the swarm surface.
 *
 * Doctrine (inherited from atomic-edit): every action leaves a receipt; every
 * receipt is hashable; secrets never reach a returned or persisted surface;
 * refusal is fail-closed and explicit. This module owns sha256, the
 * append-only ledger under .atomic/, and env-secret redaction.
 */
import crypto from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';

export const REPO_ROOT = path.resolve(
  process.env.ATOMIC_SWARM_REPO_ROOT ?? process.env.CODEX_PROJECT_DIR ?? process.cwd(),
);

export function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

const SECRET_ENV_NAME = /TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|AUTH/i;

export function secretEnvValues(env = process.env) {
  const values = [];
  for (const [name, value] of Object.entries(env)) {
    if (!value || value.length < 8) continue;
    if (SECRET_ENV_NAME.test(name)) values.push(value);
  }
  return values;
}

export function redactSecrets(text, env = process.env) {
  let out = String(text ?? '');
  for (const value of secretEnvValues(env)) {
    out = out.split(value).join('[redacted:env-secret]');
  }
  return out;
}

export function ledgerPath(name) {
  return path.join(REPO_ROOT, '.atomic', name);
}

export function appendLedger(name, entry) {
  const file = ledgerPath(name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const record = { at: new Date().toISOString(), ...entry };
  fs.appendFileSync(file, JSON.stringify(record) + '\n');
  return record;
}

export function refusal(message, extra = {}) {
  const error = new Error(message);
  error.swarmRefusal = true;
  Object.assign(error, extra);
  return error;
}
