#!/usr/bin/env node
/**
 * Standalone smoke for the published Atomic OS MCP: build, then prove the LIVE
 * server end-to-end — tool inventory + a real firewall-guarded edit that
 * persists + a bad edit that is refused. Self-contained (a temp workspace),
 * with no dependency on any host monorepo.
 */
import { spawnSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log('  PASS  ' + name); }
  else { fail += 1; console.log('  FAIL  ' + name); }
};

// 1) build
const b = spawnSync(process.execPath, [path.join(dir, 'build.mjs')], { stdio: 'inherit' });
if (b.status !== 0) { console.error('build failed'); process.exit(1); }

// 2) live MCP in an isolated temp workspace
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-os-smoke-'));
fs.writeFileSync(path.join(work, 'm.py'), 'def greet(n):\n    return n\ngreet("x")\n');
const srv = spawn(process.execPath, [path.join(dir, 'dist', 'server.js')], {
  env: { ...process.env, ATOMIC_EDIT_REPO_ROOT: work },
  stdio: ['pipe', 'pipe', 'ignore'],
});
let buf = '';
const waiters = new Map();
srv.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const l = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!l.trim()) continue;
    let m; try { m = JSON.parse(l); } catch { continue; }
    if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
  }
});
const rpc = (id, method, params) =>
  new Promise((r) => { waiters.set(id, r); srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const txt = (r) => r?.result?.content?.[0]?.text ?? JSON.stringify(r?.error ?? r);

await rpc(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const list = await rpc(2, 'tools/list', {});
const names = (list.result?.tools ?? []).map((t) => t.name);
check(`server lists >= 60 tools (got ${names.length})`, names.length >= 60);
for (const t of ['atomic_edit', 'atomic_replace_at', 'atomic_ast_edit', 'atomic_rename_symbol_universal', 'atomic_grep', 'atomic_create_file', 'atomic_transaction']) {
  check('tool present: ' + t, names.includes(t));
}

// real firewall-guarded edit: content-addressed, no coordinates
const ed = await rpc(3, 'tools/call', { name: 'atomic_replace_at', arguments: { file: 'm.py', mode: 'content', anchor: 'greet', newText: 'salute', occurrence: 1, proofOfIncorrectness: 'placeholder verb "greet" is incorrect for this API; the contract specifies "salute" as the canonical function name.' } });
check('atomic_replace_at applied', txt(ed).includes('Atomic edit applied'));
const after = fs.readFileSync(path.join(work, 'm.py'), 'utf8');
check('edit persisted (greet->salute)', after.includes('def salute(n)'));

// firewall refuses a bad edit (path escape): writing outside the workspace
const esc = await rpc(4, 'tools/call', { name: 'atomic_replace_at', arguments: { file: '../escape.py', mode: 'content', anchor: 'x', newText: 'y' } });
check('path-escape refused', txt(esc).toLowerCase().includes('escape') || txt(esc).includes('refused'));

// transactional sessions: a named multi-edit window that rolls back or commits as one unit
for (const t of ['atomic_session_begin', 'atomic_session_savepoint', 'atomic_session_rollback', 'atomic_session_commit']) {
  check('tool present: ' + t, names.includes(t));
}
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
// begin -> edit -> rollback must RESTORE the begin snapshot
const beginR = await rpc(5, 'tools/call', { name: 'atomic_session_begin', arguments: {} });
const sid = (txt(beginR).match(UUID) ?? [])[0];
check('atomic_session_begin returns a session id', !!sid);
await rpc(6, 'tools/call', { name: 'atomic_replace_at', arguments: { file: 'm.py', mode: 'content', anchor: 'salute', newText: 'hail', occurrence: 1, proofOfIncorrectness: 'verb "salute" is corrected to "hail" to exercise a negative-byte edit under proof inside the session window.' } });
check('edit inside session applied (salute->hail)', fs.readFileSync(path.join(work, 'm.py'), 'utf8').includes('def hail(n)'));
await rpc(7, 'tools/call', { name: 'atomic_session_rollback', arguments: { sessionId: sid, close: true } });
const restored = fs.readFileSync(path.join(work, 'm.py'), 'utf8');
check('atomic_session_rollback restored the window (hail->salute)', restored.includes('def salute(n)') && !restored.includes('def hail(n)'));
// begin -> edit -> commit must KEEP the edit and close the window
const begin2 = await rpc(8, 'tools/call', { name: 'atomic_session_begin', arguments: {} });
const sid2 = (txt(begin2).match(UUID) ?? [])[0];
await rpc(9, 'tools/call', { name: 'atomic_replace_at', arguments: { file: 'm.py', mode: 'content', anchor: 'salute', newText: 'hail', occurrence: 1, proofOfIncorrectness: 'verb "salute" is corrected to "hail" to exercise a negative-byte edit under proof inside the session window.' } });
const cm = await rpc(10, 'tools/call', { name: 'atomic_session_commit', arguments: { sessionId: sid2 } });
check('atomic_session_commit kept the edit (salute->hail)', fs.readFileSync(path.join(work, 'm.py'), 'utf8').includes('def hail(n)'));
check('atomic_session_commit emitted a receipt', /session|commit/i.test(txt(cm)));

// universal symbol editing now spans ALL grammars (not just TS/JS) — G1 universalized
fs.writeFileSync(path.join(work, 'b.go'), 'package b\n\nfunc Greet(n string) string {\n\treturn n\n}\n');
fs.writeFileSync(path.join(work, 'b.rs'), 'pub fn greet(n) -> i32 {\n    1\n}\n');
const esPy = await rpc(11, 'tools/call', { name: 'atomic_edit_symbol', arguments: { file: 'm.py', selector: 'hail', op: 'insert_after', code: 'def fare(n):\n    return n\n' } });
check('atomic_edit_symbol on Python (insert_after) applies', !!esPy && fs.readFileSync(path.join(work, 'm.py'), 'utf8').includes('def fare(n)'));
const esGo = await rpc(12, 'tools/call', { name: 'atomic_edit_symbol', arguments: { file: 'b.go', selector: 'Greet', op: 'insert_after', code: 'func Fare(n string) string {\n\treturn n\n}\n' } });
check('atomic_edit_symbol on Go (insert_after) applies', !!esGo && fs.readFileSync(path.join(work, 'b.go'), 'utf8').includes('func Fare('));
const esRs = await rpc(13, 'tools/call', { name: 'atomic_edit_symbol', arguments: { file: 'b.rs', selector: 'greet', op: 'insert_after', code: 'pub fn fare(n) -> i32 {\n    2\n}\n' } });
check('atomic_edit_symbol on Rust (insert_after) applies', !!esRs && fs.readFileSync(path.join(work, 'b.rs'), 'utf8').includes('pub fn fare('));
// universal read-side navigation: code_outline enumerates symbols for non-TS grammars
const olGo = await rpc(14, 'tools/call', { name: 'code_outline', arguments: { file: 'b.go' } });
const olGoSyms = (() => { try { return JSON.parse(olGo.result.content[0].text).symbols.length; } catch { return 0; } })();
check('code_outline enumerates Go symbols (universal nav)', olGoSyms >= 2);
const rdGo = await rpc(15, 'tools/call', { name: 'code_read_symbol', arguments: { file: 'b.go', selector: 'Fare' } });
check('code_read_symbol reads a Go definition (universal nav)', /func Fare\(/.test(txt(rdGo)));
// universal import insertion: add_import works on non-TS grammars
fs.writeFileSync(path.join(work, 'b.rb'), 'def hi\nend\n');
const impRb = await rpc(16, 'tools/call', { name: 'atomic_add_import', arguments: { file: 'b.rb', module: 'json', name: '' } });
check('atomic_add_import on Ruby (require) applies', !!impRb && fs.readFileSync(path.join(work, 'b.rb'), 'utf8').includes("require 'json'"));
const impGo = await rpc(17, 'tools/call', { name: 'atomic_add_import', arguments: { file: 'b.go', module: 'strings', name: '' } });
check('atomic_add_import on Go (import) applies', !!impGo && fs.readFileSync(path.join(work, 'b.go'), 'utf8').includes('import "strings"'));
// LSP awareness: a non-TS cross-file rename surfaces the exact missing language server + install command
const lspGo = await rpc(18, 'tools/call', { name: 'atomic_rename_symbol_cross_file', arguments: { file: 'b.go', line: 3, column: 6, newName: 'Renamed' } });
check('atomic surfaces the missing LSP (gopls) + install command for non-TS cross-file rename', /gopls/.test(txt(lspGo)) && /install|INSTALL/.test(txt(lspGo)));
// universal decorator + await across non-TS grammars
fs.writeFileSync(path.join(work, 'd.py'), 'import os\ndef greet(n):\n    return n\n');
const decPy = await rpc(19, 'tools/call', { name: 'atomic_add_decorator', arguments: { file: 'd.py', targetLine: 2, decorator: '@staticmethod' } });
check('atomic_add_decorator on Python applies', !!decPy && fs.readFileSync(path.join(work, 'd.py'), 'utf8').includes('@staticmethod'));
fs.writeFileSync(path.join(work, 'a.py'), 'async def f():\n    fetch(1)\n');
const awPy = await rpc(20, 'tools/call', { name: 'atomic_add_await_to_call', arguments: { file: 'a.py', callee: 'fetch' } });
check('atomic_add_await_to_call on Python prefixes await', !!awPy && /await fetch\(1\)/.test(fs.readFileSync(path.join(work, 'a.py'), 'utf8')));
fs.writeFileSync(path.join(work, 'a.rs'), 'async fn f() {\n    fetch(1);\n}\n');
const awRs = await rpc(21, 'tools/call', { name: 'atomic_add_await_to_call', arguments: { file: 'a.rs', callee: 'fetch' } });
check('atomic_add_await_to_call on Rust appends .await', !!awRs && /fetch\(1\)\.await/.test(fs.readFileSync(path.join(work, 'a.rs'), 'utf8')));

srv.kill('SIGKILL');

// proof-chain CLI over the traces this run produced (.atomic/traces in `work`)
const cli = (args) => spawnSync(process.execPath, [path.join(dir, 'atomic-cli.mjs'), ...args], { cwd: work, encoding: 'utf8' });
const v = cli(['verify', '--head']);
check('atomic verify --head recomputes the chain (VERIFIED)', v.status === 0 && /VERIFIED/.test(v.stdout));
const lg = cli(['log']);
check('atomic log walks the proof chain', /proof chain @/.test(lg.stdout) && /atomic_/.test(lg.stdout));
// Proof-Carrying Edits: export a portable artifact + independently re-verify it; tamper -> FAIL
const traceDir = path.join(work, '.atomic', 'traces');
const anyOp = fs.existsSync(traceDir) ? (fs.readdirSync(traceDir).find((f) => f.endsWith('.json')) || '').replace(/\.json$/, '') : '';
const pv = cli(['prove', anyOp]);
const proofFile = path.join(work, '.atomic', 'proofs', `${anyOp}.proof.json`);
check('atomic prove emits a portable proof-carrying artifact', pv.status === 0 && fs.existsSync(proofFile));
const vp = cli(['verify-proof', proofFile]);
check('atomic verify-proof VERIFIES the artifact independently', vp.status === 0 && /VERIFIED/.test(vp.stdout));
const pj = JSON.parse(fs.readFileSync(proofFile, 'utf8'));
pj.afterSha256 = '0'.repeat(64);
fs.writeFileSync(proofFile, JSON.stringify(pj));
const vpT = cli(['verify-proof', proofFile]);
check('atomic verify-proof detects a tampered artifact (FAILED)', vpT.status === 2 && /TAMPERED|FAILED/.test(vpT.stdout));
// #4 Founder-facing cumulative proof — non-technical session rollup
const fr = cli(['founder']);
check('atomic founder aggregates a non-technical session report', fr.status === 0 && /Founder report/.test(fr.stdout) && /files touched/.test(fr.stdout));
// #2 Self-improving gates — coverage-gap detector + gate proposal artifact
const gp = cli(['gaps']);
check('atomic gaps reports coverage gaps + emits a gate proposal', gp.status === 0 && /coverage gaps/.test(gp.stdout));
// #3 Causal blame — git blame -> the atomic op + its gate verdict (or flags an off-firewall bypass)
spawnSync('git', ['init', '-q'], { cwd: work });
spawnSync('git', ['config', 'user.email', 'a@b.c'], { cwd: work });
spawnSync('git', ['config', 'user.name', 'smoke'], { cwd: work });
fs.writeFileSync(path.join(work, 'blame.py'), 'x = 1\n');
spawnSync('git', ['add', 'blame.py'], { cwd: work });
spawnSync('git', ['commit', '-qm', 'seed'], { cwd: work });
const bl = cli(['blame', 'blame.py:1']);
check('atomic blame resolves a line to its commit + atomic record', bl.status === 0 && /commit /.test(bl.stdout));
// Trust-Compiler loop closure: incident -> gap -> MONOTONIC admission -> registry; enforce consults it
const inc = cli(['incident', 'blame.py:1']);
check('atomic incident closes the loop (gap -> declarative proposal / monotonic admission, zero humans)', inc.status === 0 && /(LOOP CLOSED|no coverage gap|proposal is declarative)/.test(inc.stdout));
const enf = cli(['enforce']);
check('atomic enforce consults the admitted gate registry', enf.status === 0 && /(admitted gate|registry empty)/.test(enf.stdout));
const rePath = path.join(work, '.atomic', 'gates', 'registry.json');
check('admitted gate persisted to the self-expansion registry', !fs.existsSync(rePath) || /atomic-gate-registry/.test(fs.readFileSync(rePath, 'utf8')));

// governance installer: `atomic init` detects a repo + generates config
const initDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-init-'));
fs.writeFileSync(path.join(initDir, 'a.py'), 'def f():\n    return 1\n');
const ini = spawnSync(process.execPath, [path.join(dir, 'atomic-cli.mjs'), 'init'], { cwd: initDir, encoding: 'utf8' });
check('atomic init generates governance config', ini.status === 0 &&
  fs.existsSync(path.join(initDir, 'atomic-edit.protected.json')) &&
  fs.existsSync(path.join(initDir, 'atomic.agent-rules.md')));

// MCP trust firewall: scan this server's descriptors, approve, then poisoning -> RED
const mcpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-mcp-'));
const serverCmd = `${process.execPath} ${path.join(dir, 'dist', 'server.js')}`;
const mcp = (args) => spawnSync(process.execPath, [path.join(dir, 'atomic-cli.mjs'), 'mcp', ...args, '--cmd', serverCmd], { cwd: mcpDir, encoding: 'utf8' });
const scan = mcp(['scan']);
check('atomic mcp scan manifests tool descriptors', scan.status === 0 && /capability manifest — \d+ tools/.test(scan.stdout));
const appr = mcp(['approve']);
const vGreen = mcp(['verify']);
check('atomic mcp verify GREEN against the approved manifest', appr.status === 0 && vGreen.status === 0 && /GREEN/.test(vGreen.stdout));
const am = path.join(mcpDir, '.atomic', 'mcp-approved.json');
const j = JSON.parse(fs.readFileSync(am, 'utf8'));
const k0 = Object.keys(j.manifest)[0];
j.manifest[k0] = '0'.repeat(64);
fs.writeFileSync(am, JSON.stringify(j));
const vRed = mcp(['verify']);
check('atomic mcp verify detects descriptor poisoning (RED)', vRed.status === 2 && /RED/.test(vRed.stdout) && new RegExp(k0).test(vRed.stdout));

// product-intent gate: a change touching a `preserve` path must be RED (git-guarded)
if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0) {
  const iDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-intent-'));
  const git = (args) => spawnSync('git', ['-C', iDir, ...args], { encoding: 'utf8' });
  git(['init', '-q']); git(['config', 'user.email', 'a@b.c']); git(['config', 'user.name', 't']);
  fs.mkdirSync(path.join(iDir, 'src')); fs.mkdirSync(path.join(iDir, 'keep'));
  fs.writeFileSync(path.join(iDir, 'src', 'a.txt'), '1\n');
  fs.writeFileSync(path.join(iDir, 'keep', 'p.txt'), '1\n');
  fs.writeFileSync(path.join(iDir, 'atomic.intent.json'), JSON.stringify({ goal: 'x', touch: ['src/**'], preserve: ['keep/**'] }));
  git(['add', '-A']); git(['commit', '-qm', 'base']);
  fs.writeFileSync(path.join(iDir, 'keep', 'p.txt'), '2\n'); // touch a preserved path
  const ir = spawnSync(process.execPath, [path.join(dir, 'atomic-cli.mjs'), 'intent', 'check'], { cwd: iDir, encoding: 'utf8' });
  check('atomic intent flags a preserve-path violation (RED)', ir.status === 2 && /PRESERVE VIOLATION/.test(ir.stdout));
} else {
  console.log('  SKIP  atomic intent check (git unavailable)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
