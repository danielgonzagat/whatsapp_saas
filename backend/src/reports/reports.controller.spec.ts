/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/interfaces';
import { ReportsController } from './reports.controller';

describe('ReportsController', () => {
  const getVendasSummary = jest.fn();
  const getAssinaturas = jest.fn();
  const getAbandonos = jest.fn();
  const getChargeback = jest.fn();
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
    getAssinaturas.mockResolvedValue({
      data: [],
      total: 12,
      summary: [
        { status: 'ACTIVE', _count: 8, _sum: { amount: 80000 } },
        { status: 'CANCELLED', _count: 4, _sum: { amount: 0 } },
      ],
      page: 1,
    });
    getAbandonos.mockResolvedValue({
      data: [{ totalInCents: 5000 }, { totalInCents: 2500 }],
      total: 2,
      page: 1,
    });
    getChargeback.mockResolvedValue({
      data: [{ order: { totalInCents: 9900 } }],
      total: 1,
    });
    sendEmail.mockResolvedValue(true);
    controller = new ReportsController(
      { getVendasSummary, getAssinaturas, getAbandonos, getChargeback } as never,
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

    it('honors a non-sales reportType by building the matching report and subject', async () => {
      const payload = {
        email: 'ops@example.com',
        reportType: 'assinaturas',
        filters: { startDate: '2026-06-01' },
      } as unknown as Parameters<ReportsController['sendReportEmail']>[1];

      const res = await controller.sendReportEmail(req, payload);

      expect(getAssinaturas).toHaveBeenCalledWith('ws-1', { startDate: '2026-06-01' });
      expect(getVendasSummary).not.toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ops@example.com',
          subject: expect.stringContaining('Assinaturas'),
        }),
      );
      expect(res).toMatchObject({ success: true, reportType: 'assinaturas' });
    });

    it('rejects unsupported reportType values instead of sending the wrong report', async () => {
      const payload = {
        email: 'ops@example.com',
        reportType: 'not-a-real-report',
      } as unknown as Parameters<ReportsController['sendReportEmail']>[1];

      await expect(controller.sendReportEmail(req, payload)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(sendEmail).not.toHaveBeenCalled();
      expect(getVendasSummary).not.toHaveBeenCalled();
    });
  });
});
