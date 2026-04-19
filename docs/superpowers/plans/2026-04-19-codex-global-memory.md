# Codex Global Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install a user-global persistent memory system for Codex that captures history
automatically, injects a conservative startup brief in new sessions, and supports manual retrieval
across the full Codex history.

**Architecture:** Build a local Node-based memory service under `~/.codex/memories/codex-mem/` using
native `node:sqlite` and an HTTP API. Install global Codex skills in `~/.agents/skills/` so new
sessions can bootstrap the service and pull a short memory brief without touching repository-local
governance surfaces.

**Tech Stack:** Node.js 25, native `node:sqlite`, native `node:test`, local HTTP server, global
Codex skills under `~/.agents/skills/`.

---

### Task 1: Create the runtime skeleton under the global memory root

**Files:**

- Create: `~/.codex/memories/codex-mem/package.json`
- Create: `~/.codex/memories/codex-mem/server.mjs`
- Create: `~/.codex/memories/codex-mem/lib/config.mjs`
- Create: `~/.codex/memories/codex-mem/lib/fs.mjs`
- Create: `~/.codex/memories/codex-mem/test/config.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRuntimePaths } from '../lib/config.mjs';

test('resolveRuntimePaths builds paths under the codex memory root', () => {
  const paths = resolveRuntimePaths('/tmp/codex-mem-root');

  assert.equal(paths.root, '/tmp/codex-mem-root');
  assert.equal(paths.dbPath, '/tmp/codex-mem-root/state/codex-mem.db');
  assert.equal(paths.logDir, '/tmp/codex-mem-root/logs');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test /Users/danielpenin/.codex/memories/codex-mem/test/config.test.mjs`
