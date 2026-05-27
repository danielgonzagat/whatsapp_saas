import { DepsCoverageService } from './deps-coverage.service';

const mockReadFile = jest.fn();
const mockReaddir = jest.fn();

jest.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
}));

describe('DepsCoverageService', () => {
  let service: DepsCoverageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DepsCoverageService();
  });

  describe('dependencies', () => {
    it('rejects invalid workspace', async () => {
      const result = await service.dependencies('invalid');
      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid_workspace');
    });

    it('returns parsed dependencies from SBOM', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify({
        components: [
          { name: 'react', version: '18.2.0', type: 'library', purl: 'pkg:npm/react@18.2.0' },
          { name: 'lodash', version: '4.17.21', type: 'library', group: 'lodash' },
        ],
      }));

      const result = await service.dependencies('backend');
      expect(result.success).toBe(true);
      expect(result.deps).toHaveLength(2);
      expect(result.deps![0].name).toBe('react');
      expect(result.deps![0].version).toBe('18.2.0');
    });

    it('filters dependencies by pattern', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify({
        components: [
          { name: 'react', version: '18.2.0', type: 'library' },
          { name: '@nestjs/core', version: '10.0.0', type: 'library', group: '@nestjs' },
        ],
      }));

      const result = await service.dependencies('backend', 'nestjs');
      expect(result.success).toBe(true);
      expect(result.deps).toHaveLength(1);
      expect(result.deps![0].name).toBe('@nestjs/core');
    });

    it('returns error on SBOM read failure', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
      const result = await service.dependencies('root');
      expect(result.success).toBe(false);
      expect(result.error).toContain('ENOENT');
    });
  });

  describe('codeCoverage', () => {
    it('returns summary from coverage-summary.json', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify({
        total: {
          lines: { total: 100, covered: 80, pct: 80 },
          branches: { total: 20, covered: 15, pct: 75 },
          functions: { total: 30, covered: 25, pct: 83.33 },
          statements: { total: 120, covered: 100, pct: 83.33 },
        },
      }));

      const result = await service.codeCoverage();
      expect(result.available).toBe(true);
      expect(result.lines!.pct).toBe(80);
      expect(result.branches!.pct).toBe(75);
    });

    it('returns available:false when no coverage files exist', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      const result = await service.codeCoverage();
      expect(result.available).toBe(false);
    });

    it('scopes coverage to a specific workspace', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify({
        total: {
          lines: { total: 50, covered: 50, pct: 100 },
          branches: { total: 10, covered: 10, pct: 100 },
          functions: { total: 5, covered: 5, pct: 100 },
          statements: { total: 60, covered: 60, pct: 100 },
        },
      }));

      const result = await service.codeCoverage(undefined, 'worker');
      expect(result.available).toBe(true);
      expect(result.lines!.pct).toBe(100);
    });
  });

  describe('affectedTests', () => {
    it('finds test files that import source files', async () => {
      mockReaddir.mockResolvedValueOnce([
        { name: 'foo.spec.ts', isFile: () => true, isDirectory: () => false },
        { name: 'foo.ts', isFile: () => true, isDirectory: () => false },
      ]);
      mockReaddir.mockResolvedValueOnce([
        { name: 'foo.test.ts', isFile: () => true, isDirectory: () => false },
      ]);
      mockReadFile.mockResolvedValueOnce("import { foo } from './foo';\ndescribe('foo', () => {});");
      mockReadFile.mockResolvedValueOnce("const foo = require('./foo');");

      const result = await service.affectedTests(['worker/src/foo.ts']);
      expect(result.sourceFiles).toEqual(['worker/src/foo.ts']);
      expect(result.testFiles).toHaveLength(2);
      expect(result.testFiles[0].file).toContain('foo.spec.ts');
      expect(result.testFiles[1].file).toContain('foo.test.ts');
    });

    it('returns empty when no test files reference source', async () => {
      mockReaddir.mockResolvedValueOnce([
        { name: 'bar.spec.ts', isFile: () => true, isDirectory: () => false },
      ]);
      mockReaddir.mockRejectedValueOnce(new Error('ENOENT'));
      mockReadFile.mockResolvedValueOnce("import { unrelated } from './baz';");

      const result = await service.affectedTests(['worker/src/foo.ts']);
      expect(result.testFiles).toHaveLength(0);
    });

    it('survives unreadable directories', async () => {
      mockReaddir.mockRejectedValue(new Error('EACCES'));

      const result = await service.affectedTests(['worker/src/foo.ts']);
      expect(result.testFiles).toHaveLength(0);
    });
  });
});
