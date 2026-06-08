import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EnvioRelatoriosTab } from './EnvioRelatoriosTab';

vi.mock('@/lib/api/reports', () => ({
  sendReportEmail: vi.fn(),
}));

import { sendReportEmail } from '@/lib/api/reports';

const sendReportEmailMock = vi.mocked(sendReportEmail);

const filters = {
  startDate: '2026-06-01',
  endDate: '2026-06-07',
};

describe('EnvioRelatoriosTab', () => {
  beforeEach(() => {
    sendReportEmailMock.mockReset();
  });

  it('validates report email locally before calling the API', async () => {
    render(<EnvioRelatoriosTab filters={filters} isMobile={false} />);

    const sendButton = screen.getByRole('button', { name: /enviar relatorio/i });

    fireEvent.click(sendButton);

    expect(await screen.findByText('Informe um email de destino valido.')).toBeTruthy();
    expect(sendReportEmailMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Email de destino'), {
      target: { value: 'nao-e-email' },
    });
    fireEvent.click(sendButton);

    expect(await screen.findByText('Informe um email de destino valido.')).toBeTruthy();
    expect(sendReportEmailMock).not.toHaveBeenCalled();
  });

  it('sends a trimmed valid report email with accessible controls', async () => {
    sendReportEmailMock.mockResolvedValue({
      data: { success: true, message: 'Relatorio enviado' },
      status: 200,
    });

    render(<EnvioRelatoriosTab filters={filters} isMobile={false} />);

    fireEvent.change(screen.getByLabelText('Email de destino'), {
      target: { value: '  ops@example.com  ' },
    });
    fireEvent.change(screen.getByLabelText('Tipo de relatorio'), {
      target: { value: 'assinaturas' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enviar relatorio/i }));

    await waitFor(() => {
      expect(sendReportEmailMock).toHaveBeenCalledWith({
        email: 'ops@example.com',
        reportType: 'assinaturas',
        period: '2026-06-01 → 2026-06-07',
        filters,
      });
    });
    expect(await screen.findByText('Relatorio enviado')).toBeTruthy();
  });
});
