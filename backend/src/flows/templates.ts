type FlowTemplateNode = {
  id: string;
  type: 'start' | 'message' | 'condition' | 'wait';
  position: { x: number; y: number };
  data: Record<string, string | number>;
};

type FlowTemplateEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: 'yes' | 'no';
};

type FlowTemplateMarket = {
  role: 'produtor';
  stage: 'validacao';
  businessType: 'infoproduto';
  flagshipJourney: 'checkout_direto';
};

type FlowTemplate = {
  id: string;
  name: string;
  category: 'VALIDATION' | 'CHECKOUT' | 'POST_SALE';
  description: string;
  market: FlowTemplateMarket;
  nodes: FlowTemplateNode[];
  edges: FlowTemplateEdge[];
};

const ACTIVE_MARKET: FlowTemplateMarket = {
  role: 'produtor',
  stage: 'validacao',
  businessType: 'infoproduto',
  flagshipJourney: 'checkout_direto',
};

/** Legacy `/flows/templates` catalog aligned to the active entry market. */
export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: 'template_produtor_validacao_checkout_diagnostico',
    name: 'Produtor em Validação - Diagnóstico de Oferta',
    category: 'VALIDATION',
    description:
      'Qualifica a oferta, promessa e primeira prova antes de enviar o lead para checkout direto.',
    market: ACTIVE_MARKET,
    nodes: [
      {
        id: 'start',
        type: 'start',
        position: { x: 120, y: 80 },
        data: { label: 'Início' },
      },
      {
        id: 'ask_offer',
        type: 'message',
        position: { x: 120, y: 180 },
        data: { content: 'Qual infoproduto você quer validar e qual transformação ele entrega?' },
      },
      {
        id: 'ask_proof',
        type: 'message',
        position: { x: 120, y: 300 },
        data: {
          content:
            'Você já tem algum sinal de demanda, como lista, audiência, conversas ou pré-vendas?',
        },
      },
      {
        id: 'ask_checkout_ready',
        type: 'condition',
        position: { x: 120, y: 420 },
        data: { condition: "contains(last_message, 'checkout')" },
      },
      {
        id: 'send_checkout',
        type: 'message',
        position: { x: -120, y: 540 },
        data: {
          content:
            'Perfeito. Vou te enviar o checkout direto e acompanhar se o pagamento ficou pendente.',
        },
      },
      {
        id: 'collect_blocker',
        type: 'message',
        position: { x: 360, y: 540 },
        data: {
          content:
            'Antes do link, qual dúvida impede você de comprar hoje: promessa, preço, garantia ou forma de pagamento?',
        },
      },
    ],
    edges: [
      { id: 'e_start_offer', source: 'start', target: 'ask_offer' },
      { id: 'e_offer_proof', source: 'ask_offer', target: 'ask_proof' },
      { id: 'e_proof_ready', source: 'ask_proof', target: 'ask_checkout_ready' },
      {
        id: 'e_ready_checkout',
        source: 'ask_checkout_ready',
        target: 'send_checkout',
        sourceHandle: 'yes',
      },
      {
        id: 'e_not_ready_blocker',
        source: 'ask_checkout_ready',
        target: 'collect_blocker',
        sourceHandle: 'no',
      },
    ],
  },
  {
    id: 'template_produtor_validacao_checkout_recuperacao_pix',
    name: 'Checkout Direto - Recuperação de Pagamento',
    category: 'CHECKOUT',
    description:
      'Recupera checkout iniciado por produtor em validação sem mascarar pendência de pagamento.',
    market: ACTIVE_MARKET,
    nodes: [
      {
        id: 'start',
        type: 'start',
        position: { x: 120, y: 80 },
        data: { label: 'Início' },
      },
      {
        id: 'confirm_intent',
        type: 'message',
        position: { x: 120, y: 180 },
        data: {
          content:
            'Vi que você abriu o checkout do infoproduto. Quer que eu te ajude a concluir agora?',
        },
      },
      {
        id: 'payment_objection',
        type: 'message',
        position: { x: 120, y: 300 },
        data: { content: 'O que travou: Pix, cartão, preço, garantia ou dúvida sobre o conteúdo?' },
      },
      {
        id: 'wait_payment',
        type: 'wait',
        position: { x: 120, y: 420 },
        data: { duration: 1800 },
      },
      {
        id: 'follow_up',
        type: 'message',
        position: { x: 120, y: 540 },
        data: {
          content:
            'Se o pagamento ainda estiver pendente, eu posso reenviar o checkout ou chamar um humano.',
        },
      },
    ],
    edges: [
      { id: 'e_start_intent', source: 'start', target: 'confirm_intent' },
      { id: 'e_intent_objection', source: 'confirm_intent', target: 'payment_objection' },
      { id: 'e_objection_wait', source: 'payment_objection', target: 'wait_payment' },
      { id: 'e_wait_follow', source: 'wait_payment', target: 'follow_up' },
    ],
  },
  {
    id: 'template_produtor_validacao_pos_compra_prova',
    name: 'Pós-compra - Primeira Prova de Valor',
    category: 'POST_SALE',
    description:
      'Ajuda o produtor a transformar a primeira compra em prova de valor e feedback acionável.',
    market: ACTIVE_MARKET,
    nodes: [
      {
        id: 'start',
        type: 'start',
        position: { x: 120, y: 80 },
        data: { label: 'Início' },
      },
      {
        id: 'welcome_buyer',
        type: 'message',
        position: { x: 120, y: 180 },
        data: {
          content: 'Pagamento confirmado. Aqui está o próximo passo para consumir o infoproduto.',
        },
      },
      {
        id: 'ask_first_value',
        type: 'message',
        position: { x: 120, y: 300 },
        data: {
          content:
            'Depois da primeira aula, responda com a principal dúvida ou primeiro resultado percebido.',
        },
      },
      {
        id: 'wait_feedback',
        type: 'wait',
        position: { x: 120, y: 420 },
        data: { duration: 86400 },
      },
      {
        id: 'request_testimonial',
        type: 'message',
        position: { x: 120, y: 540 },
        data: {
          content:
            'Conseguiu avançar? Seu feedback ajuda o produtor a validar a oferta e melhorar o checkout.',
        },
      },
    ],
    edges: [
      { id: 'e_start_welcome', source: 'start', target: 'welcome_buyer' },
      { id: 'e_welcome_value', source: 'welcome_buyer', target: 'ask_first_value' },
      { id: 'e_value_wait', source: 'ask_first_value', target: 'wait_feedback' },
      { id: 'e_wait_testimonial', source: 'wait_feedback', target: 'request_testimonial' },
    ],
  },
];
