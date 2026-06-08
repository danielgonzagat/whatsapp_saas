#!/usr/bin/env node
/**
 * AtomicBench — numeric proof of superiority over coarse editing.
 *
 * Runs the LIVE Atomic OS MCP server against a multi-language task suite and
 * measures, per edit, the bytes Atomic OS actually changed vs the bytes a
 * line-rewrite (what a line-oriented editor touches) and a file-rewrite (what a
 * full-file "rewrite and trust me" agent touches) would have changed. Then it
 * runs a safety suite: negative-byte edits without proof, a path escape, and a
 * syntax-breaking edit — all of which MUST be refused.
 *
 * Honest by construction: the baselines are COMPUTED from the same edits (not
 * claimed), every number is reproducible, and the server is real (no mocks).
 * Self-contained: a temp workspace, no host monorepo.
 *
 *   node src/bench.mjs            # build + run + print the table
 *   node src/bench.mjs --md       # also (re)write docs/BENCHMARK.md
 */
import { spawnSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const writeMd = process.argv.includes('--md');

// 1) build
const b = spawnSync(process.execPath, [path.join(dir, 'build.mjs')], { stdio: 'inherit' });
if (b.status !== 0) { console.error('build failed'); process.exit(1); }

// 2) live MCP in an isolated temp workspace. A minimal tsconfig lets the
// TS type-soundness gate produce a green judgment (the Y-admission doctrine
// refuses to write a TS edit it cannot prove type-sound — as a real repo would).
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-bench-'));
fs.writeFileSync(path.join(work, 'tsconfig.json'), JSON.stringify({
  compilerOptions: { strict: false, noEmit: true, skipLibCheck: true, target: 'es2020', module: 'esnext', moduleResolution: 'node', lib: ['es2020', 'dom'], allowJs: true },
}) + '\n');

// One representative "rename a token" task per language (byte-level edit, all langs).
// Each fixture has a clearly-wrong token to correct, on a line with real surrounding code.
// Each task corrects ONE wrong token inside a string literal (no reference/type
// entanglement — the point is to measure CHANGED-BYTE SURFACE, not rename semantics).
const TASKS = [
  { file: 'svc.py',   lang: 'Python',     anchor: 'helo',   to: 'hello',   src: 'def greet(name):\n    return "helo, " + name + " — welcome to the service"\nprint(greet("world"))\n' },
  { file: 'svc.js',   lang: 'JavaScript', anchor: 'helo',   to: 'hello',   src: 'export function greet(name) {\n  return `helo, ${name} — welcome to the service`;\n}\nconsole.log(greet("world"));\n' },
  { file: 'svc.ts',   lang: 'TypeScript', anchor: 'helo',   to: 'hello',   src: 'export function greet(name: string): string {\n  return `helo, ${name} — welcome to the service`;\n}\nconsole.log(greet("world"));\n' },
  { file: 'svc.go',   lang: 'Go',         anchor: 'helo',   to: 'hello',   src: 'package svc\n\nfunc Greet(name string) string {\n\treturn "helo, " + name + " — welcome to the service"\n}\n' },
  { file: 'svc.rs',   lang: 'Rust',       anchor: 'helo',   to: 'hello',   src: 'pub fn greet(name: &str) -> String {\n    format!("helo, {} — welcome to the service", name)\n}\n' },
  { file: 'Svc.java', lang: 'Java',       anchor: 'helo',   to: 'hello',   src: 'class Svc {\n  static String greet(String name) {\n    return "helo, " + name + " — welcome to the service";\n  }\n}\n' },
];

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
let rid = 0;
const rpc = (method, params) => {
  const id = ++rid;
  return new Promise((r) => { waiters.set(id, r); srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
};
const txt = (r) => r?.result?.content?.[0]?.text ?? JSON.stringify(r?.error ?? r);

// Minimal changed-span between two strings: strip common prefix + suffix.
function minimalSpan(before, after) {
  let p = 0;
  const max = Math.min(before.length, after.length);
  while (p < max && before[p] === after[p]) p++;
  let s = 0;
  while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const removed = before.length - p - s;
  const added = after.length - p - s;
  return { removed: Math.max(0, removed), added: Math.max(0, added), surface: Math.max(0, removed) + Math.max(0, added), offset: p };
}
// Length (incl. newline) of the line(s) the offset falls on — what a line editor rewrites.
function lineSurface(text, offset, addedLen) {
  const start = text.lastIndexOf('\n', offset - 1) + 1;
  let end = text.indexOf('\n', offset + addedLen);
  if (end === -1) end = text.length;
  return end - start + 1;
}

await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'bench', version: '1' } });
srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const rows = [];
let totAtomic = 0, totLine = 0, totFile = 0, applied = 0;
for (const t of TASKS) {
  fs.writeFileSync(path.join(work, t.file), t.src);
  const before = fs.readFileSync(path.join(work, t.file), 'utf8');
  const res = await rpc('tools/call', { name: 'atomic_replace_at', arguments: {
    file: t.file, mode: 'content', anchor: t.anchor, newText: t.to, occurrence: 1,
    proofOfIncorrectness: `the identifier "${t.anchor}" is a placeholder; the corrected name per the service contract is "${t.to}".`,
  } });
  const after = fs.readFileSync(path.join(work, t.file), 'utf8');
  const ok = after !== before && after.includes(t.to);
  if (!ok) { rows.push({ lang: t.lang, ok: false, note: txt(res).slice(0, 60) }); continue; }
  applied++;
  const span = minimalSpan(before, after);
  const line = lineSurface(after, span.offset, span.added);
  const file = before.length;
  totAtomic += span.surface; totLine += line; totFile += file;
  rows.push({ lang: t.lang, ok: true, atomic: span.surface, line, file,
    vsLine: (100 * (1 - span.surface / line)).toFixed(1), vsFile: (100 * (1 - span.surface / file)).toFixed(1) });
}

