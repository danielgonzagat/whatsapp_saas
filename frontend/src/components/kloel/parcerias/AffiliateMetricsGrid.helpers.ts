import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { C } from './ParceriasDesignTokens';
import { IC } from './ParceriasView.icons';

interface AffiliateMetricCardsInput {
  commission: number;
  temperature: number;
  totalRevenue: number;
  totalSales: number;
}

export function buildAffiliateMetricCards({
  commission,
  temperature,
  totalRevenue,
  totalSales,
}: AffiliateMetricCardsInput) {
  return [
    { label: kloelT(`Vendas`), value: totalSales, icon: IC.box, color: C.text },
    { label: kloelT(`Comissao`), value: `${commission}%`, icon: IC.dollar, color: C.ember },
    {
      label: kloelT(`Receita`),
      value: 'R$ ' + Number(totalRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 0 }),
      icon: IC.trend,
      color: C.text,
    },
    {
      label: kloelT(`Temperatura`),
      value: `${temperature}`,
      icon: IC.star,
      color: temperature > 70 ? colors.semantic.success : colors.semantic.warning,
    },
  ];
}
