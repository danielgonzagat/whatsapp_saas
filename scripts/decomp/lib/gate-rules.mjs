// Source-of-truth for workspace governance rules.
// All literals (forbidden tokens, type-any pattern, __companions__) are
// constructed at runtime via per-char joins so this file does NOT trip the
// gates it defines (no auto-trip on architecture-guardrails).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const MAX_NEW_FILE_LINES = 400;
export const MAX_TOUCHED_FILE_LINES = 600;
export const SOURCE_FILE_RE = /\.(?:[cm]?[jt]sx?)$/;

export const IGNORED_SEGMENTS = new Set([
  'node_modules',
  'dist',
  '.next',
  'out',
  'build',
  'coverage',
  '__parts__',
]);

const _COMP = ['_', '_', 'c', 'o', 'm', 'p', 'a', 'n', 'i', 'o', 'n', 's', '_', '_'].join('');
export const FORBIDDEN_DIRECTORY_SEGMENTS = new Set([_COMP]);

const _AT = String.fromCharCode(64);
const _TI = ['t', 's', '-', 'i', 'g', 'n', 'o', 'r', 'e'].join('');
const _TEE = ['t', 's', '-', 'e', 'x', 'p', 'e', 'c', 't', '-', 'e', 'r', 'r', 'o', 'r'].join('');
const _TNC = ['t', 's', '-', 'n', 'o', 'c', 'h', 'e', 'c', 'k'].join('');
const _ESL = ['e', 's', 'l', 'i', 'n', 't', '-', 'd', 'i', 's', 'a', 'b', 'l', 'e'].join('');
const _BIO = ['b', 'i', 'o', 'm', 'e', '-', 'i', 'g', 'n', 'o', 'r', 'e'].join('');
const _SEM = ['n', 'o', 's', 'e', 'm', 'g', 'r', 'e', 'p'].join('');
const _CD = ['c', 'o', 'd', 'a', 'c', 'y', ':', 'd', 'i', 's', 'a', 'b', 'l', 'e'].join('');
const _CI = ['c', 'o', 'd', 'a', 'c', 'y', ':', 'i', 'g', 'n', 'o', 'r', 'e'].join('');
const _NS = ['N', 'O', 'S', 'O', 'N', 'A', 'R'].join('');
const _NQ = ['n', 'o', 'q', 'a'].join('');
const _PUOK = ['P', 'U', 'L', 'S', 'E', '_', 'O', 'K'].join('');
const _PVOK = ['P', 'U', 'L', 'S', 'E', '_', 'V', 'I', 'S', 'U', 'A', 'L', '_', 'O', 'K'].join('');
const _PAW = ['P', 'U', 'L', 'S', 'E', '_', 'A', 'L', 'L', 'O', 'W'].join('');
const _VBP = ['V', 'I', 'S', 'U', 'A', 'L', '_', 'B', 'Y', 'P', 'A', 'S', 'S'].join('');
const _ANY = ['a', 'n', 'y'].join('');

const TOK_TI = _AT + _TI;
const TOK_TEE = _AT + _TEE;
const TOK_TNC = _AT + _TNC;

export const FORBIDDEN_TOKENS = [
  { id: 'ts-' + 'ignore', label: TOK_TI, pattern: new RegExp(TOK_TI + '\\b') },
  { id: 'ts-' + 'expect-error', label: TOK_TEE, pattern: new RegExp(TOK_TEE + '\\b') },
  { id: 'ts-' + 'nocheck', label: TOK_TNC, pattern: new RegExp(TOK_TNC + '\\b') },
  { id: 'eslint-' + 'disable', label: _ESL, pattern: new RegExp(_ESL + '\\b') },
  { id: 'biome-' + 'ignore', label: _BIO, pattern: new RegExp('\\b' + _BIO + '\\b') },
  { id: 'nose' + 'mgrep', label: _SEM, pattern: new RegExp('\\b' + _SEM + '\\b') },
  { id: 'codacy-' + 'disable', label: _CD, pattern: new RegExp(_CD + '(?:-next-line|-line)?\\b') },
  { id: 'codacy-' + 'ignore', label: _CI, pattern: new RegExp(_CI + '\\b') },
  { id: 'no' + 'sonar', label: _NS, pattern: new RegExp('\\b' + _NS + '\\b') },
  { id: 'no' + 'qa', label: _NQ, pattern: new RegExp('\\b' + _NQ + '\\b') },
  // GENERALIZED anti-fraud: banishes ANY suffix family bypass marker after PULSE separator.
  // Catches OK, SAFE, TODO, ALLOW, IGNORE, WAIVE, SKIP, NOTE, GUARD, PASS, REVIEW, FIXME, HACK, XXX, BYPASS, EXCEPT, EXCLUDE, VISUAL+OK
  // Case-insensitive, separator-agnostic. Engineered to make new PULSE_<X> bypass markers IMPOSSIBLE.
  { id: 'pulse-' + 'family', label: 'PULSE_<bypass>', pattern: new RegExp('\\b[Pp][Uu][Ll][Ss][Ee][^A-Za-z0-9]+(?:[Oo][Kk]|[Ss][Aa][Ff][Ee]|[Tt][Oo][Dd][Oo]|[Aa][Ll][Ll][Oo][Ww]|[Ii][Gg][Nn][Oo][Rr][Ee]|[Ww][Aa][Ii][Vv][Ee]|[Ss][Kk][Ii][Pp]|[Nn][Oo][Tt][Ee]|[Gg][Uu][Aa][Rr][Dd]|[Pp][Aa][Ss][Ss]|[Rr][Ee][Vv][Ii][Ee][Ww]|[Ff][Ii][Xx][Mm][Ee]|[Hh][Aa][Cc][Kk]|[Xx][Xx][Xx]|[Bb][Yy][Pp][Aa][Ss][Ss]|[Ee][Xx][Cc][Ee][Pp][Tt]|[Ee][Xx][Cc][Ll][Uu][Dd][Ee]|[Vv][Ii][Ss][Uu][Aa][Ll][^A-Za-z0-9]+[Oo][Kk])\\b') },
  { id: 'visual-' + 'bypass', label: 'VISUAL_BYPASS', pattern: new RegExp('\\b[Vv][Ii][Ss][Uu][Aa][Ll][^A-Za-z0-9]?[Bb][Yy][Pp][Aa][Ss][Ss]\\b') },
];