// safety suite — all MUST be refused / blocked
fs.writeFileSync(path.join(work, 'safe.ts'), 'export const apiKey = "live-1234567890";\nexport function f(){ return 1; }\n');
const neg = await rpc('tools/call', { name: 'atomic_replace_at', arguments: { file: 'safe.ts', mode: 'content', anchor: 'live-1234567890', newText: 'x', occurrence: 1 } });
const negRefused = /negative byte action|proofOfIncorrectness/i.test(txt(neg));
const esc = await rpc('tools/call', { name: 'atomic_replace_at', arguments: { file: '../escape.ts', mode: 'content', anchor: 'f', newText: 'g' } });
const escRefused = /escape|refused|outside/i.test(txt(esc));
const broke = await rpc('tools/call', { name: 'atomic_replace_at', arguments: { file: 'safe.ts', mode: 'content', anchor: 'return 1; }', newText: 'return 1;', occurrence: 1, proofOfIncorrectness: 'attempting to delete the closing brace to prove the syntax firewall refuses a parse-breaking edit.' } });
const safeAfter = fs.readFileSync(path.join(work, 'safe.ts'), 'utf8');
const syntaxSafe = /reject|refus|syntax|invalid/i.test(txt(broke)) || safeAfter.includes('function f(){ return 1; }');
const traceDir = path.join(work, '.atomic', 'traces');
const traceCount = fs.existsSync(traceDir) ? fs.readdirSync(traceDir).length : 0;

srv.kill('SIGKILL');

const avgVsLine = totLine ? (100 * (1 - totAtomic / totLine)).toFixed(1) : '0';
const avgVsFile = totFile ? (100 * (1 - totAtomic / totFile)).toFixed(1) : '0';

const lines = [];
lines.push('# AtomicBench — measured, reproducible (run `node src/bench.mjs`)');
lines.push('');
lines.push('## Expansion avoided — bytes Atomic OS changed vs a line-rewrite / file-rewrite of the same edit');
lines.push('');
lines.push('| Language | Atomic bytes | Line-rewrite bytes | File-rewrite bytes | Avoided vs line | Avoided vs file |');
lines.push('|---|--:|--:|--:|--:|--:|');
for (const r of rows) {
  if (!r.ok) { lines.push(`| ${r.lang} | — | — | — | (not applied: ${r.note}) | |`); continue; }
  lines.push(`| ${r.lang} | ${r.atomic} | ${r.line} | ${r.file} | ${r.vsLine}% | ${r.vsFile}% |`);
}
lines.push(`| **TOTAL (${applied}/${TASKS.length})** | **${totAtomic}** | **${totLine}** | **${totFile}** | **${avgVsLine}%** | **${avgVsFile}%** |`);
lines.push('');
lines.push('## Safety — every coarse/destructive action MUST be refused');
lines.push('');
lines.push('| Guarantee | Result |');
lines.push('|---|---|');
lines.push(`| negative-byte edit refused without proofOfIncorrectness | ${negRefused ? 'PASS — refused' : 'FAIL'} |`);
lines.push(`| path-escape (write outside repo) refused | ${escRefused ? 'PASS — refused' : 'FAIL'} |`);
lines.push(`| syntax-breaking edit refused (no bad write) | ${syntaxSafe ? 'PASS — refused/safe' : 'FAIL'} |`);
lines.push(`| every applied edit left a replayable trace | ${traceCount >= applied ? `PASS — ${traceCount} traces` : `PARTIAL — ${traceCount}/${applied}`} |`);
lines.push('');
lines.push('> Method: each task makes ONE correction; "Atomic bytes" is the minimal changed span');
lines.push('> (common-prefix/suffix stripped), "Line-rewrite" is the length of the line(s) a line editor');
lines.push('> rewrites, "File-rewrite" is the whole file a "rewrite-and-trust" agent re-emits. Baselines are');
lines.push('> computed from the same edit, not claimed. Server is the live MCP in a temp workspace.');

const report = lines.join('\n') + '\n';
console.log('\n' + report);

const safetyOk = negRefused && escRefused && syntaxSafe && traceCount >= applied && applied === TASKS.length;
if (writeMd) {
  fs.writeFileSync(path.join(dir, '..', 'docs', 'BENCHMARK.md'), report);
  console.log('wrote docs/BENCHMARK.md');
}
console.log(`AtomicBench: ${applied}/${TASKS.length} edits measured · ${avgVsLine}% avoided vs line · ${avgVsFile}% vs file · safety ${safetyOk ? 'GREEN' : 'RED'}`);
process.exit(safetyOk ? 0 : 1);
