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
 * sed/…) is a DETECTABLE bypass of atomic_exec, even though the atomic-only deny
 * hook does not BLOCK it (it only blocks code-mutating shell). Interactive /
 * login / external-runtime verbs (claude/codex/ssh/sudo/gcloud/op/…) are NOT
 * atomic-doable and stay undetectable.
 */
const CODE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|prisma|go|rs|rb|py|java|c|cc|cpp|h|hpp|cs|php|swift|kt|scala|sh|bash|sql|ya?ml|toml)$/i;

/** Verbs atomic_exec can run inside its envelope (general, non-interactive shell). */
const ATOMIC_EXEC_HANDLES =
  /^(git|npm|npx|pnpm|yarn|bun|node|deno|ts-node|tsx|ls|cat|echo|printf|mkdir|rmdir|rm|cp|mv|ln|test|true|false|grep|rg|ag|ack|find|fd|wc|head|tail|sed|awk|cut|sort|uniq|tr|jq|yq|diff|patch|tar|gzip|gunzip|zip|unzip|chmod|chown|touch|stat|date|pwd|basename|dirname|realpath|make|cmake|tsc|jest|vitest|mocha|eslint|prettier|biome|ruff|black|mypy|pytest|go|cargo|rustc|javac|gradle|mvn|ruby|gem|bundle|php|composer|dotnet|swift|kotlinc|xargs|tee|env|which|type|history|wait|kill|pkill|sleep)$/;

/** Verbs atomic_exec genuinely cannot/should-not run (interactive/login/external). */
const NON_ATOMIC_VERB =
  /^(claude|codex|opencode|hermes|vim|vi|nano|emacs|less|more|top|htop|ssh|scp|sftp|telnet|sudo|su|doas|gcloud|aws|az|kubectl|helm|docker|podman|op|kaisser|railway|vercel|stripe|gh|psql|mysql|mongosh|redis-cli|open|code|subl)$/;

/** verb + first path-like token only, capped — never the raw command (secret-leak hardening). */
function shortTarget(s) {
  const str = String(s || '').trim();
  const firstPath = (str.match(/[\w./~@-]+\.[A-Za-z0-9]+/) || [])[0] || '';
  return (firstPath || str.split(/\s+/)[0] || '').slice(0, 80);
}

/**
 * @returns {{category:string, atomicEquivalent:string|null, detectable:boolean, blockedByDenyHook:boolean, target:string}}
 */
export function classifyToolCall({ tool, toolInput }) {
  const ti = toolInput || {};

  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) {
    const f = ti.file_path || ti.filePath || ti.notebook_path || '';
    const isCode = CODE_EXT.test(String(f));
    return {
      category: 'native-edit',
      atomicEquivalent: isCode ? 'atomic_replace_at / atomic_edit_symbol' : null,
      detectable: isCode, // non-code edits are allowed + have no atomic equivalent
      blockedByDenyHook: isCode, // atomic-only-hook denies native edits to code
      target: shortTarget(f),
    };
  }

  if (tool === 'Read') {
    const f = ti.file_path || ti.filePath || '';
    const isCode = CODE_EXT.test(String(f));
    return {
      category: 'native-read',
      atomicEquivalent: isCode ? 'atomic_outline / code_read_symbol' : null,
      detectable: isCode,
      blockedByDenyHook: false,
      target: shortTarget(f),
    };
  }

  if (tool === 'Grep') {
    return {
      category: 'native-grep',
      atomicEquivalent: 'atomic_grep',
      detectable: true,
      blockedByDenyHook: false,
      target: shortTarget(ti.pattern),
    };
  }

  if (tool === 'Glob') {
    return {
      category: 'native-glob',
      atomicEquivalent: 'atomic_glob',
      detectable: true,
      blockedByDenyHook: false,
      target: shortTarget(ti.pattern),
    };
  }

  if (tool === 'Bash') {
    const cmd = String(ti.command || '');
    const verb = (cmd.trim().split(/\s+/)[0] || '').split('/').pop();
    const inlineEvalWrite =
      /\b(?:node|deno|bun|ts-node|tsx|python3?|ruby|php|perl)\b[^\n]*?(?:\s-(?:e|pe?|c|r)\b|--eval\b|\beval\b)/.test(cmd) &&
      /(?:writeFileSync|appendFileSync|createWriteStream|renameSync|copyFileSync|rmSync|unlinkSync|mkdirSync|write_text|os\.replace|shutil\.(?:move|copy))/.test(cmd);
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
      return {
        category: 'bash-edit',
        atomicEquivalent: 'atomic edit tools',
        detectable: true,
        blockedByDenyHook: true, // the atomic-only hook denies code-mutating shell
        target: verb,
      };
    }
    if (/^(grep|rg|ag|ack)$/.test(verb)) {
      return { category: 'bash-grep', atomicEquivalent: 'atomic_grep', detectable: true, blockedByDenyHook: false, target: verb };
    }
    if (/^(find|fd)$/.test(verb)) {
      return { category: 'bash-glob', atomicEquivalent: 'atomic_glob', detectable: true, blockedByDenyHook: false, target: verb };
    }
    if (/^cat$/.test(verb) && CODE_EXT.test(cmd)) {
      return { category: 'bash-read', atomicEquivalent: 'atomic_outline / Read', detectable: true, blockedByDenyHook: false, target: verb };
    }
    // Strict directive: general shell that atomic_exec handles is a DETECTABLE
    // bypass of atomic_exec (the deny-hook does not block it, so blockedByDenyHook
    // stays false — the ledger surfaces this as the honest no-bypass gap). An
    // interactive/login/external verb is NOT atomic-doable → undetectable.
    if (ATOMIC_EXEC_HANDLES.test(verb) && !NON_ATOMIC_VERB.test(verb)) {
      return { category: 'bash-exec', atomicEquivalent: 'atomic_exec', detectable: true, blockedByDenyHook: false, target: verb };
    }
    // claude / ssh / sudo / gcloud / vim / … — atomic_exec cannot/should-not run these.
    return { category: 'bash-other', atomicEquivalent: null, detectable: false, blockedByDenyHook: false, target: verb };
  }

  // MCP atomic tools themselves, or anything ambiguous — not a bypass.
  return { category: 'other', atomicEquivalent: null, detectable: false, blockedByDenyHook: false, target: '' };
}