export const ANY_TYPE_PATTERN = new RegExp(
  '(?:[:<,(]\\s*' + _ANY + '\\b|\\bas\\s+' + _ANY + '\\b|\\b' + _ANY + '\\s*[\\[<>,)\\]])',
);

export const PROTECTED_FILES = new Set([
  ['CLAUDE', 'md'].join('.'),
  ['AGENTS', 'md'].join('.'),
  ['CODEX', 'md'].join('.'),
  ['docs', 'design', 'KLOEL_VISUAL_DESIGN_CONTRACT.md'].join('/'),
  ['docs', 'design', 'KLOEL_ANTI_HARDCODE_CONTRACT.md'].join('/'),
  ['ops', 'kloel-design-tokens.json'].join('/'),
  ['.husky', 'pre-push'].join('/'),
  ['.github', 'workflows', 'ci-cd.yml'].join('/'),
  ['backend', 'eslint.config.mjs'].join('/'),
  ['frontend', 'eslint.config.mjs'].join('/'),
  ['worker', 'eslint.config.mjs'].join('/'),
  ['backend', 'src', 'lib', 'ai-models.ts'].join('/'),
  ['scripts', 'pulse', 'no-hardcoded-reality-audit.ts'].join('/'),
]);

const _DECOMP = ['scripts', 'decomp', ''].join('/');
const _OPS_CHECK = ['scripts', 'ops', 'check-'].join('/');
const _OPS_LIB = ['scripts', 'ops', 'lib', ''].join('/');

export const PROTECTED_PREFIXES = ['ops/', _OPS_CHECK, _OPS_LIB];

export const SELF_IMMUTABLE_FILES = new Set([
  _DECOMP + 'lib/gate-rules.mjs',
  _DECOMP + 'preflight-write-gate.mjs',
  _DECOMP + 'preflight-bash-gate.mjs',
  _DECOMP + 'safe-decompose.mjs',
  _DECOMP + 'validate-staged.mjs',
  _DECOMP + 'adapters/apply-patch-gate.mjs',
  ['.claude', 'settings.json'].join('/'),
  ['.husky', 'pre-commit'].join('/'),
  ['.codex', 'hooks.json'].join('/'),
  ['.opencode', 'plugin', 'workspace-gates.ts'].join('/'),
]);

export function isProtectedPath(relPath) {
  if (PROTECTED_FILES.has(relPath)) {return true;}
  for (const prefix of PROTECTED_PREFIXES) {
    if (relPath.startsWith(prefix)) {return true;}
  }
  return false;
}

export function isSelfImmutable(relPath) {
  return SELF_IMMUTABLE_FILES.has(relPath);
}
export function isSourcePath(relPath) {
  return SOURCE_FILE_RE.test(relPath);
}
export function isUnderIgnoredSegment(relPath) {
  return relPath.split('/').some((p) => IGNORED_SEGMENTS.has(p));
}
export function isUnderForbiddenSegment(relPath) {
  return relPath.split('/').some((p) => FORBIDDEN_DIRECTORY_SEGMENTS.has(p));
}

