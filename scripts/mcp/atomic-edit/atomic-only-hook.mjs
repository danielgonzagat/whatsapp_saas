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
 * PreToolUse hook protocol: read the tool call on stdin, emit a structured
 * permission decision on stdout. We DENY native edits to code files and
 * steer to the atomic tool; non-code (pure docs/text) and all non-edit
 * tools pass through, so the session is never bricked for prose.
 *
 * Honest scope: this enforces avoidance (the harness then renders nothing
 * for code edits and the tool output is the only thing shown). It does NOT
 * "disable the renderer" — that is impossible; avoidance is the mechanism.
 */
import { existsSync, readFileSync } from 'node:fs';

const NATIVE_EDIT = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
// Code/structured files the atomic-edit engine validates. Pure prose
// (.md/.txt/none) is NOT blocked — Daniel's rule is about *code*.
const CODE_EXT =
  /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|ipynb|json|py|go|rs|java|kt|c|h|cc|cpp|hpp|cs|rb|php|swift|scala|sh|bash|zsh|css|scss|less|sql|ya?ml|toml|prisma)$/i;

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
  input = JSON.parse(rawStdin || '{}');
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
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
    }),
  );
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
  `call them. To SPLIT / DECOMPOSE / EXTRACT symbols out of a file, use ` +
  `mcp__atomic-edit__atomic_decompose_file ONCE — args ` +
  `{ file, plan:[{ symbols:[...], newModule, reExport:true }] } — NOT ` +
  `repeated atomic_create_file. Example: ` +
  `mcp__atomic-edit__atomic_decompose_file { "file":"src/big.ts", ` +
  `"plan":[{ "symbols":["Foo","bar"], "newModule":"src/foo.ts", ` +
  `"reExport":true }] }. ` +
  `NEVER fall back to a native or shell edit; that path is blocked.`;

