/**
 * bypass-classify.mjs — pure, zero-dependency classifier (MOVE E). Given a
 * tool call (tool name + input), decide whether an ATOMIC equivalent existed —
 * i.e. whether the agent reached for a factory tool / Bash when an atomic tool
 * would have done. Mirrors the regex vocabulary of atomic-only-hook.mjs so
 * classification never drifts from enforcement. Default-to-undetectable for
 * anything ambiguous, so the headline bypass-rate only counts AVOIDABLE bypasses.
 *
 * Strict directive (Daniel, 2026-06-01): ALL execution should route through
 * atomic_exec. So general shell that atomic_exec handles (git/npm/node/ls/cat/
 * sed/...) is a DETECTABLE bypass of atomic_exec. In legacy Claude-style mode it
 * may be detectable-but-not-denied; in strict Codex atomic-only mode every
 * detectable non-atomic tool call is denied by codex-atomic-only-hook.
 */
const CODE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|prisma|go|rs|rb|py|java|c|cc|cpp|h|hpp|cs|php|swift|kt|scala|sh|bash|sql|ya?ml|toml)$/i;

/**
 * Verbs atomic_exec can run inside its envelope (general, non-interactive shell).
 * Parity with atomic-only-hook.mjs route-by-default (2026-06-02): the hook now routes
 * EVERY non-escape command, so the interpreter family (python/perl/osascript/Rscript/
 * lua/julia/tclsh/groovy — in addition to node/ruby/php/go/cargo already listed) has an
 * atomic_exec equivalent and is a DETECTABLE bypass when run native. This stays a finite
 * allowlist (the metric's "an atomic equivalent EXISTS" axis); a bare `./local-bin` is
 * the residual the route-by-default hook also routes but this list does not yet name.
 */
const ATOMIC_EXEC_HANDLES =
  /^(git|npm|npx|pnpm|yarn|bun|node|deno|ts-node|tsx|ls|cat|echo|printf|mkdir|rmdir|rm|cp|mv|ln|test|true|false|grep|rg|ag|ack|find|fd|wc|head|tail|sed|awk|cut|sort|uniq|tr|jq|yq|diff|patch|tar|gzip|gunzip|zip|unzip|chmod|chown|touch|stat|date|pwd|basename|dirname|realpath|make|cmake|tsc|jest|vitest|mocha|eslint|prettier|biome|ruff|black|mypy|pytest|python3?|perl|osascript|Rscript|lua|julia|tclsh|groovy|go|cargo|rustc|javac|gradle|mvn|ruby|gem|bundle|php|composer|dotnet|swift|kotlinc|xargs|tee|env|which|type|history|wait|kill|pkill|sleep)$/;

/** Verbs atomic_exec genuinely cannot/should-not run (interactive/login/external). */
const NON_ATOMIC_VERB =
  /^(claude|codex|opencode|hermes|vim|vi|nano|emacs|less|more|top|htop|ssh|scp|sftp|telnet|sudo|su|doas|gcloud|aws|az|kubectl|helm|docker|podman|op|kaisser|railway|vercel|stripe|gh|psql|mysql|mongosh|redis-cli|open|code|subl)$/;

/**
 * Peel leading env-assignments + benign exec-prefix wrappers to the program that
 * actually runs (mirror of atomic-only-hook effectiveCommand). Without this, an
 * env-prefix (`FOO=bar node …`) or exec-prefix (`time`/`nice`/`nohup`/`timeout`/
 * `env`) hid a real atomic_exec bypass behind a non-handled first token.
 */
function peelEffective(c) {
  let s = String(c || '').trim();
  let prev = null;
  let guard = 0;
  while (s !== prev && guard++ < 12) {
    prev = s;
    s = s.replace(/^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]*)\s+/, '');
    const m = s.match(/^(?:time|nice|nohup|stdbuf|command|exec|timeout|ionice|setsid|env)\b\s*/);
    if (m) {
      let rest = s.slice(m[0].length);
      rest = rest.replace(/^(?:-{1,2}[A-Za-z0-9._-]+(?:=\S+)?\s+)*/, '');
      rest = rest.replace(/^(?:\d+(?:\.\d+)?[smhd]?\s+)?/, '');
      s = rest.trim();
    }
  }
  return s.trim();
}

/** verb + first path-like token only, capped — never the raw command (secret-leak hardening). */
function shortTarget(s) {
  const str = String(s || '').trim();
  const firstPath = (str.match(/[\w./~@-]+\.[A-Za-z0-9]+/) || [])[0] || '';
  return (firstPath || str.split(/\s+/)[0] || '').slice(0, 80);
}

function withStrictDeny(record, strictAtomicOnly) {
  if (strictAtomicOnly && record.detectable && record.atomicEquivalent) {
    return { ...record, blockedByDenyHook: true };
  }
  return record;
}

/**
 * @returns {{category:string, atomicEquivalent:string|null, detectable:boolean, blockedByDenyHook:boolean, target:string}}
 */
