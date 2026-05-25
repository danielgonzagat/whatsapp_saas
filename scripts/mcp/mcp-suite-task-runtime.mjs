import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export function createTaskRuntime({ root }) {
  const ROOT = root;

  function taskDir() {
    const dir = join(ROOT, '.task-graph');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  function tasksPath() {
    return join(taskDir(), 'tasks.json');
  }

  function locksDir() {
    const dir = join(taskDir(), 'locks');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  function loadTasks() {
    if (!existsSync(tasksPath())) return [];
    try {
      return JSON.parse(readFileSync(tasksPath(), 'utf8'));
    } catch {
      return [];
    }
  }

  function saveTasks(tasks) {
    writeFileSync(tasksPath(), JSON.stringify(tasks, null, 2));
  }

  function tasksFromPlanText(text) {
    return text
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*]\s+\[[ x]\]\s*/i, '').trim())
      .filter(Boolean)
      .map((title) => ({ title }));
  }

  function depsDone(task, tasks) {
    return (task.dependsOn || []).every(
      (id) => tasks.find((item) => item.id === id)?.status === 'done',
    );
  }

  function lockPath(key) {
    return join(locksDir(), encodeURIComponent(key));
  }

  function lockKeys() {
    if (!existsSync(locksDir())) return new Set();
    return new Set(readdirSync(locksDir()).map((name) => decodeURIComponent(name)));
  }

  function acquireLock(key, owner, ttlMs) {
    const path = lockPath(key);
    const now = Date.now();
    if (existsSync(path)) {
      try {
        const current = JSON.parse(readFileSync(path, 'utf8'));
        if (current.expiresAt > now && current.owner !== owner)
          return { ok: false, locked: true, current };
      } catch {
        return { ok: false, error: 'lock file is corrupt', key };
      }
    }
    const lock = { key, owner, acquiredAt: new Date(now).toISOString(), expiresAt: now + ttlMs };
    writeFileSync(path, JSON.stringify(lock, null, 2));
    return { ok: true, lock };
  }

  function releaseLock(key, owner) {
    const path = lockPath(key);
    if (!existsSync(path)) return { ok: true, released: false };
    const lock = JSON.parse(readFileSync(path, 'utf8'));
    if (lock.owner !== owner) return { ok: false, error: 'owner mismatch', lock };
    unlinkSync(path);
    return { ok: true, released: true };
  }

  return {
    loadTasks,
    saveTasks,
    tasksFromPlanText,
    depsDone,
    lockKeys,
    acquireLock,
    releaseLock,
  };
}
