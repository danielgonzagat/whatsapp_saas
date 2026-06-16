#!/usr/bin/env node
// launcher-immortality.proof.mjs — proves the atomic-edit MCP entry chain
// survives every "agent broke it" scenario without the host ever seeing the
// server go away. Runs against a SANDBOXED CLONE of the launch chain (never
// the live tree): bootstrap + impl + supervisor + a copy of dist, with
// dist-freshness/build stubbed so only supervision mechanics are under test
// (freshness/build behavior is owned by mcp-launcher-host-boundary.proof.mjs).
//
// Scenarios:
//   1. healthy boot through bootstrap→supervisor→impl→server; blessing seeds
//   2. SIGKILL of the live server mid-session → respawn + handshake replay
//   3. impl replaced by a failing script → blessed copy restored, real server back
//   4. impl unparseable + blessed gone + dist deleted → dist-lkg restore serves
//   5. apocalypse (impl+blessed+dist+lkg gone) → rescue tools answer; repair +
//      atomic_rescue_retry brings the real server back in the SAME session
//   6. refusal contract: host-marked env without broker socket still exits 80
//   7. corrupted bootstrap is self-healed by a live supervisor's integrity sweep

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // atomic-edit
const scriptsMcpDir = path.resolve(sourceDir, '..');

const CLONE_ROOT = path.join(sourceDir, `probe-gate-immortality-${process.pid}`);
const C = {
  root: CLONE_ROOT,
  scriptsMcp: path.join(CLONE_ROOT, 'scripts', 'mcp'),
  src: path.join(CLONE_ROOT, 'scripts', 'mcp', 'atomic-edit'),
  bootstrap: path.join(CLONE_ROOT, 'scripts', 'mcp', 'atomic-edit-mcp-launcher.sh'),
  impl: path.join(CLONE_ROOT, 'scripts', 'mcp', 'atomic-edit-mcp-launcher-impl.sh'),
  supervisor: path.join(CLONE_ROOT, 'scripts', 'mcp', 'atomic-edit', 'launcher-supervisor.mjs'),
  dist: path.join(CLONE_ROOT, 'scripts', 'mcp', 'atomic-edit', 'dist'),
  lkg: path.join(CLONE_ROOT, 'scripts', 'mcp', 'atomic-edit', 'dist-lkg'),
  blessed: path.join(CLONE_ROOT, 'scripts', 'mcp', 'atomic-edit', 'launcher-blessed'),
  atomic: path.join(CLONE_ROOT, '.atomic'),
};

