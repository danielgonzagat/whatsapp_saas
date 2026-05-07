#!/usr/bin/env node
// PreToolUse hook for Bash.
//
// Bloqueia comandos shell que poderiam destruir tecnologia ou burlar gates:
//   - Delete em massa de fontes (.ts/.tsx/.mjs/.js/.tsx) sem usar safe-decompose
//   - git restore (já banido em CLAUDE.md mas reforçamos)
//   - git rm de fontes
//   - chmod -x em hooks
//   - --no-verify em git commit/push
//   - sed -i / awk/perl/python/redirect em arquivos PROTECTED_FILES
//   - tentativa de editar .claude/settings.json, scripts/decomp/, .husky/pre-commit via cat/echo/sed/awk

import { readFileSync } from 'node:fs';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function block(reasons) {
  const header = '🛑 WORKSPACE GATE BLOCK (Bash) — comando não permitido';
  const body = reasons.map((r) => '  • ' + r).join('\n');
  const footer =
    '\n— Este bloqueio é INTRANSPONÍVEL. Para decompor: node scripts/decomp/safe-decompose.mjs\n— git restore é PROIBIDO (CLAUDE.md). Para reverter use snapshot explícito.';
  process.stderr.write(header + '\n' + body + footer + '\n');
  process.exit(2);
}

function allow() {
  process.exit(0);
}

const raw = readStdin();
if (!raw) allow();

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  allow();
}

if (payload.tool_name !== 'Bash') allow();
const cmd = String((payload.tool_input || {}).command || '');
if (!cmd) allow();

const reasons = [];

// Regra: git restore proibido (CLAUDE.md REGRA ABSOLUTA)
if (/\bgit\s+restore\b/.test(cmd)) {
  reasons.push(
    'git restore é PROIBIDO neste repo (CLAUDE.md). Pode destruir trabalho não-commitado de humanos ou outros agentes.',
  );
}

// Regra: --no-verify proibido
if (/\bgit\s+(commit|push)\b[^|;&]*--no-verify\b/.test(cmd)) {
  reasons.push('--no-verify nunca é permitido (CLAUDE.md). Hooks devem rodar.');
}

// Regra: --no-gpg-sign / commit.gpgsign=false
if (/--no-gpg-sign\b|commit\.gpgsign\s*=\s*false/.test(cmd)) {
  reasons.push('Bypass de assinatura proibido sem autorização explícita.');
}

// Regra: rm -rf de paths fonte
if (
  /\brm\s+(-[rRf]+|--recursive|--force)[^|;&]*\b(backend\/src|frontend\/src|worker\/src|worker\/processors|scripts\/pulse|scripts\/orchestration|scripts\/findings-engines|scripts\/decomp)\b/.test(
    cmd,
  )
) {
  reasons.push(
    'rm -rf em diretório fonte: ' +
      cmd.slice(0, 200) +
      ' — bloqueado para evitar destruição de tecnologia.',
  );
}

// Regra: rm em arquivos individuais .ts/.tsx fontes
if (
  /\brm\b[^|;&]*\b(?!.*node_modules)[^|;&\s]+\.(?:tsx?|mjs|cjs|jsx?)\b/.test(cmd) &&
  !/\b(node_modules|dist|\.next|build|coverage|\.audit|tmp\/|\/tmp\/|test-results|playwright-report)\b/.test(
    cmd,
  )
) {
  reasons.push(
    'Delete de arquivo fonte detectado. Use scripts/decomp/safe-decompose.mjs (cuida de move + integrity check) em vez de rm direto.',
  );
}

// Regra: git rm de fontes
if (/\bgit\s+rm\b[^|;&]*\b(?!.*node_modules)[^|;&\s]+\.(?:tsx?|mjs|cjs|jsx?)\b/.test(cmd)) {
  reasons.push('git rm de arquivo fonte. Decomposição/movimento deve passar por safe-decompose.');
}

// Regra: edição de settings.json/hooks/protected via shell.
// Leitura precisa continuar liberada para que Claude, Codex, OpenCode e outras
// CLIs consigam carregar CLAUDE.md/AGENTS.md/CODEX.md antes de agir.
const PROTECTED_PATHS_RE =
  /(?:^|[\s'\"`(])(\.claude\/settings\.json|\.husky\/pre-commit|\.husky\/pre-push|scripts\/decomp\/|scripts\/ops\/check-|scripts\/ops\/lib\/|backend\/eslint\.config\.mjs|frontend\/eslint\.config\.mjs|worker\/eslint\.config\.mjs|backend\/src\/lib\/ai-models\.ts|scripts\/pulse\/no-hardcoded-reality-audit\.ts|CLAUDE\.md|AGENTS\.md|CODEX\.md|\.github\/workflows\/ci-cd\.yml|ops\/[A-Za-z0-9_-]+\.json)\b/;
const SHELL_WRITE_TO_PROTECTED_RE =
  /(?:\b(?:sed\s+-i|perl\s+-p?i|python\s+-c[^|;&]*(?:write|open\(|Path\()[^|;&]*|tee\b|cat\s+>|awk\b[^|;&]*(?:>|-i\s+inplace))[^|;&]*|(?:>>|>)[^|;&]*)/;
if (SHELL_WRITE_TO_PROTECTED_RE.test(cmd) && PROTECTED_PATHS_RE.test(cmd)) {
  reasons.push(
    'Tentativa de editar arquivo PROTECTED ou SELF-IMMUTABLE via shell. Apenas Daniel pode. Path detectado em: ' +
      cmd.slice(0, 240),
  );
}

// Regra: chmod -x hooks
if (/\bchmod\b[^|;&]*-[^|;&\s]*x[^|;&]*\.husky\//.test(cmd)) {
  reasons.push('chmod -x em hook .husky proibido — desabilitaria gate.');
}

// Regra: skip ci/codacy tags em commit messages
if (
  /git\s+commit\b[^|;&]*-m\s*(['"][^'"]*\[(ci\s+skip|skip\s+ci|codacy\s+skip|skip\s+codacy)\][^'"]*['"])/.test(
    cmd,
  )
) {
  reasons.push('Commit com tag de skip detectado. Skip tags são proibidas (CLAUDE.md).');
}

// Regra: prisma db push em prod-like contexto
if (/prisma\s+db\s+push\b/.test(cmd) && !/--accept-data-loss=false|TEST_/.test(cmd)) {
  reasons.push('prisma db push é proibido em prod/CI/Docker/automação (CLAUDE.md). Use migrate.');
}

// Anti-burla: tentativa de desligar/redirecionar git hooks.
if (/git\s+config\s+core\.hooksPath/.test(cmd)) {
  reasons.push('Tentativa de redirecionar core.hooksPath. Hooks intransponiveis.');
}
if (/\bhusky\s+(uninstall|disable)\b/.test(cmd) || /rm\s+-rf\s+\.husky/.test(cmd)) {
  reasons.push('Desligar/remover Husky proibido — gate intransponivel.');
}
if (/(?:^|[\s;&])HUSKY\s*=\s*0\b/.test(cmd)) {
  reasons.push('HUSKY=0 prefix detectado — bypass de pre-commit proibido.');
}
if (/git\s+-c\s+core\.hooksPath/.test(cmd)) {
  reasons.push('git -c core.hooksPath= override detectado — bypass proibido.');
}

if (reasons.length > 0) block(reasons);
allow();
