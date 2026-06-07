#!/usr/bin/env node
/**
 * atomic — the proof-chain CLI. "Semantic git for agents": every Atomic OS
 * mutation leaves a tamper-evident, content-addressed trace in .atomic/traces/,
 * chained through .atomic/HEAD. This CLI reads that chain.
 *
 *   atomic verify [<opId>|--head]   recompute the chain hash + check the file is still in the recorded state
 *   atomic explain <opId>           human-readable: intention, proof, char diff, gate verdict
 *   atomic log [-n N]               walk the proof chain newest -> oldest
 *   atomic compare                  run AtomicBench (atomic vs line/file rewrite)
 *   atomic replay|undo <opId>       (see note) traces are PROOF, not content snapshots
 *
 * Honest by construction: verify recomputes the SAME chain hash the engine wrote
 * (parentSha256 ‖ afterSha256 ‖ canonicalJSON(gateVerdict)); tamper with any of
 * the three and it stops matching. No content is invented.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// #1 Proof-Carrying Edits — RE-EXEC core, imported from the COMPILED dist/ (the same
// engine.validate + Merkle/seal logic the producer used to BUILD the proof; there is no
// drift-prone second re-implementation). Lazy + memoized: only `prove`/`verify-proof
// --reexec` need it, and a missing/stale dist degrades to the hash-only path with an
// honest note rather than crashing the whole CLI.
let _reexecMod = null;
async function loadReexec() {
  if (_reexecMod) return _reexecMod;
  const candidate = path.join(here, 'dist', 'engine-proof-reexec.js');
  if (!fs.existsSync(candidate)) return null;
  try {
    _reexecMod = await import(pathToFileURL(candidate).href);
    return _reexecMod;
  } catch {
    return null;
  }
}

// Ordered list of every op afterSha256 in chain order (genesis → HEAD) — the Merkle
// leaves the session snapshot commits to. Walks parentSha256 ← chainHash links so the
// order is the canonical chain order, not readdir order.
function sessionAfterLeaves() {
  const traces = allTraces();
  const byChain = new Map(traces.map((t) => [t.chainHash, t]));
  // Find the chain head: a chainHash that is no other trace's parent. Fall back to HEAD.
  const parents = new Set(traces.map((t) => t.parentSha256).filter(Boolean));
  let head = headChain();
  if (!head || !byChain.has(head)) {
    const tip = traces.find((t) => !parents.has(t.chainHash));
    head = tip ? tip.chainHash : '';
  }
  // Walk backward from head to genesis, then reverse to genesis→head order.
  const order = [];
  let cur = head;
  const guard = new Set();
  while (cur && byChain.has(cur) && !guard.has(cur)) {
    guard.add(cur);
    const t = byChain.get(cur);
    order.push(t);
    cur = t.parentSha256;
  }
  order.reverse();
  return order.map((t) => t.afterSha256);
}

// EXACT replica of trace.ts canonicalJSON — sorted keys at every depth, undefined->null.
function canonicalJSON(value) {
  const norm = (v) => {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) return v.map(norm);
    if (typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = norm(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(norm(value));
}
const chainHashOf = (parent, after, gateVerdict) => sha256(`${parent}‖${after}‖${canonicalJSON(gateVerdict)}`);

function repoRoot(start = process.cwd()) {
  let d = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(d, '.atomic', 'traces'))) return d;
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) return path.resolve(start);
    d = up;
  }
}
function tracesDir() { return path.join(repoRoot(), '.atomic', 'traces'); }
function headChain() {
  const h = path.join(repoRoot(), '.atomic', 'HEAD');
  return fs.existsSync(h) ? fs.readFileSync(h, 'utf8').trim() : '';
}
function allTraces() {
  const td = tracesDir();
  if (!fs.existsSync(td)) return [];
  return fs.readdirSync(td).filter((f) => f.endsWith('.json')).map((f) => {
    try { return JSON.parse(fs.readFileSync(path.join(td, f), 'utf8')); } catch { return null; }
  }).filter(Boolean);
}
function loadTrace(opId) {
  const td = tracesDir();
  const direct = path.join(td, `${opId}.json`);
  if (fs.existsSync(direct)) return JSON.parse(fs.readFileSync(direct, 'utf8'));
  return allTraces().find((t) => t.operationId === opId) || null;
}
function headTrace() {
  const head = headChain();
  if (!head) return null;
  return allTraces().find((t) => t.chainHash === head) || null;
}
const die = (m) => { console.error(m); process.exit(1); };

function cmdVerify(arg) {
  const t = !arg || arg === '--head' ? headTrace() : loadTrace(arg);
  if (!t) die(`no trace found for ${arg || '(HEAD)'} under ${tracesDir()}`);
  const recomputed = chainHashOf(t.parentSha256 ?? '', t.afterSha256, t.gateVerdict);
  const chainOk = recomputed === t.chainHash;
  let fileState = 'unknown';
  const abs = t.repoRoot ? path.join(t.repoRoot, t.file) : path.join(repoRoot(), t.file);
  if (fs.existsSync(abs)) {
    const onDisk = sha256(fs.readFileSync(abs, 'utf8'));
    fileState = onDisk === t.afterSha256 ? 'matches the recorded afterSha256 (unchanged since)' : 'CHANGED since this op (later edits or external change)';
  } else if (t.changed) fileState = 'file no longer exists';
  console.log(`op        ${t.operationId}`);
  console.log(`operator  ${t.operator}  ·  file ${t.file}`);
  console.log(`chain     ${chainOk ? 'OK — tamper-evident hash recomputes' : 'TAMPERED — recomputed hash != recorded chainHash'}`);
  console.log(`          chainHash=${t.chainHash}`);
  console.log(`          parent  =${t.parentSha256 || '(genesis)'}`);
  console.log(`file      ${fileState}`);
  console.log(`verdict   ${chainOk ? 'VERIFIED' : 'FAILED'}`);
  process.exit(chainOk ? 0 : 2);
}

function cmdExplain(opId) {
  if (!opId) die('usage: atomic explain <opId>');
  const t = loadTrace(opId);
  if (!t) die(`no trace for ${opId}`);
  const a = t.audit || {};
  const m = t.metrics || {};
  const be = t.byteEffect || {};
  console.log(`# ${t.operationId}`);
  console.log(`when        ${t.ts}`);
  console.log(`operator    ${t.operator}  (target: ${t.targetUnit})`);
  console.log(`file        ${t.file}`);
  console.log(`intention   ${t.intention || '(none recorded)'}`);
  console.log('');
  console.log(`what changed   ${a.whatChanged ?? t.semanticImpact ?? ''}`);
  console.log(`what preserved ${a.whatPreserved ?? ''}`);
  console.log(`how to verify  ${a.howToValidate ?? ''}`);
  console.log(`NOT proven     ${a.notProven ?? ''}`);
  console.log(`trust          promiseClass=${a.promiseClass ?? '?'} · zeroCodeTrust=${a.zeroCodeTrust ?? '?'}`);
  console.log('');
  console.log(`bytes          before=${be.beforeBytes} after=${be.currentAfterBytes ?? be.proposedBytes} (+${be.addedBytes}/-${be.removedBytes}, net ${be.netBytes})`);
  if (m.expansionFactorAvoided !== undefined) console.log(`expansion      intention=${m.intentionChars ?? '?'} chars vs line-surface=${m.lineRewriteSurfaceChars ?? '?'} (avoided ${m.expansionFactorAvoided}x)`);
  console.log(`syntax         before=${t.validation?.syntaxErrorsBefore} after=${t.validation?.syntaxErrorsAfter} (${t.validation?.language})`);
  if (t.negativeActionProof) console.log(`neg-byte proof ${t.negativeActionProof.verdict} — ${String(t.negativeActionProof.proof || '').slice(0, 120)}`);
  console.log(`gate verdict   ${t.gateVerdict ? (t.gateVerdict.didBlock ? 'BLOCKED' : 'admitted (green)') : '(none)'}`);
  console.log('');
  if (t.inlinePreview) console.log(t.inlinePreview.replace(/\[[0-9;]*m/g, ''));
  process.exit(0);
}

function cmdLog(n) {
  const limit = n || 20;
  const byChain = new Map(allTraces().map((t) => [t.chainHash, t]));
  let cur = headChain();
  let i = 0;
  if (!cur) { console.log('(empty proof chain — no .atomic/HEAD)'); process.exit(0); }
  console.log(`proof chain @ ${repoRoot()}/.atomic  (newest first)\n`);
  while (cur && i < limit) {
    const t = byChain.get(cur);
    if (!t) { console.log(`  ${cur.slice(0, 12)}  (missing trace — chain truncated)`); break; }
    const be = t.byteEffect || {};
    console.log(`  ${t.chainHash.slice(0, 12)}  ${t.ts}  ${t.operator.padEnd(22)} ${t.file}  (+${be.addedBytes ?? '?'}/-${be.removedBytes ?? '?'})`);
    cur = t.parentSha256;
    i++;
  }
  if (cur) console.log(`  …${cur.slice(0, 12)} (genesis or older)`);
  process.exit(0);
}

function cmdCompare() {
  const r = spawnSync(process.execPath, [path.join(here, 'bench.mjs')], { stdio: 'inherit' });
  process.exit(r.status ?? 0);
}

// ── atomic init — detect the repo and generate plug-and-play governance config ──
function detectRepo(root) {
  const has = (f) => fs.existsSync(path.join(root, f));
  const exts = new Set();
  const walk = (d, depth) => {
    if (depth > 2) return;
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else { const x = path.extname(e.name).toLowerCase(); if (x) exts.add(x); }
    }
  };
  walk(root, 0);
  const langs = [];
  const map = { '.py': 'Python', '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.rb': 'Ruby', '.c': 'C', '.h': 'C', '.cc': 'C++', '.cpp': 'C++', '.sh': 'Bash' };
  for (const [x, l] of Object.entries(map)) if (exts.has(x) && !langs.includes(l)) langs.push(l);
  let pkg = 'unknown', test = null;
  if (has('package.json')) {
    pkg = 'npm';
    try { test = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts?.test ? 'npm test' : null; } catch { /* ignore */ }
  } else if (has('go.mod')) { pkg = 'go'; test = 'go test ./...'; }
  else if (has('Cargo.toml')) { pkg = 'cargo'; test = 'cargo test'; }
  else if (has('pyproject.toml') || has('requirements.txt') || has('setup.py')) { pkg = 'python'; test = 'pytest'; }
  else if (has('pom.xml')) { pkg = 'maven'; test = 'mvn test'; }
  return { langs, pkg, test, ci: has('.github/workflows'), git: has('.git') };
}

