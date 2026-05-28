/**
 * Pure helpers extracted from `KloelCodeToolsService` to keep the service
 * body a thin orchestrator over `fs`, `child_process`, and the
 * CodeGraph / cognitive / pulse bridges.
 *
 * Constraints:
 *   - No `this` access — every helper is a free function or const.
 *   - No NestJS DI tokens.
 *   - No I/O. These helpers only transform inputs (strings, errors,
 *     parsed structures) into outputs. The service still owns every
 *     `fs.readFile`, `exec`, etc. call.
 *   - Safe for direct unit testing under Jest without mocks.
 */

/** Hard cap on bytes read by `toolReadSourceFile`. */
export const MAX_FILE_BYTES = 100_000;

/** Hard cap on rg result rows surfaced to the caller. */
export const MAX_GREP_RESULTS = 30;

/** Hard cap on entries returned by `toolGitLog`. */
export const GIT_LOG_MAX_COUNT = 20;

/** Default git-log count when none is supplied. */
export const GIT_LOG_DEFAULT_COUNT = 10;

/** Hard cap on entries surfaced by `toolListSourceDir`. */
export const DIR_MAX_ENTRIES = 50;

/** Slice of the read-file payload that includes line numbers. */
export interface ReadSliceResult {
  content: string;
  totalLines: number;
}

/** A single rg hit, normalized from one `file:line:content` row. */
export interface RgResultRow {
  file: string;
  line: number;
  content: string;
}

/** Outline symbol entry, kind + 1-indexed line. */
export interface OutlineSymbol {
  name: string;
  kind: string;
  line: number;
}

/** Directory entry as exposed by `toolListSourceDir`. */
export interface DirEntry {
  name: string;
  kind: 'directory' | 'symlink' | 'file';
}

/** Prisma schema parse result. */
export interface PrismaSchemaParse {
  models: Array<{ name: string; line: number }>;
  enums: Array<{ name: string; line: number }>;
  totalLines: number;
}

/**
 * Narrows `unknown` thrown values into a plain string message without
 * leaking the prototype. Same shape used across every tool method.
 */
export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * `true` when the error message matches the ENOENT (file-not-found)
 * convention from `fs.stat`/`fs.readFile`.
 */
export function isFileNotFoundError(msg: string): boolean {
  return msg.includes('ENOENT');
}

/**
 * Builds the `file_too_large` error string used by `toolReadSourceFile`.
 * Centralised so tests can assert the canonical wording.
 */
export function fileTooLargeMessage(size: number, max: number = MAX_FILE_BYTES): string {
  return `file_too_large: ${size} bytes, max ${max}`;
}

/**
 * Renders a `[startLine..endLine]` window of a UTF-8 buffer, prefixing
 * each row with its 1-indexed line number (`<n>: <line>`). Bounds are
 * clamped to the file extents so off-by-one args do not throw.
 *
 * When the requested range is unbounded (either bound missing), the
 * full content is returned unchanged.
 */
export function buildSliceContent(
  content: string,
  startLine?: number,
  endLine?: number,
): ReadSliceResult {
  const lines = content.split('\n');
  const totalLines = lines.length;
  if (!startLine || !endLine) {
    return { content, totalLines };
  }
  const s = Math.max(1, startLine);
  const e = Math.min(totalLines, endLine);
  const sliced = lines
    .slice(s - 1, e)
    .map((l, i) => `${s + i}: ${l}`)
    .join('\n');
  return { content: sliced, totalLines };
}

/**
 * Maps a `Dirent`-like record (`name` + `isDirectory`/`isSymbolicLink`)
 * to the public `DirEntry` shape. Hidden entries (`.foo`) are removed
 * except `.env.example`, then the head of the list is capped by `max`,
 * then entries are sorted dirs-first / alpha-second.
 */
export function buildDirEntries(
  raw: ReadonlyArray<{
    name: string;
    isDirectory: () => boolean;
    isSymbolicLink: () => boolean;
  }>,
  max: number = DIR_MAX_ENTRIES,
): DirEntry[] {
  const mapped: DirEntry[] = raw
    .filter((e) => !e.name.startsWith('.') || e.name === '.env.example')
    .slice(0, max)
    .map<DirEntry>((e) => ({
      name: e.name,
      kind: e.isDirectory() ? 'directory' : e.isSymbolicLink() ? 'symlink' : 'file',
    }));
  mapped.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return mapped;
}

