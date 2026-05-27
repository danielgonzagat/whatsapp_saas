import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { SafeQueryService } from './safe-query.service';

describe('SafeQueryService', () => {
  let service: SafeQueryService;
  let prisma: { $queryRawUnsafe: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    const m: TestingModule = await Test.createTestingModule({
      providers: [SafeQueryService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = m.get(SafeQueryService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('query', () => {
    const ws = 'ws-1';

    it('rejects INSERT queries', async () => {
      const r = await service.query(ws, 'INSERT INTO Product VALUES (1)');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('only_select_allowed');
    });

    it('rejects UPDATE queries', async () => {
      const r = await service.query(ws, "UPDATE Product SET name = 'X'");
      expect(r.ok).toBe(false);
      expect(r.error).toBe('only_select_allowed');
    });

    it('rejects DELETE queries', async () => {
      const r = await service.query(ws, 'DELETE FROM Product');
      expect(r.ok).toBe(false);
    });

    it('rejects DROP queries', async () => {
      const r = await service.query(ws, 'DROP TABLE Product');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('only_select_allowed');
    });

    it('accepts SELECT without table names (expression query)', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ val: 42 }]);
      const r = await service.query(ws, 'SELECT 1 AS val WHERE 1=1');
      expect(r.ok).toBe(true);
      expect(r.rows).toHaveLength(1);
    });

    it('accepts WITH (CTE) as statement type', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ cnt: 5 }]);
      const r = await service.query(ws, 'WITH cte AS (SELECT 1 AS n) SELECT n FROM cte WHERE 1=1');
      expect(r.error).not.toBe('only_select_allowed');
    });

    it('rejects unknown table names', async () => {
      const r = await service.query(ws, "SELECT * FROM UnknownTable WHERE workspaceId = 'ws-1'");
      expect(r.ok).toBe(false);
      expect(r.error).toContain('table_unknown');
    });

    it('rejects queries mentioning blocked table User', async () => {
      const r = await service.query(ws, 'SELECT * FROM "User" WHERE 1=1');
      expect(r.ok).toBe(false);
    });

    it('requires WHERE or JOIN clause', async () => {
      const r = await service.query(ws, 'SELECT 1');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('workspace_filter_required');
    });

    it('truncates results exceeding MAX_ROWS', async () => {
      const rows = Array.from({ length: 1500 }, (_, i) => ({ id: i }));
      prisma.$queryRawUnsafe.mockResolvedValue(rows);
      const r = await service.query(ws, 'SELECT 1 AS id WHERE 1=1');
      expect(r.ok).toBe(true);
      expect(r.rows).toHaveLength(1000);
    });

    it('returns error on query execution failure', async () => {
      prisma.$queryRawUnsafe.mockRejectedValue(new Error('syntax error near WHERE'));
      const r = await service.query(ws, 'SELECT 1 WHERE 1=1');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('syntax error near WHERE');
    });

    it('rejects ALTER TABLE', async () => {
      const r = await service.query(ws, 'ALTER TABLE Product ADD COLUMN x INT');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('only_select_allowed');
    });
  });
});