function cmdInit() {
  const force = process.argv.includes('--force');
  const root = repoRoot();
  const info = detectRepo(root);
  const created = [], skipped = [];
  const writeIf = (rel, content) => {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs) && !force) { skipped.push(rel); return; }
    fs.writeFileSync(abs, content);
    created.push(rel);
  };

  const protectedCfg = {
    files: ['CLAUDE.md', 'AGENTS.md', 'atomic-edit.protected.json', ...(info.ci ? ['.github/workflows'] : [])],
    globs: ['**/*.key', '**/*.pem', '**/.env*', '**/secrets*', '**/*.lock', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'Cargo.lock', 'go.sum'],
  };
  writeIf('atomic-edit.protected.json', JSON.stringify(protectedCfg, null, 2) + '\n');

  const rules = [
    '# Atomic OS — agent operating rules (generated by `atomic init`)',
    '',
    `Repo: ${info.langs.join(', ') || 'unknown'} · package manager: ${info.pkg}${info.test ? ` · tests: \`${info.test}\`` : ''}`,
    '',
    '- **Edit only through the atomic-edit MCP tools.** The coarse editor (full-file /',
    '  whole-line Write/Edit, raw `sed`/overwrite) is banned for code.',
    '- **Smallest faithful change.** Edit by content/anchor, never by line/column.',
    '- **Byte-positivity:** removing/overwriting existing bytes needs a written',
    '  `proofOfIncorrectness` (≥20 chars). Additive, correctness-increasing edits flow freely.',
    '- **Multi-file = one transaction** (`atomic_transaction`); long work = a named',
    '  session (`atomic_session_begin` → … → `atomic_session_commit`/`rollback`).',
    info.test ? `- **Validate by the product:** after a change, run \`${info.test}\` and confirm green.` : '- **Validate by the product:** run the test suite and confirm green after a change.',
    '- **Protected paths** in `atomic-edit.protected.json` are refused for all agents.',
    '- Inspect any change with `atomic verify <opId>` / `atomic explain <opId>`; audit the chain with `atomic log`.',
    '',
  ].join('\n');
  writeIf('atomic.agent-rules.md', rules);

  console.log(`atomic init @ ${root}`);
  console.log(`detected: ${info.langs.join(', ') || '(no source detected)'} · pkg=${info.pkg}${info.test ? ` · test="${info.test}"` : ''} · ci=${info.ci} · git=${info.git}`);
  console.log(created.length ? `created: ${created.join(', ')}` : 'created: (none)');
  if (skipped.length) console.log(`skipped (exists; use --force): ${skipped.join(', ')}`);
  console.log('\nnext: add the MCP server to your AI CLI —');
  console.log(JSON.stringify({ mcpServers: { 'atomic-edit': { command: 'bash', args: [path.join(here, 'atomic-edit-mcp-launcher.sh')] } } }, null, 2));
  console.log('\nthen review atomic-edit.protected.json + atomic.agent-rules.md and commit them.');
  process.exit(0);
}