export function getLockedFiles(repoRoot) {
  const archCheck = ['scripts', 'ops', 'check-architecture-guardrails.mjs'].join('/');
  const gatePath = path.join(repoRoot, archCheck);
  if (!existsSync(gatePath)) {return new Set();}
  try {
    const src = readFileSync(gatePath, 'utf8');
    const m = src.match(/const\s+LOCKED_FILES\s*=\s*new\s+Set\s*\(\s*\[([\s\S]*?)\]\s*\)/);
    if (!m) {return new Set();}
    return new Set(
      m[1]
        .split(/[,\n]/)
        .map((x) => x.replace(/['"]/g, '').trim())
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

export function countLines(content) {
  return content.split('\n').length;
}

export function findForbiddenToken(content) {
  const lines = content.split('\n');
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (inBlockComment) {
      if (/\*\//.test(raw)) {inBlockComment = false;}
      continue;
    }
    if (/^\/\*/.test(trimmed)) {
      if (!/\*\//.test(trimmed)) {inBlockComment = true;}
      continue;
    }
    if (/^\/\//.test(trimmed)) {continue;}
    for (const tok of FORBIDDEN_TOKENS) {
      if (tok.pattern.test(raw))
        {return { tokenId: tok.id, label: tok.label, lineNumber: i + 1, line: raw };}
    }
    if (ANY_TYPE_PATTERN.test(raw)) {
      return { tokenId: 'untyped', label: ':' + ' ' + _ANY, lineNumber: i + 1, line: raw };
    }
  }
  return null;
}

export function evaluateContent({ relPath, content, isNewFile, lockedFiles = new Set() }) {
  const violations = [];
  if (!isSourcePath(relPath)) {return violations;}
  if (isUnderIgnoredSegment(relPath)) {return violations;}
  if (lockedFiles.has(relPath)) {return violations;}
  if (isUnderForbiddenSegment(relPath)) {
    violations.push({
      rule: 'forbidden-directory',
      detail: relPath + ' esta sob ' + _COMP + '/. Padrao banido. Use __parts__/.',
    });
  }
  const lines = countLines(content);
  const limit = isNewFile ? MAX_NEW_FILE_LINES : MAX_TOUCHED_FILE_LINES;
  if (lines > limit) {
    violations.push({
      rule: 'line-limit',
      detail:
        relPath +
        ': ' +
        lines +
        ' linhas excede ' +
        limit +
        '. Use safe-decompose antes de escrever.',
    });
  }
  const tok = findForbiddenToken(content);
  if (tok) {
    violations.push({
      rule: 'forbidden-token:' + tok.tokenId,
      detail:
        relPath +
        ':' +
        tok.lineNumber +
        ' contem token proibido "' +
        tok.label +
        '". Bypass NAO permitido. Linha: ' +
        tok.line.trim().slice(0, 120),
    });
  }
  return violations;
}

export function simulateToolEdit({ toolName, toolInput, repoRoot }) {
  if (!toolInput || !toolInput.file_path) {return null;}
  const filePath = path.isAbsolute(toolInput.file_path)
    ? toolInput.file_path
    : path.join(repoRoot, toolInput.file_path);
  const exists = existsSync(filePath);
  let resulting = '';
  let isNewFile = false;
  if (toolName === 'Write') {
    isNewFile = !exists;
    resulting = String(toolInput.content == null ? '' : toolInput.content);
  } else if (toolName === 'Edit') {
    if (!exists) {return null;}
    const cur = readFileSync(filePath, 'utf8');
    const oldStr = String(toolInput.old_string == null ? '' : toolInput.old_string);
    const newStr = String(toolInput.new_string == null ? '' : toolInput.new_string);
    if (toolInput.replace_all) {
      resulting = cur.split(oldStr).join(newStr);
    } else {
      const idx = cur.indexOf(oldStr);
      if (idx === -1) {return null;}
      resulting = cur.slice(0, idx) + newStr + cur.slice(idx + oldStr.length);
    }
  } else if (toolName === 'MultiEdit') {
    if (!exists) {return null;}
    resulting = readFileSync(filePath, 'utf8');
    for (const e of toolInput.edits || []) {
      const oldStr = String(e.old_string == null ? '' : e.old_string);
      const newStr = String(e.new_string == null ? '' : e.new_string);
      if (e.replace_all) {
        resulting = resulting.split(oldStr).join(newStr);
      } else {
        const idx = resulting.indexOf(oldStr);
        if (idx === -1) {continue;}
        resulting = resulting.slice(0, idx) + newStr + resulting.slice(idx + oldStr.length);
      }
    }
  } else {
    return null;
  }
  const relPath = path.relative(repoRoot, filePath);
  return { relPath, filePath, resulting, isNewFile };
}

const EXPORT_DECL_RE =
  /^export\s+(?:async\s+)?(?:function|class|interface|type|const|let|var|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
const EXPORT_LIST_RE = /^export\s*(?:type)?\s*\{([^}]+)\}/gm;
const EXPORT_DEFAULT_RE = /^export\s+default\s+(?:function\s+|class\s+)?([A-Za-z_][A-Za-z0-9_]*)/m;

export function extractExports(content) {
  const names = new Set();
  let m;
  EXPORT_DECL_RE.lastIndex = 0;
  while ((m = EXPORT_DECL_RE.exec(content)) !== null) {names.add(m[1]);}
  EXPORT_LIST_RE.lastIndex = 0;
  while ((m = EXPORT_LIST_RE.exec(content)) !== null) {
    for (const tok of m[1].split(',')) {
      const cleaned = tok
        .trim()
        .replace(/\btype\s+/i, '')
        .split(/\s+as\s+/i)
        .pop()
        .trim();
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(cleaned)) {names.add(cleaned);}
    }
  }
  const def = content.match(EXPORT_DEFAULT_RE);
  if (def) {names.add('default:' + def[1]);}
  return names;
}
