/**
 * Static catalog of recommended flow templates seeded by FlowTemplateService.
 *
 * Extracted from flow-template.service.ts to reduce module size.
 * Pure data — no Prisma or Nest dependencies.
 */

/** Input shape used to create a flow template (mirrors service-internal type). */
export type RecommendedFlowTemplate = {
  name: string;
  category: string;
  nodes: unknown;
  edges: unknown;
  description?: string;
  isPublic?: boolean;
};

/** Returns the canonical seed list of recommended templates. */
export function getRecommendedFlowTemplates(): RecommendedFlowTemplate[] {
  return [
    {
      name: 'WhatsApp - Qualificação Rápida',
      category: 'SALES',
      description:
        'Fluxo curto para capturar nome, necessidade e orçamento antes de passar para humano.',
      nodes: [
        { id: 'start', type: 'start', label: 'Início' },
        {
          id: 'ask_name',
          type: 'message',
          label: 'Pergunta nome',
          content: 'Oi! Sou do time. Qual seu nome?',
        },
        {
          id: 'ask_need',
          type: 'message',
          label: 'Pergunta necessidade',
          content: 'Qual é a sua necessidade agora? (ex: site, tráfego, CRM)',
        },
        {
          id: 'ask_budget',
          type: 'message',
          label: 'Pergunta orçamento',
          content: 'Você já tem um orçamento estimado para isso?',
        },
        { id: 'end', type: 'end', label: 'Fim' },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'ask_name' },
        { id: 'e2', source: 'ask_name', target: 'ask_need' },
        { id: 'e3', source: 'ask_need', target: 'ask_budget' },
        { id: 'e4', source: 'ask_budget', target: 'end' },
      ],
      isPublic: true,
    },
    {
      name: 'Suporte - Coleta de Dados',
      category: 'SUPPORT',
      description:
        'Coleta dados essenciais antes de abrir ticket para reduzir tempo de primeira resposta.',
      nodes: [
        { id: 'start', type: 'start', label: 'Início' },
        {
          id: 'ask_problem',
          type: 'message',
          label: 'Pergunta problema',
          content: 'Pode descrever rapidamente o problema?',
        },
        {
          id: 'ask_env',
          type: 'message',
          label: 'Ambiente',
          content: 'É web, mobile ou API? Qual navegador/versão?',
        },
        {
          id: 'ask_priority',
          type: 'message',
          label: 'Prioridade',
          content: 'Isso está bloqueando seu uso? (sim/não)',
        },
        { id: 'end', type: 'end', label: 'Fim' },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'ask_problem' },
        { id: 'e2', source: 'ask_problem', target: 'ask_env' },
        { id: 'e3', source: 'ask_env', target: 'ask_priority' },
        { id: 'e4', source: 'ask_priority', target: 'end' },
      ],
      isPublic: true,
    },
    {
      name: 'Reengajamento Inativo (D+30)',
      category: 'MARKETING',
      description: 'Fluxo de nudge para contatos inativos há 30 dias com CTA claro.',
      nodes: [
        { id: 'start', type: 'start', label: 'Início' },
        {
          id: 'ping',
          type: 'message',
          label: 'Ping',
          content: 'Oi! Vi que você não acessa há um tempo. Posso te ajudar a retomar?',
        },
        {
          id: 'offer',
          type: 'message',
          label: 'Oferta',
          content: 'Se quiser, posso te mostrar as novidades ou montar um plano rápido.',
        },
        { id: 'end', type: 'end', label: 'Fim' },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'ping' },
        { id: 'e2', source: 'ping', target: 'offer' },
        { id: 'e3', source: 'offer', target: 'end' },
      ],
      isPublic: true,
    },
  ];
}