function record(results, name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
  if (!jsonMode) process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name}\n`);
}

function buildClone() {
  fs.rmSync(CLONE_ROOT, { recursive: true, force: true });
  fs.mkdirSync(C.src, { recursive: true });
  fs.copyFileSync(path.join(scriptsMcpDir, 'atomic-edit-mcp-launcher.sh'), C.bootstrap);
  fs.copyFileSync(path.join(scriptsMcpDir, 'atomic-edit-mcp-launcher-impl.sh'), C.impl);
  fs.chmodSync(C.bootstrap, 0o755);
  fs.chmodSync(C.impl, 0o755);
  fs.copyFileSync(path.join(sourceDir, 'launcher-supervisor.mjs'), C.supervisor);
  for (const helper of ['atomic-exec-broker.mjs', 'atomic-exec-broker-client.mjs']) {
    fs.copyFileSync(path.join(sourceDir, helper), path.join(C.src, helper));
  }
  fs.cpSync(path.join(sourceDir, 'dist'), C.dist, { recursive: true });
  // stubs: freshness always passes, build always fails — supervision only
  fs.writeFileSync(path.join(C.src, 'dist-freshness.mjs'), 'process.exit(0);\n');
  fs.writeFileSync(path.join(C.src, 'build.mjs'), 'console.error("clone build stub: refusing"); process.exit(1);\n');
  fs.symlinkSync(path.join(sourceDir, 'node_modules'), path.join(C.src, 'node_modules'));
}

function cloneEnv(extra = {}) {
  return {
    ...process.env,
    ATOMIC_SINGLE_TOOL_CALL: '', ATOMIC_SINGLE_TOOL_NAME: '', ATOMIC_SINGLE_TOOL_ARGS_JSON: '',
    ATOMIC_HOST_SANDBOX: '', ATOMIC_HOST_ATOMIC_ONLY: '', ATOMIC_HOST_WRITE_ROOT: '',
    ATOMIC_EXEC_BROKER_SOCKET: '',
    // explicit degraded-mode admission, mirroring the host MCP registrations
    // (the strict impl refuses self-hosting without it)
    ATOMIC_EDIT_MCP_SELF_HOSTED: '1', ATOMIC_EDIT_ALLOW_SELF_HOSTED: '1',
    CODEX_PROJECT_DIR: '', TMPDIR: '', TMP: '', TEMP: '',
    ATOMIC_SUPERVISOR_INTEGRITY_INTERVAL_MS: '400',
    ATOMIC_SUPERVISOR_BOOT_TIMEOUT_MS: '45000',
    ...extra,
  };
}

async function connect(extraEnv = {}) {
  const transport = new StdioClientTransport({
    command: C.bootstrap, args: [], cwd: CLONE_ROOT, stderr: 'pipe', env: cloneEnv(extraEnv),
  });
  const client = new Client({ name: 'launcher-immortality-proof', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readSupervisorState() {
  try {
    const entries = fs.readdirSync(C.atomic).filter((n) => /^supervisor-state-\d+\.json$/.test(n));
    let newest = null;
    for (const n of entries) {
      const full = path.join(C.atomic, n);
      const mtime = fs.statSync(full).mtimeMs;
      if (!newest || mtime > newest.mtime) newest = { full, mtime };
    }
    return newest ? JSON.parse(fs.readFileSync(newest.full, 'utf8')) : null;
  } catch { return null; }
}

const hasFullTools = (listed) =>
  (listed.tools?.length ?? 0) >= 50 && listed.tools.some((t) => t.name === 'atomic_y_certificate');

async function main() {
  const results = [];
  buildClone();
  try {
    // 1 — healthy boot + blessing seeds
    {
      const client = await connect();
      try {
        const listed = await client.listTools();
        record(results, 'healthy clone boots the real server through bootstrap→supervisor→impl', hasFullTools(listed), { tools: listed.tools?.length });
        await sleep(300);
        record(
          results,
          'first healthy handshake seeds blessed copies and dist-lkg',
          fs.existsSync(path.join(C.blessed, 'atomic-edit-mcp-launcher-impl.sh')) &&
            fs.existsSync(path.join(C.blessed, 'launcher-supervisor.mjs')) &&
            fs.existsSync(path.join(C.lkg, 'server.js')),
          { blessed: fs.existsSync(C.blessed), lkg: fs.existsSync(C.lkg) },
        );

        // 2 — SIGKILL the live server mid-session, same client keeps working
        const state = readSupervisorState();
        let respawned = false;
        if (state?.serverPid) {
          try { process.kill(state.serverPid, 'SIGKILL'); } catch { /* already gone */ }
          await sleep(400);
          const relisted = await client.listTools();
          respawned = hasFullTools(relisted);
        }
        record(results, 'SIGKILL of the live server is invisible: same session keeps serving (respawn + handshake replay)', respawned, { serverPid: state?.serverPid });

        // 7 — corrupted bootstrap self-heals via the live supervisor integrity sweep
        fs.writeFileSync(C.bootstrap, 'if [[ ; then fi\n');
        let healed = false;
        for (let i = 0; i < 20; i += 1) {
          await sleep(400);
          const r = childProcess.spawnSync('/bin/bash', ['-n', C.bootstrap], { timeout: 5000 });
          if (r.status === 0) { healed = true; break; }
        }
        record(results, 'corrupted bootstrap is auto-restored by a live supervisor within seconds', healed, {});

        // 7b — parseable-but-INERT bootstrap (exit 0, no supervisor exec) must
        // also be detected and restored: "parses fine" is not "healthy".
        fs.writeFileSync(C.bootstrap, '#!/usr/bin/env bash\nexit 0\n');
        let healedInert = false;
        for (let i = 0; i < 20; i += 1) {
          await sleep(400);
          try {
            if (fs.readFileSync(C.bootstrap, 'utf8').includes('launcher-supervisor.mjs')) { healedInert = true; break; }
          } catch { /* mid-rename */ }
        }
        record(results, 'parseable-but-inert bootstrap (exit 0) is detected and restored by the integrity sweep', healedInert, {});
      } finally {
        try { await client.close(); } catch { /* best effort */ }
      }
    }

    // 3 — impl replaced by an exiting script → blessed restore brings real server back
    {
      fs.writeFileSync(C.impl, '#!/bin/bash\nexit 7\n');
      fs.chmodSync(C.impl, 0o755);
      const client = await connect();
      try {
        const listed = await client.listTools();
        const implText = fs.readFileSync(C.impl, 'utf8');
        const implRestored = !/^exit 7$/m.test(implText);
        record(
          results,
          'impl sabotaged with a crashing script: blessed copy restored, real server serves anyway',
          hasFullTools(listed) && implRestored,
          { tools: listed.tools?.length, implRestored },
        );
      } finally {
        try { await client.close(); } catch { /* best effort */ }
      }
    }

    // 8 — poisoned blessed impl must NOT be restored over the live impl
    // (fingerprint mismatch), and the sweep quarantines it
    {
      fs.writeFileSync(path.join(C.blessed, 'atomic-edit-mcp-launcher-impl.sh'), '#!/bin/bash\nexit 1\n');
      fs.writeFileSync(C.impl, '#!/bin/bash\nexit 7\n');
      fs.chmodSync(C.impl, 0o755);
      const client = await connect();
      try {
        const listed = await client.listTools();
        const implText = fs.readFileSync(C.impl, 'utf8');
        const poisonInstalled = /^exit 1$/m.test(implText);
        await sleep(1200);
        const blessedQuarantined = !fs.existsSync(path.join(C.blessed, 'atomic-edit-mcp-launcher-impl.sh'));
        record(
          results,
          'poisoned blessed impl is refused (fingerprint mismatch), quarantined, and the session still serves',
          hasFullTools(listed) && !poisonInstalled && blessedQuarantined,
          { tools: listed.tools?.length, poisonInstalled, blessedQuarantined },
        );
      } finally {
        try { await client.close(); } catch { /* best effort */ }
      }
    }

    // 9 — poisoned dist-lkg must NOT clobber a healthy dist
    {
      fs.writeFileSync(path.join(C.lkg, 'server.js'), 'process.exit(1);\n');
      // impl unparseable and blessed impl gone (quarantined in 8) → ladder
      // reaches the lkg stage while dist is still healthy
      fs.writeFileSync(C.impl, 'if [[ ; then fi\n');
      const distServerBefore = fs.readFileSync(path.join(C.dist, 'server.js'));
      const client = await connect();
      try {
        const listed = await client.listTools();
        const distServerAfter = fs.readFileSync(path.join(C.dist, 'server.js'));
        record(
          results,
          'poisoned dist-lkg is refused by its integrity manifest: healthy dist preserved and served directly',
          hasFullTools(listed) && Buffer.compare(distServerBefore, distServerAfter) === 0,
          { tools: listed.tools?.length, distIntact: Buffer.compare(distServerBefore, distServerAfter) === 0 },
        );
      } finally {
        try { await client.close(); } catch { /* best effort */ }
      }
    }

    // re-seed the armor (healthy impl back, fresh bless + lkg snapshot) for
    // the destructive scenarios below
    {
      fs.copyFileSync(path.join(scriptsMcpDir, 'atomic-edit-mcp-launcher-impl.sh'), C.impl);
      fs.chmodSync(C.impl, 0o755);
      fs.rmSync(C.lkg, { recursive: true, force: true });
      const client = await connect();
      try {
        await client.listTools();
        await sleep(300);
      } finally {
        try { await client.close(); } catch { /* best effort */ }
      }
    }

    // 6 — security refusal still propagates through the chain (exit 80)
    {
      const refuse = childProcess.spawnSync(C.bootstrap, [], {
        cwd: CLONE_ROOT, encoding: 'utf8', timeout: 20000,
        env: cloneEnv({
          ATOMIC_HOST_SANDBOX: 'macos-sandbox-exec', ATOMIC_HOST_ATOMIC_ONLY: '1',
          ATOMIC_HOST_WRITE_ROOT: CLONE_ROOT, ATOMIC_EXEC_BROKER_SOCKET: '',
          ATOMIC_EDIT_MCP_SELF_HOSTED: '', ATOMIC_EDIT_ALLOW_SELF_HOSTED: '',
        }),
      });
      record(
        results,
        'host-marked env without broker socket still refuses with designed exit 80',
        refuse.status === 80 && /ATOMIC_EXEC_BROKER_SOCKET/.test(refuse.stderr ?? ''),
        { status: refuse.status },
      );
    }

    // 4 — impl unparseable + blessed gone + dist deleted → dist-lkg serves
    {
      fs.writeFileSync(C.impl, 'if [[ ; then fi\n');
      fs.rmSync(C.blessed, { recursive: true, force: true });
      fs.rmSync(C.dist, { recursive: true, force: true });
      const client = await connect();
      try {
        const listed = await client.listTools();
        record(
          results,
          'impl unparseable + no blessed + dist deleted: dist-lkg restore still serves the real server',
          hasFullTools(listed),
          { tools: listed.tools?.length },
        );
      } finally {
        try { await client.close(); } catch { /* best effort */ }
      }
    }

    // 5 — apocalypse → rescue answers; in-session repair + retry recovers
    {
      fs.writeFileSync(C.impl, 'if [[ ; then fi\n');
      fs.rmSync(C.blessed, { recursive: true, force: true });
      fs.rmSync(C.dist, { recursive: true, force: true });
      fs.rmSync(C.lkg, { recursive: true, force: true });
      fs.rmSync(`${C.dist}.broken-last`, { recursive: true, force: true });
      const client = await connect();
      try {
        const listed = await client.listTools();
        const rescueToolsOnly = listed.tools?.some((t) => t.name === 'atomic_rescue_status');
        let statusOk = false;
        if (rescueToolsOnly) {
          const status = await client.callTool({ name: 'atomic_rescue_status', arguments: {} });
          const text = status.content?.[0]?.text ?? '';
          statusOk = text.includes('"mode": "rescue"') || text.includes('"mode":"rescue"');
        }
        record(results, 'apocalypse (impl+blessed+dist+lkg gone): rescue mode answers initialize/tools with diagnostics', rescueToolsOnly && statusOk, { tools: listed.tools?.map((t) => t.name) });

        // repair in place, then recover within the SAME session
        fs.copyFileSync(path.join(scriptsMcpDir, 'atomic-edit-mcp-launcher-impl.sh'), C.impl);
        fs.chmodSync(C.impl, 0o755);
        fs.cpSync(path.join(sourceDir, 'dist'), C.dist, { recursive: true });
        const retry = await client.callTool({ name: 'atomic_rescue_retry', arguments: {} });
        await sleep(800);
        const relisted = await client.listTools();
        record(
          results,
          'after in-place repair, atomic_rescue_retry resurrects the real server in the same session',
          retry.isError !== true && hasFullTools(relisted),
          { tools: relisted.tools?.length },
        );
      } finally {
        try { await client.close(); } catch { /* best effort */ }
      }
    }
  } finally {
    fs.rmSync(CLONE_ROOT, { recursive: true, force: true });
  }

  return { ok: results.every((entry) => entry.ok), results };
}

main().then((result) => {
  if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(result.ok ? 0 : 1);
}).catch((error) => {
  process.stderr.write((error instanceof Error ? error.stack ?? error.message : String(error)) + '\n');
  try { fs.rmSync(CLONE_ROOT, { recursive: true, force: true }); } catch { /* cleanup */ }
  process.exit(1);
});
