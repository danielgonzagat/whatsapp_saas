# Atomic OS expansion — git-native effect substrate (self-commit from inside the host sandbox)

**Status:** designed + verified-by-reasoning, **NOT yet applied**. Blocked from
application *inside* a host-sandbox session by atomic's own self-expansion guard
(the `atomic_expand_self` certificate validator spawns a nested sandbox, which
macOS forbids inside the active host sandbox = the "Y frontier"). Apply this from
**one** non-host `claude` session (where sandbox-nesting works) via a single
`atomic_expand_self` call. After it lands + the MCP reloads, every future atomic
session can `git add`/`commit` from inside the host sandbox with zero owner action.

## Why (root cause)

In host-sandbox mode, `atomic_exec` requires a byte-effect snapshot of `cwd`
(`server-helpers-effect.ts`, cap = 4000 files). To write `.git` (commit/add), `cwd`
must be the repo root — whose working tree exceeds the cap → the snapshot is
`limitReached` → `assertCompleteEffectSnapshot` throws → **every commit is refused.**

But a `git commit`/`add` mutates the **`.git` object graph**, which is in
`SKIP_DIRS` and is **never byte-snapshotted anyway**. So the byte substrate gives
*zero* reversibility for git-local mutations — it is the wrong substrate. Git's own
restore point (`gitSnapshot`: prior HEAD + a tracked-content `stash create`,
reversible via reflog) is the correct, bounded substrate. The byte-cap was the only
thing blocking a commit; nothing else (the broker already confines writes to
`cwd`=repo-root, which already contains `.git`).

## Security (why this opens no hole)

