# Codex CLI Environment Repair — exact patches

> **Status:** applied and validated by Codex on 2026-06-01. Originally authored from a Claude-atomic-host session that is
> **architecturally unable to land these edits itself** (see "Why a doc" below).
> **Network posture change APPROVED by the repo owner (Daniel) on 2026-06-01.**

## Symptom (fresh Codex session via `node scripts/mcp/atomic-edit/codex-atomic-host-launcher.mjs -- codex`)

- "erro no stream" — Codex can't reach its model endpoint.
- atomic-edit MCP: `handshaking with MCP server failed: connection closed: initialize response`.
- HTTP MCPs fail: `openaiDeveloperDocs`, `codex_apps` (`error sending request ... 443`).
- ~12 stdio MCPs time out after 30s (sentry, codacy, github, stripe, vercel, railway, datadog, context7, sequential-thinking, obsidian, mercadopago, beads).
- A Codex agent that tried to fix it hit a **bootstrap deadlock**: the hook denied *every* tool (incl. `mcp__atomic-edit__*` and `update_goal`).

## Root causes (4)

1. **Hook ordering deadlock** — `scripts/mcp/atomic-edit/codex-atomic-only-hook.mjs`: the `!hostSandboxActive()` deny runs **before** the atomic-tool allowlist, so when host env is unset every tool (including the atomic tools that are the only repair path) is denied. Planner controls (`update_goal`/`get_goal`/`update_plan`) aren't allowlisted at all.
2. **Host launcher denied DNS/HTTP** — `codex-atomic-host-launcher.mjs` `sandboxProfile()` used `(deny default)` and only allowed the broker Unix socket + CODEX_HOME subpath. Port-scoped outbound rules such as `(remote ip "*:443")` are insufficient because DNS fails before HTTPS (`getaddrinfo ENOTFOUND`). The validated fix is host-layer `(allow network-outbound)`. Per-command `atomic_exec` network denial is still enforced separately by the **broker**, so opening host network does NOT loosen `atomic_exec`; proven by `gates/external-runtime-denial.proof.mjs` + `gates/atomic-exec-broker.proof.mjs`.
3. **atomic-edit MCP handshake** — `scripts/mcp/atomic-edit-mcp-launcher.sh` fails closed (`exit 79/80`) if host env + a live broker socket aren't inherited, and a cold `node build.mjs` can exceed the 45s startup timeout. dist is currently present/fresh, so this is resolved once #1+#2 hold and the timeout is raised (#4).
4. **MCP startup timeouts too low** — `~/.codex/config.toml`: most entries use the 30s default; the network-dependent ones hang (symptom of #2) and cold `npx`/`uvx` first-runs exceed 30s.

## Why a doc (not applied directly)

`scripts/mcp/atomic-edit/**` is locked behind the atomic-OS **self-expansion guard**. The only legal editor is `atomic_expand_self`, whose mandatory validator lattice includes `gates/codex-entrypoint-contract.proof.mjs`, which goes RED in a **Claude**-host session (the Claude launcher does not pin `CODEX_PROJECT_DIR`/`TMPDIR=repoRoot`; the Codex launcher does). Confirmed empirically: an `atomic_expand_self` attempt for patch 1 rolled back on
`codex-entrypoint-contract.proof.mjs`, `compiled-mcp-y-certificate.proof.mjs`, `codex-atomic-only-hook.proof.mjs`.
**=> Apply these from a freshly-relaunched Codex-host session** (where `codex-entrypoint-contract` is green), via one `atomic_expand_self` call carrying patches 1–4 together (the hook + its proof + the launcher + the launcher proof must change as one coherent expansion). Patch 5 (`~/.codex/config.toml`) is outside the repo — edit it with any editor.

---

## Patch 1 — `scripts/mcp/atomic-edit/codex-atomic-only-hook.mjs` (full replacement)

Reorders: atomic-edit tools + computation-free planner controls are admitted BEFORE the host-sandbox check; native/non-atomic tools still require the host sandbox AND are still denied when hosted.

```js
#!/usr/bin/env node
/**
 * codex-atomic-only-hook.mjs — strict Codex CLI closed-loop protocol.
 *
 * Codex may not execute computation through native/TUI tools. A tool call has
 * exactly two legal shapes: (1) an atomic-edit MCP tool, or (2) an atomic-edit
 * MCP edit tool used to expand atomic-edit itself. Everything else is denied
 * fail-closed.
 *
 * BOOTSTRAP ORDERING: atomic-edit MCP tools are admitted BEFORE the host-sandbox
 * requirement is checked. Atomic tools self-enforce the admission envelope (a
 * per-command broker sandbox) and are the only way to repair the host launcher
 * itself, so requiring the host sandbox before allowing them creates a deadlock
 * where a session whose host env did not propagate can never use atomic tools to
 * fix the host. Non-atomic tools still require the host sandbox.
 */
import { readFileSync } from 'node:fs';

const ATOMIC_TOOL_RE = /^(?:mcp__atomic_edit(?:\.|__)|mcp__atomic-edit__|atomic-edit__|atomic_edit__)/;

// Codex planner/meta controls carry no computation (no fs/network/exec) and must
// stay usable even before the host sandbox is active — e.g. so a blocked session
// can still record/inspect its goal. Tight, named allowlist ONLY: never widen to
// a wildcard or the native-tool bypass this hook exists to prevent reopens.
const CODEX_CONTROL_RE = /^(?:update_goal|update_plan|get_goal|get_plan)$/;

function readStdinRaw() {
  try {
    return readFileSync(0, 'utf8') || '';
  } catch {
    return '';
  }
}

function parseToolName(input) {
  return String(input?.tool_name ?? input?.toolName ?? input?.name ?? input?.recipient_name ?? '');
}

function hostSandboxActive() {
  return process.env.ATOMIC_HOST_SANDBOX === 'macos-sandbox-exec' && process.env.ATOMIC_HOST_ATOMIC_ONLY === '1';
}

function deny(reason) {
  const payload = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

function allow() {
  process.exit(0);
}

const raw = readStdinRaw();
let input;
try {
  input = JSON.parse(raw);
} catch {
  deny(
    'Codex atomic-only protocol refused an unparsable tool call (fail-closed). ' +
      'Retry through an atomic-edit MCP tool. If the required computation is missing, first use atomic-edit tools to implement that computation inside atomic-edit.',
  );
}

const tool = parseToolName(input);

// Bootstrap admission: atomic-edit tools and computation-free Codex planner
// controls are always legal, BEFORE the host-sandbox requirement.
if (ATOMIC_TOOL_RE.test(tool) || CODEX_CONTROL_RE.test(tool)) allow();

if (!hostSandboxActive()) {
  deny(
    `Codex atomic-only protocol requires the host sandbox before any non-atomic tool call; "${tool || '<unknown>'}" was refused. ` +
      'Relaunch Codex through scripts/mcp/atomic-edit/codex-atomic-host-launcher.mjs so the process, filesystem writes, temp writes, and network boundary are controlled before atomic tools execute.',
  );
}

deny(
  `Codex atomic-only protocol: native/non-atomic tool "${tool || '<unknown>'}" is forbidden. ` +
    'Only atomic-edit MCP tools may execute computation. If no existing atomic tool can perform this action, ' +
    'the next legal action is to use atomic-edit itself (atomic_create_file, atomic_replace_text, atomic_edit_symbol, ' +
    'atomic_transaction, atomic_exec inside its admission envelope, etc.) to implement the missing computation inside atomic-edit first. ' +
    'Positive actions must create only admitted byte-correct results; negative actions must be routed through atomic gates that prove the target bytes are non-correct/removable, never through native tooling.',
);
```

## Patch 1b — `scripts/mcp/atomic-edit/codex-atomic-only-hook.proof.mjs` (REQUIRED with patch 1)

The reorder makes "unhosted atomic is denied" FALSE by design, so the first proof check must flip. Replace the block at lines ~70–78:

**OLD:**
```js
const unhostedAtomic = run({ tool_name: 'mcp__atomic_edit.atomic_exec', tool_input: { command: 'pwd' } });
const unhostedAtomicBody = parsed(unhostedAtomic.stdout);
check(
  'unhosted Codex is denied before atomic tools can run',
  unhostedAtomic.status === 0 &&
    isDeny(unhostedAtomicBody) &&
    /requires the host sandbox/.test(denialReason(unhostedAtomicBody)),
  unhostedAtomic.stdout || unhostedAtomic.stderr,
);
```
**NEW:**
```js
const unhostedAtomic = run({ tool_name: 'mcp__atomic_edit.atomic_exec', tool_input: { command: 'pwd' } });
check(
  'unhosted Codex still admits atomic tools so a broken session can self-repair',
  unhostedAtomic.status === 0 && unhostedAtomic.stdout === '',
  unhostedAtomic.stdout || unhostedAtomic.stderr,
);
const unhostedNative = run({ tool_name: 'Bash', tool_input: { command: 'pwd' } });
const unhostedNativeBody = parsed(unhostedNative.stdout);
check(
  'unhosted native tool is denied (requires host sandbox)',
  unhostedNative.status === 0 &&
    isDeny(unhostedNativeBody) &&
    /requires the host sandbox/.test(denialReason(unhostedNativeBody)),
  unhostedNative.stdout || unhostedNative.stderr,
);
const unhostedPlanner = run({ tool_name: 'update_goal', tool_input: {} });
check(
  'unhosted planner control is admitted (computation-free)',
  unhostedPlanner.status === 0 && unhostedPlanner.stdout === '',
  unhostedPlanner.stdout || unhostedPlanner.stderr,
);
```
(The remaining hosted-tool checks are unchanged and still pass.)

## Patch 2 — `scripts/mcp/atomic-edit/codex-atomic-host-launcher.mjs` (`sandboxProfile`)

Use a host-wide outbound allow after `...codexRuntimeNetworkRules(codexHome),` and before `'(allow file-write* (literal "/dev/null"))'`. Keep `(deny default)`; do NOT add the literal `(allow network*)` (a proof forbids that token). The narrower `remote ip "*:443"`/`"*:80"` form was rejected by live validation because DNS resolution still failed.

**OLD (lines 78–82):**
```js
    ...codexRuntimeWriteRules(codexHome),
    ...codexRuntimeNetworkRules(codexHome),
    '(allow file-write* (literal "/dev/null"))',
    '(allow file-write* (literal "/dev/stdout"))',
    '(allow file-write* (literal "/dev/stderr"))',
```
**NEW:**
```js
    ...codexRuntimeWriteRules(codexHome),
    ...codexRuntimeNetworkRules(codexHome),
    // Codex's reasoning stream, DNS, and several MCPs are HTTP/remote.
    // atomic_exec remains network-denied by the out-of-sandbox broker.
    '(allow network-outbound)',
    '(allow network-inbound (local ip "localhost:*"))',
    '(allow file-write* (literal "/dev/null"))',
    '(allow file-write* (literal "/dev/stdout"))',
    '(allow file-write* (literal "/dev/stderr"))',
```

## Patch 3 — `scripts/mcp/atomic-edit/gates/whole-host-sandbox-launcher.proof.mjs` (REQUIRED with patch 2)

This proof used to assert "network denied from child". After patch 2 it must assert DNS resolution at the host layer; filesystem containment is still asserted by the other checks.

**(a) currentBoundaryProof:**
```js
  const network = childProcess.spawnSync(
    process.execPath,
    [
      '-e',
      'const dns=require("node:dns"); dns.lookup("developers.openai.com", (error) => { if (error) { console.error(error.code || error.message); process.exit(3); } process.exit(0); });',
    ],
    { cwd: repoRoot, encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  record(
    results,
    'current host boundary resolves DNS for Codex HTTP MCPs (per-command atomic_exec stays broker-denied)',
    network.status === 0,
    { status: network.status, stdout: network.stdout, stderr: network.stderr },
  );
```
**(b) launcherProof:**
```js
  const network = run('node -e "const dns=require(\\\"node:dns\\\"); dns.lookup(\\\"developers.openai.com\\\", (error) => { if (error) { console.error(error.code || error.message); process.exit(3); } process.exit(0); });"');
  record(results, 'launcher resolves DNS for Codex HTTP MCPs (per-command atomic_exec stays broker-denied)', network.status === 0, {
    status: network.status,
    stdout: network.stdout,
    stderr: network.stderr,
  });
```
> The real per-command guarantee (atomic_exec network = denied) is asserted by `gates/external-runtime-denial.proof.mjs` + `gates/atomic-exec-broker.proof.mjs` — leave those unchanged; they are the safety net.

## Patch 4 — `scripts/mcp/atomic-edit/gates/codex-entrypoint-contract.proof.mjs`

Rename the stale static contract key from `hostAllowsOnlyBrokerSocketNetwork` to `hostAllowsCodexOutboundNetwork`. The condition still checks `(deny default)` present + `allow network-outbound` present + `(allow network*)` absent, but the name no longer implies the host permits only the broker socket.

## Patch 5 — `~/.codex/config.toml` (outside repo; edit directly)

Add `startup_timeout_sec` directly under each `[mcp_servers.<name>]` header (before any `.tools.*` sub-table). The HTTP entries (`openaiDeveloperDocs`) only work after patch 2 — no timeout helps them.

```toml
[mcp_servers.atomic-edit]
startup_timeout_sec = 120.0   # was 45.0 — cover a cold `node build.mjs`
[mcp_servers.context7]
startup_timeout_sec = 120.0   # npx cold-fetch
[mcp_servers.sequential-thinking]
startup_timeout_sec = 120.0
[mcp_servers.beads]
startup_timeout_sec = 120.0   # was 30.0 — uvx cold-fetch
[mcp_servers.stripe]
startup_timeout_sec = 90.0
[mcp_servers.codacy]
startup_timeout_sec = 90.0
[mcp_servers.github]
startup_timeout_sec = 90.0
[mcp_servers.sentry]
startup_timeout_sec = 90.0
[mcp_servers.railway]
startup_timeout_sec = 90.0
[mcp_servers.datadog]
startup_timeout_sec = 90.0
[mcp_servers.codecov]
startup_timeout_sec = 90.0
[mcp_servers.mercadopago]
startup_timeout_sec = 90.0
[mcp_servers.vercel]
startup_timeout_sec = 90.0
[mcp_servers.obsidian]
startup_timeout_sec = 90.0
```

---

## How to apply (one expansion, from a fresh Codex-host session)

1. Edit `~/.codex/config.toml` per patch 5 (any editor; it's outside the repo) — do this FIRST so the relaunched session gives MCPs enough startup time.
2. Relaunch: `node scripts/mcp/atomic-edit/codex-atomic-host-launcher.mjs -- codex` (this session pins `CODEX_PROJECT_DIR`/`TMPDIR`, so `codex-entrypoint-contract` is green; the hook allows atomic tools because host env is active).
3. In that Codex session, run ONE `atomic_expand_self` whose `files[]` carries patches 1, 1b, 2, 3 as `op: "replace"` with the full corrected content of each file (read each current file, apply the snippet, supply the result). Suggested `proofCommands`:
   - `node gates/no-bypass-static-policy.proof.mjs --json`
   - `node codex-atomic-only-hook.proof.mjs --json`
   - `node gates/whole-host-sandbox-launcher.proof.mjs --json`
   - `node gates/codex-entrypoint-contract.proof.mjs --json`
   - `node gates/external-runtime-denial.proof.mjs --json`  (must stay green: atomic_exec still network-denied)
4. After it sticks: open a brand-new Codex session, run `/mcp`, confirm atomic-edit + the HTTP/remote MCPs connect and the stream works.

## Governance note

- Network posture change (patch 2) **approved by Daniel on 2026-06-01**. It aligns the Codex launcher with the existing Claude launcher (host network allowed; per-command `atomic_exec` stays network-denied via the broker). The only remaining host-layer guarantee is filesystem containment (writes confined to repo + `CODEX_HOME`) + per-command broker denial.
- Patches 1/1b widen the strict hook to admit a tight, named planner-control allowlist. Do NOT broaden it to a wildcard.
