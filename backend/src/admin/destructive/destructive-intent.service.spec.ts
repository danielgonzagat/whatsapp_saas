import { Test, TestingModule } from '@nestjs/testing';
import { DestructiveIntentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DestructiveIntentRegistry } from './destructive-handler.registry';
import { DestructiveIntentService } from './destructive-intent.service';
import { OpsAlertService } from '../../observability/ops-alert.service';

jest.mock('../common/admin-crypto', () => ({
  sha256Hex: jest.fn((s: string) => `hash:${s}`),
}));
jest.mock('./destructive-intent.types', () => ({
  toDestructiveIntentView: jest.fn((record: Record<string, unknown>) => ({
    id: record.id,
    kind: record.kind,
    status: record.status,
    targetType: record.targetType,
    targetId: record.targetId,
    reason: record.reason,
    challenge: record.challenge,
    requiresOtp: record.requiresOtp,
    reversible: record.reversible,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    confirmedAt: record.confirmedAt ?? null,
    executedAt: record.executedAt ?? null,
    failureMessage: record.failureMessage ?? null,
    undoExpiresAt: record.undoExpiresAt ?? null,
    undoAt: record.undoAt ?? null,
    resultSnapshot: (record.resultSnapshot as Record<string, unknown> | null) ?? null,
  })),
}));

const makeIntent = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'int_1',
  kind: 'PURGE_CACHE',
  status: 'PENDING' as string,
  targetType: 'Workspace',
  targetId: 'ws_1',
  reason: 'test',
  challenge: 'ABC123',
  requiresOtp: false,
  reversible: true,
  createdAt: new Date(Date.now() - 60_000),
  expiresAt: new Date(Date.now() + 300_000),
  confirmedAt: null,
  executedAt: null,
  executedByAdminUserId: null,
  failureMessage: null,
  undoTokenHash: null,
  undoExpiresAt: null,
  undoAt: null,
  resultSnapshot: null,
  createdByAdminUserId: 'admin_1',
  ip: '1.2.3.4',
  userAgent: 'test-agent',
  ...overrides,
});

const mockHandlerExecute = jest.fn();
const mockHandlerUndo = jest.fn();
const mockHandler = {
  kind: 'PURGE_CACHE',
  reversible: true,
  requiresOtp: false,
  execute: mockHandlerExecute,
  undo: mockHandlerUndo,
};