/**
 * Quotes a value for a single-quoted shell argument by escaping every
 * embedded single quote (`'` -> `'\\''`). Used everywhere the service
 * splices user input into a `bash -c '...'` invocation.
 */
export function shellQuote(value: string): string {
  return value.replace(/'/g, "'\\''");
}

/**
 * Builds the `rg --line-number ...` command used by `toolSearchCodebase`.
 * Encapsulates the two divergent shapes: a `--glob` flag suppresses the
 * fixed `backend/src/ frontend/src/ worker/src/` suffix; without a glob
 * those default roots are appended.
 */
export function buildSearchCommand(
  pattern: string,
  glob: string | undefined,
  repoRoot: string,
  max: number = MAX_GREP_RESULTS,
): string {
  const globArg = glob ? `--glob '${shellQuote(glob)}'` : '';
  const searchPath = glob ? '' : ' backend/src/ frontend/src/ worker/src/';
  return `cd '${repoRoot}' && rg --line-number -i --max-count ${max} ${globArg} '${shellQuote(pattern)}'${searchPath} 2>&1`;
}

/**
 * Parses one `file:line:content` row emitted by `rg --line-number`.
 * Returns `null` for blank lines so callers can flat-filter.
 */
export function parseRgResultLine(line: string): RgResultRow | null {
  if (!line) {
    return null;
  }
  const [file, lnum, ...rest] = line.split(':');
  if (!file) {
    return null;
  }
  return {
    file,
    line: Number(lnum),
    content: rest.join(':').trim(),
  };
}

/**
 * Parses a full `rg --line-number` stdout block into result rows.
 * Empty input yields an empty array (no crash).
 */
export function parseRgResults(stdout: string): RgResultRow[] {
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(parseRgResultLine)
    .filter((row): row is RgResultRow => row !== null);
}

/**
 * `true` when an `exec` error looks like rg's "no matches" exit code 1
 * with usable stdout/stderr that we can still parse.
 */
export function isRgNoMatchError(msg: string): boolean {
  return msg.includes('exit code 1') || msg.includes('Command failed');
}

/**
 * Narrows the `stdout`/`stderr` fields tacked onto `exec` errors by
 * `child_process` without `any`. Returns `undefined` for non-string
 * entries.
 */
export function extractExecOutput(err: unknown): { stdout?: string; stderr?: string } {
  const ce = err as { stdout?: unknown; stderr?: unknown };
  return {
    stdout: typeof ce.stdout === 'string' ? ce.stdout : undefined,
    stderr: typeof ce.stderr === 'string' ? ce.stderr : undefined,
  };
}

/**
 * Clamps a user-supplied `git log` count to the `[1..max]` window,
 * falling back to `defaultN` when the input is missing or non-positive.
 */
export function clampGitLogCount(
  count: number | undefined,
  max: number = GIT_LOG_MAX_COUNT,
  defaultN: number = GIT_LOG_DEFAULT_COUNT,
): number {
  if (!count || count <= 0) {
    return defaultN;
  }
  return Math.min(count, max);
}

/**
 * Pattern table used by `toolCodeOutline` to scrape symbols out of a
 * source buffer. Order is significant: each line stops at the first
 * regex hit, so more specific (`export class`) must precede more
 * general (`class`).
 */
export const OUTLINE_PATTERNS: ReadonlyArray<{
  regex: RegExp;
  kind: string;
  extract: (m: RegExpMatchArray) => string;
}> = [
  {
    regex: /^\s*export\s+(async\s+)?function\s+(\w+)/,
    kind: 'function',
    extract: (m) => m[2] ?? 'unknown',
  },
  {
    regex: /^\s*(async\s+)?function\s+(\w+)/,
    kind: 'function',
    extract: (m) => m[2] ?? 'unknown',
  },
  { regex: /^\s*export\s+class\s+(\w+)/, kind: 'class', extract: (m) => m[1] ?? 'unknown' },
  { regex: /^\s*class\s+(\w+)/, kind: 'class', extract: (m) => m[1] ?? 'unknown' },
  {
    regex: /^\s*export\s+interface\s+(\w+)/,
    kind: 'interface',
    extract: (m) => m[1] ?? 'unknown',
  },
  { regex: /^\s*export\s+type\s+(\w+)/, kind: 'type', extract: (m) => m[1] ?? 'unknown' },
  { regex: /^\s*export\s+const\s+(\w+)/, kind: 'const', extract: (m) => m[1] ?? 'unknown' },
  {
    regex: /^\s*(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\(/,
    kind: 'method',
    extract: (m) => m[1] ?? 'unknown',
  },
  { regex: /@Injectable\(\)/, kind: 'decorator', extract: () => 'Injectable' },
  { regex: /@Controller\(/, kind: 'decorator', extract: () => 'Controller' },
  { regex: /@Module\(/, kind: 'decorator', extract: () => 'Module' },
];

/**
 * Walks a source buffer line-by-line, applying `OUTLINE_PATTERNS` in
 * order. Each matched line yields a single symbol; subsequent patterns
 * for that same line are skipped to keep results stable.
 */
export function extractOutlineSymbols(content: string): {
  symbols: OutlineSymbol[];
  totalLines: number;
} {
  const lines = content.split('\n');
  const symbols: OutlineSymbol[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      continue;
    }
    for (const p of OUTLINE_PATTERNS) {
      const m = line.match(p.regex);
      if (m) {
        symbols.push({ name: p.extract(m), kind: p.kind, line: i + 1 });
        break;
      }
    }
  }
  return { symbols, totalLines: lines.length };
}

/**
 * Parses a Prisma schema buffer into a model+enum index. Each entry
 * records the 1-indexed line of its `model Foo {` / `enum Bar {`
 * declaration, which is what the tool surfaces to chat clients.
 */
export function parsePrismaSchema(content: string): PrismaSchemaParse {
  const modelMatches = [...content.matchAll(/^model\s+(\w+)\s*\{/gm)];
  const models = modelMatches.map((m) => ({
    name: m[1] ?? 'unknown',
    line: content.slice(0, m.index).split('\n').length,
  }));

  const enumMatches = [...content.matchAll(/^enum\s+(\w+)\s*\{/gm)];
  const enums = enumMatches.map((m) => ({
    name: m[1] ?? 'unknown',
    line: content.slice(0, m.index).split('\n').length,
  }));

  return {
    models,
    enums,
    totalLines: content.split('\n').length,
  };
}

/**
 * Strips quote characters and trims whitespace from a CodeGraph
 * subject. An empty result is the caller's signal that no query was
 * supplied (it then short-circuits with a friendly message).
 */
export function sanitizeCodeGraphQuery(query: string): string {
  return query.replace(/["'`]/g, '').trim();
}

/**
 * `true` when a CodeGraph error message indicates the underlying
 * process was killed by the caller-supplied timeout.
 */
export function isCodeGraphTimeoutError(msg: string): boolean {
  return msg.includes('ETIMEDOUT') || msg.includes('killed');
}

/**
 * Builds the shell command used to run jest from `backend/`. When a
 * `-t` pattern is supplied it is shell-quoted; otherwise the unfiltered
 * full run command is returned.
 */
export function buildJestCommand(repoRoot: string, pattern: string | undefined): string {
  if (pattern) {
    return `cd '${repoRoot}/backend' && npx jest --no-coverage -t '${shellQuote(pattern)}' --forceExit --json 2>&1`;
  }
  return `cd '${repoRoot}/backend' && npx jest --no-coverage --forceExit --json 2>&1`;
}

/**
 * Normalises a jest `testResults[]` entry into the trimmed shape the
 * tool returns: file paths are rewritten relative to `repoRoot`.
 */
export function mapJestTestResults(
  results: ReadonlyArray<{ name: string; status: string }> | undefined,
  repoRoot: string,
): Array<{ file: string; status: string }> {
  return (results ?? []).map((r) => ({
    file: r.name.replace(repoRoot + '/', ''),
    status: r.status,
  }));
}

/**
 * Whitelist guard for `toolBuildStatus`. Anything outside this trio
 * silently no-ops to avoid arbitrary `tsc` execution in random dirs.
 */
export const BUILD_SCOPES: ReadonlyArray<'backend' | 'frontend' | 'worker'> = [
  'backend',
  'frontend',
  'worker',
];

/**
 * Returns the ordered scope list `toolBuildStatus` should iterate.
 * Empty input means "all three"; an unknown scope yields an empty
 * array (caller short-circuits with `success: true, results: {}`).
 */
export function resolveBuildScopes(
  scope: string | undefined,
): ReadonlyArray<'backend' | 'frontend' | 'worker'> {
  if (!scope) {
    return BUILD_SCOPES;
  }
  return BUILD_SCOPES.includes(scope as 'backend' | 'frontend' | 'worker')
    ? [scope as 'backend' | 'frontend' | 'worker']
    : [];
}
