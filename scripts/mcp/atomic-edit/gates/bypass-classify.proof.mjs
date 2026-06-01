#!/usr/bin/env node
/**
 * Proof (proof-allowlisted name) for bypass-classify.mjs after the strict
 * directive: general shell (git/npm/node/ls/cat/sed) via native Bash is a
 * detectable atomic_exec bypass; interactive/login/external verbs
 * (claude/ssh/sudo/gcloud) are not atomic-doable and stay undetectable. Also
 * re-asserts the original code-edit/read/grep/glob bypass classes.
 */
import { classifyToolCall } from '../bypass-classify.mjs';

const cases = [
  // [tool, input, expectDetectable, expectBlocked, label]
  ['Edit', { file_path: 'x.ts' }, true, true, 'native code edit blocked'],
  ['Edit', { file_path: 'notes.md' }, false, false, 'doc edit undetectable'],
  ['Read', { file_path: 'x.ts' }, true, false, 'code read detectable'],
  ['Grep', { pattern: 'foo' }, true, false, 'grep detectable'],
  ['Glob', { pattern: '*.ts' }, true, false, 'glob detectable'],
  ['Bash', { command: "sed -i 's/a/b/' x.ts" }, true, true, 'code-mutating shell blocked'],
  ['Bash', { command: 'cat x.ts' }, true, false, 'cat code detectable'],
  ['Bash', { command: 'git commit -m x' }, true, false, 'git is atomic_exec bypass'],
  ['Bash', { command: 'npm run build' }, true, false, 'npm is atomic_exec bypass'],
  ['Bash', { command: 'node dist/server.js' }, true, false, 'node is atomic_exec bypass'],
  ['Bash', { command: 'ls -la' }, true, false, 'ls is atomic_exec bypass'],
  ['Bash', { command: 'tsc --noEmit' }, true, false, 'tsc is atomic_exec bypass'],
  ['Bash', { command: 'claude --version' }, false, false, 'claude undetectable (interactive)'],
  ['Bash', { command: 'ssh host uptime' }, false, false, 'ssh undetectable (remote)'],
  ['Bash', { command: 'sudo systemctl restart x' }, false, false, 'sudo undetectable (privileged)'],
  ['Bash', { command: 'gcloud auth login' }, false, false, 'gcloud undetectable (provider)'],
  ['Bash', { command: 'op read x' }, false, false, 'op undetectable (secrets login)'],
];

const jsonMode = process.argv.includes('--json');
const results = [];
for (const [tool, input, expDetect, expBlocked, label] of cases) {
  const c = classifyToolCall({ tool, toolInput: input });
  const ok = c.detectable === expDetect && c.blockedByDenyHook === expBlocked;
  results.push({ name: label, ok, detail: { got: { detectable: c.detectable, blocked: c.blockedByDenyHook, category: c.category }, want: { detectable: expDetect, blocked: expBlocked } } });
}
// extra invariant: atomic_exec-handled bypasses are detectable but NOT blocked
// (the deny-hook does not block general shell — honest gap surfaced, not faked).
const gitC = classifyToolCall({ tool: 'Bash', toolInput: { command: 'git status' } });
results.push({ name: 'general-shell bypass is detectable but blockedByDenyHook=false', ok: gitC.detectable === true && gitC.blockedByDenyHook === false && gitC.atomicEquivalent === 'atomic_exec', detail: gitC });

const ok = results.every((r) => r.ok);
if (jsonMode) console.log(JSON.stringify({ ok, results }, null, 2));
else for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
process.exit(ok ? 0 : 1);
