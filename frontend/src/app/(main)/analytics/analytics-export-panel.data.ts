import { kloelT } from '@/lib/i18n/t';

export const REPORT_CARDS = [
  { key: 'vendas', label: kloelT(`Vendas`), desc: kloelT(`Resumo completo de pedidos e receita do periodo.`) },
  { key: 'assinaturas', label: kloelT(`Assinaturas`), desc: kloelT(`Base recorrente, status e proximas cobrancas.`) },
  { key: 'abandonos', label: kloelT(`Abandonos`), desc: kloelT(`Checkouts nao concluidos e valor perdido.`) },
  { key: 'chargeback', label: kloelT(`Chargebacks`), desc: kloelT(`Disputas, valores e historico de perda/ganho.`) },
  { key: 'engajamento', label: kloelT(`Engajamento`), desc: kloelT(`Mensagens, contatos e performance operacional.`) },
  { key: 'satisfacao', label: kloelT(`Satisfacao`), desc: kloelT(`NPS, comentarios e visao de experiencia do cliente.`) },
] as const;