// ── MCP trust firewall — capability manifest + tool-poisoning / rug-pull detection ──
function parseCmdFlag() {
  const i = process.argv.indexOf('--cmd');
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1].split(' ');
  return ['bash', path.join(here, 'atomic-edit-mcp-launcher.sh')]; // default: this server
}
function listToolsFromServer(cmd) {
  return new Promise((resolve, reject) => {
    const srv = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'ignore'] });
    let buf = ''; const waiters = new Map(); let done = false;
    const finish = (fn, arg) => { if (done) return; done = true; clearTimeout(to); try { srv.kill('SIGKILL'); } catch { /* noop */ } fn(arg); };
    const to = setTimeout(() => finish(reject, new Error('MCP server timed out (no tools/list)')), 30000);
    srv.on('error', (e) => finish(reject, e));
    srv.stdout.on('data', (d) => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!l.trim()) continue;
        let m; try { m = JSON.parse(l); } catch { continue; }
        if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
      }
    });
    const rpc = (id, method, params) => new Promise((r) => { waiters.set(id, r); srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
    (async () => {
      await rpc(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'atomic-mcp-guard', version: '1' } });
      srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      const l = await rpc(2, 'tools/list', {});
      finish(resolve, (l.result?.tools ?? []).map((t) => ({ name: t.name, description: t.description ?? '', inputSchema: t.inputSchema ?? {} })));
    })().catch((e) => finish(reject, e));
  });
}
function manifestOf(tools) {
  const m = {};
  for (const t of tools.slice().sort((a, b) => a.name.localeCompare(b.name))) {
    m[t.name] = sha256(`${t.name}\n${t.description}\n${canonicalJSON(t.inputSchema)}`);
  }
  return m;
}
const approvedPath = () => path.join(repoRoot(), '.atomic', 'mcp-approved.json');
async function cmdMcp(sub) {
  const cmd = parseCmdFlag();
  let tools;
  try { tools = await listToolsFromServer(cmd); } catch (e) { die(`could not list tools from [${cmd.join(' ')}]: ${e.message}`); }
  const manifest = manifestOf(tools);
  if (sub === 'scan' || !sub) {
    console.log(`# capability manifest — ${tools.length} tools from [${cmd.join(' ')}]`);
    for (const [n, h] of Object.entries(manifest)) console.log(`${h.slice(0, 16)}  ${n}`);
    return process.exit(0);
  }
  if (sub === 'approve') {
    fs.mkdirSync(path.dirname(approvedPath()), { recursive: true });
    fs.writeFileSync(approvedPath(), JSON.stringify({ ts: new Date().toISOString(), count: tools.length, manifest }, null, 2) + '\n');
    console.log(`approved ${tools.length} tool descriptors -> ${approvedPath()}`);
    return process.exit(0);
  }
  if (sub === 'verify') {
    if (!fs.existsSync(approvedPath())) die(`no approved manifest at ${approvedPath()} — run \`atomic mcp approve\` first`);
    const approved = JSON.parse(fs.readFileSync(approvedPath(), 'utf8')).manifest || {};
    const added = [], removed = [], changed = [];
    for (const n of Object.keys(manifest)) { if (!(n in approved)) added.push(n); else if (approved[n] !== manifest[n]) changed.push(n); }
    for (const n of Object.keys(approved)) if (!(n in manifest)) removed.push(n);
    const clean = !added.length && !removed.length && !changed.length;
    console.log(`MCP trust verify — ${tools.length} tools vs approved (${Object.keys(approved).length})`);
    if (changed.length) console.log(`  CHANGED descriptor (tool-poisoning / schema-shadowing risk): ${changed.join(', ')}`);
    if (added.length) console.log(`  ADDED unapproved tool (parasitic chaining risk): ${added.join(', ')}`);
    if (removed.length) console.log(`  REMOVED tool (rug-pull risk): ${removed.join(', ')}`);
    console.log(`  trust: ${clean ? 'GREEN — every tool descriptor matches the approved manifest' : 'RED — descriptor drift; review before trusting this server'}`);
    return process.exit(clean ? 0 : 2);
  }
  die('usage: atomic mcp <scan|approve|verify> [--cmd "<server command>"]');
}

// ── product-intent gate — did the change stay within the declared intent? ──
function globToRe(g) {
  const e = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, ' ').replace(/\*/g, '[^/]*').replace(/ /g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + e + '$');
}
const matchAny = (file, globs) => globs.some((g) => globToRe(g).test(file));

function cmdIntent(sub) {
  const root = repoRoot();
  const cfgP = path.join(root, 'atomic.intent.json');
  if (sub && sub !== 'check') die('usage: atomic intent check [--base <ref>] [--run]');
  if (!fs.existsSync(cfgP)) {
    die(`no atomic.intent.json at ${root}. Declare the intent, e.g.:\n` +
      JSON.stringify({ goal: 'improve PIX checkout', touch: ['src/checkout/**', 'src/payments/pix/**'], preserve: ['src/payments/card/**', 'src/affiliates/**', '**/*.lock'], verify: 'npm test' }, null, 2));
  }
  const cfg = JSON.parse(fs.readFileSync(cfgP, 'utf8'));
  const bi = process.argv.indexOf('--base');
  const base = bi >= 0 && process.argv[bi + 1] ? process.argv[bi + 1] : 'HEAD';
  const r = spawnSync('git', ['-C', root, 'diff', '--name-only', base], { encoding: 'utf8' });
  if (r.status !== 0) die('git diff failed (not a git repo, or bad base): ' + (r.stderr || '').trim().slice(0, 200));
  const changed = r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  const preserve = cfg.preserve || [], touch = cfg.touch || [];
  const violations = changed.filter((f) => matchAny(f, preserve));
  const outOfScope = touch.length ? changed.filter((f) => !matchAny(f, touch) && !violations.includes(f)) : [];
  const inScope = changed.filter((f) => !violations.includes(f) && !outOfScope.includes(f));
  console.log(`intent check @ ${root} (changed vs ${base})`);
  console.log(`goal: ${cfg.goal || '(none declared)'}`);
  console.log(`changed: ${changed.length} file(s) · in-scope: ${inScope.length}`);
  if (outOfScope.length) console.log(`  OUT-OF-SCOPE (not matched by touch[]): ${outOfScope.join(', ')}`);
  if (violations.length) console.log(`  PRESERVE VIOLATION (touched a protected path): ${violations.join(', ')}`);
  let verifyOk = true;
  if (cfg.verify && process.argv.includes('--run')) {
    const v = spawnSync('bash', ['-lc', cfg.verify], { cwd: root, stdio: 'inherit' });
    verifyOk = v.status === 0;
    console.log(`  verify ("${cfg.verify}"): ${verifyOk ? 'PASS' : 'FAIL'}`);
  }
  const ok = !violations.length && !outOfScope.length && verifyOk;
  console.log(`  verdict: ${ok ? 'GREEN — the change honored the declared product intent' : 'RED — the change drifted from the declared intent'}`);
  process.exit(ok ? 0 : 2);
}

