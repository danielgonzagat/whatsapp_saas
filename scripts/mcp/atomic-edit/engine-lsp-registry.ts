/**
 * Language-server registry — universal LSP routing for 24 languages.
 *
 * For operations that genuinely need TYPE resolution (cross-file rename,
 * overload-safe refactors, semantic diagnostics), atomic routes through
 * the appropriate LSP via the lsp-mesh gateway.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface LspInfo {
  lsp: string;
  bin: string;
  install: string;
}

const LSP_BY_GRAMMAR: Record<string, LspInfo> = {
  typescript: { lsp: 'typescript-language-server', bin: 'typescript-language-server', install: 'npm i -g typescript-language-server typescript' },
  python: { lsp: 'pyright', bin: 'pyright', install: 'npm i -g pyright' },
  go: { lsp: 'gopls', bin: 'gopls', install: 'go install golang.org/x/tools/gopls@latest' },
  rust: { lsp: 'rust-analyzer', bin: 'rust-analyzer', install: 'brew install rust-analyzer' },
  c: { lsp: 'clangd', bin: 'clangd', install: 'brew install llvm' },
  cpp: { lsp: 'clangd', bin: 'clangd', install: 'brew install llvm' },
  java: { lsp: 'jdtls', bin: 'jdtls', install: 'brew install jdtls' },
  kotlin: { lsp: 'kotlin-language-server', bin: 'kotlin-language-server', install: 'brew install kotlin-language-server' },
  php: { lsp: 'intelephense', bin: 'intelephense', install: 'npm i -g intelephense' },
  swift: { lsp: 'sourcekit-lsp', bin: 'sourcekit-lsp', install: 'built-in macOS' },
  csharp: { lsp: 'csharp-ls-vs', bin: 'csharp-ls-vs', install: 'dotnet tool install -g csharp-ls-vs' },
  ruby: { lsp: 'ruby-lsp', bin: 'ruby-lsp', install: 'gem install ruby-lsp (Ruby >= 3.0)' },
  elixir: { lsp: 'elixir-ls', bin: 'elixir-ls', install: 'brew install elixir-ls' },
  zig: { lsp: 'zls', bin: 'zls', install: 'brew install zls' },
  haskell: { lsp: 'haskell-language-server', bin: 'haskell-language-server', install: 'brew install haskell-language-server && brew install ghc' },
  lua: { lsp: 'lua-language-server', bin: 'lua-language-server', install: 'brew install lua-language-server' },
  graphql: { lsp: 'graphql-lsp', bin: 'graphql-lsp', install: 'npm i -g graphql-language-service-cli' },
  bash: { lsp: 'bash-language-server', bin: 'bash-language-server', install: 'npm i -g bash-language-server' },
  dockerfile: { lsp: 'docker-langserver', bin: 'docker-langserver', install: 'npm i -g dockerfile-language-server-nodejs' },
  json: { lsp: 'vscode-json-language-server', bin: 'vscode-json-language-server', install: 'npm i -g vscode-langservers-extracted' },
  yaml: { lsp: 'yaml-language-server', bin: 'yaml-language-server', install: 'npm i -g yaml-language-server' },
  toml: { lsp: 'taplo', bin: 'taplo', install: 'brew install taplo' },
  markdown: { lsp: 'marksman', bin: 'marksman', install: 'brew install marksman' },
};

export function lspFor(grammar: string): LspInfo | null {
  return LSP_BY_GRAMMAR[grammar] ?? null;
}

export function lspOnPath(bin: string): boolean {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const d of dirs) {
    try { if (fs.existsSync(path.join(d, bin))) return true; } catch {}
  }
  return false;
}

export function lspLanguages(): string[] {
  return Object.keys(LSP_BY_GRAMMAR);
}

export interface LspStatus extends LspInfo {
  grammar: string;
  installed: boolean;
}

export function lspStatusFor(grammar: string): LspStatus | null {
  const info = lspFor(grammar);
  if (!info) return null;
  return { grammar, ...info, installed: lspOnPath(info.bin) };
}

export function allLspStatus(): LspStatus[] {
  return Object.keys(LSP_BY_GRAMMAR)
    .map((g) => lspStatusFor(g)!)
    .filter(Boolean)
    .sort((a, b) => a.grammar.localeCompare(b.grammar));
}

export function lspRequirementMessage(grammar: string, op: string): string {
  const info = lspFor(grammar);
  if (!info) {
    return `${op} needs type resolution for "${grammar}" — no LSP configured. Use single-file ops.`;
  }
  const installed = lspOnPath(info.bin);
  if (installed) {
    return `${op} on ${grammar}: "${info.bin}" DETECTED on PATH — connect via lsp-mesh.`;
  }
  return `${op} on ${grammar}: "${info.bin}" MISSING. INSTALL → ${info.install}`;
}
