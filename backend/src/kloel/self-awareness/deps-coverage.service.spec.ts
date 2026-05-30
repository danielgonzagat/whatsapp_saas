import { DepsCoverageService } from './deps-coverage.service';
import type { DepResult } from './deps-coverage.sbom.helpers';

const mockReadFile = jest.fn<Promise<string>, unknown[]>();
const mockReaddir = jest.fn<Promise<unknown[]>, unknown[]>();

jest.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
}));

describe('DepsCoverageService', () => {
  let service: DepsCoverageService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new DepsCoverageService();
  });

  describe('dependencies', () => {
    it('rejects invalid workspace', async () => {
      const result = await service.dependencies('invalid');
      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid_workspace');
    });

    it('returns parsed dependencies from SBOM', async () => {
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify({
          components: [
            { name: 'react', version: '18.2.0', type: 'library', purl: 'pkg:npm/react@18.2.0' },
            { name: 'lodash', version: '4.17.21', type: 'library', group: 'lodash' },
          ],
        }),
      );

      const result = await service.dependencies('backend', undefined);
      expect(result.success).toBe(true);
      const deps: DepResult[] = result.deps ?? [];
      expect(deps).toHaveLength(2);
      expect(deps[0].name).toBe('react');
      expect(deps[0].version).toBe('18.2.0');
    });

    it('filters dependencies by pattern', async () => {
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify({
          components: [
            { name: 'react', version: '18.2.0', type: 'library' },
            { name: '@nestjs/core', version: '10.0.0', type: 'library', group: '@nestjs' },
          ],
        }),
      );

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
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify({
          total: {
            lines: { total: 100, covered: 80, pct: 80 },
            branches: { total: 20, covered: 15, pct: 75 },
            functions: { total: 30, covered: 25, pct: 83.33 },
            statements: { total: 120, covered: 100, pct: 83.33 },
          },
        }),
      );

      const result = await service.codeCoverage();
      expect(result.pct).toBe(80);
      expect(result.lines).toBe(100);
      expect(result.uncovered).toEqual([]);
    });

    it('returns zeros when no coverage files exist', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      const result = await service.codeCoverage();
      expect(result.pct).toBe(0);
      expect(result.lines).toBe(0);
    });

    it('scopes coverage to a specific workspace', async () => {
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify({
          total: {
            lines: { total: 50, covered: 50, pct: 100 },
            branches: { total: 10, covered: 10, pct: 100 },
            functions: { total: 5, covered: 5, pct: 100 },
            statements: { total: 60, covered: 60, pct: 100 },
          },
        }),
      );

      const result = await service.codeCoverage(undefined, 'worker');
      expect(result.pct).toBe(100);
      expect(result.lines).toBe(50);
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
      mockReadFile.mockResolvedValueOnce(
        "import { foo } from './foo';\ndescribe('foo', () => {});",
      );
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

  // ── new capabilities (PI-K46) ──

  describe('affectedTests (single-file overload)', () => {
    it('returns test file paths for a single source file', async () => {
      mockReaddir.mockResolvedValueOnce([
        { name: 'bar.spec.ts', isFile: () => true, isDirectory: () => false },
      ]);
      mockReaddir.mockResolvedValueOnce([
        { name: 'bar.test.ts', isFile: () => true, isDirectory: () => false },
      ]);
      mockReadFile.mockResolvedValueOnce("import { bar } from './bar';");
      mockReadFile.mockResolvedValueOnce("const bar = require('./bar');");

      const paths = await service.affectedTests('worker/src/bar.ts');
      expect(Array.isArray(paths)).toBe(true);
      expect(paths).toHaveLength(2);
      expect(paths[0]).toContain('bar.spec.ts');
      expect(paths[1]).toContain('bar.test.ts');
    });

    it('returns empty array when no test files match', async () => {
      mockReaddir.mockResolvedValueOnce([
        { name: 'other.spec.ts', isFile: () => true, isDirectory: () => false },
      ]);
      mockReaddir.mockRejectedValueOnce(new Error('ENOENT'));
      mockReadFile.mockResolvedValueOnce("import { other } from './other';");

      const paths = await service.affectedTests('worker/src/missing.ts');
      expect(paths).toEqual([]);
    });
  });

  describe('dependencies (file-based overload)', () => {
    it('returns imports and importedBy for a file path', async () => {
      mockReadFile.mockResolvedValueOnce(
        "import { foo } from './foo';\nimport { bar } from '../utils/bar';\nconst lodash = require('lodash');",
      );
      mockReadFile.mockResolvedValueOnce("import { target } from './target';");
      mockReadFile.mockResolvedValueOnce("const target = require('../target');");
      mockReadFile.mockResolvedValueOnce('export const x = 1;');

      // readdir for importers scan (two workspaces)
      mockReaddir.mockResolvedValueOnce([
        { name: 'consumer.ts', isFile: () => true, isDirectory: () => false },
        { name: 'unrelated.ts', isFile: () => true, isDirectory: () => false },
      ]);
      mockReaddir.mockResolvedValueOnce([]);

      const result = await service.dependencies('backend/src/target.ts');
      expect(result.imports).toHaveLength(3);
      expect(result.imports).toContain('./foo');
      expect(result.imports).toContain('../utils/bar');
      expect(result.imports).toContain('lodash');
      expect(result.importedBy.length).toBeGreaterThanOrEqual(1);
      expect(result.importedBy[0]).toContain('consumer.ts');
    });

    it('returns empty importedBy when no files import the target', async () => {
      mockReadFile.mockResolvedValueOnce("import { x } from 'lodash';");
      mockReadFile.mockResolvedValueOnce("import { y } from './other';");
      mockReaddir.mockResolvedValueOnce([
        { name: 'other.ts', isFile: () => true, isDirectory: () => false },
      ]);
      mockReaddir.mockResolvedValueOnce([]);

      const result = await service.dependencies('backend/src/isolated.ts');
      expect(result.imports).toHaveLength(1);
      expect(result.importedBy).toEqual([]);
    });

    it('caches results within TTL', async () => {
      mockReadFile.mockResolvedValue("import { a } from './a';");
      mockReaddir.mockResolvedValue([
        { name: 'user.ts', isFile: () => true, isDirectory: () => false },
      ]);

      const r1 = await service.dependencies('backend/src/cached.ts');
      const r2 = await service.dependencies('backend/src/cached.ts');

      // Second call should return cached; readFile called only once per import direction
      expect(r1.imports).toEqual(r2.imports);
      expect(r1.importedBy).toEqual(r2.importedBy);
    });
  });
});
