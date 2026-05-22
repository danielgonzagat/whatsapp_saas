'use client';

import { colors } from '@/lib/design-tokens';
import {
  SUBINTERFACE_PILL_ROW_STYLE,
  getSubinterfacePillStyle,
} from '@/components/kloel/ui/subinterface-pill';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useCallback } from 'react';
import { V, FONT_SORA } from './analytics.design-tokens';
import { ICONS } from './shared/Icons';
import { useAnalyticsFilters, normalizeVisibleReportTab } from './use-analytics-filters';
import { useExportReport } from './AnalyticsExportPanel';
import { AnalyticsHeader } from './AnalyticsHeader';
import { AnalyticsFilterDrawer } from './AnalyticsFilterDrawer';
import { AnalyticsExportPanel } from './AnalyticsExportPanel';
import {
  VendasTab,
  AfterPayTab,
  ChurnTab,
  AbandonosTab,
  SatisfacaoTab,
  EnvioRelatoriosTab,
  AfiliadosTab,
  IndicadoresTab,
  AssinaturasTab,
  IndProdTab,
  RecusaTab,
  OrigemTab,
  MetricasTab,
  EstornosTab,
  ChargebackTab,
  EngajamentoTab,
} from './tabs';

export const dynamic = 'force-dynamic';

const TABS = [
  { k: 'vendas', l: 'Operacoes', ic: ICONS.dollar },
  { k: 'abandonos', l: 'Abandonos', ic: ICONS.ban },
  { k: 'assinaturas', l: 'Assinaturas', ic: ICONS.repeat },
  { k: 'estornos', l: 'Estornos', ic: ICONS.undo },
];

export default function KloelRelatorio() {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get('tab');

  const {
    active,
    setActive,
    page,
    setPage,
    showFilter,
    setShowFilter,
    filters,
    setFilters,
    baseFilters,
  } = useAnalyticsFilters();

  useEffect(() => {
    const nextTab = normalizeVisibleReportTab(tabParam);
    if (nextTab !== active) {
      setActive(nextTab);
    }
    if (tabParam && !TABS.find((t) => t.k === tabParam)) {
      router.replace('/analytics?tab=vendas');
    }
  }, [active, router, setActive, tabParam]);

  const exportReport = useExportReport(filters);
  const handleExport = useCallback(() => exportReport(active, active), [active, exportReport]);
  const showExport = !['envio', 'exportacoes'].includes(active);

  return (
    <div
      style={{
        background: V.void,
        minHeight: '100vh',
        fontFamily: FONT_SORA,
        color: V.t,
        padding: isMobile ? '20px 16px 28px' : '28px 32px',
      }}
    >
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}} ::selection{background:rgba(232,93,48,.3)} ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:${colors.border.space};border-radius:4px}`}</style>

      <AnalyticsHeader
        filters={filters}
        setFilters={setFilters}
        setShowFilter={setShowFilter}
        onExport={handleExport}
        showExport={showExport}
        isMobile={isMobile}
      />

      <div style={SUBINTERFACE_PILL_ROW_STYLE}>
        {TABS.map((t) => (
          <button
            type="button"
            key={t.k}
            onClick={() => {
              setActive(t.k);
              setPage(1);
              router.replace(`/analytics?tab=${t.k}`);
            }}
            style={getSubinterfacePillStyle(active === t.k, isMobile)}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>{t.ic(14)}</span>
            {t.l}
          </button>
        ))}
      </div>

      <div style={{ animation: 'fadeIn .3s ease', maxWidth: 1240, margin: '0 auto' }} key={active}>
        {active === 'vendas' && (
          <VendasTab
            filters={filters}
            baseFilters={baseFilters}
            page={page}
            setPage={setPage}
            isMobile={isMobile}
          />
        )}
        {active === 'afterpay' && (
          <AfterPayTab
            filters={filters}
            setFilters={setFilters}
            baseFilters={baseFilters}
            page={page}
            setPage={setPage}
          />
        )}
        {active === 'churn' && <ChurnTab filters={filters} />}
        {active === 'abandonos' && (
          <AbandonosTab baseFilters={baseFilters} page={page} setPage={setPage} />
        )}
        {active === 'satisfacao' && <SatisfacaoTab />}
        {active === 'envio' && <EnvioRelatoriosTab filters={filters} isMobile={isMobile} />}
        {active === 'exportacoes' && (
          <AnalyticsExportPanel setPage={setPage} setActive={setActive} />
        )}
        {active === 'afiliados' && <AfiliadosTab filters={filters} />}
        {active === 'indicadores' && <IndicadoresTab filters={filters} />}
        {active === 'assinaturas' && (
          <AssinaturasTab baseFilters={baseFilters} page={page} setPage={setPage} />
        )}
        {active === 'ind_prod' && <IndProdTab filters={filters} />}
        {active === 'recusa' && (
          <RecusaTab baseFilters={baseFilters} page={page} setPage={setPage} />
        )}
        {active === 'origem' && <OrigemTab filters={filters} />}
        {active === 'metricas' && <MetricasTab filters={filters} />}
        {active === 'estornos' && (
          <EstornosTab
            filters={filters}
            setFilters={setFilters}
            baseFilters={baseFilters}
            page={page}
            setPage={setPage}
          />
        )}
        {active === 'chargeback' && (
          <ChargebackTab baseFilters={baseFilters} page={page} setPage={setPage} />
        )}
        {active === 'engajamento' && <EngajamentoTab filters={filters} />}
      </div>

      <AnalyticsFilterDrawer
        open={showFilter}
        onClose={() => setShowFilter(false)}
        filters={filters}
        setFilters={setFilters}
      />
    </div>
  );
}