// Camada 3 (Bash leg): a shell command can edit a code file too (sed -i,
// > redirection, tee, perl -i …) and would bypass the Edit/Write ban. Deny
// ONLY the unambiguous in-place code-content mutations — everything else
// (npm/git/node/build/prettier/grep/cat …) passes, so workflows are safe.
function bashEditsCode(cmd) {
  if (!cmd) return false;
  const source = String(cmd);
  // Deep paths included (backend/src/a/b/c.ts). Exclude shell metachars so a
  // redirect/pipe/paren boundary terminates the path token.
  const codeTarget = String.raw`[^\s'"|;&<>()]*\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|ipynb|json|py|go|rs|java|kt|c|h|cc|cpp|hpp|cs|rb|php|swift|scala|sh|bash|zsh|css|scss|less|sql|ya?ml|toml|prisma)\b`;
  const codeRe = new RegExp(codeTarget);
  const mentionsCodeTarget = codeRe.test(source);

  // ── (1) ANY redirect whose target is a code path ──────────────────────
  // FAIL-CLOSED. Catches `git show REF:f.ts > f.ts`, `cat … > f.ts`,
  // `node -e … > a/b.ts`, `printf … > src/x.ts`, bare `> backend/src/x.ts`,
  // `>>`, `>|` (noclobber override), fd-qualified `1>`/`2>`/`&>`, optional
  // spaces/quotes/backslash. The R43 evasion was `git show HEAD:x.ts > x.ts`.
  const redirectToCode = new RegExp(
    String.raw`(?:\d*>>?|>\||&>>?)\s*\\?["']?\s*${codeTarget}`,
  );
  if (redirectToCode.test(source)) return true;

  // ── (2) git working-tree mutation: rewrites tracked files OUTSIDE the
  // atomic OS → bypass. Read-only git (diff/status/log, `show` without a
  // redirect, `stash list`, `stash show`) carries none of these verbs.
  const gitMutation = [
    /\bgit\s+stash\s+(?:push|save|pop|apply)\b/, // hide/restore changes
    /\bgit\s+stash\b(?!\s+(?:list|show)\b)/, // bare `git stash` (+ later pop)
    /\bgit\s+restore\b/, // restore working tree
    /\bgit\s+reset\s+(?:--hard|--merge|--keep)\b/, // hard reset = code rewrite
    /\bgit\s+(?:apply|am)\b/, // apply a patch onto tracked code
    /\bgit\s+checkout\b[^|;&\n]*\s--(?:\s|$)/, // git checkout [REF] -- <path>
  ];
  if (gitMutation.some((re) => re.test(source))) return true;
  // checkout/reset that *names* a code path (no `--` form) = restore too.
  if (/\bgit\s+(?:checkout|reset)\b/.test(source) && mentionsCodeTarget) return true;

  // ── (3) copy / move / link / raw-write a code path into place ─────────
  // R43 evasion: `cp /tmp/util-keep.ts <repo>.ts`. Conservative: if the
  // command invokes one of these AND any code path appears anywhere → deny.
  if (
    /(?:^|[\s;&|])(?:cp|mv|install|rsync|ln|dd|truncate|shred)\s+\S/.test(source) &&
    mentionsCodeTarget
  )
    return true;

  // patch / ed / git-applypatch rewrite tracked code from a diff.
  if (/\bapplypatch\b/.test(source)) return true;
  if (/\bpatch\b\s*(?:-p\s*\d|-i\b|--input\b)/.test(source)) return true;
  if (/\bpatch\b[^|;&\n]*<\s*[^\s|;&]/.test(source)) return true; // patch < x.diff
  if (/\bed\s+-/.test(source) || /\bed\b[^|;&\n]*<<-?\s*['"]?\w/.test(source)) return true;

  // ── (4) in-place / interpreter writers (kept + extended) ──────────────
  const directMutationPatterns = [
    new RegExp(String.raw`\bsed\b[^|]*\s-i`), // sed -i
    new RegExp(String.raw`\bperl\b[^|]*\s-i`), // perl -i
    new RegExp(String.raw`\b(?:g?awk)\b[^|]*>\s*${codeTarget}`), // awk > code
    new RegExp(String.raw`\btee\b[^|]*\s+\\?["']?\s*${codeTarget}`), // tee [quoted] code
    new RegExp(String.raw`\bsponge\b[^|]*\s${codeTarget}`), // sponge code
    new RegExp(String.raw`\b(?:rm|unlink|truncate|touch)\b[^|;&]*${codeTarget}`), // delete/truncate/create code
  ];
  if (directMutationPatterns.some((re) => re.test(source))) return true;

  // Heredoc/here-string that produces a code file: `cat > x.ts <<'EOF'`,
  // `tee x.ts <<EOF`, `… <<EOF > x.ts`, quoted or not. If the command both
  // opens a heredoc/here-string AND references any code-extension path, deny
  // (this closes the quoted/spacing evasions of the redirect regexes above).
  if (
    /<<-?\s*['"]?[\w.]/.test(source) &&
    codeRe.test(source) &&
    /\b(?:cat|tee|dd|ed|node|deno|bun|python3?|ruby|php|perl)\b|>>?/.test(source)
  )
    return true;

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

  if (!mentionsCodeTarget) return false;

  const runtimeWritePatterns = [
    /\b(?:python3?|node|ruby|php)\b[\s\S]*(?:writeFileSync|writeFile|appendFileSync|appendFile|write_text|open\s*\([^)]*['"][wa+]|truncate\s*\(|rename\s*\(|copyfile\s*\()/,
    /\b(?:node|deno|bun)\b[\s\S]*(?:fs\.|node:fs|Deno\.)[\s\S]*(?:write|append|rename|copyFile|truncate|rm|unlink|mkdir)/,
  ];
  return runtimeWritePatterns.some((re) => re.test(source));
}

if (tool === 'Bash') {
  const cmd = ti.command ?? ti.cmd ?? '';
  if (bashEditsCode(String(cmd)))
    deny(`TUI-abolished rule: shell in-place edit of a code file is banned. ${STEER}`);
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

// Camada READ: a native full-file Read of a large source file is the
// measured residual context tax (A/B R19: native Read = 52K chars = 51%
// of atomic tool-result volume — the residual line-oriented-read
// bottleneck the Atomic Action Principle names). Steer large code reads
// to the OS's structured-read operators. Small / test / spec / .d.ts /
// config / json / non-code / missing files pass through untouched. Fail
// OPEN on any internal hook error (never block on a hook bug) — but a
// readable large code file MUST deny.
const READ_EXEMPT =
  /(\.(test|spec)\.[tj]sx?$)|(\.d\.ts$)|(__tests__\/)|(\.config\.[tjm]s$)|(\.json$)/;
if (
  tool === 'Read' &&
  filePath &&
  CODE_EXT.test(String(filePath)) &&
  !READ_EXEMPT.test(String(filePath))
) {
  try {
    const fp = String(filePath);
    if (existsSync(fp)) {
      const lineCount = readFileSync(fp, 'utf8').split('\n').length;
      if (lineCount > 140) {
        const cwd = process.cwd();
        let rel = fp;
        if (fp.startsWith(cwd + '/')) rel = fp.slice(cwd.length + 1);
        else if (fp.startsWith('/')) rel = fp.slice(fp.lastIndexOf('/') + 1);
        deny(
          `Structured-read rule: native full-file Read of a large source file ` +
            `is the measured residual context tax (A/B R19: native Read = 52K ` +
            `chars = 51% of atomic tool-result volume). Read structurally ` +
            `instead. Send EXACTLY: mcp__atomic-edit__code_outline { "file": ` +
            `"${rel}" }  then mcp__atomic-edit__code_read_symbol for ONLY the ` +
            `symbol(s) you will edit. Do NOT native-Read this file.`,
        );
      }
    }
  } catch {
    allow(); // fail-open on internal hook error only
  }
}

if (!NATIVE_EDIT.has(tool)) allow();
if (filePath && !CODE_EXT.test(String(filePath))) allow(); // prose/docs OK

deny(
  `TUI-abolished rule: native ${tool} on code is banned so the harness never ` +
    `renders its whole-line +/- diff. Use mcp__atomic-edit__* instead ` +
    `(atomic_replace_range / atomic_replace_text / atomic_edit_symbol / ` +
    `atomic_replace_literal / atomic_replace_property_value / atomic_wrap_range / ` +
    `atomic_transaction / atomic_add_import …). To SPLIT / DECOMPOSE / EXTRACT ` +
    `symbols out of a file, use mcp__atomic-edit__atomic_decompose_file ONCE — ` +
    `args { file, plan:[{ symbols:[...], newModule, reExport:true }] } — NOT ` +
    `repeated atomic_create_file. Example: ` +
    `mcp__atomic-edit__atomic_decompose_file { "file":"src/big.ts", ` +
    `"plan":[{ "symbols":["Foo","bar"], "newModule":"src/foo.ts", ` +
    `"reExport":true }] }. The tool returns the char-level ` +
    `atomicDiff [-removed-]{+added+} + FounderBlock — the only permitted visual ` +
    `proof. If mcp__atomic-edit__* is not in this session's tools, the server ` +
    `is not loaded: say so and start a fresh session (it is enabled in ` +
    `.mcp.json + ~/.claude.json). Do NOT silently fall back to native edit.`,
);
