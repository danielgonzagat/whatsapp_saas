#!/usr/bin/env node
/**
 * TUI-abolished enforcement (Daniel, 2026-05-15, ratified & repeated).
 *
 * "Casca nativa fica; renderer de diff nativo morre." The Claude Code TUI
 * draws a whole-line +/- block ONLY for the built-in Edit/Write/MultiEdit/
 * NotebookEdit tools — and that renderer cannot be disabled from inside.
 * So we BAN those tools for code: every code mutation must go through
 * mcp__atomic-edit__* (whose result carries the char-level atomicDiff +
 * FounderBlock — the only permitted visual proof).
 *
 * PreToolUse hook protocol: read the tool call on stdin. For allowed tools,
 * exit 0 silently; for denied tools, emit a structured deny decision and
 * steer to the atomic tool. Non-code (pure docs/text) and all non-edit
 * tools pass through, so the session is never bricked for prose.
 *
 * Honest scope: this enforces avoidance (the harness then renders nothing
 * for code edits and the tool output is the only thing shown). It does NOT
 * "disable the renderer" — that is impossible; avoidance is the mechanism.
 */
import { readFileSync } from 'node:fs';

const NATIVE_EDIT = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
// Code/structured files the atomic-edit engine validates. Pure prose
// (.md/.txt/none) is NOT blocked — Daniel's rule is about *code*.
const CODE_EXT =
  /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|ipynb|json|py|go|rs|java|kt|c|h|cc|cpp|hpp|cs|rb|php|swift|scala|sh|bash|zsh|css|scss|less|sql|ya?ml|toml|prisma|vue|svelte|astro|erb)$/i;
// Prose/docs that genuinely carry no executable config or credential surface — the ONLY
// extensions a native Write/Edit may target without the atomic security/byte gates. Rank-7
// no-bypass fix: the old `!CODE_EXT` allow let native Write reach `.env`, `.html`, a `.csv`,
// or an extensionless dotfile (`.npmrc`/`Dockerfile`) — so a `.env` with `sk_live_…` landed
// with NO security scan. Allow-prose-only routes every secret/config-bearing file through
// atomic (which security-scans), deny-by-default. Atomic_create_file handles any text the
// Write tool can produce, so routing is always feasible.
const PROSE_EXT = /\.(md|markdown|mdx|txt|text|rst|adoc|asciidoc)$/i;

function readStdinRaw() {
  try {
    return readFileSync(0, 'utf8') || '';
  } catch {
    return '';
  }
}

// FAIL CLOSED: an enforcement gate that cannot parse its own input must not
// wave the call through (the A/B loop proved fail-open lets large-heredoc
// writes slip past). On parse failure we DENY; the agent simply retries
// (transient) or routes the code change through mcp__atomic-edit__*.
const rawStdin = readStdinRaw();
let input;
try {
  // Empty stdin is NOT valid input — JSON.parse('') throws here and the catch
  // below denies (fail-closed), matching the documented contract. (Do NOT
  // default to '{}': that silently allowed an empty/truncated hook payload.)
  input = JSON.parse(rawStdin);
} catch {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'atomic-only hook could not parse the tool call; refusing for safety ' +
          '(fail-closed). Retry the call, or make code changes via ' +
          'mcp__atomic-edit__* (atomic_create_file / atomic_replace_range / …).',
      },
    }),
  );
  process.exit(0);
}
const tool = input.tool_name ?? input.toolName ?? '';
const ti = input.tool_input ?? input.toolInput ?? {};
const filePath = ti.file_path ?? ti.filePath ?? ti.path ?? '';

const allow = () => {
  // Codex treats an explicit permissionDecision as a blocking/asking decision.
  // Allowing a tool is represented by exit 0 with no hook decision payload.
  process.exit(0);
};

const deny = (reason) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
};