Expected: FAIL because `../lib/config.mjs` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
export function resolveRuntimePaths(root) {
  return {
    root,
    stateDir: `${root}/state`,
    logDir: `${root}/logs`,
    dbPath: `${root}/state/codex-mem.db`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test /Users/danielpenin/.codex/memories/codex-mem/test/config.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-19-codex-global-memory-design.md docs/superpowers/plans/2026-04-19-codex-global-memory.md
git commit -m "docs: add codex global memory design and plan"
```

### Task 2: Build the SQLite schema and repository layer

**Files:**

- Create: `~/.codex/memories/codex-mem/lib/db.mjs`
- Create: `~/.codex/memories/codex-mem/lib/schema.mjs`
- Create: `~/.codex/memories/codex-mem/test/db.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { openMemoryDb, upsertMemory, searchMemories } from '../lib/db.mjs';

test('upsertMemory stores searchable memory records', () => {
  const db = openMemoryDb(':memory:');

  upsertMemory(db, {
    kind: 'fact',
    title: 'User prefers conservative startup injection',
    summary: 'Inject only short high-confidence memory briefs.',
    rawExcerpt: null,
    tags: ['preference'],
    contentHash: 'hash-1',
  });

  const results = searchMemories(db, 'conservative');

  assert.equal(results.length, 1);
  assert.equal(results[0].kind, 'fact');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test /Users/danielpenin/.codex/memories/codex-mem/test/db.test.mjs`
Expected: FAIL because the DB layer does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Code must:

- create `memories` plus FTS table;
- insert/update by `content_hash`;
- expose deterministic search results ordered by relevance and recency.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test /Users/danielpenin/.codex/memories/codex-mem/test/db.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/danielpenin/.codex/memories/codex-mem
git commit -m "feat: add codex memory database layer"
```

### Task 3: Implement redaction and memory normalization

**Files:**

- Create: `~/.codex/memories/codex-mem/lib/redact.mjs`
- Create: `~/.codex/memories/codex-mem/lib/normalize.mjs`
- Create: `~/.codex/memories/codex-mem/test/redact.test.mjs`
- Create: `~/.codex/memories/codex-mem/test/normalize.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitiveText } from '../lib/redact.mjs';

test('redactSensitiveText masks bearer tokens and jwt-like values', () => {
  const input = 'Authorization: Bearer secret-token abc.eyJhbGciOiJIUzI1NiJ9.xyz';
  const output = redactSensitiveText(input);

  assert.match(output, /\[REDACTED\]/);
  assert.ok(!output.includes('secret-token'));
});
```

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHistoryLine } from '../lib/normalize.mjs';

test('normalizeHistoryLine turns durable preference text into a fact record', () => {
  const record = normalizeHistoryLine({
    ts: 1775000000,
    text: 'User prefers conservative startup injection and global memory.',
    session_id: 'sess-1',
  });

  assert.equal(record.kind, 'fact');
  assert.match(record.summary, /conservative startup injection/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
`node --test /Users/danielpenin/.codex/memories/codex-mem/test/redact.test.mjs
/Users/danielpenin/.codex/memories/codex-mem/test/normalize.test.mjs`
Expected: FAIL because the modules do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Code must:

- mask secret-like substrings before persistence;
- classify normalized records into `fact`, `decision`, `episode`, `artifact`, or `raw_excerpt`;
- retain raw excerpts only when short and low-sensitivity.

- [ ] **Step 4: Run tests to verify they pass**

Run:
`node --test /Users/danielpenin/.codex/memories/codex-mem/test/redact.test.mjs
/Users/danielpenin/.codex/memories/codex-mem/test/normalize.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/danielpenin/.codex/memories/codex-mem
git commit -m "feat: add codex memory normalization and redaction"
```

### Task 4: Implement incremental ingestion from Codex history

**Files:**

- Create: `~/.codex/memories/codex-mem/lib/ingest-history.mjs`
- Create: `~/.codex/memories/codex-mem/lib/ingest-sessions.mjs`
- Create: `~/.codex/memories/codex-mem/lib/checkpoints.mjs`
- Create: `~/.codex/memories/codex-mem/test/ingest-history.test.mjs`
- Create: `~/.codex/memories/codex-mem/test/ingest-sessions.test.mjs`

- [ ] **Step 1: Write the failing tests**

Tests must prove:

- changed files are detected;
- duplicate content hashes do not create duplicate memory rows;
- session command records become searchable artifacts.

- [ ] **Step 2: Run tests to verify they fail**

Run:
`node --test /Users/danielpenin/.codex/memories/codex-mem/test/ingest-history.test.mjs
/Users/danielpenin/.codex/memories/codex-mem/test/ingest-sessions.test.mjs`
Expected: FAIL because ingestion modules do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Code must:

- scan `~/.codex/history.jsonl`;
- scan `~/.codex/sessions/**/*.jsonl`;
- track checkpoints by file path, mtime, and size;
- normalize and upsert records into the DB.

- [ ] **Step 4: Run tests to verify they pass**

Run:
`node --test /Users/danielpenin/.codex/memories/codex-mem/test/ingest-history.test.mjs
/Users/danielpenin/.codex/memories/codex-mem/test/ingest-sessions.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/danielpenin/.codex/memories/codex-mem
git commit -m "feat: add incremental codex history ingestion"
```

### Task 5: Build search, timeline, and startup brief ranking

**Files:**

- Create: `~/.codex/memories/codex-mem/lib/rank.mjs`
- Create: `~/.codex/memories/codex-mem/lib/brief.mjs`
- Create: `~/.codex/memories/codex-mem/test/search.test.mjs`
- Create: `~/.codex/memories/codex-mem/test/brief.test.mjs`

- [ ] **Step 1: Write the failing tests**

Tests must prove:

- high-sensitivity items are excluded from startup briefs;
- startup briefs include only short sections;
- query + cwd matching promotes relevant items.

- [ ] **Step 2: Run tests to verify they fail**

Run:
`node --test /Users/danielpenin/.codex/memories/codex-mem/test/search.test.mjs
/Users/danielpenin/.codex/memories/codex-mem/test/brief.test.mjs`
Expected: FAIL because ranking modules do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Code must:

- compute confidence from query/cwd/tag overlap;
- produce at most a small conservative brief payload;
- expose plain search and timeline helpers for manual retrieval.

- [ ] **Step 4: Run tests to verify they pass**

Run:
`node --test /Users/danielpenin/.codex/memories/codex-mem/test/search.test.mjs
/Users/danielpenin/.codex/memories/codex-mem/test/brief.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/danielpenin/.codex/memories/codex-mem
git commit -m "feat: add codex memory retrieval and brief ranking"
```

### Task 6: Expose the local HTTP service and auto-start flow

**Files:**

- Modify: `~/.codex/memories/codex-mem/server.mjs`
- Create: `~/.codex/memories/codex-mem/lib/http.mjs`
- Create: `~/.codex/memories/codex-mem/test/server.test.mjs`

- [ ] **Step 1: Write the failing test**

Tests must prove these endpoints respond:

- `GET /health`
- `POST /admin/reindex`
- `GET /memory/search`
- `GET /memory/timeline`
- `GET /memory/brief`

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test /Users/danielpenin/.codex/memories/codex-mem/test/server.test.mjs`
Expected: FAIL because the server routes are incomplete.

- [ ] **Step 3: Write minimal implementation**

Code must:

- initialize the DB;
- run an initial ingest on startup;
- serve JSON endpoints on localhost;
- support background execution from the bootstrap skill.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test /Users/danielpenin/.codex/memories/codex-mem/test/server.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/danielpenin/.codex/memories/codex-mem
git commit -m "feat: add codex memory local http service"
```

### Task 7: Install the global bootstrap, search, and admin skills

**Files:**

- Create: `~/.agents/skills/codex-memory-bootstrap/SKILL.md`
- Create: `~/.agents/skills/codex-memory-search/SKILL.md`
- Create: `~/.agents/skills/codex-memory-admin/SKILL.md`

- [ ] **Step 1: Write the failing verification**

Verification goal:

- skill folders exist;
- bootstrap skill clearly says it runs at the start of any conversation;
- search/admin skills map to the local service endpoints.

- [ ] **Step 2: Run verification to confirm absence**

Run:
`find /Users/danielpenin/.agents/skills -maxdepth 2 -type f | rg
'codex-memory-(bootstrap|search|admin)'`
Expected: no matches before creation.

- [ ] **Step 3: Write minimal implementation**

Each skill must:

- be concise;
- reference the local service under `~/.codex/memories/codex-mem/`;
- use conservative retrieval;
- never inject anything when confidence is low.

- [ ] **Step 4: Run verification to confirm install**

Run:
`find /Users/danielpenin/.agents/skills -maxdepth 2 -type f | rg
'codex-memory-(bootstrap|search|admin)'`
Expected: all three skills present.

- [ ] **Step 5: Commit**

```bash
git add /Users/danielpenin/.agents/skills
git commit -m "feat: install codex global memory skills"
```

### Task 8: Rebuild from real Codex history and smoke test a startup brief

**Files:**

- Modify: `~/.codex/memories/codex-mem/` as needed from verification findings

- [ ] **Step 1: Run full rebuild**

Run: `node /Users/danielpenin/.codex/memories/codex-mem/server.mjs --reindex-once`
Expected: existing Codex history is indexed into the database without crashes.

- [ ] **Step 2: Run service health check**

Run: `curl -sS http://127.0.0.1:37777/health`
Expected: JSON with `ok: true`

- [ ] **Step 3: Run manual search smoke test**

Run: `curl -sS 'http://127.0.0.1:37777/memory/search?q=whatsapp&limit=5'`
Expected: at least one relevant result from prior Codex history.

- [ ] **Step 4: Run startup brief smoke test**

Run:
`curl -sS 'http://127.0.0.1:37777/memory/brief?cwd=/Users/danielpenin/whatsapp_saas&q=continuar%20trabalho%20anterior'`
Expected: a short JSON payload with compact sections or an explicit low-confidence no-brief
response.

- [ ] **Step 5: Commit**

```bash
git add /Users/danielpenin/.codex/memories/codex-mem /Users/danielpenin/.agents/skills
git commit -m "feat: ship codex global memory runtime"
```
