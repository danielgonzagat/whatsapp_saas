import { AdminComplianceController } from './admin-compliance.controller';
import { AdminHomePeriodDto } from '../dashboard/dto/list-home.dto';

describe('AdminComplianceController', () => {
  const overview = jest.fn();

  const controller = new AdminComplianceController({
    overview,
  } as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET overview', () => {
    it('delegates to service with period, from, and to from the query dto', async () => {
      const fakeResult = { summary: { chargebackCount: 3 } };
      overview.mockResolvedValue(fakeResult);

      const query = {
        period: AdminHomePeriodDto.D30,
        from: new Date('2026-04-01'),
        to: new Date('2026-05-01'),
      };

      const result = await controller.overview(query);

      expect(overview).toHaveBeenCalledWith(
        AdminHomePeriodDto.D30,
        query.from,
        query.to,
      );
      expect(result).toBe(fakeResult);
    });

    it('passes undefined from and to when query has no date range', async () => {
      overview.mockResolvedValue({ riskByGateway: [] });

      const query = { period: AdminHomePeriodDto.TODAY };

      await controller.overview(query);

      expect(overview).toHaveBeenCalledWith(
        AdminHomePeriodDto.TODAY,
        undefined,
        undefined,
      );
    });

    it('returns the service result unchanged', async () => {
      const expected = { range: {}, summary: {}, kycQueue: [] };
      overview.mockResolvedValue(expected);

      const result = await controller.overview({
        period: AdminHomePeriodDto.D30,
      });

      expect(result).toEqual(expected);
    });

    it('propagates error when service throws', async () => {
      const error = new Error('Gateway timeout');
      overview.mockRejectedValue(error);

      await expect(
        controller.overview({ period: AdminHomePeriodDto.CUSTOM }),
      ).rejects.toThrow('Gateway timeout');

      expect(overview).toHaveBeenCalledWith(
        AdminHomePeriodDto.CUSTOM,
        undefined,
        undefined,
      );
    });
  });
});
