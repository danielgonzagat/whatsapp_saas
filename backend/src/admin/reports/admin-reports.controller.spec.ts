import { AdminReportsController } from './admin-reports.controller';
import { AdminHomePeriodDto } from '../dashboard/dto/list-home.dto';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';

describe('AdminReportsController', () => {
  const overviewMock = jest.fn();
  const exportCsvRowsMock = jest.fn();

  const mockAdmin: AuthenticatedAdmin = {
    id: 'admin-1',
    name: 'Test Admin',
    email: 'admin@test.com',
    role: 'SUPER_ADMIN',
    sessionId: 'sess-1',
    scope: 'full',
  } as AuthenticatedAdmin;

  let controller: AdminReportsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminReportsController({
      overview: overviewMock,
      exportCsvRows: exportCsvRowsMock,
    } as never);
  });

  describe('overview', () => {
    it('calls service with period, from and to from query', async () => {
      const mockResult = { snapshot: { totalSales: 5000 }, exportHistory: [] };
      overviewMock.mockResolvedValue(mockResult);

      const result = await controller.overview({
        period: AdminHomePeriodDto.D30,
        compare: 'NONE',
        from: new Date('2026-01-01'),
        to: new Date('2026-01-31'),
      });

      expect(overviewMock).toHaveBeenCalledWith(
        AdminHomePeriodDto.D30,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );
      expect(result).toBe(mockResult);
    });

    it('propagates error from service', async () => {
      const error = new Error('database unavailable');
      overviewMock.mockRejectedValue(error);

      await expect(
        controller.overview({ period: AdminHomePeriodDto.TODAY }),
      ).rejects.toThrow('database unavailable');
    });
  });

  describe('exportCsv', () => {
    it('calls service with period, adminId, from and to', async () => {
      const mockRows = [
        { orderNumber: 'ORD-1', totalBRL: '99.90' },
      ];
      exportCsvRowsMock.mockResolvedValue(mockRows);

      const result = await controller.exportCsv(
        {
          period: AdminHomePeriodDto.CUSTOM,
          compare: 'NONE',
          from: new Date('2026-05-01'),
          to: new Date('2026-05-14'),
        },
        mockAdmin,
      );

      expect(exportCsvRowsMock).toHaveBeenCalledWith(
        AdminHomePeriodDto.CUSTOM,
        'admin-1',
        new Date('2026-05-01'),
        new Date('2026-05-14'),
      );
      expect(result).toEqual(mockRows);
    });

    it('propagates admin.id for audit tracking', async () => {
      exportCsvRowsMock.mockResolvedValue([]);

      await controller.exportCsv(
        { period: AdminHomePeriodDto.TODAY },
        { ...mockAdmin, id: 'admin-42' },
      );

      expect(exportCsvRowsMock).toHaveBeenCalledWith(
        AdminHomePeriodDto.TODAY,
        'admin-42',
        undefined,
        undefined,
      );
    });

    it('propagates error from service', async () => {
      const error = new Error('export failed');
      exportCsvRowsMock.mockRejectedValue(error);

      await expect(
        controller.exportCsv(
          { period: AdminHomePeriodDto.D30 },
          mockAdmin,
        ),
      ).rejects.toThrow('export failed');
    });
  });
});