// ── Proof-Carrying Edits — export a portable, independently-verifiable artifact ──
async function cmdProve(opId) {
  if (!opId) die('usage: atomic prove <opId>');
  const t = loadTrace(opId);
  if (!t) die(`no trace for ${opId}`);
  const artifact = {
    format: 'atomic-proof-carrying-edit/v1',
    operationId: t.operationId,
    ts: t.ts,
    file: t.file,
    operator: t.operator,
    intention: t.intention ?? null,
    parentSha256: t.parentSha256 ?? '',
    afterSha256: t.afterSha256,
    proposedSha256: t.proposedSha256 ?? null,
    byteEffect: t.byteEffect ?? null,
    validation: t.validation ?? null,
    negativeActionProof: t.negativeActionProof ?? null,
    gateVerdict: t.gateVerdict ?? null,
    audit: t.audit ?? null,
    chainHash: t.chainHash,
    verifier: 'atomic verify-proof <file> — recomputes sha256(parentSha256 ‖ afterSha256 ‖ canonicalJSON(gateVerdict)) and asserts it equals chainHash. No repo, no trust in the producer.',
  };

  // ── #1 Proof-Carrying Edits: embed the RE-EXECUTABLE proof body (re-exec snapshot +
  // Merkle inclusion + gateRunId + decision tree + seal) when the dist re-exec core is
  // available AND this op carries a content snapshot. The v1 hash-only fields above are
  // ALWAYS kept (back-compat); the re-exec body is strictly additive. A missing dist or
  // snapshot degrades honestly to a hash-only proof with a recorded reason.
  const rx = await loadReexec();
  if (!rx) {
    artifact.reexec = { available: false, reason: 'dist/engine-proof-reexec.js not built — hash-only proof (run the build, then re-run prove)' };
  } else if (!t.snapshotPath) {
    artifact.reexec = { available: false, reason: 'this op carries no content snapshot (.atomic/snapshots) — hash-only proof; only ops written with content can be re-executed' };
  } else {
    const snapAbs = t.repoRoot ? path.join(t.repoRoot, t.snapshotPath) : path.join(repoRoot(), t.snapshotPath);
    if (!fs.existsSync(snapAbs)) {
      artifact.reexec = { available: false, reason: `recorded snapshotPath ${t.snapshotPath} not found on disk — hash-only proof` };
    } else {
      let snap;
      try { snap = JSON.parse(fs.readFileSync(snapAbs, 'utf8')); } catch { snap = null; }
      const leaves = sessionAfterLeaves();
      const leafIndex = leaves.indexOf(t.afterSha256);
      if (!snap || leafIndex < 0) {
        artifact.reexec = { available: false, reason: 'snapshot unreadable or op afterSha256 absent from the session leaf set — hash-only proof' };
      } else {
        // Build the full re-exec body with the SAME core the verifier will re-run.
        const body = rx.buildReexecProofBody({
          snapshot: snap,
          sessionAfterLeaves: leaves,
          leafIndex,
          gateVerdict: t.gateVerdict ?? null,
          parentSha256: t.parentSha256 ?? '',
          chainHash: t.chainHash,
          validation: t.validation ?? null,
          preferEnvKey: process.env.ATOMIC_PROOF_SEAL_KEY ? true : false,
        });
        artifact.reexec = { available: true, ...body };
        artifact.verifierReexec = 'atomic verify-proof <file> --reexec — re-runs engine.validate(file, before, after) over the embedded snapshot and asserts the recorded verdict REPRODUCES; re-derives the Merkle root from the embedded leaf+path; recomputes the gateRunId; and re-checks the seal. No repo, no trust in the producer.';
      }
    }
  }

  const dir = path.join(repoRoot(), '.atomic', 'proofs');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${t.operationId}.proof.json`);
  fs.writeFileSync(out, JSON.stringify(artifact, null, 2) + '\n');
  console.log(`proof-carrying edit → ${out}`);
  console.log(`  chainHash ${t.chainHash}`);
  if (artifact.reexec?.available) {
    console.log(`  re-exec   embedded — snapshot + Merkle leaf ${artifact.reexec.merkle?.leafIndex}/${artifact.reexec.merkle?.leafCount} + gateRunId ${artifact.reexec.gateRunId} + seal (${artifact.reexec.seal?.keyId})`);
    console.log(`  re-execute anywhere (no repo needed): atomic verify-proof ${out} --reexec`);
  } else {
    console.log(`  re-exec   not embedded — ${artifact.reexec?.reason ?? 'unavailable'} (hash-only proof)`);
  }
  console.log(`  re-verify anywhere (no repo needed): atomic verify-proof ${out}`);
  process.exit(0);
}

async function cmdVerifyProof(file, reexec = false) {
  if (!file) die('usage: atomic verify-proof <proof.json> [--reexec]');
  if (!fs.existsSync(file)) die(`no such proof file: ${file}`);
  let a;
  try { a = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { die(`unreadable proof: ${e.message}`); }
  if (!a.chainHash || !a.afterSha256) die('not an atomic proof-carrying edit (missing chainHash / afterSha256)');
  const recomputed = chainHashOf(a.parentSha256 ?? '', a.afterSha256, a.gateVerdict ?? undefined);
  const ok = recomputed === a.chainHash;
  const gv = a.gateVerdict;
  console.log(`proof-carrying edit — ${a.operationId} (${a.operator} · ${a.file})`);
  console.log(`  intention   ${a.intention ?? '(none)'}`);
  console.log(`  chain       ${ok ? 'OK — recomputed hash matches the artifact (tamper-evident)' : 'TAMPERED — recomputed != recorded chainHash'}`);
  console.log(`  gates       ${gv ? (gv.didBlock ? 'BLOCKED' : 'admitted (green)') : '(no gate verdict captured)'}`);
  console.log(`  syntax      before=${a.validation?.syntaxErrorsBefore ?? '?'} after=${a.validation?.syntaxErrorsAfter ?? '?'}`);
  console.log(`  afterSha256 ${a.afterSha256}`);

  // ── #1 Proof-Carrying Edits: --reexec RE-EXECUTES the construction rather than only
  // re-hashing it. Four producer-untrusted checks over the embedded re-exec body:
  //   (1) re-run engine.validate(file, before, after) over the snapshot → verdict reproduces
  //   (2) re-derive the Merkle root from the embedded leaf + path → equals the claimed root
  //   (3) recompute the gateRunId from (verdict ‖ after ‖ parent) → equals the embedded id
  //   (4) recompute the seal over the canonical final-state body → equals the embedded mac
  // Plus prints the full per-gate decision tree carried in the body.
  let reexecOk = true;
  if (reexec) {
    const rx = await loadReexec();
    const body = a.reexec;
    if (!rx) {
      reexecOk = false;
      console.log(`  re-exec     UNAVAILABLE — dist/engine-proof-reexec.js not built on this verifier (run the build, then re-run --reexec)`);
    } else if (!body || body.available === false) {
      reexecOk = false;
      console.log(`  re-exec     ABSENT — this proof carries no re-executable body${body?.reason ? ` (${body.reason})` : ''}; only \`prove\` on a content-snapshotted op embeds it`);
    } else if (body.reexecVersion !== 'atomic-proof-reexec/v2') {
      reexecOk = false;
      console.log(`  re-exec     VERSION — unsupported re-exec body version ${body.reexecVersion ?? '(none)'}`);
    } else {
      // (1) re-exec engine.validate over the embedded before/after snapshot.
      const r = rx.reexecValidate(body.snapshot, a.validation ?? null, a.afterSha256);
      // (2) Merkle inclusion: re-derive the root from leaf + path, and bind to this op.
      const merkleOk = !!body.merkle && typeof body.merkle.leaf === 'string' && rx.verifyMerkleProof(body.merkle);
      const leafBinds = body.snapshot && rx.buildSnapshot(body.snapshot.file, body.snapshot.before, body.snapshot.after).afterSha256 === a.afterSha256;
      // (3) gateRunId recompute over the bound triple.
      const gateRunIdRecomputed = rx.gateRunIdOf(a.gateVerdict ?? null, a.afterSha256, a.parentSha256 ?? '');
      const gateRunIdOk = gateRunIdRecomputed === body.gateRunId;
      // (4) seal recompute over the canonical final-state body.
      const reexecBits = a.validation
        ? { language: r.recomputed.language, before: r.recomputed.before, after: r.recomputed.after, ok: r.recomputed.ok }
        : null;
      const sealRes = rx.verifySeal(
        { merkleRoot: body.merkle.root, leaf: body.merkle.leaf, gateRunId: body.gateRunId, chainHash: a.chainHash, reexec: reexecBits },
        body.seal,
      );
      reexecOk = r.reproduces && merkleOk && leafBinds && gateRunIdOk && sealRes.ok;
      console.log(`  re-exec     (1) validate  ${r.reproduces ? 'REPRODUCES — re-ran engine.validate; recorded verdict matches' : `DIVERGED — ${r.note}`}`);
      console.log(`              (2) merkle    ${merkleOk && leafBinds ? `root re-derived from leaf+path (member ${body.merkle.leafIndex}/${body.merkle.leafCount})` : 'FAILED — leaf/path does not re-derive the root, or leaf does not bind this op'}`);
      console.log(`              (3) gateRunId ${gateRunIdOk ? `recomputes (${body.gateRunId})` : 'FAILED — recomputed gateRunId != embedded'}`);
      console.log(`              (4) seal      ${sealRes.ok ? sealRes.note : `FAILED — ${sealRes.note}`}`);
      console.log(`  decision tree (${body.decisionTree?.length ?? 0} gate${(body.decisionTree?.length ?? 0) === 1 ? '' : 's'}):`);
      for (const n of body.decisionTree ?? []) {
        console.log(`    · ${n.gate.padEnd(24)} ${n.decision.toUpperCase().padEnd(12)} ${n.fact}${n.locus ? ` @ ${n.locus}` : ''}`);
      }
    }
  }

  const allOk = ok && reexecOk;
  console.log(`  verdict     ${allOk ? `VERIFIED — independently${reexec ? ' + RE-EXECUTED' : ''}, without the repo or trusting the producer` : 'FAILED'}`);
  process.exit(allOk ? 0 : 2);
}

