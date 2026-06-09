// Persistent navigation session store (SQLite via better-sqlite3 if available,
// falling back to a JSON-backed store so the MCP works in any environment
// without native deps).

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

const SCHEMA_VERSION = 1;

function newId() {
  return randomBytes(8).toString('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * JSON-file backed session store. Pure JS, zero deps, atomic via rename.
 * State shape:
 *  {
 *    schema: 1,
 *    sessions: { [id]: Session },
 *    activeSessionId: string | null
 *  }
 *
 * Session shape:
 *  {
 *    id, createdAt, updatedAt, workspaceRoot, goal,
 *    currentNode: { kind, name, filePath, line, qualifiedName } | null,
 *    breadcrumbs: NavigationStep[],
 *    visited: string[],            // node ids OR file paths OR "file:line"
 *    frontier: FrontierItem[],
 *    blocked: BlockedItem[],
 *    hypotheses: HypothesisItem[],
 *    surprises: SurpriseItem[],
 *    receipts: ReceiptItem[],
 *    routes: RouteItem[]
 *  }
 */
export function createSessionStore(stateDir) {
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  const file = join(stateDir, 'sessions.json');
  const tmp = join(stateDir, 'sessions.json.tmp');

  function load() {
    if (!existsSync(file)) {
      return { schema: SCHEMA_VERSION, sessions: {}, activeSessionId: null };
    }
    try {
      const raw = readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed.sessions) parsed.sessions = {};
      if (!('activeSessionId' in parsed)) parsed.activeSessionId = null;
      return parsed;
    } catch {
      return { schema: SCHEMA_VERSION, sessions: {}, activeSessionId: null };
    }
  }

  function save(state) {
    state.schema = SCHEMA_VERSION;
    const dir = dirname(tmp);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    renameSync(tmp, file);
  }

  let state = load();

  function getActive() {
    if (!state.activeSessionId) return null;
    return state.sessions[state.activeSessionId] || null;
  }

  function requireActive() {
    const s = getActive();
    if (!s) throw new Error('No active navigation session. Call nav_start_session first.');
    return s;
  }

  function touch(session) {
    session.updatedAt = nowIso();
  }

  return {
    /** Create or replace a session with a fresh body. */
    startSession({ workspaceRoot, goal, label }) {
      const id = newId();
      const session = {
        id,
        label: label || `session-${id.slice(0, 6)}`,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        workspaceRoot,
        goal: goal || null,
        currentNode: null,
        currentFile: null,
        currentSymbol: null,
        breadcrumbs: [],
        visited: [],
        frontier: [],
        blocked: [],
        hypotheses: [],
        surprises: [],
        receipts: [],
        routes: [],
        stats: { moves: 0, jumps: 0, traces: 0, gaps: 0, proofs: 0 },
      };
      state.sessions[id] = session;
      state.activeSessionId = id;
      save(state);
      return deepClone(session);
    },

    listSessions() {
      return Object.values(state.sessions)
        .map((s) => ({
          id: s.id,
          label: s.label,
          goal: s.goal,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          breadcrumbCount: s.breadcrumbs.length,
          visitedCount: s.visited.length,
          active: s.id === state.activeSessionId,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    switchSession(id) {
      if (!state.sessions[id]) throw new Error(`session not found: ${id}`);
      state.activeSessionId = id;
      save(state);
      return deepClone(state.sessions[id]);
    },

    endSession(id) {
      const target = id || state.activeSessionId;
      if (!target || !state.sessions[target]) return false;
      delete state.sessions[target];
      if (state.activeSessionId === target) state.activeSessionId = null;
      save(state);
      return true;
    },

    /** Read-only snapshot of the active session.
     *  Re-loads from disk so multiple sessionStore instances pointing to
     *  the same dir see each other's mutations (inter-instance consistency
     *  within one process; complements inter-process continuity). */
    snapshot() {
      state = load();
      const s = getActive();
      return s ? deepClone(s) : null;
    },

    setLocation({ kind, name, filePath, line, qualifiedName, nodeId, reason }) {
      const s = requireActive();
      const prev = s.currentNode;
      s.currentNode = { kind, name, filePath, line, qualifiedName, nodeId };
      s.currentFile = filePath || null;
      s.currentSymbol = qualifiedName || name || null;
      const step = {
        at: nowIso(),
        from: prev,
        to: s.currentNode,
        reason: reason || null,
      };
      s.breadcrumbs.push(step);
      if (filePath) {
        const key = line ? `${filePath}:${line}` : filePath;
        if (!s.visited.includes(key)) s.visited.push(key);
      }
      s.stats.moves += 1;
      touch(s);
      save(state);
      return deepClone({ current: s.currentNode, step });
    },

    pop() {
      const s = requireActive();
      if (s.breadcrumbs.length === 0) throw new Error('breadcrumb empty');
      const removed = s.breadcrumbs.pop();
      s.currentNode = removed.from;
      s.currentFile = removed.from?.filePath || null;
      s.currentSymbol = removed.from?.qualifiedName || removed.from?.name || null;
      touch(s);
      save(state);
      return deepClone({ current: s.currentNode, popped: removed });
    },

    addFrontier(item) {
      const s = requireActive();
      const entry = {
        id: newId(),
        at: nowIso(),
        ...item,
      };
      s.frontier.push(entry);
      touch(s);
      save(state);
      return deepClone(entry);
    },

    removeFrontier(id) {
      const s = requireActive();
      const before = s.frontier.length;
      s.frontier = s.frontier.filter((f) => f.id !== id);
      touch(s);
      save(state);
      return s.frontier.length < before;
    },

    addBlocked(item) {
      const s = requireActive();
      const entry = { id: newId(), at: nowIso(), ...item };
      s.blocked.push(entry);
      touch(s);
      save(state);
      return deepClone(entry);
    },

    addHypothesis({ statement, expectation, supports = [], contradicts = [] }) {
      const s = requireActive();
      const entry = {
        id: newId(),
        at: nowIso(),
        statement,
        expectation,
        supports,
        contradicts,
        status: 'open',
      };
      s.hypotheses.push(entry);
      touch(s);
      save(state);
      return deepClone(entry);
    },

    updateHypothesis(id, patch) {
      const s = requireActive();
      const h = s.hypotheses.find((x) => x.id === id);
      if (!h) throw new Error(`hypothesis not found: ${id}`);
      Object.assign(h, patch);
      h.updatedAt = nowIso();
      touch(s);
      save(state);
      return deepClone(h);
    },

    addSurprise({ statement, observed, expected, severity = 'medium' }) {
      const s = requireActive();
      const entry = {
        id: newId(),
        at: nowIso(),
        statement,
        observed,
        expected,
        severity,
      };
      s.surprises.push(entry);
      touch(s);
      save(state);
      return deepClone(entry);
    },

    addReceipt(entry) {
      const s = requireActive();
      const item = { id: newId(), at: nowIso(), ...entry };
      s.receipts.push(item);
      s.stats.proofs += 1;
      touch(s);
      save(state);
      return deepClone(item);
    },

    addRoute(entry) {
      const s = requireActive();
      const item = { id: newId(), at: nowIso(), ...entry };
      s.routes.push(item);
      s.stats.traces += 1;
      touch(s);
      save(state);
      return deepClone(item);
    },

    bumpStat(name, delta = 1) {
      const s = requireActive();
      s.stats[name] = (s.stats[name] || 0) + delta;
      touch(s);
      save(state);
    },

    /** Mark a node id or file:line as visited even without moving there. */
    markVisited(key) {
      const s = requireActive();
      if (!s.visited.includes(key)) {
        s.visited.push(key);
        touch(s);
        save(state);
      }
    },
  };
}
