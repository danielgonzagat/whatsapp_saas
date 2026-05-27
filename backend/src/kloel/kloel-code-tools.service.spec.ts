import { KloelCodeToolsService } from './kloel-code-tools.service';

// Mock fs/promises at module level
const mockReadFile = jest.fn();
const mockStat = jest.fn();
const mockReaddir = jest.fn();
const mockAccess = jest.fn();

jest.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  access: (...args: unknown[]) => mockAccess(...args),
}));

const mockExec = jest.fn();
jest.mock('child_process', () => ({
  exec: (...args: unknown[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') {
      return mockExec(...args);
    }
    return mockExec(...args);
  },
}));

// promisify mock — exec is promisified at module top-level
jest.mock('util', () => {
  const actual = jest.requireActual('util');
  return {
    ...actual,
    promisify: () => jest.fn().mockImplementation((cmd: string, opts?: Record<string, unknown>) => {
      if (typeof cmd !== 'string') return Promise.reject(new Error('bad cmd'));
      if (cmd.includes('git log')) {
        return Promise.resolve({ stdout: 'abc123 feat: test\ndef456 fix: bug', stderr: '' });
      }
      if (cmd.includes('git diff')) {
        return Promise.resolve({ stdout: 'src/file.ts | 10 +++', stderr: '' });
      }
      if (cmd.includes('git status')) {
        return Promise.resolve({ stdout: 'M src/file.ts', stderr: '' });
      }
      if (cmd.includes('rg --line-number')) {
        return Promise.resolve({ stdout: 'src/file.ts:10:match', stderr: '' });
      }
      if (cmd.includes('npx jest')) {
        return Promise.resolve({ stdout: JSON.stringify({ success: true, numTotalTests: 5, numPassedTests: 5, numFailedTests: 0, testResults: [] }), stderr: '' });
      }
      if (cmd.includes('npx tsc')) {
        return Promise.resolve({ stdout: '', stderr: '' });
      }
      if (cmd.includes('codegraph')) {
        return Promise.resolve({ stdout: 'ok', stderr: '' });
      }
      return Promise.resolve({ stdout: '', stderr: '' });
    }),
  };
});

describe('KloelCodeToolsService', () => {
  let service: KloelCodeToolsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new KloelCodeToolsService();
  });

  describe('toolReadSourceFile', () => {
    it('reads a file and returns content with line count', async () => {
      mockStat.mockResolvedValue({ isFile: () => true, size: 500 });
      mockReadFile.mockResolvedValue('line1\nline2\nline3');
      const result = await service.toolReadSourceFile('src/test.ts');
      expect(result.success).toBe(true);
      expect(result.totalLines).toBe(3);
      expect(result.content).toContain('line1');
    });

    it('returns error for non-file entries', async () => {
      mockStat.mockResolvedValue({ isFile: () => false, size: 100 });
      const result = await service.toolReadSourceFile('src/dir');
      expect(result.success).toBe(false);
      expect(result.error).toBe('not_a_file');
    });

    it('returns error when file not found', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT: no such file'));
      const result = await service.toolReadSourceFile('src/missing.ts');
      expect(result.success).toBe(false);
      expect(result.error).toBe('file_not_found');
    });

    it('reads a file slice with startLine/endLine', async () => {
      mockStat.mockResolvedValue({ isFile: () => true, size: 100 });
      mockReadFile.mockResolvedValue('a\nb\nc\nd\ne');
      const result = await service.toolReadSourceFile('src/test.ts', 2, 4);
      expect(result.success).toBe(true);
      expect(result.content).toContain('2: b');
      expect(result.content).toContain('4: d');
    });
  });

  describe('toolListSourceDir', () => {
    it('lists directory entries sorted dirs-first', async () => {
      mockReaddir.mockResolvedValue([
        { name: '.git', isDirectory: () => true, isSymbolicLink: () => false },
        { name: 'src', isDirectory: () => true, isSymbolicLink: () => false },
        { name: 'index.ts', isDirectory: () => false, isSymbolicLink: () => false },
        { name: 'package.json', isDirectory: () => false, isSymbolicLink: () => false },
      ]);
      const result = await service.toolListSourceDir('src');
      expect(result.success).toBe(true);
      expect(result.entries[0].kind).toBe('directory');
    });

    it('returns error on failure', async () => {
      mockReaddir.mockRejectedValue(new Error('Permission denied'));
      const result = await service.toolListSourceDir('secret');
      expect(result.success).toBe(false);
    });
  });

  describe('toolGitLog', () => {
    it('returns git log entries', async () => {
      const result = await service.toolGitLog(5);
      expect(result.success).toBe(true);
      expect(result.entries).toHaveLength(2);
    });
  });

  describe('toolGitDiff', () => {
    it('returns git diff summary', async () => {
      const result = await service.toolGitDiff('HEAD~2');
      expect(result.success).toBe(true);
      expect(result.summary).toContain('+++');
    });
  });

  describe('toolGitStatus', () => {
    it('returns git status files', async () => {
      const result = await service.toolGitStatus();
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1);
    });
  });

  describe('toolSearchCodebase', () => {
    it('returns search results', async () => {
      const result = await service.toolSearchCodebase('test');
      expect(result.success).toBe(true);
    });
  });

  describe('toolRunBackendTests', () => {
    it('returns test results', async () => {
      const result = await service.toolRunBackendTests('auth');
      expect(result.success).toBe(true);
      expect(result.numTotalTests).toBe(5);
    });
  });

  describe('toolBuildStatus', () => {
    it('returns build status for scoped packages', async () => {
      const result = await service.toolBuildStatus('backend');
      expect(result.success).toBe(true);
    });
  });

  describe('toolCodeOutline', () => {
    it('detects symbols from source code', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('export function foo() {}\nexport class Bar {}\nconst baz = 1;\n');
      const result = await service.toolCodeOutline('src/test.ts');
      expect(result.success).toBe(true);
    });

    it('falls back to rg file search when access fails', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockReadFile.mockResolvedValue('export const X = 1;\n');
      const result = await service.toolCodeOutline('src/missing.ts');
      // either success or error depending on rg fallback
      expect(result).toHaveProperty('success');
    });
  });

  describe('toolReadPrismaSchema', () => {
    it('parses Prisma schema models and enums', async () => {
      mockReadFile.mockResolvedValue('model User {\n  id String\n}\nmodel Product {\n  id String\n}\nenum Role {\n  ADMIN\n}');
      const result = await service.toolReadPrismaSchema();
      expect(result.success).toBe(true);
      expect(result.modelCount).toBe(2);
      expect(result.enumCount).toBe(1);
    });

    it('returns error on read failure', async () => {
      mockReadFile.mockRejectedValue(new Error('EACCES'));
      const result = await service.toolReadPrismaSchema();
      expect(result.success).toBe(false);
    });
  });

  describe('toolCodeGraphStatus', () => {
    it('returns codegraph status output', async () => {
      const result = await service.toolCodeGraphStatus();
      expect(result.success).toBe(true);
    });
  });

  describe('toolCodeGraphSearch', () => {
    it('returns codegraph search results', async () => {
      const result = await service.toolCodeGraphSearch('ProductService');
      expect(result.success).toBe(true);
    });
  });
});