// ── #4 Founder-facing continuous proof — aggregate per-op audit blocks into one report ──
function cmdFounder() {
  const traces = allTraces().sort((a, b) => (a.ts < b.ts ? -1 : 1));
  if (!traces.length) { console.log('(no edits recorded — empty .atomic/traces)'); process.exit(0); }
  const files = new Set();
  const notProven = [];
  const changed = [];
  let added = 0, removed = 0, minTrust = 100, blocked = 0;
  for (const t of traces) {
    files.add(t.file);
    const be = t.byteEffect || {};
    added += be.addedBytes || 0; removed += be.removedBytes || 0;
    const z = t.audit?.zeroCodeTrust;
    if (typeof z === 'number') minTrust = Math.min(minTrust, z);
    if (t.audit?.notProven) notProven.push(`${t.file}: ${t.audit.notProven}`);
    if (t.audit?.whatChanged) changed.push(`${t.file}: ${t.audit.whatChanged}`);
    if (t.gateVerdict?.didBlock) blocked += 1;
  }
  console.log('# Founder report — what changed in this product (no code required)');
  console.log(`edits: ${traces.length} · files touched: ${files.size} · bytes +${added}/-${removed}`);
  console.log(`refused (gate-blocked, never written): ${blocked} · lowest per-edit trust ceiling: ${minTrust}/100`);
  console.log('\nfiles:');
  for (const f of files) console.log('  • ' + f);
  console.log('\nNOT proven (honest — verify by running the product):');
  const np = [...new Set(notProven)].slice(0, 12);
  if (!np.length) console.log('  (each edit carried its own founder note; structural validation held)');
  for (const n of np) console.log('  - ' + n);
  console.log('\nEvery edit is independently provable: atomic prove <opId> / atomic verify-proof <file>.');
  process.exit(0);
}

// ── #3 Causal blame (STRONG form) — sessionId linkage + recovered re-crivo + named false-negative gate ──
// Loads the COMPILED engine (dist/engine-causal-blame.js, same idiom as proof-chain.proof.mjs)
// and prints the four-step forensic report. Degrades loudly (never throws) when the dist is absent
// so the legacy file+timestamp print below still runs as the floor. Returns true iff it printed.
async function runCausalBlame(file, locus) {
  let engine;
  try {
    engine = await import(path.join(here, 'dist', 'engine-causal-blame.js'));
  } catch (e) {
    console.log(`  (strong-form blame unavailable — compiled engine not built: ${e instanceof Error ? e.message : e})`);
    console.log('  run: node scripts/mcp/atomic-edit/build.mjs   then re-run blame for sessionId linkage + recovered re-crivo.');
    return false;
  }
  const report = await engine.causalBlame(repoRoot(), file, locus);
  const link = report.link;
  if (link) {
    console.log(`  session   ${link.sessionId || '(legacy trace — no sessionId; degraded to file+timestamp)'}`);
    console.log(`  linked by ${link.linkedBy}${link.commit ? ` · commit ${link.commit.slice(0, 12)}` : ''}`);
  }
  const rec = report.recovered;
  if (rec) {
    console.log(`  recovered before/after: ${rec.after === null ? 'UNRECOVERABLE' : rec.afterVerified ? 'VERIFIED (after hashes to op.afterSha256)' : 'UNVERIFIED (indicative only)'}`);
  }
  const fn = report.falseNegative;
  if (fn) {
    console.log(`  re-crivo  ${report.reCrivo?.run ? `${report.reCrivo.ran.length} gate(s) ran · ${report.reCrivo.run.reds.length} red · ${report.reCrivo.run.unjudged.length} unjudged` : '(no recovered bytes to judge)'}`);
    console.log(`  FALSE NEGATIVE GATE: ${fn.gate}  [${fn.verdict}]`);
    console.log(`    ${fn.reason}`);
  }
  if (report.recalibrationPath) console.log(`  recalibration record → ${path.relative(repoRoot(), report.recalibrationPath)}`);
  if (report.proposalPath) console.log(`  #2 proposal fed → ${path.relative(repoRoot(), report.proposalPath)}`);
  for (const n of report.notes) console.log(`  · ${n}`);
  return true;
}