export function classifyToolCall({ tool, toolInput, strictAtomicOnly = false }) {
  const ti = toolInput || {};
  const strict = Boolean(strictAtomicOnly);

  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) {
    const f = ti.file_path || ti.filePath || ti.notebook_path || '';
    const isCode = CODE_EXT.test(String(f));
    return withStrictDeny(
      {
        category: 'native-edit',
        atomicEquivalent: isCode ? 'atomic_replace_at / atomic_edit_symbol' : null,
        detectable: isCode, // non-code edits are allowed + have no atomic equivalent
        blockedByDenyHook: isCode, // atomic-only-hook denies native edits to code
        target: shortTarget(f),
      },
      strict,
    );
  }

  if (tool === 'Read') {
    const f = ti.file_path || ti.filePath || '';
    const isCode = CODE_EXT.test(String(f));
    return withStrictDeny(
      {
        category: 'native-read',
        atomicEquivalent: isCode ? 'atomic_outline / code_read_symbol' : null,
        detectable: isCode,
        blockedByDenyHook: false,
        target: shortTarget(f),
      },
      strict,
    );
  }

  if (tool === 'Grep') {
    return withStrictDeny(
      {
        category: 'native-grep',
        atomicEquivalent: 'atomic_grep',
        detectable: true,
        blockedByDenyHook: false,
        target: shortTarget(ti.pattern),
      },
      strict,
    );
  }

  if (tool === 'Glob') {
    return withStrictDeny(
      {
        category: 'native-glob',
        atomicEquivalent: 'atomic_glob',
        detectable: true,
        blockedByDenyHook: false,
        target: shortTarget(ti.pattern),
      },
      strict,
    );
  }

  if (tool === 'Bash') {
    const cmd = String(ti.command || '');
    const verb = (cmd.trim().split(/\s+/)[0] || '').split('/').pop();
    const inlineEvalWrite =
      /\b(?:node|deno|bun|ts-node|tsx|python3?|ruby|php|perl)\b[^\n]*?(?:\s-(?:e|pe?|c|r)\b|--eval\b|\beval\b)/.test(
        cmd,
      ) &&
      /(?:writeFileSync|appendFileSync|createWriteStream|renameSync|copyFileSync|rmSync|unlinkSync|mkdirSync|write_text|os\.replace|shutil\.(?:move|copy))/.test(
        cmd,
      );
    const mutatesCode =
      /\bsed\b[^|]*\s-i/.test(cmd) ||
      /\bperl\b[^|]*\s-i/.test(cmd) ||
      (/\btee\b[^|]*\s+["']?[\w./-]+/.test(cmd) && CODE_EXT.test(cmd)) ||
      (/\b(?:rm|unlink|truncate|touch)\b/.test(cmd) && CODE_EXT.test(cmd)) ||
      /\bdd\b[^|]*\bof=/.test(cmd) ||
      // parity with atomic-only-hook.mjs bashEditsCode (else the ledger under-counts
      // what the deny-hook actually blocks): redirect / cat> / cp / mv / awk> into code.
      (/(?:^|[\s;&|])>{1,2}(?!>)/.test(cmd) && CODE_EXT.test(cmd)) ||
      (/\b(?:cp|mv|install)\b/.test(cmd) && CODE_EXT.test(cmd)) ||
      (/\b(?:g?awk)\b[^|]*>/.test(cmd) && CODE_EXT.test(cmd)) ||
      inlineEvalWrite;
    if (mutatesCode) {
      return withStrictDeny(
        {
          category: 'bash-edit',
          atomicEquivalent: 'atomic edit tools',
          detectable: true,
          blockedByDenyHook: true, // the atomic-only hook denies code-mutating shell
          target: verb,
        },
        strict,
      );
    }
    if (/^(grep|rg|ag|ack)$/.test(verb)) {
      return withStrictDeny(
        {
          category: 'bash-grep',
          atomicEquivalent: 'atomic_grep',
          detectable: true,
          blockedByDenyHook: false,
          target: verb,
        },
        strict,
      );
    }
    if (/^(find|fd)$/.test(verb)) {
      return withStrictDeny(
        {
          category: 'bash-glob',
          atomicEquivalent: 'atomic_glob',
          detectable: true,
          blockedByDenyHook: false,
          target: verb,
        },
        strict,
      );
    }
    if (/^cat$/.test(verb) && CODE_EXT.test(cmd)) {
      return withStrictDeny(
        {
          category: 'bash-read',
          atomicEquivalent: 'atomic_outline / Read',
          detectable: true,
          blockedByDenyHook: false,
          target: verb,
        },
        strict,
      );
    }
    // Strict directive: general shell that atomic_exec handles is a DETECTABLE
    // bypass of atomic_exec. Whether it was blocked depends on the active hook
    // posture: legacy atomic-only-hook allows some shell, strict Codex denies all
    // non-atomic tools through codex-atomic-only-hook.
    //
    // Normalize through peelEffective so an env/exec-prefix (FOO=bar / time /
    // nohup / timeout / env) is recognized, and recognize wrapper/control-flow
    // forms (bash -c …, ( … ), for/if/while …) — atomic_exec runs `/bin/bash -c`,
    // so all of these have an atomic_exec equivalent and are detectable bypasses.
    const peeled = peelEffective(cmd);
    const effVerb = (peeled.split(/\s+/)[0] || '').split('/').pop();
    const isWrapper =
      (/^(?:bash|sh|zsh|dash|ksh)$/.test(effVerb) && /\s-c\b/.test(peeled)) ||
      /^(?:for|if|while|until|case|select|function)$/.test(effVerb) ||
      /^[({]/.test(peeled);
    if (isWrapper || (ATOMIC_EXEC_HANDLES.test(effVerb) && !NON_ATOMIC_VERB.test(effVerb))) {
      return withStrictDeny(
        {
          category: 'bash-exec',
          atomicEquivalent: 'atomic_exec',
          detectable: true,
          blockedByDenyHook: false,
          target: effVerb,
        },
        strict,
      );
    }
    // claude / ssh / sudo / gcloud / vim / ... — atomic_exec cannot/should-not run these.
    return {
      category: 'bash-other',
      atomicEquivalent: null,
      detectable: false,
      blockedByDenyHook: false,
      target: verb,
    };
  }

  // MCP atomic tools themselves, or anything ambiguous — not a bypass.
  return {
    category: 'other',
    atomicEquivalent: null,
    detectable: false,
    blockedByDenyHook: false,
    target: '',
  };
}
