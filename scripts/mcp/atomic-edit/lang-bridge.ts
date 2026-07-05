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

/** Extensions covered by tree-sitter fallback (tried when native parser unavailable). */
const TREE_SITTER_FALLBACK_EXTS = new Set([
  '.java', '.kt', '.c', '.h', '.cc', '.cpp', '.hpp', '.cs',
  '.swift', '.scala', '.php', '.css', '.scss', '.less', '.sql', '.html',
  '.go', '.rs',
]);

/** Map extension to tree-sitter language tag for validation. */
const EXT_TO_TS_LANG_PRE: Record<string, string> = {
  '.java': 'java',   '.kt': 'java',
  '.c': 'c',         '.h': 'c',
  '.cc': 'cpp',      '.cpp': 'cpp',     '.hpp': 'cpp',
  '.cs': 'cpp',
  '.swift': 'cpp',
  '.scala': 'java',
  '.php': 'cpp',
  '.css': 'css', '.scss': 'javascript', '.less': 'javascript',
  '.sql': 'sql',
  '.html': 'html',
  '.go': 'go',
  '.rs': 'rust',
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

  // No native validator — try tree-sitter for covered extensions
  if (!v) {
    if (TREE_SITTER_FALLBACK_EXTS.has(ext)) {
      const tsResult = tryTreeSitterValidation(ext, text);
      if (tsResult && tsResult.errorCount >= 0) {
        return {
          language: EXT_TO_TS_LANG_PRE[ext] as LangValidationResult['language'],
          errorCount: tsResult.errorCount,
          firstError: tsResult.firstError,
          realParser: true,
        };
      }
    }
    return { language: 'generic', errorCount: 0, realParser: false };
  }

  if (!v.check()) {
    // Native parser not available — try tree-sitter for covered extensions
    if (TREE_SITTER_FALLBACK_EXTS.has(ext)) {
      const tsResult = tryTreeSitterValidation(ext, text);
      if (tsResult && tsResult.errorCount >= 0) {
        return {
          language: EXT_TO_TS_LANG_PRE[ext] as LangValidationResult['language'],
          errorCount: tsResult.errorCount,
          firstError: tsResult.firstError,
          realParser: true,
        };
      }
    }
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

const ATOMIC_ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const WASM_VALIDATE_SCRIPT = path.join(ATOMIC_ROOT, 'lang-validate-wasm.mjs');
const WASM_TS_LANGS = new Set(['css', 'sql', 'html']);

function validateWasmGrammar(absPath: string, lang: string): { errorCount: number; firstError?: string } {
  const r = childProcess.spawnSync(process.execPath, [WASM_VALIDATE_SCRIPT, absPath, lang], {
    timeout: 15000,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.error || r.status !== 0) return { errorCount: -1 };
  const out = (r.stdout ?? '').trim();
  if (!out) return { errorCount: -1 };
  try {
    const parsed = JSON.parse(out) as { skipped?: boolean; errors?: number; firstError?: string };
    if (parsed.skipped) return { errorCount: -1 };
    return {
      errorCount: Number.isFinite(parsed.errors) ? Number(parsed.errors) : 0,
      firstError: typeof parsed.firstError === 'string' ? parsed.firstError : undefined,
    };
  } catch {
    return { errorCount: -1 };
  }
}

/** Try tree-sitter validation — writes text to temp file, calls Python or WASM parser. */
function tryTreeSitterValidation(ext: string, text: string): { errorCount: number; firstError?: string } | null {
  const lang = EXT_TO_TS_LANG_PRE[ext];
  if (!lang) return null;
  if (!WASM_TS_LANGS.has(lang) && !ts3Available()) return null;

  const tmpDir = os.tmpdir();
  const tmpPath = path.join(tmpDir, `.atomic-lang-${process.pid}-${Date.now()}${ext}`);
  try {
    fs.writeFileSync(tmpPath, text, 'utf8');
    return validateTreeSitter(tmpPath, ext, text);
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* cleanup */ }
  }
}


// ─────────────────────────── tree-sitter bridge ───────────────────────────

const TREE_SITTER_SCRIPT = path.join(ATOMIC_ROOT, 'lang-validate.py');
/** Map extension to tree-sitter language tag. */
const EXT_TO_TS_LANG: Record<string, string> = {
  '.java': 'java',   '.kt': 'java',     // Kotlin uses Java grammar as approximation
  '.c': 'c',         '.h': 'c',
  '.cc': 'cpp',      '.cpp': 'cpp',     '.hpp': 'cpp',
  '.cs': 'cpp',                          // C# approximate grammar fallback
  '.swift': 'cpp',                       // Swift approximate grammar fallback
  '.scala': 'java',                      // Scala approximate grammar fallback
  '.php': 'cpp',                         // PHP approximate grammar fallback
  '.css': 'css',
  '.scss': 'javascript',
  '.less': 'javascript',
  '.sql': 'sql',
  '.html': 'html',
  '.go': 'go',
  '.rs': 'rust',
};

let _ts3Available: boolean | null = null;

function ts3Available(): boolean {
  if (_ts3Available !== null) return _ts3Available;
  try {
    const r = childProcess.spawnSync('python3', ['-c', 'import tree_sitter; import tree_sitter_java'], {
      timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    _ts3Available = r.status === 0;
  } catch {
    _ts3Available = false;
  }
  return _ts3Available;
}

/**
 * Validate using tree-sitter Python script. Returns {errorCount, firstError}.
 * Returns errorCount=-1 if tree-sitter is not available.
 */
function validateTreeSitter(absPath: string, ext: string, text: string): { errorCount: number; firstError?: string } {
  const lang = EXT_TO_TS_LANG[ext];
  if (!lang) return { errorCount: -1 };
  if (WASM_TS_LANGS.has(lang)) return validateWasmGrammar(absPath, lang);
  if (!ts3Available()) return { errorCount: -1 };

  const tmpDir = os.tmpdir();
  const tmpPath = path.join(tmpDir, `.atomic-ts-${process.pid}-${Date.now()}${ext}`);
  try {
    fs.writeFileSync(tmpPath, text, 'utf8');
    const r = childProcess.spawnSync('python3', [TREE_SITTER_SCRIPT, tmpPath, lang], {
      timeout: 15000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.error) return { errorCount: -1 };

    const out = (r.stdout ?? '').trim();
    if (!out) return { errorCount: -1 };

    const parsed = JSON.parse(out);
    if (parsed.skipped) return { errorCount: -1 };
    return {
      errorCount: parsed.errors ?? 0,
      firstError: parsed.firstError,
    };
  } catch {
    return { errorCount: -1 };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* cleanup */ }
  }
}
/**
 * Flush the availability cache (useful after installing a new language toolchain
 * during the same session).
 */
export function flushLangCache(): void {
  availabilityCache.clear();
}