// ── #3 Causal blame — map a defect line to the atomic op that introduced it + its gate verdict ──
// ── #3 Causal blame — map a defect line to the atomic op that introduced it + its gate verdict ──
async function cmdBlame(spec, maybeLine) {
  let file = spec, line = Number(maybeLine);
  const m = spec ? /^(.+):(\d+)$/.exec(spec) : null;
  if (m) { file = m[1]; line = Number(m[2]); }
  if (!file || !Number.isFinite(line)) die('usage: atomic blame <file>:<line>');
  const root = repoRoot();
  const b = spawnSync('git', ['-C', root, 'blame', '-L', `${line},${line}`, '--porcelain', file], { encoding: 'utf8' });
  if (b.status !== 0) die('git blame failed (not a git repo / bad path): ' + (b.stderr || '').trim().slice(0, 160));
  const commit = (b.stdout.split('\n')[0] || '').split(' ')[0];
  const author = (b.stdout.match(/^author (.+)$/m) || [])[1] || '?';
  console.log(`blame ${file}:${line}`);
  console.log(`  commit ${commit.slice(0, 12)} · author ${author}`);
  const ops = allTraces()
    .filter((t) => t.file === file || file.endsWith(t.file) || t.file.endsWith(file))
    .sort((a, b2) => (a.ts < b2.ts ? 1 : -1));
  if (!ops.length) {
    console.log('  NO atomic op recorded for this file — it was edited OUTSIDE the atomic firewall (a bypass). That is the gap: route edits through atomic.');
    process.exit(0);
  }
  const op = ops[0];
  const gv = op.gateVerdict;
  console.log(`  atomic op ${op.operationId} (${op.operator} · ${op.ts})`);
  console.log(`  gate verdict: ${gv ? (gv.didBlock ? 'BLOCKED' : 'admitted green') : 'NONE — admitted without a convergence verdict (coverage gap)'}`);
  console.log(`  -> if this line is a defect: the gate that admitted it is the recalibration target. Close the loop with: atomic gaps`);
  // STRONG form (#3 complete): sessionId linkage + recovered before/after + re-run the crivo +
  // name the false-negative gate + write the recalibration record + feed the #2 pipeline.
  // The lines above are the floor (always printed); this augments them when the engine is built.
  await runCausalBlame(file, Number.isFinite(line) ? `L${line}` : undefined);
  process.exit(0);
}

// ── #2 Self-improving gates — detect coverage gaps + propose a gate (admission needs the engine registry) ──
function cmdGaps() {
  const traces = allTraces();
  const ungated = traces.filter((t) => !t.gateVerdict);
  const byExt = {};
  for (const t of ungated) { const e = path.extname(t.file) || '(none)'; byExt[e] = (byExt[e] || 0) + 1; }
  console.log('# Gate coverage gaps — ops admitted without a convergence verdict');
  console.log(`total ops: ${traces.length} · ungated: ${ungated.length}`);
  const entries = Object.entries(byExt).sort((a, b) => b[1] - a[1]);
  for (const [e, n] of entries) console.log(`  ${e}: ${n} ungated op(s)`);
  if (!entries.length) { console.log('  no gaps — every op carried a gate verdict.'); process.exit(0); }
  const [topExt, topN] = entries[0];
  const id = `coverage-${topExt.replace(/\W/g, '') || 'none'}`;
  const proposal = {
    format: 'atomic-gate-proposal/v1',
    reason: `${topN} op(s) on "${topExt}" files were admitted without a convergence gate verdict`,
    proposedGate: { id, kind: 'GateModule', intent: `require a green convergence verdict before admitting any write to "${topExt}" files` },
    admission: 'submit to the self-expansion lattice in the engine registry (single-owner scripts/mcp/atomic-edit) — atomic does not auto-admit a gate it cannot prove monotonic',
  };
  const dir = path.join(repoRoot(), '.atomic', 'proposed-gates');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${id}.proposal.json`);
  fs.writeFileSync(out, JSON.stringify(proposal, null, 2) + '\n');
  console.log(`\nproposed gate → ${out}`);
  console.log(`  intent: ${proposal.proposedGate.intent}`);
  console.log('  admission: needs the self-expansion lattice on the engine registry (monotonic) — not auto-admitted here.');
  process.exit(0);
}

// ── Self-expansion registry — admitted gates the crivo consults (enforced via `atomic enforce`) ──
function gateRegistryPath() { return path.join(repoRoot(), '.atomic', 'gates', 'registry.json'); }
function loadGateRegistry() { try { return JSON.parse(fs.readFileSync(gateRegistryPath(), 'utf8')); } catch { return { format: 'atomic-gate-registry/v1', gates: [] }; } }
function saveGateRegistry(r) { const p = gateRegistryPath(); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(r, null, 2) + '\n'); }

// ── #2 self-improving Gate Lattice (CLI side) — the REAL signal + the REAL monotonic verifier ──
// The corpus of KNOWN-GOOD edits: every GREEN trace's reconstructable before→after
// bytes. A trace stores hashes, not full content, so `after` is the file's current
// on-disk bytes WHEN it is unchanged since the op (afterSha256 matches); otherwise
// the edit can no longer be faithfully reconstructed and is SKIPPED — never guessed.
// This mirrors engine-gate-registry.readKnownGoodCorpus so the CLI admission run and
// the engine admission run judge the same corpus.
function readKnownGoodCorpus() {
  const root = repoRoot();
  const out = [];
  for (const t of allTraces()) {
    const wasGreen = !t.gateVerdict || (t.gateVerdict.green !== false && t.gateVerdict.didBlock !== true && !(t.gateVerdict.reds && t.gateVerdict.reds.length));
    if (!wasGreen || !t.file) continue;
    const abs = t.repoRoot ? path.join(t.repoRoot, t.file) : path.join(root, t.file);
    let onDisk;
    try { onDisk = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    if (t.afterSha256 && sha256(onDisk) !== t.afterSha256) continue; // file changed since → cannot reconstruct exactly
    const be = t.byteEffect || {};
    out.push({ file: t.file, before: typeof be.beforeContent === 'string' ? be.beforeContent : '', after: typeof be.afterContent === 'string' ? be.afterContent : onDisk, operationId: t.operationId });
  }
  return out;
}

// Recorded prod incidents — one JSON object per line in .atomic/incidents/incidents.jsonl,
// each naming a file (and optional locus/symptom) that broke in production. This is the
// "prod-broke" half of the lattice's real gap signal; a prod monitor / on-call appends here.
function readIncidents() {
  const p = path.join(repoRoot(), '.atomic', 'incidents', 'incidents.jsonl');
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { const r = JSON.parse(t); if (r && typeof r.file === 'string') out.push(r); } catch { /* partial/corrupt line → skip */ }
  }
  return out;
}

// THE REAL gap: the delta "all-gates-passed vs prod-broke". Intersect recorded prod
// incidents with the GREEN known-good corpus on file — the result is the set of edits
// the lattice admitted GREEN that an incident later proved defective. Those green-but-
// broken edits are the witness corpus a NEW gate must learn to red. Empty when no
// incident has been recorded (then there is no proven blind spot — only the weak
// ungated-ops fallback signal applies).
function detectIncidentGap() {
  const incidents = readIncidents();
  if (!incidents.length) return [];
  const corpus = readKnownGoodCorpus();
  const byFile = new Map(corpus.map((e) => [e.file, e]));
  const root = repoRoot();
  const out = [];
  const seen = new Set();
  for (const inc of incidents) {
    const rel = path.isAbsolute(inc.file) ? path.relative(root, inc.file) : inc.file;
    const hit = byFile.get(inc.file) || byFile.get(rel);
    if (hit && !seen.has(hit.file)) { out.push(hit); seen.add(hit.file); }
  }
  return out;
}

// Load a candidate gate's EXECUTABLE module (a real GateModule: `export function gate(ctx){…}`)
// and return its callable. null when the module is missing / exports no gate (an
// unloadable proposal can never be admitted — admission requires a real runnable fact).
async function loadCandidateGate(modulePath) {
  const abs = path.isAbsolute(modulePath) ? modulePath : path.join(repoRoot(), modulePath);
  if (!fs.existsSync(abs)) return null;
  try {
    const mod = await import(pathToFileURL(abs).href);
    const cand = typeof mod.gate === 'function' ? mod : mod.default;
    if (!cand || typeof cand.gate !== 'function') return null;
    return { id: cand.id || null, appliesTo: cand.appliesTo, gate: cand.gate };
  } catch { return null; }
}

// THE REAL monotonic admission verifier: run the candidate gate over the known-good
// corpus and admit ONLY if it reds NONE of those edits. A `red` on a previously-green
// edit is a monotonicity violation (it retroactively flips an admitted edit). An
// `unjudged`/throw is NOT a conflict (honest abstention does not flip a verdict). This
// is the check the old no-op was reaching for: it referenced t.gateVerdict.requiresConvergence,
// a field that does not exist on RegistryRun, so it never found a conflict and admitted everything.
function verifyMonotonicAgainstCorpus(candidate, corpus) {
  const conflicts = [];
  let checked = 0;
  for (const edit of corpus) {
    let applies = true;
    try { applies = candidate.appliesTo ? candidate.appliesTo(edit.file) : true; } catch { applies = false; }
    if (!applies) continue;
    checked += 1;
    let res;
    try { res = candidate.gate({ file: edit.file, before: edit.before, after: edit.after, repoRoot: repoRoot() }); } catch { continue; }
    if (res && res.status === 'red') conflicts.push({ file: edit.file, operationId: edit.operationId, fact: res.fact });
  }
  return { ok: conflicts.length === 0, conflicts, checked };
}

// Coverage-gap detector (non-exiting) — shared by `gaps` and `incident`.
function detectGapProposal() {
  // THE REAL gap signal first: "all-gates-passed vs prod-broke". A recorded prod
  // incident (.atomic/incidents/incidents.jsonl) whose file intersects a GREEN trace
  // is a green-but-broken edit — the precise blind spot a NEW gate must learn to red.
  // This is strictly stronger than the ungated-ops fallback below (a missing verdict
  // is not a defect; a green verdict that an incident refuted IS).
  const greenButBroken = detectIncidentGap();
  if (greenButBroken && greenButBroken.length) {
    const top = greenButBroken[0];
    const ext = path.extname(top.file) || '(none)';
    const id = `incident-${ext.replace(/\W/g, '') || 'none'}`;
    const gate = {
      id,
      kind: 'GateModule',
      targetExt: ext,
      // modulePath is intentionally UNSET: the lattice does not auto-synthesize an
      // executable gate body from an incident — that is the human/agent's authoring
      // step. The proposal NAMES the witness edits a real gate must red; admission
      // then runs that authored gate against the corpus (monotonic) before it lands.
      modulePath: null,
      intent: `red the green-but-broken edit class witnessed by incident on "${top.file}" (all built-in gates passed, prod broke)`,
      witnesses: greenButBroken.slice(0, 20).map((e) => ({ file: e.file, operationId: e.operationId })),
    };
    const proposal = {
      format: 'atomic-gate-proposal/v2',
      signal: 'all-gates-passed-vs-prod-broke',
      reason: `${greenButBroken.length} edit(s) were admitted GREEN by every built-in gate yet a prod incident later proved them defective — author a GateModule that reds this class`,
      proposedGate: gate,
    };
    const dir = path.join(repoRoot(), '.atomic', 'proposed-gates'); fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, `${id}.proposal.json`); fs.writeFileSync(out, JSON.stringify(proposal, null, 2) + '\n');
    return { proposalPath: out, gate, count: greenButBroken.length, signal: 'all-gates-passed-vs-prod-broke', witnesses: gate.witnesses };
  }

  const ungated = allTraces().filter((t) => !t.gateVerdict);
  if (!ungated.length) return null;
  const byExt = {};
  for (const t of ungated) { const e = path.extname(t.file) || '(none)'; byExt[e] = (byExt[e] || 0) + 1; }
  const [topExt, topN] = Object.entries(byExt).sort((a, b) => b[1] - a[1])[0];
  const id = `coverage-${topExt.replace(/\W/g, '') || 'none'}`;
  const gate = { id, kind: 'GateModule', targetExt: topExt, intent: `require a green convergence verdict before admitting any write to "${topExt}" files` };
  const proposal = { format: 'atomic-gate-proposal/v1', reason: `${topN} op(s) on "${topExt}" admitted without a convergence verdict`, proposedGate: gate };
  const dir = path.join(repoRoot(), '.atomic', 'proposed-gates'); fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${id}.proposal.json`); fs.writeFileSync(out, JSON.stringify(proposal, null, 2) + '\n');
  return { proposalPath: out, gate, count: topN };
}

