// Adapter over the local CodeGraph SQLite database (`.codegraph/codegraph.db`).
// Uses the `codegraph` CLI for JSON output, but also reads the SQLite file
// directly via `sqlite3` for graph queries we cannot express through the CLI
// (callers, callees, edges of arbitrary kinds, contains tree, …).
//
// We deliberately avoid native bindings (better-sqlite3) so the MCP works in
// any Node install. `sqlite3` CLI is always available on macOS/linux.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function runJson(args, { cwd, timeout = 25_000 } = {}) {
  const res = spawnSync(args[0], args.slice(1), {
    cwd,
    timeout,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0 && !res.stdout) {
    return { ok: false, error: (res.stderr || '').trim() || `exit ${res.status}`, raw: '' };
  }
  const raw = (res.stdout || '').trim();
  if (!raw) return { ok: true, data: null, raw: '' };
  try {
    return { ok: true, data: JSON.parse(raw), raw };
  } catch (err) {
    return { ok: false, error: `JSON parse: ${err.message}`, raw };
  }
}

function runSqlite(dbPath, sql) {
  // Use -json mode to get an array back.
  const res = spawnSync('sqlite3', ['-json', dbPath, sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) {
    return { ok: false, error: (res.stderr || '').trim() || `exit ${res.status}` };
  }
  const raw = (res.stdout || '').trim();
  if (!raw) return { ok: true, rows: [] };
  try {
    return { ok: true, rows: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: `JSON parse: ${err.message}`, raw };
  }
}

function sqliteEscape(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function createCodegraphAdapter({ workspaceRoot }) {
  const dbPath = join(workspaceRoot, '.codegraph', 'codegraph.db');
  const dbExists = existsSync(dbPath);

  function ensureDb() {
    if (!dbExists) {
      throw new Error(
        `CodeGraph DB not found at ${dbPath}. Run \`codegraph init && codegraph index\` first.`,
      );
    }
  }

  function status() {
    return { dbPath, dbExists };
  }

  function rawSql(sql) {
    ensureDb();
    return runSqlite(dbPath, sql);
  }

  /** Search by symbol via the codegraph CLI (uses FTS5 ranking). */
  function query(search, { limit = 10, kind } = {}) {
    const args = ['codegraph', 'query', search, '--json', '--limit', String(limit)];
    if (kind) args.push('--kind', kind);
    const { ok, data, error } = runJson(args, { cwd: workspaceRoot });
    if (!ok) return { ok: false, error };
    return { ok: true, results: Array.isArray(data) ? data : [] };
  }

  /** Build a CodeGraph "context" doc — markdown bundle that summarises a task. */
  function context(task, { maxNodes = 30, maxCode = 6, format = 'markdown' } = {}) {
    const args = [
      'codegraph',
      'context',
      task,
      '--max-nodes',
      String(maxNodes),
      '--max-code',
      String(maxCode),
      '--format',
      format,
    ];
    const res = spawnSync(args[0], args.slice(1), {
      cwd: workspaceRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (res.status !== 0 && !res.stdout) {
      return { ok: false, error: (res.stderr || '').trim() || `exit ${res.status}` };
    }
    return { ok: true, content: res.stdout };
  }

  /** Fetch a node by its CodeGraph id (e.g. "method:1234"). */
  function getNode(id) {
    ensureDb();
    const r = runSqlite(
      dbPath,
      `SELECT * FROM nodes WHERE id = ${sqliteEscape(id)} LIMIT 1`,
    );
    if (!r.ok) return r;
    return { ok: true, node: r.rows[0] || null };
  }

  /** Find a node by exact qualified name. */
  function findByQualifiedName(qname) {
    ensureDb();
    const r = runSqlite(
      dbPath,
      `SELECT * FROM nodes WHERE qualified_name = ${sqliteEscape(qname)} LIMIT 1`,
    );
    if (!r.ok) return r;
    return { ok: true, node: r.rows[0] || null };
  }

  /** Find all nodes inside a given file. */
  function nodesInFile(filePath, { kinds = null, limit = 200 } = {}) {
    ensureDb();
    const kindFilter = kinds
      ? ` AND kind IN (${kinds.map(sqliteEscape).join(',')})`
      : '';
    const sql = `
      SELECT id, kind, name, qualified_name, start_line, end_line, is_exported, is_async, signature, docstring
      FROM nodes
      WHERE file_path = ${sqliteEscape(filePath)}${kindFilter}
      ORDER BY start_line ASC
      LIMIT ${Number(limit) | 0};
    `;
    const r = runSqlite(dbPath, sql);
    if (!r.ok) return r;
    return { ok: true, nodes: r.rows };
  }

  /** Outgoing edges from a node (callees, contains-children, imports, etc.). */
  function outgoing(nodeId, { kind = null, limit = 50 } = {}) {
    ensureDb();
    const kindFilter = kind ? ` AND e.kind = ${sqliteEscape(kind)}` : '';
    const sql = `
      SELECT e.kind AS edge_kind, e.line, e.col, e.metadata, n.*
      FROM edges e
      JOIN nodes n ON n.id = e.target
      WHERE e.source = ${sqliteEscape(nodeId)}${kindFilter}
      LIMIT ${Number(limit) | 0};
    `;
    const r = runSqlite(dbPath, sql);
    if (!r.ok) return r;
    return { ok: true, edges: r.rows };
  }

  /** Incoming edges into a node (callers, parents, importers). */
  function incoming(nodeId, { kind = null, limit = 50 } = {}) {
    ensureDb();
    const kindFilter = kind ? ` AND e.kind = ${sqliteEscape(kind)}` : '';
    const sql = `
      SELECT e.kind AS edge_kind, e.line, e.col, e.metadata, n.*
      FROM edges e
      JOIN nodes n ON n.id = e.source
      WHERE e.target = ${sqliteEscape(nodeId)}${kindFilter}
      LIMIT ${Number(limit) | 0};
    `;
    const r = runSqlite(dbPath, sql);
    if (!r.ok) return r;
    return { ok: true, edges: r.rows };
  }

  /** Resolve a symbol name to its best matching node, preferring exported methods/functions/classes. */
  function resolveSymbol(name, { kinds = ['method', 'function', 'class', 'interface'], limit = 5 } = {}) {
    ensureDb();
    const kindList = kinds.map(sqliteEscape).join(',');
    const sql = `
      SELECT id, kind, name, qualified_name, file_path, start_line, end_line, is_exported, signature
      FROM nodes
      WHERE name = ${sqliteEscape(name)} AND kind IN (${kindList})
      ORDER BY is_exported DESC, end_line - start_line DESC
      LIMIT ${Number(limit) | 0};
    `;
    const r = runSqlite(dbPath, sql);
    if (!r.ok) return r;
    return { ok: true, candidates: r.rows };
  }

  /** Resolve a file path to its `file` node (if present). */
  function resolveFileNode(filePath) {
    ensureDb();
    const sql = `
      SELECT id, kind, name, qualified_name, file_path
      FROM nodes
      WHERE file_path = ${sqliteEscape(filePath)} AND kind = 'file'
      LIMIT 1;
    `;
    const r = runSqlite(dbPath, sql);
    if (!r.ok) return r;
    return { ok: true, node: r.rows[0] || null };
  }

  /** Files reachable from a node within N hops following any edge. */
  function neighborhood(nodeId, { hops = 1, limitPerHop = 80 } = {}) {
    ensureDb();
    const seen = new Set([nodeId]);
    const frontier = [nodeId];
    const result = [];
    for (let h = 0; h < hops && frontier.length; h++) {
      const next = [];
      for (const id of frontier) {
        const outR = outgoing(id, { limit: limitPerHop });
        const inR = incoming(id, { limit: limitPerHop });
        for (const e of [...(outR.edges || []), ...(inR.edges || [])]) {
          if (!seen.has(e.id)) {
            seen.add(e.id);
            next.push(e.id);
            result.push({ hop: h + 1, edgeKind: e.edge_kind, node: e });
          }
        }
      }
      frontier.length = 0;
      frontier.push(...next);
    }
    return { ok: true, neighbors: result };
  }

  /** Names of all functions/methods called by a node (transitively, capped). */
  function transitiveCallees(nodeId, { depth = 2, cap = 50 } = {}) {
    ensureDb();
    const seen = new Set([nodeId]);
    const out = [];
    const queue = [{ id: nodeId, d: 0 }];
    while (queue.length && out.length < cap) {
      const { id, d } = queue.shift();
      if (d >= depth) continue;
      const r = outgoing(id, { kind: 'calls', limit: 30 });
      for (const e of r.edges || []) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          out.push({ depth: d + 1, node: e });
          queue.push({ id: e.id, d: d + 1 });
          if (out.length >= cap) break;
        }
      }
    }
    return { ok: true, callees: out };
  }

  return {
    status,
    rawSql,
    query,
    context,
    getNode,
    findByQualifiedName,
    nodesInFile,
    outgoing,
    incoming,
    resolveSymbol,
    resolveFileNode,
    neighborhood,
    transitiveCallees,
  };
}
