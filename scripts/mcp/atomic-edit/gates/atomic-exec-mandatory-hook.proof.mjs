#!/usr/bin/env node
/**
 * Proof: the atomic-only-hook routes general shell through atomic_exec (proof #1
 * strong enforcement). Pipes tool-call payloads to the hook and asserts the
 * deny/allow decision:
 *   DENY (route via atomic_exec): git status, npm test, node, ls, cat, jq, tsc,
 *     shell control-flow and compound shell commands
 *   allow (atomic_exec cannot safely proxy): git commit/add/push/pull, npm install, ssh,
 *     sudo, gcloud, claude, curl
 *   code-mutation still denied (regression guard)
 *   ATOMIC_EXEC_MANDATORY=0 disables the routing denial
 */
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const here = path.dirname(fileURLToPath(import.meta.url));
const hook = path.resolve(here, '..', 'atomic-only-hook.mjs');

function decide(command, env = {}) {
  const res = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  const out = String(res.stdout || '');
  if (/atomic_exec-mandatory/.test(out)) return 'route';
  if (/TUI-abolished/.test(out)) return 'code-denied';
  return 'allow';
}

const results = [];
const rec = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

// routed (atomic_exec-mandatory)
for (const c of ['git status', 'git diff', 'npm test', 'npm run build', 'node x.mjs', 'ls -la', 'cat f.txt', 'jq . a.json', 'tsc --noEmit', 'grep -rn x .', 'find . -name x', 'for i in 1 2; do echo $i; done', 'cd /tmp && ls']) {
  rec(`route: ${c}`, decide(c) === 'route', { got: decide(c) });
}
// allowed escapes that atomic_exec intentionally does not proxy as generic read-only commands
for (const c of ['git commit -m x', 'git add .', 'git push origin x', 'git pull', 'npm install foo', 'ssh host uptime', 'sudo systemctl restart x', 'gcloud auth login', 'claude --version', 'curl https://x']) {
  rec(`allow: ${c}`, decide(c) === 'allow', { got: decide(c) });
}
// code-mutation regression guard
rec('code-mutating shell still denied', decide("sed -i 's/a/b/' x.ts") === 'code-denied', { got: decide("sed -i 's/a/b/' x.ts") });
// disable flag: outside the host envelope it is owner-controlled; inside the
// atomic-only host envelope it must be ignored so a closed-loop session cannot
// neutralize routing by exporting an env var.
const disabledDecision = decide('git status', { ATOMIC_EXEC_MANDATORY: '0' });
const hostAtomicOnly = process.env.ATOMIC_HOST_ATOMIC_ONLY === '1';
rec(
  hostAtomicOnly ? 'ATOMIC_EXEC_MANDATORY=0 is ignored inside atomic host' : 'ATOMIC_EXEC_MANDATORY=0 disables routing outside atomic host',
  disabledDecision === (hostAtomicOnly ? 'route' : 'allow'),
  { got: disabledDecision, hostAtomicOnly },
);

const ok = results.every((r) => r.ok);
if (jsonMode) console.log(JSON.stringify({ ok, results }, null, 2));
else for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
process.exit(ok ? 0 : 1);