// MONOTONIC admission — a gate is admitted only if, RUN over the known-good corpus,
// it reds NONE of those edits. The gate must be a REAL executable GateModule (a
// modulePath that exports `gate(ctx)`); a declarative proposal with no module cannot
// be admitted, because there is nothing to run against the corpus. The candidate is
// loaded and EXECUTED over every reconstructable green edit; a concrete red on any of
// them is a monotonicity violation and refuses admission. This replaces the prior
// no-op (which read t.gateVerdict.requiresConvergence — absent on RegistryRun — so it
// never found a conflict and admitted every proposal unconditionally).
async function admitGate(gate, sourceName) {
  if (!gate.modulePath) {
    return { ok: false, reason: 'proposal has no modulePath — admission requires a REAL executable GateModule (a module exporting gate(ctx){return {id,status,fact}}), not a declarative descriptor' };
  }
  const candidate = await loadCandidateGate(gate.modulePath);
  if (!candidate) {
    return { ok: false, reason: `gate module ${gate.modulePath} does not exist or exports no callable gate()` };
  }
  const corpus = readKnownGoodCorpus();
  const verdict = verifyMonotonicAgainstCorpus(candidate, corpus);
  if (!verdict.ok) {
    return { ok: false, reason: `non-monotonic: would red ${verdict.conflicts.length} known-good edit(s) — ${verdict.conflicts.slice(0, 3).map((c) => `${c.file} (${c.fact})`).join('; ')}` };
  }
  const reg = loadGateRegistry();
  if (reg.gates.some((x) => x.id === gate.id)) return { ok: true, already: true, reg, checked: verdict.checked };
  reg.gates.push({ id: gate.id, kind: gate.kind || 'GateModule', intent: gate.intent, modulePath: gate.modulePath, targetExt: gate.targetExt || null, monotonic: true, admittedAgainst: verdict.checked, admittedAt: new Date().toISOString(), source: sourceName || null });
  saveGateRegistry(reg);
  return { ok: true, reg, checked: verdict.checked };
}

