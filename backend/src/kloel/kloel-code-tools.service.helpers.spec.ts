import {
  BUILD_SCOPES,
  DIR_MAX_ENTRIES,
  GIT_LOG_DEFAULT_COUNT,
  GIT_LOG_MAX_COUNT,
  MAX_FILE_BYTES,
  MAX_GREP_RESULTS,
  OUTLINE_PATTERNS,
  buildDirEntries,
  buildJestCommand,
  buildSearchCommand,
  buildSliceContent,
  clampGitLogCount,
  extractErrorMessage,
  extractExecOutput,
  extractOutlineSymbols,
  fileTooLargeMessage,
  isCodeGraphTimeoutError,
  isFileNotFoundError,
  isRgNoMatchError,
  mapJestTestResults,
  parsePrismaSchema,
  parseRgResultLine,
  parseRgResults,
  resolveBuildScopes,
  sanitizeCodeGraphQuery,
  shellQuote,
} from './kloel-code-tools.service.helpers';

describe('kloel-code-tools.service.helpers', () => {
  describe('extractErrorMessage', () => {
    it('returns Error.message for Error instances', () => {
      expect(extractErrorMessage(new Error('boom'))).toBe('boom');
    });
    it('stringifies non-Error throws', () => {
      expect(extractErrorMessage('plain')).toBe('plain');
      expect(extractErrorMessage(42)).toBe('42');
      expect(extractErrorMessage(null)).toBe('null');
    });
  });

  describe('isFileNotFoundError', () => {
    it('detects ENOENT', () => {
      expect(isFileNotFoundError('ENOENT: no such file')).toBe(true);
    });
    it('returns false for other errors', () => {
      expect(isFileNotFoundError('EACCES: permission denied')).toBe(false);
    });
  });

  describe('fileTooLargeMessage', () => {
    it('renders canonical message with size and default max', () => {
      const msg = fileTooLargeMessage(200_000);
      expect(msg).toBe(`file_too_large: 200000 bytes, max ${MAX_FILE_BYTES}`);
    });
    it('uses supplied max when given', () => {
      expect(fileTooLargeMessage(123, 1000)).toBe('file_too_large: 123 bytes, max 1000');
    });
  });

  describe('buildSliceContent', () => {
    it('returns original content unchanged when bounds are missing', () => {
      const r = buildSliceContent('a\nb\nc');
      expect(r.content).toBe('a\nb\nc');
      expect(r.totalLines).toBe(3);
    });
    it('numbers and slices when bounds are supplied', () => {
      const r = buildSliceContent('a\nb\nc\nd\ne', 2, 4);
      expect(r.totalLines).toBe(5);
      expect(r.content).toBe('2: b\n3: c\n4: d');
    });
    it('clamps endLine to file extents', () => {
      const r = buildSliceContent('a\nb', 1, 100);
      expect(r.content).toBe('1: a\n2: b');
    });
    it('treats startLine=0 as unbounded (original behavior)', () => {
      const r = buildSliceContent('a\nb', 0, 2);
      expect(r.content).toBe('a\nb');
    });
  });

  describe('buildDirEntries', () => {
    const dirent = (name: string, dir = false, sym = false) => ({
      name,
      isDirectory: () => dir,
      isSymbolicLink: () => sym,
    });

    it('filters hidden entries but keeps .env.example', () => {
      const out = buildDirEntries([
        dirent('.git', true),
        dirent('.env.example'),
        dirent('index.ts'),
      ]);
      expect(out.map((e) => e.name)).toEqual(['.env.example', 'index.ts']);
    });

    it('sorts directories before files and alpha within kind', () => {
      const out = buildDirEntries([
        dirent('z.ts'),
        dirent('src', true),
        dirent('a.ts'),
        dirent('apps', true),
      ]);
      expect(out.map((e) => e.name)).toEqual(['apps', 'src', 'a.ts', 'z.ts']);
    });

    it('labels symlinks distinctly from files and dirs', () => {
      const out = buildDirEntries([dirent('link', false, true)]);
      expect(out[0]?.kind).toBe('symlink');
    });

    it('caps at the supplied max length', () => {
      const big = Array.from({ length: 60 }, (_, i) => dirent(`f${i}.ts`));
      const out = buildDirEntries(big, 10);
      expect(out).toHaveLength(10);
    });

    it('exposes a sensible default cap', () => {
      expect(DIR_MAX_ENTRIES).toBeGreaterThan(0);
    });
  });

  describe('shellQuote', () => {
    it('escapes embedded single quotes', () => {
      expect(shellQuote("it's")).toBe("it'\\''s");
    });
    it('passes through clean strings', () => {
      expect(shellQuote('plain')).toBe('plain');
    });
  });

  describe('buildSearchCommand', () => {
    it('appends default roots when no glob is supplied', () => {
      const cmd = buildSearchCommand('foo', undefined, '/r');
      expect(cmd).toContain("cd '/r'");
      expect(cmd).toContain('rg --line-number -i');
      expect(cmd).toContain(`--max-count ${MAX_GREP_RESULTS}`);
      expect(cmd).toContain("'foo'");
      expect(cmd).toContain(' backend/src/ frontend/src/ worker/src/');
    });
    it('uses --glob and drops the default-roots tail when a glob is supplied', () => {
      const cmd = buildSearchCommand('foo', '*.ts', '/r');
      expect(cmd).toContain("--glob '*.ts'");
      expect(cmd).not.toContain(' backend/src/');
    });
    it('escapes both the pattern and the glob', () => {
      const cmd = buildSearchCommand("a'b", "*.t's", '/r');
      expect(cmd).toContain("'a'\\''b'");
      expect(cmd).toContain("'*.t'\\''s'");
    });
  });

  describe('parseRgResultLine', () => {
    it('parses a well-formed row', () => {
      const r = parseRgResultLine('src/file.ts:42:hello world');
      expect(r).toEqual({ file: 'src/file.ts', line: 42, content: 'hello world' });
    });
    it('rejoins content that itself contains colons', () => {
      const r = parseRgResultLine('a.ts:5:foo: bar: baz');
      expect(r?.content).toBe('foo: bar: baz');
    });
    it('returns null for empty input', () => {
      expect(parseRgResultLine('')).toBeNull();
    });
  });

  describe('parseRgResults', () => {
    it('parses multi-line stdout, dropping blanks', () => {
      const stdout = 'a.ts:1:x\n\nb.ts:2:y\n';
      const out = parseRgResults(stdout);
      expect(out).toHaveLength(2);
      expect(out[0]?.file).toBe('a.ts');
      expect(out[1]?.line).toBe(2);
    });
    it('handles empty buffer', () => {
      expect(parseRgResults('')).toEqual([]);
    });
  });

  describe('isRgNoMatchError', () => {
    it('detects rg-style exit-1 messages', () => {
      expect(isRgNoMatchError('Command failed: rg ...')).toBe(true);
      expect(isRgNoMatchError('exit code 1')).toBe(true);
    });
    it('returns false otherwise', () => {
      expect(isRgNoMatchError('ENOENT')).toBe(false);
    });
  });

  describe('extractExecOutput', () => {
    it('extracts stdout/stderr strings', () => {
      const e = { stdout: 'out', stderr: 'err' };
      expect(extractExecOutput(e)).toEqual({ stdout: 'out', stderr: 'err' });
    });
    it('drops non-string fields', () => {
      const e = { stdout: 123, stderr: undefined };
      expect(extractExecOutput(e)).toEqual({ stdout: undefined, stderr: undefined });
    });
    it('handles plain Errors without stdout/stderr', () => {
      expect(extractExecOutput(new Error('x'))).toEqual({
        stdout: undefined,
        stderr: undefined,
      });
    });
  });

  describe('clampGitLogCount', () => {
    it('returns default for undefined or non-positive input', () => {
      expect(clampGitLogCount(undefined)).toBe(GIT_LOG_DEFAULT_COUNT);
      expect(clampGitLogCount(0)).toBe(GIT_LOG_DEFAULT_COUNT);
      expect(clampGitLogCount(-5)).toBe(GIT_LOG_DEFAULT_COUNT);
    });
    it('caps at the max', () => {
      expect(clampGitLogCount(9999)).toBe(GIT_LOG_MAX_COUNT);
    });
    it('passes through values inside the band', () => {
      expect(clampGitLogCount(5)).toBe(5);
    });
  });

  describe('extractOutlineSymbols', () => {
    it('detects functions, classes, interfaces, types, consts, methods, decorators', () => {
      const src = [
        'export function alpha() {}',
        'function beta() {}',
        'export class Cls {}',
        'class Plain {}',
        'export interface IFoo {}',
        'export type TFoo = number;',
        'export const KAPPA = 1;',
        '  protected async runIt() {}',
        '@Injectable()',
        '@Controller("x")',
        '@Module({})',
      ].join('\n');
      const { symbols, totalLines } = extractOutlineSymbols(src);
      const names = symbols.map((s) => `${s.kind}:${s.name}`);
      expect(names).toContain('function:alpha');
      expect(names).toContain('function:beta');
      expect(names).toContain('class:Cls');
      expect(names).toContain('class:Plain');
      expect(names).toContain('interface:IFoo');
      expect(names).toContain('type:TFoo');
      expect(names).toContain('const:KAPPA');
      expect(names).toContain('method:runIt');
      expect(names).toContain('decorator:Injectable');
      expect(names).toContain('decorator:Controller');
      expect(names).toContain('decorator:Module');
      expect(totalLines).toBe(11);
    });
    it('skips blank lines without crashing', () => {
      const { symbols } = extractOutlineSymbols('\n\n');
      expect(symbols).toEqual([]);
    });
    it('exposes the regex table for inspection', () => {
      expect(OUTLINE_PATTERNS.length).toBeGreaterThan(0);
    });
  });

  describe('parsePrismaSchema', () => {
    it('extracts models and enums with 1-indexed lines', () => {
      const schema = ['model User {', '  id String', '}', 'enum Role {', '  ADMIN', '}'].join('\n');
      const parsed = parsePrismaSchema(schema);
      expect(parsed.models).toEqual([{ name: 'User', line: 1 }]);
      expect(parsed.enums).toEqual([{ name: 'Role', line: 4 }]);
      expect(parsed.totalLines).toBe(6);
    });
    it('handles a buffer with no models', () => {
      const parsed = parsePrismaSchema('// nothing here\n');
      expect(parsed.models).toEqual([]);
      expect(parsed.enums).toEqual([]);
    });
  });

  describe('sanitizeCodeGraphQuery', () => {
    it('strips quote characters and trims', () => {
      expect(sanitizeCodeGraphQuery('  "foo`bar\'" ')).toBe('foobar');
    });
    it('returns empty string for whitespace-only input', () => {
      expect(sanitizeCodeGraphQuery('   ')).toBe('');
    });
  });

  describe('isCodeGraphTimeoutError', () => {
    it('detects timeout/kill signals', () => {
      expect(isCodeGraphTimeoutError('ETIMEDOUT')).toBe(true);
      expect(isCodeGraphTimeoutError('process killed by SIGTERM')).toBe(true);
    });
    it('returns false for plain errors', () => {
      expect(isCodeGraphTimeoutError('boom')).toBe(false);
    });
  });

  describe('buildJestCommand', () => {
    it('returns full-run command when no pattern is supplied', () => {
      const cmd = buildJestCommand('/r', undefined);
      expect(cmd).toBe("cd '/r/backend' && npx jest --no-coverage --forceExit --json 2>&1");
    });
    it('quotes the -t pattern when supplied', () => {
      const cmd = buildJestCommand('/r', "auth's");
      expect(cmd).toContain("-t 'auth'\\''s'");
      expect(cmd).toContain('--forceExit --json');
    });
  });

  describe('mapJestTestResults', () => {
    it('strips repo prefix from each name', () => {
      const out = mapJestTestResults(
        [
          { name: '/r/backend/foo.spec.ts', status: 'passed' },
          { name: '/r/backend/bar.spec.ts', status: 'failed' },
        ],
        '/r',
      );
      expect(out).toEqual([
        { file: 'backend/foo.spec.ts', status: 'passed' },
        { file: 'backend/bar.spec.ts', status: 'failed' },
      ]);
    });
    it('returns [] for undefined input', () => {
      expect(mapJestTestResults(undefined, '/r')).toEqual([]);
    });
  });

  describe('resolveBuildScopes', () => {
    it('returns the full whitelist when no scope is supplied', () => {
      expect(resolveBuildScopes(undefined)).toEqual(BUILD_SCOPES);
    });
    it('returns a single-element array for a known scope', () => {
      expect(resolveBuildScopes('backend')).toEqual(['backend']);
    });
    it('returns [] for unknown scopes', () => {
      expect(resolveBuildScopes('mystery')).toEqual([]);
    });
  });
});
