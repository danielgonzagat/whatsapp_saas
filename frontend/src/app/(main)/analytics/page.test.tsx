import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import KloelRelatorio from './page';

const replace = vi.fn();
let searchParams = new URLSearchParams('tab=vendas');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

vi.mock('@/hooks/useResponsiveViewport', () => ({
  useResponsiveViewport: () => ({ isMobile: false }),
}));

vi.mock('./AnalyticsHeader', () => ({
  AnalyticsHeader: () => <div data-testid="analytics-header" />,
}));

vi.mock('./AnalyticsFilterDrawer', () => ({
  AnalyticsFilterDrawer: () => <div data-testid="analytics-filter-drawer" />,
}));

vi.mock('./AnalyticsExportPanel', () => ({
  AnalyticsExportPanel: () => <div data-testid="analytics-export-panel" />,
  useExportReport: () => vi.fn(),
}));

vi.mock('./tabs', () => ({
  VendasTab: () => <div>Operacoes panel</div>,
  AfterPayTab: () => <div>Pos-pagamento panel</div>,
  ChurnTab: () => <div>Cancelamentos panel</div>,
  AbandonosTab: () => <div>Abandonos panel</div>,
  SatisfacaoTab: () => <div>Satisfacao panel</div>,
  EnvioRelatoriosTab: () => <div>Envio panel</div>,
  AfiliadosTab: () => <div>Afiliados panel</div>,
  IndicadoresTab: () => <div>Indicadores panel</div>,
  AssinaturasTab: () => <div>Assinaturas panel</div>,
  IndProdTab: () => <div>Indicadores por produto panel</div>,
  RecusaTab: () => <div>Recusas panel</div>,
  OrigemTab: () => <div>Origem panel</div>,
  MetricasTab: () => <div>Metricas panel</div>,
  EstornosTab: () => <div>Estornos panel</div>,
  ChargebackTab: () => <div>Chargeback panel</div>,
  EngajamentoTab: () => <div>Engajamento panel</div>,
}));

describe('KloelRelatorio tabs', () => {
  it('exposes the active analytics tab with aria-pressed', () => {
    searchParams = new URLSearchParams('tab=vendas');
    replace.mockClear();
    replace.mockImplementation((url: string) => {
      searchParams = new URLSearchParams(url.split('?')[1] || '');
    });

    render(<KloelRelatorio />);

    const operacoes = screen.getByRole('button', { name: 'Operacoes' });
    const cancelamentos = screen.getByRole('button', { name: 'Cancelamentos' });

    expect(operacoes.getAttribute('aria-pressed')).toBe('true');
    expect(cancelamentos.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(cancelamentos);

    expect(operacoes.getAttribute('aria-pressed')).toBe('false');
    expect(cancelamentos.getAttribute('aria-pressed')).toBe('true');
    expect(replace).toHaveBeenCalledWith('/analytics?tab=churn');
  });
});
