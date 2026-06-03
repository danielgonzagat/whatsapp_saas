#!/usr/bin/env node
/**
 * Proof (proof-allowlisted name) for bypass-classify.mjs. General shell
 * (git/npm/node/ls/cat/sed) via native Bash is a detectable atomic_exec bypass;
 * interactive/login/external verbs (claude/ssh/sudo/gcloud) are not atomic-doable
 * and stay undetectable. The classifier supports two honest postures:
 * legacy mode preserves whether the softer hook would block the call; strict
 * Codex atomic-only mode marks every detectable atomic-equivalent call blocked.
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

const strictCases = [
  ['Read', { file_path: 'x.ts' }, true, true, 'strict code read blocked'],
  ['Grep', { pattern: 'foo' }, true, true, 'strict grep blocked'],
  ['Glob', { pattern: '*.ts' }, true, true, 'strict glob blocked'],
  ['Bash', { command: 'cat x.ts' }, true, true, 'strict cat code blocked'],
  ['Bash', { command: 'git status --short' }, true, true, 'strict git status blocked'],
  ['Bash', { command: 'npm run build' }, true, true, 'strict npm build blocked'],
  ['Edit', { file_path: 'notes.md' }, false, false, 'strict doc edit still undetectable'],
  ['Bash', { command: 'claude --version' }, false, false, 'strict non-atomic-doable command still undetectable'],
];

const jsonMode = process.argv.includes('--json');
const results = [];
for (const [tool, input, expDetect, expBlocked, label] of cases) {
  const c = classifyToolCall({ tool, toolInput: input });
  const ok = c.detectable === expDetect && c.blockedByDenyHook === expBlocked;
  results.push({ name: label, ok, detail: { got: { detectable: c.detectable, blocked: c.blockedByDenyHook, category: c.category }, want: { detectable: expDetect, blocked: expBlocked } } });
}
for (const [tool, input, expDetect, expBlocked, label] of strictCases) {
  const c = classifyToolCall({ tool, toolInput: input, strictAtomicOnly: true });
  const ok = c.detectable === expDetect && c.blockedByDenyHook === expBlocked;
  results.push({ name: label, ok, detail: { got: { detectable: c.detectable, blocked: c.blockedByDenyHook, category: c.category }, want: { detectable: expDetect, blocked: expBlocked } } });
}
// legacy invariant: atomic_exec-handled bypasses are detectable but not marked
// denied unless strictAtomicOnly is active.
const gitLegacy = classifyToolCall({ tool: 'Bash', toolInput: { command: 'git status' } });
results.push({ name: 'legacy general-shell bypass is detectable but blockedByDenyHook=false', ok: gitLegacy.detectable === true && gitLegacy.blockedByDenyHook === false && gitLegacy.atomicEquivalent === 'atomic_exec', detail: gitLegacy });
const gitStrict = classifyToolCall({ tool: 'Bash', toolInput: { command: 'git status' }, strictAtomicOnly: true });
results.push({ name: 'strict general-shell bypass is detectable and blockedByDenyHook=true', ok: gitStrict.detectable === true && gitStrict.blockedByDenyHook === true && gitStrict.atomicEquivalent === 'atomic_exec', detail: gitStrict });

const ok = results.every((r) => r.ok);
if (jsonMode) console.log(JSON.stringify({ ok, results }, null, 2));
else for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
process.exit(ok ? 0 : 1);
