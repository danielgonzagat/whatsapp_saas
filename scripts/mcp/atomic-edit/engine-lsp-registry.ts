/**
 * Language-server registry — for operations that genuinely need TYPE resolution
 * (cross-file rename, overload-safe refactors) in a non-TS language, atomic does
 * not guess. Instead it tells the agent/dev EXACTLY which language server the
 * specific work needs, the install command, and whether it is already on PATH —
 * so the requirement is always surfaced and actionable, never a silent gap.
 *
 * TS/JS need no external server (ts-morph is bundled). The others map to the
 * canonical LSP for that ecosystem.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface LspInfo {
  /** human name of the language server */
  lsp: string;
  /** the executable expected on PATH */
  bin: string;
  /** a copy-pasteable install command (best-effort, cross-platform note inline) */
  install: string;
}

const LSP_BY_GRAMMAR: Record<string, LspInfo> = {
  go: { lsp: 'gopls', bin: 'gopls', install: 'go install golang.org/x/tools/gopls@latest' },
  rust: { lsp: 'rust-analyzer', bin: 'rust-analyzer', install: 'rustup component add rust-analyzer' },
  python: { lsp: 'pyright', bin: 'pyright-langserver', install: 'npm i -g pyright   (or: pipx install pyright)' },
  java: { lsp: 'Eclipse JDT Language Server (jdtls)', bin: 'jdtls', install: 'brew install jdtls   (or see github.com/eclipse-jdtls/eclipse.jdt.ls)' },
  c: { lsp: 'clangd', bin: 'clangd', install: 'brew install llvm   (or: apt-get install clangd)' },
  cpp: { lsp: 'clangd', bin: 'clangd', install: 'brew install llvm   (or: apt-get install clangd)' },
  ruby: { lsp: 'solargraph', bin: 'solargraph', install: 'gem install solargraph' },
};

/** The language server for a grammar, or null (TS/JS = bundled ts-morph; bash/json = n/a). */
export function lspFor(grammar: string): LspInfo | null {
  return LSP_BY_GRAMMAR[grammar] ?? null;
}

/** Is the executable resolvable on PATH? (read-only PATH scan — no subprocess). */
export function lspOnPath(bin: string): boolean {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const d of dirs) {
    try {
      if (fs.existsSync(path.join(d, bin))) return true;
    } catch {
      /* unreadable PATH entry */
    }
  }
  return false;
}

export interface LspStatus extends LspInfo {
  grammar: string;
  installed: boolean;
}

/** Status for one grammar's LSP (null if none configured). */
export function lspStatusFor(grammar: string): LspStatus | null {
  const info = lspFor(grammar);
  if (!info) return null;
  return { grammar, ...info, installed: lspOnPath(info.bin) };
}

/**
 * The actionable message returned when an op needs type resolution a language
 * server provides. Always names the server, the install command, and whether it
 * is present — so the CLI agent and the dev are informed of exactly what to
 * download/connect for this specific work.
 */
export function lspRequirementMessage(grammar: string, op: string): string {
  const info = lspFor(grammar);
  if (!info) {
    return `${op} needs type resolution for "${grammar}", which has no configured language server — atomic will not guess. Use single-file/scope-correct ops instead.`;
  }
  const installed = lspOnPath(info.bin);
  if (installed) {
    return `${op} on ${grammar} needs the ${info.lsp} language server for type-correct resolution. DETECTED: "${info.bin}" is on PATH — connect it through your CLI's LSP / atomic_apply_workspace_edit. atomic will not guess type-dependent edits.`;
  }
  return `${op} on ${grammar} needs the ${info.lsp} language server for type-correct resolution. MISSING: "${info.bin}" is not on PATH. INSTALL → ${info.install} — then re-run. atomic refuses to guess type-dependent edits without it.`;
}
