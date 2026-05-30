/**
 * bypass-classify.mjs — pure, zero-dependency classifier (MOVE E). Given a
 * tool call (tool name + input), decide whether an ATOMIC equivalent existed —
 * i.e. whether the agent reached for a factory tool / Bash when an atomic tool
 * would have done. Mirrors the regex vocabulary of atomic-only-hook.mjs so
 * classification never drifts from enforcement. Default-to-undetectable for
 * anything ambiguous, so the headline bypass-rate only counts AVOIDABLE bypasses.
 */
const CODE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|prisma|go|rs|rb|py|java|c|cc|cpp|h|hpp|cs|php|swift|kt|scala|sh|bash|sql|ya?ml|toml)$/i;

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
    const mutatesCode =
      /\bsed\b[^|]*\s-i/.test(cmd) ||
      /\bperl\b[^|]*\s-i/.test(cmd) ||
      /\btee\b[^|]*\s+["']?[\w./-]+/.test(cmd) && CODE_EXT.test(cmd) ||
      (/\b(?:rm|unlink|truncate|touch)\b/.test(cmd) && CODE_EXT.test(cmd)) ||
      /\bdd\b[^|]*\bof=/.test(cmd);
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
    // git / npm / node / build / mkdir / echo / etc. — no atomic equivalent
    return { category: 'bash-other', atomicEquivalent: null, detectable: false, blockedByDenyHook: false, target: verb };
  }

  // MCP atomic tools themselves, or anything ambiguous — not a bypass.
  return { category: 'other', atomicEquivalent: null, detectable: false, blockedByDenyHook: false, target: '' };
}
