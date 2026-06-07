import type { AuthenticatedRequest } from '../common/interfaces';
import { ReportsController } from './reports.controller';

describe('ReportsController', () => {
  const getVendasSummary = jest.fn();
  const sendEmail = jest.fn();

  const req = {
    user: {
      id: 'user-1',
      email: 'owner@example.com',
      workspaceId: 'ws-1',
    },
  } as unknown as AuthenticatedRequest;

  let controller: ReportsController;

  beforeEach(() => {
    jest.clearAllMocks();
    getVendasSummary.mockResolvedValue({
      totalRevenue: 123450,
      totalCount: 9,
      ticketMedio: 13717,
      conversao: 66.67,
    });
    sendEmail.mockResolvedValue(true);
    controller = new ReportsController(
      { getVendasSummary } as never,
      {} as never,
      { sendEmail } as never,
    );
  });

  describe('sendReportEmail', () => {
    it('uses submitted filters instead of reparsing the display period string', async () => {
      const payload = {
        email: 'ops@example.com',
        reportType: 'vendas',
        period: 'display-only period',
        filters: {
          startDate: '2026-06-01',
          endDate: '2026-06-07',
          status: 'PAID',
        },
      } as unknown as Parameters<ReportsController['sendReportEmail']>[1];

      await controller.sendReportEmail(req, payload);

      expect(getVendasSummary).toHaveBeenCalledWith('ws-1', {
        startDate: '2026-06-01',
        endDate: '2026-06-07',
        status: 'PAID',
      });
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ops@example.com',
          subject: expect.stringContaining('Resumo de Vendas'),
        }),
      );
    });
  });
});
