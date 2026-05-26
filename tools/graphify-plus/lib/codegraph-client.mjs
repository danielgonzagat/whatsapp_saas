// tools/graphify-plus/lib/codegraph-client.mjs
//
// Thin reader for the CodeGraph SQLite store (.codegraph/codegraph.db).
// Reuses `better-sqlite3` from any nested node_modules that already pulled it
// (CodeGraph itself depends on it, so the runtime has it after `npm install`).
//
// Exposes:
//   • openDB()                       – returns a better-sqlite3 Database
//   • countNodes(db)                 – aggregate stats
//   • allNodes(db, { kinds })        – iterator over node rows
//   • allEdges(db)                   – iterator over edge rows
//   • findBySymbol(db, name)         – exact + suffix match by qualified_name/name
//   • inboundEdges(db, nodeId)       – edges pointing AT a node
//   • outboundEdges(db, nodeId)      – edges leaving a node

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

function resolveSqlite() {
  const candidates = [
    '/Users/danielpenin/whatsapp_saas/node_modules/better-sqlite3',
    '/usr/local/lib/node_modules/@colbymchenry/codegraph/node_modules/better-sqlite3',
    join(process.env.HOME || '', '.nvm/versions/node/*/lib/node_modules/@colbymchenry/codegraph/node_modules/better-sqlite3'),
    'better-sqlite3',
  ];
  for (const c of candidates) {
    if (c.includes('*')) continue;
    if (c === 'better-sqlite3' || existsSync(c)) {
      try {
        return require(c);
      } catch {
        continue;
      }
    }
  }
  // Last resort — global npm root
  try {
    const { execSync } = require('node:child_process');
    const globalRoot = execSync('npm root -g').toString().trim();
    return require(join(globalRoot, '@colbymchenry/codegraph/node_modules/better-sqlite3'));
  } catch (err) {
    throw new Error(
      `Cannot locate better-sqlite3. Install it locally (npm i better-sqlite3) or ensure @colbymchenry/codegraph is installed globally. Last error: ${err.message}`,
    );
  }
}

export function openDB(dbPath = '.codegraph/codegraph.db') {
  const Database = resolveSqlite();
  if (!existsSync(dbPath)) {
    throw new Error(`CodeGraph DB not found at ${dbPath}. Run "codegraph init && codegraph index" first.`);
  }
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

export function countNodes(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM nodes').get().n;
}

export function countEdges(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM edges').get().n;
}

export function statsByKind(db) {
  return db.prepare('SELECT kind, COUNT(*) AS n FROM nodes GROUP BY kind ORDER BY n DESC').all();
}

export function statsByLanguage(db) {
  return db.prepare('SELECT language, COUNT(*) AS n FROM files GROUP BY language ORDER BY n DESC').all();
}

export function* allNodes(db, { kinds } = {}) {
  const sql = kinds && kinds.length
    ? `SELECT * FROM nodes WHERE kind IN (${kinds.map(() => '?').join(',')})`
    : 'SELECT * FROM nodes';
  for (const row of db.prepare(sql).iterate(...(kinds || []))) {
    yield row;
  }
}

export function* allEdges(db) {
  for (const row of db.prepare('SELECT * FROM edges').iterate()) {
    yield row;
  }
}

export function findBySymbol(db, name) {
  // exact qualified_name then suffix on name
  const exact = db
    .prepare('SELECT * FROM nodes WHERE qualified_name = ? OR name = ? LIMIT 50')
    .all(name, name);
  if (exact.length > 0) return exact;
  return db
    .prepare("SELECT * FROM nodes WHERE qualified_name LIKE ? OR name LIKE ? LIMIT 50")
    .all(`%${name}`, `%${name}`);
}

export function inboundEdges(db, nodeId) {
  return db.prepare('SELECT * FROM edges WHERE target = ?').all(nodeId);
}

export function outboundEdges(db, nodeId) {
  return db.prepare('SELECT * FROM edges WHERE source = ?').all(nodeId);
}

export function fileForNode(db, nodeId) {
  const node = db.prepare('SELECT file_path FROM nodes WHERE id = ?').get(nodeId);
  return node?.file_path || null;
}
