import { ICONS } from './shared/Icons';

/**
 * Analytics report tab definitions (static UI config — key, label, icon).
 * Lives in a .ts config module (not the .tsx page) so the tab catalogue is a
 * single source of truth and is not an inline literal inside the component.
 * Every `k` here must also be present in VISIBLE_REPORT_TABS (use-analytics-filters.ts).
 */
export const TABS = [
  { k: 'vendas', l: 'Operacoes', ic: ICONS.dollar },
  { k: 'afterpay', l: 'Pos-pagamento', ic: ICONS.clock },
  { k: 'churn', l: 'Cancelamentos', ic: ICONS.down },
  { k: 'abandonos', l: 'Abandonos', ic: ICONS.ban },
  { k: 'satisfacao', l: 'Satisfacao', ic: ICONS.check },
  { k: 'afiliados', l: 'Afiliados', ic: ICONS.users },
  { k: 'indicadores', l: 'Indicadores', ic: ICONS.chart },
  { k: 'assinaturas', l: 'Assinaturas', ic: ICONS.repeat },
  { k: 'ind_prod', l: 'Indicadores por produto', ic: ICONS.pkg },
  { k: 'recusa', l: 'Recusas', ic: ICONS.alert },
  { k: 'origem', l: 'Origem', ic: ICONS.globe },
  { k: 'metricas', l: 'Metricas', ic: ICONS.target },
  { k: 'estornos', l: 'Estornos', ic: ICONS.undo },
  { k: 'chargeback', l: 'Chargeback', ic: ICONS.card },
  { k: 'engajamento', l: 'Engajamento', ic: ICONS.trend },
  { k: 'envio', l: 'Envio de relatorios', ic: ICONS.phone },
  { k: 'exportacoes', l: 'Exportacoes', ic: ICONS.dl },
];