// #2 close — admit a proposed gate into the registry (monotonic), so the crivo self-expands.
async function cmdAdmitGate(proposalFile) {
  if (!proposalFile) die('usage: atomic admit-gate <proposal.json>');
  let prop;
  try { prop = JSON.parse(fs.readFileSync(proposalFile, 'utf8')); } catch (e) { die('unreadable proposal: ' + e.message); }
  const g = prop.proposedGate || prop;
  if (!g.id || !g.intent) die('proposal missing proposedGate.id / intent');
  if (!g.modulePath) die('proposal missing proposedGate.modulePath — admission requires a REAL executable GateModule, not a declarative descriptor');
  const r = await admitGate(g, path.basename(proposalFile));
  if (!r.ok) die('admission REFUSED — ' + r.reason);
  console.log(r.already ? `gate "${g.id}" already admitted.` : `gate ADMITTED → ${g.id}`);
  console.log(`  intent: ${g.intent}`);
  console.log(`  verified monotonic against ${r.checked ?? 0} known-good corpus edit(s) — reddened none`);
  console.log(`  registry: ${gateRegistryPath()} (${r.reg.gates.length} gate(s)) — the byte floor consults it on every write`);
  process.exit(0);
}

// enforcement surface — what CI / pre-commit / the agent runs so the crivo actually consults the admitted gates.
function cmdEnforce(file) {
  const reg = loadGateRegistry();
  if (!reg.gates.length) { console.log('no admitted gates — registry empty.'); process.exit(0); }
  console.log(`crivo consults ${reg.gates.length} admitted gate(s):`);
  for (const g of reg.gates) {
    const applies = !file || !g.targetExt || path.extname(file) === g.targetExt;
    console.log(`  • ${g.id} — ${g.intent}${file ? (applies ? '  [APPLIES]' : '  [n/a]') : ''}`);
  }
  process.exit(0);
}

// #3 close — the entrypoint a prod monitor calls on an incident; closes blame -> gap -> admission with zero humans.
async function cmdIncident(spec) {
  let file = spec, line;
  const m = spec ? /^(.+):(\d+)$/.exec(spec) : null;
  if (m) { file = m[1]; line = Number(m[2]); }
  if (!file) die('usage: atomic incident <file>:<line>');
  console.log(`# Incident loop — ${file}${Number.isFinite(line) ? ':' + line : ''}`);
  const ops = allTraces().filter((t) => t.file === file || file.endsWith(t.file) || t.file.endsWith(file)).sort((a, b) => (a.ts < b.ts ? 1 : -1));
  const op = ops[0];
  console.log(`  atomic op: ${op ? `${op.operationId} (gate ${op.gateVerdict ? (op.gateVerdict.didBlock ? 'BLOCKED' : 'green') : 'NONE'})` : 'none — edited off-firewall (bypass)'}`);
  // STRONG form (#3 complete): before the coverage-gap admission below, run the full
  // forensic chain — link the op's session + commit, recover the before/after bytes,
  // RE-EXECUTE the crivo over the recovered edit, NAME the false-negative gate, and
  // write the recalibration record (which itself feeds a proposal into #2). This is
  // what makes the incident loop name the EXACT gate that admitted the defect.
  await runCausalBlame(file, Number.isFinite(line) ? `L${line}` : undefined);
  const gap = detectGapProposal();
  if (!gap) { console.log('  no coverage gap — the crivo already judged every op. Loop closed (nothing to add).'); process.exit(0); }
  console.log(`  gap: ${gap.count} green-but-broken / ungated op(s) -> proposal ${path.basename(gap.proposalPath)}`);
  if (!gap.gate.modulePath) {
    console.log(`  proposal is declarative (no executable GateModule) — author a real gate(ctx){return {id,status,fact}} module under atomic-os/gates/, set proposedGate.modulePath, then: atomic admit-gate ${path.basename(gap.proposalPath)}`);
    process.exit(0);
  }
  const r = await admitGate(gap.gate, path.basename(gap.proposalPath));
  if (!r.ok) { console.log(`  admission refused: ${r.reason}`); process.exit(1); }
  console.log(`  verified monotonic against ${r.checked ?? 0} known-good corpus edit(s) — reddened none`);
  console.log(`  gate ${r.already ? 'already present' : 'ADMITTED'}: ${gap.gate.id} — registry now has ${r.reg.gates.length} gate(s)`);
  console.log('  LOOP CLOSED: incident -> blame -> gap -> proposal -> monotonic admission -> registry. Zero humans on the critical path.');
  process.exit(0);
}

function cmdReplayUndo(verb, opId) {
  if (!opId) die(`usage: atomic ${verb} <opId>`);
  const t = loadTrace(opId);
  if (!t) die(`no trace for ${opId}`);
  console.error(
    `atomic ${verb}: traces are PROOF/audit artifacts (chain hash, byte accounting, gate verdict),\n` +
    `not content snapshots — rollback.strategy = "${t.rollback?.strategy ?? 'caller-held'}". Cold ${verb}\n` +
    `from a trace alone would invent content, which Atomic OS will not do.\n` +
    `  • live reversal: use atomic_session_begin/rollback (snapshots the file set for the window).\n` +
    `  • cold ${verb}: planned via an opt-in .atomic/snapshots/ content layer (roadmap pillar #4).\n` +
    `Use \`atomic verify ${opId}\` / \`atomic explain ${opId}\` to inspect this op now.`,
  );
  process.exit(3);
}

const [, , cmd, ...rest] = process.argv;
switch (cmd) {
  case 'verify': cmdVerify(rest[0]); break;
  case 'explain': cmdExplain(rest[0]); break;
  case 'log': { const i = rest.indexOf('-n'); cmdLog(i >= 0 ? Number(rest[i + 1]) : undefined); break; }
  case 'compare': cmdCompare(); break;
  case 'init': cmdInit(); break;
  case 'mcp': cmdMcp(rest[0]); break;
  case 'intent': cmdIntent(rest[0]); break;
  case 'prove': await cmdProve(rest[0]); break;
  case 'verify-proof': await cmdVerifyProof(rest.find((r) => !r.startsWith('--')), rest.includes('--reexec')); break;
  case 'founder': cmdFounder(); break;
  case 'blame': cmdBlame(rest[0], rest[1]).catch(die); break;
  case 'gaps': cmdGaps(); break;
  case 'admit-gate': cmdAdmitGate(rest[0]).catch(die); break;
  case 'enforce': cmdEnforce(rest[0]); break;
  case 'incident': cmdIncident(rest[0]).catch(die); break;
  case 'replay': case 'undo': cmdReplayUndo(cmd, rest[0]); break;
  default:
    console.log('atomic — proof-chain CLI + governance + MCP trust firewall\n  init [--force]            detect the repo + generate governance config\n  verify [<opId>|--head]    recompute the chain + check file state\n  explain <opId>            intention, proof, char diff, gate verdict\n  log [-n N]                walk the proof chain\n  compare                   run AtomicBench\n  mcp <scan|approve|verify> [--cmd "<server>"]   capability manifest + tool-poisoning detection\n  intent check [--base <ref>] [--run]            verify a change stayed within the declared product intent\n  prove <opId>              export a portable proof-carrying edit (+ re-exec body when content-snapshotted)\n  verify-proof <file> [--reexec]   re-verify a proof; --reexec RE-RUNS validate + Merkle + gateRunId + seal\n  replay|undo <opId>        (proof != content snapshot; see note)');
    process.exit(cmd ? 1 : 0);
}
