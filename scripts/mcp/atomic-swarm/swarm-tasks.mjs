/**
 * swarm_task_* — persistent task store where "done" can be made VERIFIABLE.
 *
 * Parity target: the TUI TodoWrite/Tasks — except a task may carry an
 * acceptanceCommand, and completing such a task REQUIRES that command to exit
 * 0 through the governed broker (same sandbox as atomic_exec) at completion
 * time. No broker, no completion — fail-closed, like everything in the swarm.
 * Tasks without acceptanceCommand complete freely (parity with TodoWrite),
 * but the receipt records that the completion was unverified.
 *
 * Store: .atomic/swarm-tasks.json (atomic temp+rename writes).
 * Ledger: .atomic/swarm-tasks-ledger.jsonl (every transition, with evidence).
 */
import * as fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, appendLedger, redactSecrets, refusal, sha256Hex } from './swarm-core.mjs';

const STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled']);

function storePath() {
  return path.join(REPO_ROOT, '.atomic', 'swarm-tasks.json');
}

function readStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    if (parsed && Array.isArray(parsed.tasks)) return parsed;
  } catch {
    // missing/corrupt store falls through to a fresh one
  }
  return { nextId: 1, tasks: [] };
}

function writeStore(store) {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, file);
}

function findTask(store, id) {
  const task = store.tasks.find((candidate) => candidate.id === Number(id));
  if (!task) throw refusal(`swarm_task refused: no task with id ${id}`);
  return task;
}

export function taskCreate({ subject, description, acceptanceCommand, acceptanceCwd } = {}) {
  if (!String(subject ?? '').trim()) throw refusal('swarm_task_create refused: subject is required');
  const store = readStore();
  const task = {
    id: store.nextId,
    subject: String(subject),
    description: String(description ?? ''),
    acceptanceCommand: String(acceptanceCommand ?? '').trim() || null,
    acceptanceCwd: String(acceptanceCwd ?? '.') || '.',
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completion: null,
  };
  store.nextId += 1;
  store.tasks.push(task);
  writeStore(store);
  appendLedger('swarm-tasks-ledger.jsonl', { tool: 'swarm_task_create', id: task.id, subject: task.subject, gated: task.acceptanceCommand !== null });
  return { ok: true, task };
}

export function taskList() {
  const store = readStore();
  return { ok: true, tasks: store.tasks };
}

export async function taskUpdate({ id, status, subject, description } = {}, { runAcceptance } = {}) {
  const store = readStore();
  const task = findTask(store, id);
  if (subject !== undefined) task.subject = String(subject);
  if (description !== undefined) task.description = String(description);
  if (status !== undefined) {
    const next = String(status);
    if (!STATUSES.has(next)) throw refusal(`swarm_task_update refused: invalid status ${next}`);
    if (next === 'completed' && task.acceptanceCommand) {
      if (typeof runAcceptance !== 'function') {
        throw refusal(
          `swarm_task_update refused (fail-closed): task ${task.id} is gated by an acceptance command and no governed runner is available`,
        );
      }
      const verdict = await runAcceptance(task.acceptanceCommand, task.acceptanceCwd);
      const stdout = redactSecrets(String(verdict?.stdout ?? ''));
      const stderr = redactSecrets(String(verdict?.stderr ?? ''));
      const passed = verdict?.ok === true && verdict?.exitCode === 0;
      const completion = {
        verified: passed,
        command: task.acceptanceCommand,
        exitCode: typeof verdict?.exitCode === 'number' ? verdict.exitCode : null,
        stdoutSha256: sha256Hex(stdout),
        stderrSha256: sha256Hex(stderr),
        at: new Date().toISOString(),
      };
      if (!passed) {
        appendLedger('swarm-tasks-ledger.jsonl', { tool: 'swarm_task_update', id: task.id, refusedCompletion: completion, stderrSample: stderr.slice(0, 2000) });
        throw refusal(
          `swarm_task_update refused: acceptance command for task ${task.id} failed (exit ${completion.exitCode}); a gated task cannot be marked done on a red gate`,
          { completion },
        );
      }
      task.completion = completion;
    } else if (next === 'completed') {
      task.completion = { verified: false, command: null, at: new Date().toISOString() };
    }
    task.status = next;
  }
  task.updatedAt = new Date().toISOString();
  writeStore(store);
  appendLedger('swarm-tasks-ledger.jsonl', { tool: 'swarm_task_update', id: task.id, status: task.status, verified: task.completion?.verified ?? null });
  return { ok: true, task };
}
