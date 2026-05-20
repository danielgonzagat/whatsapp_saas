/**
 * Multi-language validation bridge for the atomic-edit MCP server.
 *
 * Extends the validate() engine past TS/JS/JSON/structural-balance into
 * real syntax validation for Python, Go, Rust, Ruby, and any language
 * whose parser is available on the host. Falls back gracefully to
 * structural-balance when no parser is installed.
 *
 * Design: spawn child_process per validation request. Stateless —
 * no persistent server, no port, no network. Caches "is parser available"
 * per-language so cold-start is one probe, then fast-path.
 */

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ─────────────────────────── types ───────────────────────────

export interface LangValidationResult {
  /** Language tag used by the validator (e.g. "python", "go", "rust"). */
  language: string;
  /** Number of parse errors found. */
  errorCount: number;
  /** First error message, if any. */
  firstError?: string;
  /** Whether a real parser was available (false = fell back to structural). */
  realParser: boolean;
}

export type LangErrorSeverity = 'error' | 'warning';

// ─────────────────────────── cache ───────────────────────────

const availabilityCache = new Map<string, boolean>();

function probeCommand(cmd: string, args: string[]): boolean {
  const cached = availabilityCache.get(cmd);
  if (cached !== undefined) return cached;
  try {
    const r = childProcess.spawnSync(cmd, args, {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const ok = r.status === 0 || r.status === 1; // parse error = parser worked
    availabilityCache.set(cmd, ok);
    return ok;
  } catch {
    availabilityCache.set(cmd, false);
    return false;
  }
}

// ─────────────────────────── per-language validators ───────────────────────────

/**
 * Python: use `ast.parse()` via inline script.
 * Returns {errorCount, firstError}. Real parser — full CPython grammar.
 */
function validatePython(absPath: string): { errorCount: number; firstError?: string } {
  const script = [
    'import ast, sys',
    `try:`,
    `  with open(${JSON.stringify(absPath)}, 'r') as f:`,
    '    ast.parse(f.read())',
    '  print("OK")',
    'except SyntaxError as e:',
    '  print(f"SYNTAX_ERROR:{e.msg}:line {e.lineno}:col {e.offset}")',
    'except Exception as e:',
    '  print(f"ERROR:{e}")',
  ].join('\n');

  const r = childProcess.spawnSync('python3', ['-c', script], {
    timeout: 10000,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdout = (r.stdout ?? '').trim();
  if (stdout === 'OK') return { errorCount: 0 };
  if (stdout.startsWith('SYNTAX_ERROR:')) {
    return { errorCount: 1, firstError: stdout.slice('SYNTAX_ERROR:'.length) };
  }
  // python3 not found or other error — fall through to structural
  return { errorCount: -1 };
}

/**
 * Go: use `go tool compile -e` or `gofmt -e`.
 * gofmt -e is faster and always available if Go is installed.
 */
function validateGo(absPath: string): { errorCount: number; firstError?: string } {
  const r = childProcess.spawnSync('gofmt', ['-e', absPath], {
    timeout: 10000,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stderr = (r.stderr ?? '').trim();
  if (!stderr) return { errorCount: 0 };
  // gofmt errors look like: file.go:10:5: expected ')', found '...'
  const lines = stderr.split('\n').filter(l => l.includes(':'));
  return {
    errorCount: lines.length,
    firstError: lines[0]?.trim() || 'parse error',
  };
}

/**
 * Rust: use `rustc --edition 2021 --parse-only`.
 */
function validateRust(absPath: string): { errorCount: number; firstError?: string } {
  const r = childProcess.spawnSync('rustc', ['--edition', '2021', '--parse-only', absPath], {
    timeout: 15000,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stderr = (r.stderr ?? '').trim();
  if (r.status === 0) return { errorCount: 0 };
  // Count error: lines
  const lines = stderr.split('\n').filter(l => l.startsWith('error:') || l.startsWith('error['));
  return {
    errorCount: lines.length || 1,
    firstError: lines[0]?.trim() || stderr.slice(0, 200),
  };
}

/**
 * Ruby: use `ruby -c` (check syntax only, no execution).
 */
function validateRuby(absPath: string): { errorCount: number; firstError?: string } {
  const r = childProcess.spawnSync('ruby', ['-c', absPath], {
    timeout: 10000,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = (r.stdout ?? '').trim();
  if (stdout === 'Syntax OK') return { errorCount: 0 };
  return { errorCount: 1, firstError: stdout || 'syntax error' };
}

/**
 * Shell: use `bash -n` (parse without executing).
 */
function validateShell(absPath: string): { errorCount: number; firstError?: string } {
  const r = childProcess.spawnSync('bash', ['-n', absPath], {
    timeout: 10000,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status === 0) return { errorCount: 0 };
  const stderr = (r.stderr ?? '').trim();
  return { errorCount: 1, firstError: stderr || 'syntax error' };
}

// ─────────────────────────── public API ───────────────────────────

const EXT_VALIDATORS: Record<string, {
  check: () => boolean;
  validate: (absPath: string) => { errorCount: number; firstError?: string };
  lang: string;
}> = {
  '.py':  { check: () => probeCommand('python3', ['--version']), validate: validatePython, lang: 'python' },
  '.go':  { check: () => probeCommand('gofmt', ['-h']),             validate: validateGo,     lang: 'go' },
  '.rs':  { check: () => probeCommand('rustc', ['--version']),    validate: validateRust,   lang: 'rust' },
  '.rb':  { check: () => probeCommand('ruby', ['--version']),     validate: validateRuby,   lang: 'ruby' },
  '.sh':  { check: () => probeCommand('bash', ['--version']),     validate: validateShell,  lang: 'shell' },
  '.bash':{ check: () => probeCommand('bash', ['--version']),     validate: validateShell,  lang: 'shell' },
  '.zsh': { check: () => probeCommand('zsh', ['--version']),      validate: validateShell,  lang: 'shell' },
};

// Also cover extensions that structural balance already handles but we
// want to upgrade to real parsing when available:
// .java, .kt, .c, .cpp, .cs, .swift, .scala — these need tree-sitter (Phase 2)
// and stay as structural for now.

/**
 * Try real-syntax validation for a file. Returns a LangValidationResult.
 * If no real parser is available, returns errorCount=-1 (caller should
 * fall back to structural or generic).
 */
export function validateLanguage(file: string, text: string): LangValidationResult {
  const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
  const v = EXT_VALIDATORS[ext];
  if (!v) return { language: 'generic', errorCount: 0, realParser: false };

  if (!v.check()) {
    return { language: 'generic', errorCount: -1, realParser: false };
  }

  // Write text to temp file because most parsers need a real path
  const tmpDir = os.tmpdir();
  const tmpPath = path.join(tmpDir, `.atomic-py-validate-${process.pid}-${Date.now()}${ext}`);
  try {
    fs.writeFileSync(tmpPath, text, 'utf8');
    const result = v.validate(tmpPath);
    if (result.errorCount < 0) {
      return { language: 'generic', errorCount: -1, realParser: false };
    }
    return {
      language: v.lang,
      errorCount: result.errorCount,
      firstError: result.firstError,
      realParser: true,
    };
  } catch {
    return { language: 'generic', errorCount: -1, realParser: false };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* best-effort cleanup */ }
  }
}

/**
 * Flush the availability cache (useful after installing a new language toolchain
 * during the same session).
 */
export function flushLangCache(): void {
  availabilityCache.clear();
}
