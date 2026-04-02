export const FLOW_TEMPLATES = [
  {
    id: 'template_welcome',
    name: 'Boas-vindas Simples',
    description:
      'Fluxo básico para receber novos leads e qualificar interesse.',
    nodes: [
      {
        id: '1',
        type: 'start',
        position: { x: 100, y: 100 },
        data: { label: 'Início' },
      },
      {
        id: '2',
        type: 'message',
        position: { x: 100, y: 200 },
        data: { content: 'Olá! Tudo bem? Bem-vindo à nossa empresa.' },
      },
      {
        id: '3',
        type: 'message',
        position: { x: 100, y: 300 },
        data: { content: 'Como podemos te ajudar hoje?' },
      },
      {
        id: '4',
        type: 'condition',
        position: { x: 100, y: 400 },
        data: { condition: "contains(last_message, 'preço')" },
      },
      {
        id: '5',
        type: 'message',
        position: { x: -100, y: 500 },
        data: { content: 'Nossos planos começam em R$ 99/mês.' },
      },
      {
        id: '6',
        type: 'message',
        position: { x: 300, y: 500 },
        data: { content: 'Se precisar de apoio humano, um consultor pode assumir esta conversa no momento certo.' },
      },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e2-3', source: '2', target: '3' },
      { id: 'e3-4', source: '3', target: '4' },
      { id: 'e4-5', source: '4', target: '5', sourceHandle: 'yes' },
      { id: 'e4-6', source: '4', target: '6', sourceHandle: 'no' },
    ],
  },
  {
    id: 'template_scheduling',
    name: 'Agendamento Automático',
    description: 'Qualifica o cliente e envia link de agendamento.',
    nodes: [
      {
        id: '1',
        type: 'start',
        position: { x: 100, y: 100 },
        data: { label: 'Início' },
      },
      {
        id: '2',
        type: 'message',
        position: { x: 100, y: 200 },
        data: { content: 'Oi! Gostaria de agendar uma reunião?' },
      },
      {
        id: '3',
        type: 'condition',
        position: { x: 100, y: 300 },
        data: { condition: "contains(last_message, 'sim')" },
      },
      {
        id: '4',
        type: 'message',
        position: { x: 100, y: 400 },
        data: {
          content: 'Ótimo! Escolha um horário aqui: https://cal.com/exemplo',
        },
      },
      {
        id: '5',
        type: 'wait',
        position: { x: 100, y: 500 },
        data: { duration: 3600 },
      }, // Wait 1h
      {
        id: '6',
        type: 'message',
        position: { x: 100, y: 600 },
        data: {
          content: "Conseguiu agendar? Se precisar de ajuda, digite 'ajuda'.",
        },
      },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e2-3', source: '2', target: '3' },
      { id: 'e3-4', source: '3', target: '4', sourceHandle: 'yes' },
      { id: 'e4-5', source: '4', target: '5' },
      { id: 'e5-6', source: '5', target: '6' },
    ],
  },
  {
    id: 'template_ai_sales',
    name: 'Vendedor IA (GPT-4)',
    description:
      'Usa a IA para responder dúvidas com base na sua Base de Conhecimento.',
    nodes: [
      {
        id: '1',
        type: 'start',
        position: { x: 100, y: 100 },
        data: { label: 'Início' },
      },
      {
        id: '2',
        type: 'aiKbNode',
        position: { x: 100, y: 200 },
        data: {
          prompt: 'Você é um vendedor útil. Responda dúvidas sobre o produto.',
          outputVariable: 'ai_response',
        },
      },
      {
        id: '3',
        type: 'message',
        position: { x: 100, y: 300 },
        data: { content: '{{ai_response}}' },
      },
      {
        id: '4',
        type: 'goToNode',
        position: { x: 100, y: 400 },
        data: { targetNodeId: '2' },
      }, // Loop
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e2-3', source: '2', target: '3' },
      { id: 'e3-4', source: '3', target: '4' },
    ],
  },
];
