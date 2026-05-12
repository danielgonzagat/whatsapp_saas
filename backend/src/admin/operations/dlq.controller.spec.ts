import { BadRequestException } from '@nestjs/common';
import { DlqController } from './dlq.controller';

const mockAdmin = {
  id: 'admin-1',
  name: 'Test Admin',
  email: 'admin@test.com',
  role: 'OWNER' as const,
  sessionId: 's1',
  scope: 'full' as const,
};

function makeMockAudit() {
  return { append: jest.fn(), list: jest.fn() };
}

describe('DlqController', () => {
  let controller: DlqController;
  let audit: ReturnType<typeof makeMockAudit>;

  beforeEach(() => {
    jest.clearAllMocks();
    audit = makeMockAudit();
    controller = new DlqController(audit as never);
  });

  describe('listQueues', () => {
    it('returns queue names and dlq names', () => {
      const result = controller.listQueues();
      expect(result.queues).toBeDefined();
      expect(Array.isArray(result.queues)).toBe(true);
      expect(typeof result.count).toBe('number');
    });
  });

  describe('listDlq', () => {
    it('throws BadRequestException for unknown queue', async () => {
      await expect(controller.listDlq('nonexistent-queue', '20', '0')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('clamps limit to max 200', async () => {
      await expect(controller.listDlq('nonexistent-queue', '999', '0')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('inspectJob', () => {
    it('throws BadRequestException for unknown queue', async () => {
      await expect(controller.inspectJob('nonexistent-queue', 'job-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reprocessJobs', () => {
    it('throws BadRequestException for unknown queue', async () => {
      await expect(
        controller.reprocessJobs('nonexistent-queue', undefined, 10, mockAdmin),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when more than 100 jobIds provided', async () => {
      const ids = Array.from({ length: 101 }, (_, i) => `job-${i}`);
      await expect(
        controller.reprocessJobs('nonexistent-queue', ids, undefined, mockAdmin),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('discardJobs', () => {
    it('throws when jobIds is empty', async () => {
      await expect(controller.discardJobs('test-queue', [], mockAdmin)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when no jobIds provided', async () => {
      await expect(controller.discardJobs('test-queue', undefined, mockAdmin)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('purgeDlq', () => {
    it('throws BadRequestException for unknown queue', async () => {
      await expect(controller.purgeDlq('nonexistent-queue', mockAdmin)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