const STEER =
  `The atomic-edit tools ARE active in this session — call them DIRECTLY by ` +
  `their exact name, do NOT use ToolSearch to look for them, and do NOT ` +
  `conclude they are absent. To create a NEW file: call the tool named ` +
  `mcp__atomic-edit__atomic_create_file with { "file": "<repo-relative path>", ` +
  `"content": "<full file content>" }. To change an existing file: ` +
  `mcp__atomic-edit__atomic_replace_range / atomic_edit_symbol / ` +
  `atomic_replace_text / atomic_apply_edits / atomic_add_import. To read ` +
  `structure first: mcp__atomic-edit__code_outline / code_read_symbol. ` +
  `Each returns the char-level [-removed-]{+added+} + FounderBlock proof. ` +
  `If (and only if) a tool's schema is not visible, run ToolSearch with the ` +
  `EXACT query "select:mcp__atomic-edit__atomic_create_file,` +
  `mcp__atomic-edit__atomic_replace_range,mcp__atomic-edit__atomic_edit_symbol,` +
  `mcp__atomic-edit__atomic_apply_edits,mcp__atomic-edit__code_outline" then ` +
  `call them. NEVER fall back to a native or shell edit; that path is blocked.`;

// Camada 3 (Bash leg): a shell command can edit a code file too (sed -i,
// > redirection, tee, perl -i …) and would bypass the Edit/Write ban. Deny
// ONLY the unambiguous in-place code-content mutations — everything else
// (npm/git/node/build/prettier/grep/cat …) passes, so workflows are safe.
function bashEditsCode(cmd) {
  if (!cmd) return false;
  const source = String(cmd);
  const codeTarget = String.raw`(?!(?:/tmp/|/private/tmp/|tmp/))[^\s'"|;&>]*\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|ipynb|json|py|go|rs|java|kt|c|h|cc|cpp|hpp|cs|rb|php|swift|scala|sh|bash|zsh|css|scss|less|sql|ya?ml|toml|prisma|vue|svelte|astro|erb)\b`;
  const directMutationPatterns = [
    new RegExp(String.raw`\bsed\b[^|]*\s-i`), // sed -i
    new RegExp(String.raw`\bperl\b[^|]*\s-i`), // perl -i
    new RegExp(String.raw`\b(?:g?awk)\b[^|]*>\s*${codeTarget}`), // awk > code
    new RegExp(String.raw`\btee\b[^|]*\s+\\?["']?\s*${codeTarget}`), // tee [quoted] code
    new RegExp(String.raw`(?:^|[\s;&|])>{1,2}(?!>)\s*\\?["']?\s*${codeTarget}`), // > / >> [quoted] code
    new RegExp(String.raw`\b(?:cp|mv|install)\b[^|]*\s${codeTarget}(?:\s|$)`), // cp/mv/install onto code
    new RegExp(String.raw`\b(?:rm|unlink|truncate|touch)\b[^|;&]*${codeTarget}`), // delete/truncate/create code
    new RegExp(String.raw`\b(?:ed|ex)\b[^|;&]*${codeTarget}`), // ed/ex line editor in-place on code
  ];
  if (directMutationPatterns.some((re) => re.test(source))) return true;

  // Heredocs are not inherently writes. The direct mutation regexes above
  // already catch `cat > x.ts <<EOF`, `tee x.ts <<EOF`, and redirects into
  // code files. Keep read-only diagnostic heredocs legal even when they mention
  // code paths for spawned probes.

  // Inline-eval interpreters (node -e / python -c / ruby -e / php -r / deno
  // eval / bun -e / perl -pe …) are the Write-bypass vector observed in the
  // atomic A/B loop. If the inline script carries ANY write/delete/rename
  // primitive, deny UNCONDITIONALLY — no code-target token required. Read-only
  // inline evals carry none of these and stay allowed.
  const inlineEval =
    /\b(?:node|deno|bun|ts-node|tsx|python3?|ruby|php|perl)\b[^\n]*?(?:\s-(?:e|pe?|c|r)\b|--eval\b|\beval\b)/;
  const writePrim =
    /(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|promises\s*\.\s*(?:write|appendFile|rename|cp|rm|unlink|mkdir)|fs\s*\.\s*write|open\s*\([^)]*['"][wax+]|truncate\s*\(|renameSync|\.rename\s*\(|copyFileSync|copyfile\s*\(|cpSync|rmSync|unlinkSync|mkdirSync|Deno\s*\.\s*(?:writeTextFile|writeFile|create|remove|rename)|write_text|os\.replace|shutil\.(?:move|copy|copyfile))/;
  if (inlineEval.test(source) && writePrim.test(source)) return true;
  if (/\bdd\b[^|]*\bof=/.test(source)) return true;

  const mentionsCodeTarget = new RegExp(codeTarget).test(source);
  if (!mentionsCodeTarget) return false;

  const runtimeWritePatterns = [
    /\b(?:python3?|node|ruby|php)\b[\s\S]*(?:writeFileSync|writeFile|appendFileSync|appendFile|write_text|open\s*\([^)]*['"][wa+]|truncate\s*\(|rename\s*\(|copyfile\s*\()/,
    /\b(?:node|deno|bun)\b[\s\S]*(?:fs\.|node:fs|Deno\.)[\s\S]*(?:write|append|rename|copyFile|truncate|rm|unlink|mkdir)/,
  ];
  return runtimeWritePatterns.some((re) => re.test(source));
}

// Camada 4 (Bash exec leg): the strict directive routes ALL execution through
// atomic_exec. So general shell that atomic_exec handles (npm test / node / ls /
// cat / jq / tsc / build / read-only git …) is DENIED here and steered to
// atomic_exec. ESCAPE — atomic_exec genuinely cannot/should-not run these, so
// they pass natively:
//   (a) network/remote (git push|pull|fetch|clone, curl, wget, ssh, scp, rsync)
//   (b) local git that mutates the index/worktree (commit|add|stash|checkout|
//       reset|merge|rebase|tag|cherry-pick) — atomic_exec's effect-proof cannot
//       snapshot the whole repo (cap), so these stay native to keep git usable
//   (c) interactive/login/privileged/provider (claude, ssh, sudo, gcloud, op, gh…)
//   (d) package install/publish (npm/pip/cargo install|publish — external registry)
//   (e) shell control-flow / cd / source / subshell openers
// Gated by ATOMIC_EXEC_MANDATORY (default on); set ATOMIC_EXEC_MANDATORY=0 to disable.
//
// CLOSED HOLE (Daniel, 2026-06-01): the first-token verb check let a WRAPPER
// smuggle arbitrary execution past routing — `bash -c …`, `( … )`, a `for`/`if`
// loop, an env-prefix (`FOO=bar node …`), or an exec-prefix (`time`/`nice`/
// `nohup`/`timeout`/`env`). Two defences below: (1) effectiveCommand() peels
// env-assignments + benign exec-prefix wrappers so the EFFECTIVE verb is what
// actually runs; (2) escape tokens are matched at command-HEAD positions over
// the whole string (start, after ; & | ( {, or after `-c "`), so a wrapped
// `git push`/`curl`/`sudo` still escapes while a routable wrapper/loop/subshell
// now correctly ROUTES into the atomic envelope.

// Peel leading env-assignments + benign exec-prefix wrappers to the program that
// actually runs. `FOO=bar time nice -n5 node x` -> `node x`.
function effectiveCommand(c) {
  let s = String(c || '').trim();
  let prev = null;
  let guard = 0;
  while (s !== prev && guard++ < 12) {
    prev = s;
    s = s.replace(/^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]*)\s+/, '');
    const m = s.match(/^(?:time|nice|nohup|stdbuf|command|exec|timeout|ionice|setsid|env)\b\s*/);
    if (m) {
      let rest = s.slice(m[0].length);
      rest = rest.replace(/^(?:-{1,2}[A-Za-z0-9._-]+(?:=\S+)?\s+)*/, ''); // -flags
      rest = rest.replace(/^(?:\d+(?:\.\d+)?[smhd]?\s+)?/, ''); // numeric arg (timeout 30)
      s = rest.trim();
    }
  }
  return s.trim();
}

// Genuine escapes (atomic_exec cannot/should-not run) matched at command-HEAD
// positions over the WHOLE command, so a wrapper can't smuggle them past the
// first-token check, yet an escape verb appearing as a mere path argument
// (e.g. `cat docker-compose.yml`) does NOT spuriously escape.
function hasEscapeToken(c) {
  const s = String(c || '');
  const H = String.raw`(?:^|[\n;&|({]|-c\s+["']?)\s*`;
  const net = new RegExp(
    H +
      String.raw`(?:git\s+(?:push|pull|fetch|clone|remote|submodule|lfs)|curl|wget|ssh|scp|sftp|rsync)\b`,
  );
  const gitMut = new RegExp(
    H +
      String.raw`git\s+(?:commit|add|stash|checkout|switch|reset|restore|merge|rebase|tag|cherry-pick|revert|rm|mv|clean|apply|am)\b`,
  );
  const interactive = new RegExp(
    H +
      String.raw`(?:claude|codex|opencode|hermes|vim|vi|nano|emacs|less|more|top|htop|ssh|scp|sudo|su|doas|gcloud|aws|az|kubectl|helm|docker|podman|op|kaisser|railway|vercel|stripe|gh|psql|mysql|mongosh|redis-cli|open|code|subl)\b`,
  );
  const pkg = new RegExp(
    H +
      String.raw`(?:npm|pnpm|yarn|bun|pip|pipx|poetry|cargo|go|gem|bundle|composer)\s+(?:install|add|update|publish|deploy|i|ci)\b`,
  );
  return net.test(s) || gitMut.test(s) || interactive.test(s) || pkg.test(s);
}

function shouldRouteThroughAtomicExec(cmd) {
  // The mandatory routing may be self-disabled (ATOMIC_EXEC_MANDATORY=0) ONLY outside an
  // atomic-only host envelope. In a host-launched session (ATOMIC_HOST_ATOMIC_ONLY=1) the
  // disable is IGNORED — a closed-loop session cannot neutralize routing by exporting the
  // env var (rank-6 no-bypass hole). Owner config outside the envelope is still honored.
  if (process.env.ATOMIC_EXEC_MANDATORY === '0' && process.env.ATOMIC_HOST_ATOMIC_ONLY !== '1')
    return false;
  const raw = String(cmd || '').trim();
  if (!raw) return false;
  // Genuine escape anywhere (even wrapped) -> leave native; atomic_exec can't run it.
  if (hasEscapeToken(raw)) return false;

  const eff = effectiveCommand(raw);
  const verb = (eff.split(/\s+/)[0] || '').split('/').pop();

  // Shell-wrapper / control-flow / subshell with no escape token: atomic_exec
  // wraps the whole string in `/bin/bash -c`, so it CAN run it. Route it.
  if (/^(?:bash|sh|zsh|dash|ksh)$/.test(verb) && /\s-c\b/.test(eff)) return true;
  if (/^(?:for|if|while|until|case|select|function)$/.test(verb)) return true;
  if (/^[({]/.test(eff)) return true;

  // Route-by-default (Daniel, 2026-06-02 — rank-1 no-bypass hole). After the genuine-
  // escape filter (`hasEscapeToken` returned false above) and the wrapper/control-flow
  // branches, EVERY remaining command routes through the atomic envelope. The prior
  // fixed allowlist let any non-listed program run NATIVELY, fully outside atomic —
  // python3/python/ruby/perl/php/osascript/Rscript/lua/julia/dotnet/swift/groovy and any
  // `./local-bin` or `/abs/path/bin`. `osascript -e` alone can drive the whole macOS GUI
  // and the network, uncounted. Routing-by-default is strictly MORE coverage than the
  // allowlist (monotonic: every verb the allowlist routed still routes), and atomic_exec
  // runs them all via `/bin/bash -c` under snapshot + trace + rollback. The only residual
  // is a bare interactive REPL (`node`/`python3` with no script): atomic_exec gets EOF on
  // a non-TTY stdin and the command timeout bounds it — acceptable vs. the leak it closes.
  // `verb`/`eff` above still gate the wrapper/control-flow short-circuits; this fallthrough
  // is the new default for everything the escape filter did not exempt.
  return true;
}

// Destructive worktree escapes that atomic_exec deliberately cannot reverse (no
// whole-repo snapshot) and that `hasEscapeToken` would otherwise wave through to NATIVE
// Bash — silently destroying uncommitted human/agent work. These are DENIED outright
// (not routed, not allowed): `git restore` (CLAUDE.md ABSOLUTE prohibition), `git reset
// --hard`, `git clean -f…`, and the file-restore forms of checkout (`checkout -- <path>`,
// `checkout .`). Branch ops (checkout <branch>, switch, reset --soft) are NOT matched.
// Matched at command-HEAD positions so a mere path argument (`cat git-restore.md`) never
// trips it.
function isDestructiveWorktreeEscape(c) {
  const s = String(c || '');
  const H = String.raw`(?:^|[\n;&|({]|-c\s+["']?)\s*`;
  const gitRestore = new RegExp(H + String.raw`git\s+restore\b`);
  const gitResetHard = new RegExp(H + String.raw`git\s+reset\b[^\n;&|]*?\s--hard\b`);
  const gitCleanForce = new RegExp(H + String.raw`git\s+clean\b[^\n;&|]*?\s-[A-Za-z]*f`);
  const gitCheckoutPath = new RegExp(
    H + String.raw`git\s+checkout\b[^\n;&|]*?(?:\s--\s|\s\.(?=\s|$))`,
  );
  return (
    gitRestore.test(s) || gitResetHard.test(s) || gitCleanForce.test(s) || gitCheckoutPath.test(s)
  );
}

if (tool === 'Bash') {
  const cmd = ti.command ?? ti.cmd ?? '';
  if (bashEditsCode(String(cmd)))
    deny(`TUI-abolished rule: shell in-place edit of a code file is banned. ${STEER}`);
  if (isDestructiveWorktreeEscape(String(cmd)))
    deny(
      `Destructive worktree command refused — atomic cannot reverse it and CLAUDE.md ` +
        `forbids git restore. \`git restore\` / \`git reset --hard\` / \`git clean -f\` / ` +
        `\`git checkout -- <path>\` silently destroy uncommitted work. Commit or stash first, ` +
        `restore from an explicit snapshot, or stop and ask — never discard the working tree blind.`,
    );
  if (shouldRouteThroughAtomicExec(String(cmd)))
    deny(
      `atomic_exec-mandatory rule: route this shell command through the atomic envelope. ` +
        `Call mcp__atomic-edit__atomic_exec { command, cwd, intent, proveEffect } instead of ` +
        `native Bash — it wraps the command in sandbox + trace + rollback. Network/remote, ` +
        `local git mutations (commit/add/stash/checkout/…), interactive/login, package-install, ` +
        `and shell control-flow still pass natively because atomic_exec cannot run them.`,
    );
  allow();
}

function patchTouchesCode(patchText) {
  if (!patchText) return false;
  const paths = [];
  for (const line of String(patchText).split('\n')) {
    const match = line.match(/^\*\*\* (?:Update|Add|Delete) File:\s*(.+)$/);
    if (match) paths.push(match[1].trim());
  }
  return paths.some((p) => CODE_EXT.test(p));
}

if (tool === 'apply_patch') {
  const patchText = ti.command ?? ti.patch ?? ti.input ?? '';
  if (patchTouchesCode(String(patchText))) {
    deny(`TUI-abolished rule: native apply_patch on code is banned. ${STEER}`);
  }
  allow();
}

if (!NATIVE_EDIT.has(tool)) allow();
// Allow native Write/Edit ONLY for genuine prose (.md/.txt/…). Everything else — code AND
// secret/config-bearing non-code (.env, .html, .csv, extensionless dotfiles) — routes
// through atomic so it is security-scanned + byte-gated (rank-7 no-bypass fix).
if (filePath && PROSE_EXT.test(String(filePath))) allow();

deny(
  `TUI-abolished rule: native ${tool} on this file is banned (code, or a secret/config- ` +
    `bearing non-prose file the security gate must scan) so the harness never ` +
    `renders its whole-line +/- diff. Use mcp__atomic-edit__* instead ` +
    `(atomic_replace_range / atomic_replace_text / atomic_edit_symbol / ` +
    `atomic_replace_literal / atomic_replace_property_value / atomic_wrap_range / ` +
    `atomic_transaction / atomic_add_import …). The tool returns the char-level ` +
    `atomicDiff [-removed-]{+added+} + FounderBlock — the only permitted visual ` +
    `proof. If mcp__atomic-edit__* is not in this session's tools, the server ` +
    `is not loaded: say so and start a fresh session (it is enabled in ` +
    `.mcp.json + ~/.claude.json). Do NOT silently fall back to native edit.`,
);
