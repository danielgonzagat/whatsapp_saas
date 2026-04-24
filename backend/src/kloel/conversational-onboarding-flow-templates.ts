/**
 * ============================================
 * ONBOARDING FLOW TEMPLATES
 * ============================================
 * Static flow template definitions used during
 * conversational onboarding to auto-create flows.
 * ============================================
 */

const BASE_Y = 100;
const SPACING = 150;

export interface FlowTemplate {
  name: string;
  description: string;
  triggerType: string;
  keywords: string[];
  nodes: unknown[];
  edges: unknown[];
}

export function buildWelcomeTemplate(customMessages?: string[]): FlowTemplate {
  return {
    name: 'Boas-vindas Automático',
    description: 'Fluxo de boas-vindas para novos contatos',
    triggerType: 'NEW_CONTACT',
    keywords: ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'início', 'inicio'],
    nodes: [
      {
        id: 'start_1',
        type: 'start',
        position: { x: 250, y: BASE_Y },
        data: { label: 'Início', trigger: 'NEW_CONTACT' },
      },
      {
        id: 'msg_welcome',
        type: 'message',
        position: { x: 250, y: BASE_Y + SPACING },
        data: {
          label: 'Mensagem de Boas-vindas',
          message:
            customMessages?.[0] ||
            'Olá! Seja bem-vindo(a).\n\nSou a assistente virtual e estou aqui para te ajudar. Como posso ser útil hoje?',
        },
      },
      {
        id: 'menu_1',
        type: 'menu',
        position: { x: 250, y: BASE_Y + SPACING * 2 },
        data: {
          label: 'Menu Principal',
          message: 'Escolha uma opção:',
          options: [
            { id: '1', label: 'Ver produtos e serviços' },
            { id: '2', label: 'Falar com atendente' },
            { id: '3', label: 'Dúvidas frequentes' },
          ],
        },
      },
      {
        id: 'end_1',
        type: 'end',
        position: { x: 250, y: BASE_Y + SPACING * 3 },
        data: { label: 'Fim' },
      },
    ],
    edges: [
      { id: 'e1', source: 'start_1', target: 'msg_welcome' },
      { id: 'e2', source: 'msg_welcome', target: 'menu_1' },
      { id: 'e3', source: 'menu_1', target: 'end_1' },
    ],
  };
}

export function buildSalesTemplate(): FlowTemplate {
  return {
    name: 'Funil de Vendas',
    description: 'Fluxo para qualificação e conversão de vendas',
    triggerType: 'KEYWORD',
    keywords: ['comprar', 'preço', 'valor', 'quanto custa', 'catálogo', 'produtos'],
    nodes: [
      {
        id: 'start_1',
        type: 'start',
        position: { x: 250, y: BASE_Y },
        data: { label: 'Início - Interesse em compra', trigger: 'KEYWORD' },
      },
      {
        id: 'msg_interest',
        type: 'message',
        position: { x: 250, y: BASE_Y + SPACING },
        data: {
          label: 'Captura de interesse',
          message:
            'Ótimo! Você está interessado em nossos produtos e serviços.\n\nVou te mostrar as melhores opções.',
        },
      },
      {
        id: 'ai_qualify',
        type: 'ai',
        position: { x: 250, y: BASE_Y + SPACING * 2 },
        data: {
          label: 'IA Qualifica Lead',
          prompt:
            'Qualifique este lead perguntando sobre suas necessidades e orçamento de forma natural e consultiva.',
        },
      },
      {
        id: 'condition_1',
        type: 'condition',
        position: { x: 250, y: BASE_Y + SPACING * 3 },
        data: { label: 'Lead Qualificado?', condition: 'qualified === true' },
      },
      {
        id: 'msg_offer',
        type: 'message',
        position: { x: 100, y: BASE_Y + SPACING * 4 },
        data: {
          label: 'Enviar Oferta',
          message: 'Preparei uma condição comercial para você. Vou te passar os detalhes.',
        },
      },
      {
        id: 'msg_nurture',
        type: 'message',
        position: { x: 400, y: BASE_Y + SPACING * 4 },
        data: {
          label: 'Nutrir Lead',
          message: 'Entendi. Vou te enviar algumas informações úteis para apoiar sua decisão.',
        },
      },
      {
        id: 'end_1',
        type: 'end',
        position: { x: 250, y: BASE_Y + SPACING * 5 },
        data: { label: 'Fim' },
      },
    ],
    edges: [
      { id: 'e1', source: 'start_1', target: 'msg_interest' },
      { id: 'e2', source: 'msg_interest', target: 'ai_qualify' },
      { id: 'e3', source: 'ai_qualify', target: 'condition_1' },
      { id: 'e4', source: 'condition_1', target: 'msg_offer', sourceHandle: 'yes' },
      { id: 'e5', source: 'condition_1', target: 'msg_nurture', sourceHandle: 'no' },
      { id: 'e6', source: 'msg_offer', target: 'end_1' },
      { id: 'e7', source: 'msg_nurture', target: 'end_1' },
    ],
  };
}

