import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { CodeAccessService } from './code-access.service';

jest.mock('fs');
jest.mock('child_process', () => ({ execSync: jest.fn() }));

type ExecFailure = Error & { status: number };

const mockExecSync = jest.mocked(execSync);

describe('CodeAccessService', () => {
  let service: CodeAccessService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Resolve repo root: walk up until backend/ + frontend/ exist
    let callCount = 0;
    (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
      callCount++;
      // First call: backend/ under hint
      // Service walks up; let first call fail so it walks to parent
      if (callCount <= 3) {
        return false;
      }
      if (p.endsWith('backend') || p.endsWith('frontend')) {
        return true;
      }
      return false;
    });
    const m: TestingModule = await Test.createTestingModule({
      providers: [CodeAccessService],
    }).compile();
    service = m.get(CodeAccessService);
  });

  describe('read', () => {
    it('rejects path outside repo', () => {
      const r = service.read('/etc/passwd');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('path_outside_repo');
    });

    it('rejects missing file', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      const r = service.read('src/missing.ts');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('file_not_found');
    });

    it('rejects directory', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 0, isDirectory: () => true });
      const r = service.read('src/lib');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('is_directory');
    });

    it('rejects file too large', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 600_000, isDirectory: () => false });
      const r = service.read('src/huge.ts');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('file_too_large');
    });
  });

  describe('search', () => {
    it('parses ripgrep output into hits', () => {
      mockExecSync.mockReturnValue('app.ts:10:5:console.log("hello")');
      const hits = service.search('console');
      expect(hits).toHaveLength(1);
      expect(hits[0].file).toContain('app.ts');
      expect(hits[0].line).toBe(10);
    });

    it('returns empty array when no matches (exit code 1)', () => {
      const err: ExecFailure = Object.assign(new Error('no matches'), { status: 1 });
      mockExecSync.mockImplementation(() => {
        throw err;
      });
      const hits = service.search('nonexistent');
      expect(hits).toEqual([]);
    });

    it('survives exec failures', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('rg not found');
      });
      const hits = service.search('something');
      expect(hits).toEqual([]);
    });
  });

  describe('findUsages', () => {
    it('searches with word boundaries', () => {
      mockExecSync.mockReturnValue('app.ts:5:1:myFunc');
      const hits = service.findUsages('myFunc');
      expect(hits).toHaveLength(1);
    });

    it('returns empty when symbol not found', () => {
      const err: ExecFailure = Object.assign(new Error('none'), { status: 1 });
      mockExecSync.mockImplementation(() => {
        throw err;
      });
      const hits = service.findUsages('nonexistentSymbol');
      expect(hits).toEqual([]);
    });
  });

  describe('whichServiceImplements', () => {
    it('searches for capability id', () => {
      mockExecSync.mockReturnValue('svc.ts:3:10:capId');
      const hits = service.whichServiceImplements('cap-x');
      expect(hits).toHaveLength(1);
    });

    it('falls back to domainService search when empty', () => {
      const err: ExecFailure = Object.assign(new Error('none'), { status: 1 });
      mockExecSync.mockImplementation(() => {
        throw err;
      });
      const hits = service.whichServiceImplements('cap-x');
      expect(hits).toEqual([]);
    });
  });
});
