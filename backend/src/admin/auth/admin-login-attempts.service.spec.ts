import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminLoginAttemptsService } from './admin-login-attempts.service';

describe('AdminLoginAttemptsService', () => {
  let service: AdminLoginAttemptsService;

  const email = 'admin@test.com';
  const ip = '1.2.3.4';

  const mockAttemptCount = jest.fn();
  const mockAttemptCreate = jest.fn();

  const prismaMock = {
    adminLoginAttempt: {
      count: mockAttemptCount,
      create: mockAttemptCreate,
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockAttemptCount.mockResolvedValue(0);
    mockAttemptCreate.mockResolvedValue({ id: 'att_1' });

    prismaMock.$transaction.mockImplementation(async (ops: unknown) => {
      if (typeof ops === 'function') {
        return ops(prismaMock);
      }
      return [0, 0];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminLoginAttemptsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get(AdminLoginAttemptsService);
  });

  describe('isLocked', () => {
    it('returns false when both email and IP are below threshold', async () => {
      prismaMock.$transaction.mockResolvedValueOnce([2, 1]);

      const result = await service.isLocked(email, ip);

      expect(result).toBe(false);
    });

    it('returns true when email failures reach threshold', async () => {
      prismaMock.$transaction.mockResolvedValueOnce([5, 0]);

      const result = await service.isLocked(email, ip);

      expect(result).toBe(true);
    });

    it('returns true when IP failures reach threshold', async () => {
      prismaMock.$transaction.mockResolvedValueOnce([0, 5]);

      const result = await service.isLocked(email, ip);

      expect(result).toBe(true);
    });

    it('returns true when both exceed threshold', async () => {
      prismaMock.$transaction.mockResolvedValueOnce([7, 10]);

      const result = await service.isLocked(email, ip);

      expect(result).toBe(true);
    });

    it('counts only failures (success=false) within the window', async () => {
      prismaMock.$transaction.mockResolvedValueOnce([0, 0]);

      await service.isLocked(email, ip);

      expect(mockAttemptCount).toHaveBeenCalledTimes(2);
      const emailCall = mockAttemptCount.mock.calls[0][0] as Record<string, unknown>;
      const ipCall = mockAttemptCount.mock.calls[1][0] as Record<string, unknown>;
      expect(emailCall.where).toEqual(expect.objectContaining({ email, success: false }));
      expect(ipCall.where).toEqual(expect.objectContaining({ ip, success: false }));
      const emailWhere = emailCall.where as { createdAt: { gte: Date } };
      expect(emailWhere.createdAt.gte).toBeInstanceOf(Date);
    });

    it('counts email and IP independently', async () => {
      prismaMock.$transaction.mockResolvedValueOnce([0, 0]);

      await service.isLocked(email, ip);

      expect(mockAttemptCount).toHaveBeenCalledTimes(2);
      const emailCall = mockAttemptCount.mock.calls[0][0] as Record<string, unknown>;
      const ipCall = mockAttemptCount.mock.calls[1][0] as Record<string, unknown>;
      expect(emailCall.where).toEqual(expect.objectContaining({ email }));
      expect(ipCall.where).toEqual(expect.objectContaining({ ip }));
    });

    it('uses read-committed isolation for consistent counts', async () => {
      prismaMock.$transaction.mockResolvedValueOnce([0, 0]);

      await service.isLocked(email, ip);

      expect(prismaMock.$transaction).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ isolationLevel: 'ReadCommitted' }),
      );
    });
  });

  describe('record', () => {
    it('records a successful attempt', async () => {
      await service.record(email, ip, true);

      expect(mockAttemptCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { email, ip, success: true },
        }),
      );
    });

    it('records a failed attempt', async () => {
      await service.record(email, ip, false);

      expect(mockAttemptCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { email, ip, success: false },
        }),
      );
    });
  });

  describe('lockout after N failures', () => {
    it('locks after exactly MAX_ATTEMPTS email failures', async () => {
      prismaMock.$transaction
        .mockResolvedValueOnce([4, 0]) // step 1: 4 failures, not locked
        .mockResolvedValueOnce([5, 0]); // step 2: 5 failures, now locked

      const notLockedYet = await service.isLocked(email, ip);
      expect(notLockedYet).toBe(false);

      const nowLocked = await service.isLocked(email, ip);
      expect(nowLocked).toBe(true);
    });

    it('locks after exactly MAX_ATTEMPTS IP failures', async () => {
      prismaMock.$transaction.mockResolvedValueOnce([0, 4]).mockResolvedValueOnce([0, 5]);

      const notLockedYet = await service.isLocked(email, ip);
      expect(notLockedYet).toBe(false);

      const nowLocked = await service.isLocked(email, ip);
      expect(nowLocked).toBe(true);
    });

    it('does not lock when failures are from outside the window', async () => {
      // 0 failures returned means either no records or all outside window
      prismaMock.$transaction.mockResolvedValueOnce([0, 0]);

      const result = await service.isLocked(email, ip);
      expect(result).toBe(false);
    });
  });

  describe('prisma errors', () => {
    it('propagates database errors from isLocked', async () => {
      prismaMock.$transaction.mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(service.isLocked(email, ip)).rejects.toThrow('DB connection lost');
    });

    it('propagates database errors from record', async () => {
      mockAttemptCreate.mockRejectedValueOnce(new Error('write failure'));

      await expect(service.record(email, ip, false)).rejects.toThrow('write failure');
    });
  });
});