export function buildSupportTemplate(): FlowTemplate {
  return {
    name: 'Atendimento e Suporte',
    description: 'Fluxo para suporte ao cliente',
    triggerType: 'KEYWORD',
    keywords: ['ajuda', 'suporte', 'problema', 'reclamação', 'dúvida', 'erro'],
    nodes: [
      {
        id: 'start_1',
        type: 'start',
        position: { x: 250, y: BASE_Y },
        data: { label: 'Início - Pedido de Suporte' },
      },
      {
        id: 'msg_support',
        type: 'message',
        position: { x: 250, y: BASE_Y + SPACING },
        data: {
          message:
            'Entendi que você precisa de ajuda.\n\nVou te ajudar a resolver isso. Pode me contar mais sobre o que está acontecendo?',
        },
      },
      {
        id: 'ai_support',
        type: 'ai',
        position: { x: 250, y: BASE_Y + SPACING * 2 },
        data: {
          label: 'IA Resolve',
          prompt:
            'Você é um agente de suporte prestativo. Entenda o problema do cliente e tente resolver ou encaminhe para um humano se necessário.',
        },
      },
      {
        id: 'end_1',
        type: 'end',
        position: { x: 250, y: BASE_Y + SPACING * 3 },
        data: { label: 'Fim' },
      },
    ],
    edges: [
      { id: 'e1', source: 'start_1', target: 'msg_support' },
      { id: 'e2', source: 'msg_support', target: 'ai_support' },
      { id: 'e3', source: 'ai_support', target: 'end_1' },
    ],
  };
}

export function buildSchedulingTemplate(): FlowTemplate {
  return {
    name: 'Agendamento Automático',
    description: 'Fluxo para agendamento de horários',
    triggerType: 'KEYWORD',
    keywords: ['agendar', 'horário', 'marcar', 'consulta', 'reunião', 'disponibilidade'],
    nodes: [
      {
        id: 'start_1',
        type: 'start',
        position: { x: 250, y: BASE_Y },
        data: { label: 'Início - Agendamento' },
      },
      {
        id: 'msg_schedule',
        type: 'message',
        position: { x: 250, y: BASE_Y + SPACING },
        data: {
          message:
            'Vamos agendar seu horário.\n\nPor favor, me informe:\n1. Qual serviço deseja?\n2. Data preferida\n3. Horário preferido',
        },
      },
      {
        id: 'ai_schedule',
        type: 'ai',
        position: { x: 250, y: BASE_Y + SPACING * 2 },
        data: {
          label: 'IA Agenda',
          prompt:
            'Colete as preferências de agendamento do cliente e confirme o horário disponível.',
        },
      },
      {
        id: 'msg_confirm',
        type: 'message',
        position: { x: 250, y: BASE_Y + SPACING * 3 },
        data: {
          message: 'Agendamento confirmado. Você receberá um lembrete antes do horário.',
        },
      },
      {
        id: 'end_1',
        type: 'end',
        position: { x: 250, y: BASE_Y + SPACING * 4 },
        data: { label: 'Fim' },
      },
    ],
    edges: [
      { id: 'e1', source: 'start_1', target: 'msg_schedule' },
      { id: 'e2', source: 'msg_schedule', target: 'ai_schedule' },
      { id: 'e3', source: 'ai_schedule', target: 'msg_confirm' },
      { id: 'e4', source: 'msg_confirm', target: 'end_1' },
    ],
  };
}

export function buildLeadCaptureTemplate(): FlowTemplate {
  return {
    name: 'Captura de Leads',
    description: 'Fluxo para capturar e qualificar leads',
    triggerType: 'KEYWORD',
    keywords: ['interessado', 'saber mais', 'informações', 'contato', 'orçamento'],
    nodes: [
      {
        id: 'start_1',
        type: 'start',
        position: { x: 250, y: BASE_Y },
        data: { label: 'Início - Captura de Lead' },
      },
      {
        id: 'msg_capture',
        type: 'message',
        position: { x: 250, y: BASE_Y + SPACING },
        data: {
          message:
            'Que bom que você tem interesse.\n\nPara eu te passar as melhores informações, pode me dizer seu nome?',
        },
      },
      {
        id: 'input_name',
        type: 'input',
        position: { x: 250, y: BASE_Y + SPACING * 2 },
        data: { label: 'Captura Nome', variable: 'lead_name', validation: 'text' },
      },
      {
        id: 'msg_email',
        type: 'message',
        position: { x: 250, y: BASE_Y + SPACING * 3 },
        data: {
          message:
            'Perfeito, {{lead_name}}. Qual é o seu melhor e-mail para eu te enviar mais detalhes?',
        },
      },
      {
        id: 'input_email',
        type: 'input',
        position: { x: 250, y: BASE_Y + SPACING * 4 },
        data: { label: 'Captura Email', variable: 'lead_email', validation: 'email' },
      },
      {
        id: 'msg_thanks',
        type: 'message',
        position: { x: 250, y: BASE_Y + SPACING * 5 },
        data: {
          message:
            'Perfeito, {{lead_name}}. Registrei suas informações.\n\nVamos continuar seu atendimento por aqui com os próximos detalhes.',
        },
      },
      {
        id: 'end_1',
        type: 'end',
        position: { x: 250, y: BASE_Y + SPACING * 6 },
        data: { label: 'Fim' },
      },
    ],
    edges: [
      { id: 'e1', source: 'start_1', target: 'msg_capture' },
      { id: 'e2', source: 'msg_capture', target: 'input_name' },
      { id: 'e3', source: 'input_name', target: 'msg_email' },
      { id: 'e4', source: 'msg_email', target: 'input_email' },
      { id: 'e5', source: 'input_email', target: 'msg_thanks' },
      { id: 'e6', source: 'msg_thanks', target: 'end_1' },
    ],
  };
}

export function getFlowTemplate(flowType: string, customMessages?: string[]): FlowTemplate {
  switch (flowType) {
    case 'sales':
      return buildSalesTemplate();
    case 'support':
      return buildSupportTemplate();
    case 'scheduling':
      return buildSchedulingTemplate();
    case 'lead_capture':
      return buildLeadCaptureTemplate();
    case 'welcome':
    default:
      return buildWelcomeTemplate(customMessages);
  }
}
