import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AnalyticsFilterDrawer } from './AnalyticsFilterDrawer';
import type { ReportFilters } from './analytics.types';

describe('AnalyticsFilterDrawer', () => {
  it('clears optional advanced filters without erasing the active report date range', () => {
    const setFilters = vi.fn();
    const filters: ReportFilters = {
      startDate: '2026-05-07',
      endDate: '2026-06-06',
      orderCode: 'COD-TESTE-CODEX',
      buyerName: 'Comprador Codex',
      cpfCnpj: '12345678901',
      planName: 'Plano Codex',
      utmSource: 'instagram',
      utmMedium: 'stories',
      affiliateEmail: 'afiliado.codex@example.com',
      isFirstPurchase: 'true',
    };

    render(
      <AnalyticsFilterDrawer
        open
        onClose={vi.fn()}
        filters={filters}
        setFilters={setFilters}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }));

    expect((screen.getByLabelText('Data inicio') as HTMLInputElement).value).toBe('2026-05-07');
    expect((screen.getByLabelText('Data fim') as HTMLInputElement).value).toBe('2026-06-06');
    expect((screen.getByLabelText('Codigo da venda') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Nome do comprador') as HTMLInputElement).value).toBe('');
    expect(screen.queryByLabelText('Primeira compra')).toBeNull();

    expect(setFilters).toHaveBeenCalledTimes(1);
    const nextFilters = setFilters.mock.calls[0]?.[0];
    expect(typeof nextFilters).toBe('function');
    expect((nextFilters as (current: ReportFilters) => ReportFilters)(filters)).toEqual({
      startDate: '2026-05-07',
      endDate: '2026-06-06',
    });
  });

  it('names the drawer close action so it does not collide with the graph overlay close button', () => {
    const onClose = vi.fn();

    render(
      <AnalyticsFilterDrawer
        open
        onClose={onClose}
        filters={{ startDate: '2026-05-07', endDate: '2026-06-06' }}
        setFilters={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fechar filtro avancado' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape without leaking the key event to global graph shortcuts', () => {
    const onClose = vi.fn();
    const globalShortcut = vi.fn();
    document.addEventListener('keydown', globalShortcut);

    try {
      render(
        <AnalyticsFilterDrawer
          open
          onClose={onClose}
          filters={{ startDate: '2026-05-07', endDate: '2026-06-06' }}
          setFilters={vi.fn()}
        />,
      );

      fireEvent.keyDown(screen.getByLabelText('Nome do comprador'), { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(globalShortcut).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', globalShortcut);
    }
  });
});