describe('DestructiveIntentService', () => {
  let service: DestructiveIntentService;

  const mockCreate = jest.fn();
  const mockUpdate = jest.fn();
  const mockFindUnique = jest.fn();

  const prismaMock = {
    destructiveIntent: {
      create: mockCreate,
      update: mockUpdate,
      findUnique: mockFindUnique,
    },
  };

  const registryMock = {
    resolve: jest.fn(),
  };

  const opsAlertMock = {
    alertOnCriticalError: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    registryMock.resolve.mockReturnValue(mockHandler);
    mockHandlerExecute.mockResolvedValue({
      ok: true,
      snapshot: { purged: 42 },
    });
    mockHandlerUndo.mockResolvedValue({
      ok: true,
      snapshot: { restored: true },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DestructiveIntentService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: DestructiveIntentRegistry, useValue: registryMock },
        { provide: OpsAlertService, useValue: opsAlertMock },
      ],
    }).compile();

    service = module.get(DestructiveIntentService);
  });

  describe('create', () => {
    it('creates PENDING intent with challenge', async () => {
      const record = makeIntent();
      mockCreate.mockResolvedValueOnce(record);

      const result = await service.create({
        adminUserId: 'admin_1',
        kind: 'PURGE_CACHE' as never,
        targetType: 'Workspace',
        targetId: 'ws_1',
        reason: 'test',
        ip: '1.2.3.4',
        userAgent: 'test-agent',
      });

      expect(result.status).toBe('PENDING');
      expect(result.id).toBe('int_1');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: DestructiveIntentStatus.PENDING,
            kind: 'PURGE_CACHE',
          }),
        }),
      );
    });

    it('throws when handler not found for kind', async () => {
      registryMock.resolve.mockReturnValueOnce(null);

      await expect(
        service.create({
          adminUserId: 'admin_1',
          kind: 'UNKNOWN_KIND' as never,
          targetType: 'Workspace',
          targetId: 'ws_1',
          reason: 'test',
          ip: '1.2.3.4',
          userAgent: 'test-agent',
        }),
      ).rejects.toThrow(/handler/i);
    });
  });

  describe('confirm', () => {
    it('transitions PENDING → CONFIRMED → EXECUTED', async () => {
      const pending = makeIntent();
      const confirmed = makeIntent({ status: 'CONFIRMED' });
      const executed = makeIntent({
        status: 'EXECUTED',
        executedAt: new Date('2026-05-10T12:02:00Z'),
        executedByAdminUserId: 'admin_1',
        resultSnapshot: { purged: 42 },
        undoTokenHash: 'hash:token',
        undoExpiresAt: new Date('2026-05-11T12:02:00Z'),
      });

      mockFindUnique.mockResolvedValueOnce(pending);
      mockUpdate
        .mockResolvedValueOnce(confirmed)
        .mockResolvedValueOnce(makeIntent({ status: 'EXECUTING' }))
        .mockResolvedValueOnce(executed);

      const result = await service.confirm({
        intentId: 'int_1',
        adminUserId: 'admin_1',
        challenge: 'ABC123',
        ip: '1.2.3.4',
        userAgent: 'test-agent',
      });

      expect(result.status).toBe('EXECUTED');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'int_1' },
          data: expect.objectContaining({ status: DestructiveIntentStatus.CONFIRMED }),
        }),
      );
    });

    it('throws when intent expired', async () => {
      const expired = makeIntent({
        status: 'EXPIRED',
        expiresAt: new Date('2026-05-09T12:00:00Z'),
      });
      mockFindUnique.mockResolvedValueOnce(expired);

      await expect(
        service.confirm({
          intentId: 'int_1',
          adminUserId: 'admin_1',
          challenge: 'ABC123',
          ip: '1.2.3.4',
          userAgent: 'test-agent',
        }),
      ).rejects.toThrow(/expirou/i);
    });

    it('throws when challenge mismatch', async () => {
      mockFindUnique.mockResolvedValueOnce(makeIntent());

      await expect(
        service.confirm({
          intentId: 'int_1',
          adminUserId: 'admin_1',
          challenge: 'WRONG',
          ip: '1.2.3.4',
          userAgent: 'test-agent',
        }),
      ).rejects.toThrow(/challenge/i);
    });

    it('throws when confirmed by wrong admin', async () => {
      mockFindUnique.mockResolvedValueOnce(makeIntent());

      await expect(
        service.confirm({
          intentId: 'int_1',
          adminUserId: 'admin_2',
          challenge: 'ABC123',
          ip: '1.2.3.4',
          userAgent: 'test-agent',
        }),
      ).rejects.toThrow(/acesso negado/i);
    });

    it('returns cached result when already EXECUTED (idempotency)', async () => {
      const executed = makeIntent({
        status: 'EXECUTED',
        executedAt: new Date('2026-05-10T12:02:00Z'),
        resultSnapshot: { purged: 42 },
      });
      mockFindUnique.mockResolvedValueOnce(executed);

      const result = await service.confirm({
        intentId: 'int_1',
        adminUserId: 'admin_1',
        challenge: 'ABC123',
        ip: '1.2.3.4',
        userAgent: 'test-agent',
      });

      expect(result.status).toBe('EXECUTED');
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('returns intent view', async () => {
      mockFindUnique.mockResolvedValueOnce(makeIntent());

      const result = await service.get('int_1');

      expect(result.id).toBe('int_1');
      expect(result.status).toBe('PENDING');
    });

    it('throws when intent not found', async () => {
      mockFindUnique.mockResolvedValueOnce(null);

      await expect(service.get('unknown')).rejects.toThrow(/n.o encontrado/i);
    });
  });

  describe('undo', () => {
    it('reverts EXECUTED intent to UNDONE', async () => {
      const token = 'undo_123';
      const undoTokenHash = `hash:${token}`;
      const executed = makeIntent({
        status: 'EXECUTED',
        reversible: true,
        undoTokenHash,
        undoExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        executedAt: new Date(Date.now() - 60_000),
        resultSnapshot: { purged: 42 },
      });
      const undone = makeIntent({
        status: 'UNDONE',
        undoAt: new Date('2026-05-10T12:10:00Z'),
        resultSnapshot: { purged: 42, undo: { restored: true } },
      });

      mockFindUnique.mockResolvedValueOnce(executed);
      mockUpdate.mockResolvedValueOnce(undone);

      const result = await service.undo({
        intentId: 'int_1',
        adminUserId: 'admin_1',
        undoToken: token,
        ip: '1.2.3.4',
        userAgent: 'test-agent',
      });

      expect(result.status).toBe('UNDONE');
      expect(mockHandlerUndo).toHaveBeenCalled();
    });

    it('throws when intent not EXECUTED', async () => {
      mockFindUnique.mockResolvedValueOnce(makeIntent({ status: 'PENDING' }));

      await expect(
        service.undo({
          intentId: 'int_1',
          adminUserId: 'admin_1',
          undoToken: 'token',
          ip: '1.2.3.4',
          userAgent: 'test-agent',
        }),
      ).rejects.toThrow(/cannot undo/i);
    });

    it('throws when intent not reversible', async () => {
      mockFindUnique.mockResolvedValueOnce(
        makeIntent({
          status: 'EXECUTED',
          reversible: false,
          undoTokenHash: 'hash:token',
          undoExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }),
      );

      await expect(
        service.undo({
          intentId: 'int_1',
          adminUserId: 'admin_1',
          undoToken: 'token',
          ip: '1.2.3.4',
          userAgent: 'test-agent',
        }),
      ).rejects.toThrow(/not reversible/i);
    });

    it('throws when undo token invalid', async () => {
      mockFindUnique.mockResolvedValueOnce(
        makeIntent({
          status: 'EXECUTED',
          reversible: true,
          undoTokenHash: 'hash:correct',
          undoExpiresAt: new Date('2026-05-11T12:02:00Z'),
        }),
      );

      await expect(
        service.undo({
          intentId: 'int_1',
          adminUserId: 'admin_1',
          undoToken: 'wrong_token',
          ip: '1.2.3.4',
          userAgent: 'test-agent',
        }),
      ).rejects.toThrow(/undo/i);
    });
  });
});
