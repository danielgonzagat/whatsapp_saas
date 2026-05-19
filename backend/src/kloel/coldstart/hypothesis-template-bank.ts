/**
 * UTP-COLDSTART-003 — Hypothesis Template Bank.
 *
 * Catalog of common commercial hypothesis templates. Used when no
 * WISDOM patterns are available (cold-start scenario). Each template
 * belongs to a category (audience, offer, objection, channel, pricing,
 * messaging) and suggests micro-tests.
 *
 * Pure data. Stateless.
 */
import type { HypothesisCategory, HypothesisTemplate } from './coldstart.types';

export const HYPOTHESIS_TEMPLATES: readonly HypothesisTemplate[] = [
  {
    templateId: 'h_tmpl_audience_01',
    label: 'perfil do comprador',
    description: 'o publico que compra tem um perfil diferente do que a empresa imagina',
    category: 'audience',
    suggestedMicroTests: [
      'perguntar a 5 clientes porque compraram',
      'analisar perfil de 10 leads convertidos',
    ],
  },
  {
    templateId: 'h_tmpl_audience_02',
    label: 'origem do lead',
    description: 'uma origem de lead tem taxa de conversao muito superior as demais',
    category: 'audience',
    suggestedMicroTests: [
      'comparar taxa de conversao por canal nos ultimos 30 dias',
      'redirecionar 20% do orcamento para o canal campeao',
    ],
  },
  {
    templateId: 'h_tmpl_offer_01',
    label: 'promessa principal',
    description: 'a promessa atual nao esta gerando urgencia ou desejo suficiente',
    category: 'offer',
    suggestedMicroTests: [
      'testar 2 variacoes da promessa com 50 leads cada',
      'medir taxa de clique e resposta por variacao',
    ],
  },
  {
    templateId: 'h_tmpl_offer_02',
    label: 'bonus de decisao',
    description: 'um bonus adicional remove a principal objecao de compra',
    category: 'offer',
    suggestedMicroTests: [
      'adicionar 1 bonus e medir taxa de fechamento por 2 semanas',
      'perguntar a leads que desistiram o que faltou',
    ],
  },
  {
    templateId: 'h_tmpl_objection_01',
    label: 'objecao de preco',
    description: 'a principal objecao e preco, mas o valor percebido pode ser aumentado',
    category: 'objection',
    suggestedMicroTests: [
      'listar objecoes dos ultimos 10 leads perdidos',
      'testar comunicacao que compara custo vs perda de nao agir',
    ],
  },
  {
    templateId: 'h_tmpl_objection_02',
    label: 'objecao de confianca',
    description: 'leads desistem por falta de confianca na entrega ou no resultado',
    category: 'objection',
    suggestedMicroTests: [
      'adicionar 2 provas sociais na conversa de venda',
      'medir taxa de avanco no pipeline antes e depois',
    ],
  },
  {
    templateId: 'h_tmpl_channel_01',
    label: 'canal de aquisicao',
    description: 'um canal de aquisicao tem custo por lead muito menor que os outros',
    category: 'channel',
    suggestedMicroTests: [
      'calcular CPA por canal nos ultimos 30 dias',
      'aumentar investimento no canal de menor CPA por 7 dias',
    ],
  },
  {
    templateId: 'h_tmpl_channel_02',
    label: 'canal de conversa',
    description: 'mudar o canal de conversa (email → whatsapp) aumenta taxa de resposta',
    category: 'channel',
    suggestedMicroTests: [
      'enviar 20 mensagens via WhatsApp vs 20 via email',
      'medir taxa de resposta em 48h',
    ],
  },
  {
    templateId: 'h_tmpl_pricing_01',
    label: 'sensibilidade a preco',
    description: 'o preco atual esta abaixo do que o mercado aceitaria pagar',
    category: 'pricing',
    suggestedMicroTests: [
      'testar precos 20% acima e 20% abaixo por 7 dias cada',
      'medir volume vs receita total',
    ],
  },
  {
    templateId: 'h_tmpl_pricing_02',
    label: 'formato de pagamento',
    description: 'oferecer parcelamento ou pagamento unico muda a taxa de conversao',
    category: 'pricing',
    suggestedMicroTests: [
      'apresentar duas opcoes de pagamento para 30 leads',
      'medir preferencia e taxa de fechamento',
    ],
  },
  {
    templateId: 'h_tmpl_messaging_01',
    label: 'tom da abordagem',
    description: 'um tom mais direto gera mais resposta do que um tom consultivo',
    category: 'messaging',
    suggestedMicroTests: [
      'testar 2 tons de abertura com 30 leads cada',
      'medir taxa de resposta em 24h',
    ],
  },
  {
    templateId: 'h_tmpl_messaging_02',
    label: 'timing da mensagem',
    description: 'o horario de envio da primeira mensagem afeta a taxa de resposta',
    category: 'messaging',
    suggestedMicroTests: [
      'enviar mensagens em 3 horarios diferentes',
      'medir taxa de resposta por faixa horaria',
    ],
  },
];

export function getTemplatesByCategory(
  category: HypothesisCategory,
): readonly HypothesisTemplate[] {
  return HYPOTHESIS_TEMPLATES.filter((t) => t.category === category);
}

export function getAllCategories(): readonly HypothesisCategory[] {
  const cats = new Set<HypothesisCategory>();
  for (const t of HYPOTHESIS_TEMPLATES) {
    cats.add(t.category);
  }
  return [...cats];
}

export function getTemplateById(templateId: string): HypothesisTemplate | undefined {
  return HYPOTHESIS_TEMPLATES.find((t) => t.templateId === templateId);
}