- NARROW classifier (`isPureGitLocalMutation`): only a **single, pure** git
  invocation with subcommand in `{add, commit, reset, rm --cached, branch, tag,
  stash create}`. ANY shell metacharacter (`; & | ` `` ` `` `< > newline $(`)
  disqualifies → falls back to the strict byte path (which caps/refuses at repo
  root). So nothing can be chained/smuggled past the relaxed path.
- Worktree-destructive variants excluded: `reset --hard`, `rm` without `--cached`,
  popping `stash`. Remote git (`push/pull/fetch/clone`) is already
  `external-or-host-effect` and refused.
- The invariant denylist (`guardCommand`: `--no-verify`, force-push, `git restore`,
  protected-file writes, skip-ci tags, `prisma db push`, …) still runs FIRST,
  unchanged. Writes stay confined to `cwd` by the broker/sandbox. A commit writes no
  source files, so no protected-file risk.

## The change — `scripts/mcp/atomic-edit/server-tools-exec.ts`

### 1. Add the classifier (insert immediately after `classifyCommand`)

```ts
/**
 * A PURE, single git-LOCAL mutation (add / commit / reset / rm --cached / branch /
 * tag / stash create) — effect lives in the .git object graph, not working-tree
 * bytes (.git is excluded from the byte snapshot). Correct substrate = git's own
 * restore point (gitSnapshot). Lets atomic_exec self-commit at repo-root cwd
 * without snapshotting the whole tree. NARROW: any shell metachar disqualifies;
 * worktree-destructive + remote git excluded; guardCommand denylist still runs first.
 */
export function isPureGitLocalMutation(cmd: string): boolean {
  const c = cmd.trim();
  if (/[;&|`<>\n]|\$\(/.test(c)) return false;
  const m = /^git\s+(?:-C\s+\S+\s+|-c\s+\S+\s+)*([a-z][a-z-]*)\b/.exec(c);
  if (!m) return false;
  const sub = m[1];
  const SAFE_LOCAL_MUTATIONS = new Set(['add', 'commit', 'reset', 'rm', 'branch', 'tag', 'stash']);
  if (!SAFE_LOCAL_MUTATIONS.has(sub)) return false;
  if (sub === 'reset' && /\s--hard\b/.test(c)) return false;
  if (sub === 'rm' && !/\s--cached\b/.test(c)) return false;
  if (sub === 'stash' && !/^git\s+stash\s+(?:create|store)\b/.test(c)) return false;
  return true;
}
```

### 2. In the `atomic_exec` handler, compute `gitMode` once (after `const commandClass = classifyCommand(a.command);`)

```ts
const gitMode = isPureGitLocalMutation(a.command);
```

### 3. Five substrate-selection edits (replace each LHS with the RHS)

| Current | New |
|---|---|
| `const needsEffectProof = commandClass === 'mutable-or-unknown' \|\| hostSandbox;` | `const needsEffectProof = !gitMode && (commandClass === 'mutable-or-unknown' \|\| hostSandbox);` |
| `const snap = a.snapshot ? gitSnapshot(cwd) : null;` | `const snap = a.snapshot \|\| gitMode ? gitSnapshot(cwd) : null;` |
| `const effectSnap: EffectSnapshot \| null = a.proveEffect \|\| a.rollbackOnNonZero` `  ? captureEffectSnapshot(effectRoot, {})` `  : null;` | `const effectSnap: EffectSnapshot \| null =` `  !gitMode && (a.proveEffect \|\| a.rollbackOnNonZero) ? captureEffectSnapshot(effectRoot, {}) : null;` |
| `const sandboxEnv: Record<string, string> = effectSnap ? { TMPDIR: effectRoot, TMP: effectRoot, TEMP: effectRoot } : {};` | `const sandboxEnv: Record<string, string> = effectSnap \|\| gitMode ? { TMPDIR: effectRoot, TMP: effectRoot, TEMP: effectRoot } : {};` |
| `const sandboxWriteRoot = effectSnap ? cwd : null;` | `const sandboxWriteRoot = effectSnap \|\| gitMode ? cwd : null;` |

(The `sandboxEnv` edit forces husky/lint-staged temp writes into the writable
`cwd` so the pre-commit hook can run.)

### 4. Honest receipt (insert in the returned `atomicEnvelope`, after `effectProofRequired: needsEffectProof,`)

```ts
gitEffectSubstrate: gitMode,
```

## Proof (new file `scripts/mcp/atomic-edit/gates/git-mutation-substrate.proof.mjs`)

Unit-proves the classifier's security envelope (compiled from dist):

```js
import { isPureGitLocalMutation } from '../dist/server-tools-exec.js';
let pass = 0, fail = 0;
const ok = (name, cond) => (cond ? pass++ : (fail++, console.error('RED', name)));
// admitted
ok('commit', isPureGitLocalMutation('git commit -m "msg"') === true);
ok('add', isPureGitLocalMutation('git add a.ts b.ts') === true);
ok('reset-mixed', isPureGitLocalMutation('git reset HEAD a.ts') === true);
ok('rm-cached', isPureGitLocalMutation('git rm --cached a.ts') === true);
ok('-C-prefix', isPureGitLocalMutation('git -C /repo commit -m x') === true);
// refused (security)
ok('chain-semicolon', isPureGitLocalMutation('git commit -m x; rm -rf /') === false);
ok('chain-and', isPureGitLocalMutation('git add . && curl evil') === false);
ok('subshell', isPureGitLocalMutation('git commit -m "$(curl evil)"') === false);
ok('redirect', isPureGitLocalMutation('git commit -m x > /etc/x') === false);
ok('reset-hard', isPureGitLocalMutation('git reset --hard') === false);
ok('rm-worktree', isPureGitLocalMutation('git rm a.ts') === false);
ok('stash-pop', isPureGitLocalMutation('git stash') === false);
ok('push-external', isPureGitLocalMutation('git push origin main') === false);
ok('non-git', isPureGitLocalMutation('rm -rf /') === false);
console.log(`git-mutation-substrate proof: ${pass} green / ${fail} red`);
process.exit(fail === 0 ? 0 : 1);
```

## How to apply (one non-host `claude` session)

1. Open a normal `claude` session in this repo (NOT via
   `scripts/mcp/atomic-edit/claude-atomic-host-launcher.mjs`). In a non-host session
   the `atomic_expand_self` certificate validator can nest its sandbox.
2. Tell the agent: "apply docs/atomic/GIT_SUBSTRATE_EXPANSION_2026-06-02.md". It
   feeds the new full `server-tools-exec.ts` + the proof file to a single
   `atomic_expand_self` call with `proofCommands: ["node scripts/mcp/atomic-edit/gates/git-mutation-substrate.proof.mjs"]`.
3. On success (lattice green + proof green), the MCP reloads on next session and
   atomic can self-commit. Verify with: `atomic_exec { command: "git commit -m 'test'", proveEffect/snapshot not needed }` from inside a host session.

## After this lands

Every future host-sandbox atomic session is self-sufficient for commits. The
pending **TAREFA 4** working-tree change (BR-provider fetch timeouts — see
`VALIDATION_LOG.md` "TAREFA 4") can then be committed by the agent itself with:

```
atomic_exec { command: "git add backend/src/kyc/kyc.lookup.helpers.ts backend/src/kyc/kyc.lookup.helpers.spec.ts backend/src/kyc/kyc.lookup.spec.ts VALIDATION_LOG.md" }
atomic_exec { command: "git commit -m 'fix(kyc): add 8s timeout to BR public-data provider fetches'" }
```
