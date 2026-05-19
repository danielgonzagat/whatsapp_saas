import { api } from './core';

export interface BrainDecideInput {
  intent: string;
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> | undefined;
  context?: Record<string, unknown> | undefined;
  source?: string | undefined;
}

export interface BrainCapabilityResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface BrainDecideAction {
  tool: string;
  result?: BrainCapabilityResult | unknown;
}

export interface BrainDecideOutput {
  actions: BrainDecideAction[];
  confidence: number;
  conversationId?: string;
  intent: string;
  requestId: string;
  response?: string;
  source: string;
  title?: string;
}

export async function brainDecide(input: BrainDecideInput): Promise<BrainDecideOutput> {
  const { data } = await api.post<BrainDecideOutput>('/brain/decide', {
    intent: input.intent,
    messages: input.messages,
    context: input.context,
    source: input.source ?? 'chat',
  });
  return data;
}

export async function brainListCapabilities(): Promise<{
  count: number;
  capabilities: Array<{ name: string; description: string; domain: string }>;
}> {
  const { data } = await api.get<{
    count: number;
    capabilities: Array<{ name: string; description: string; domain: string }>;
  }>('/brain/capabilities');
  return data;
}

export const OPERATOR_INTENT_PATTERNS: Array<{
  intent: string;
  keywords: string[];
  examples: string[];
}> = [
  {
    intent: 'list_products',
    keywords: [
      'produto',
      'produtos',
      'catalogo',
      'catalogo de produtos',
      'meus produtos',
      'listar produtos',
      'liste produtos',
      'quais produtos',
      'mostra produtos',
      'ver produtos',
    ],
    examples: ['liste meus produtos', 'mostra o catalogo', 'quais produtos tenho'],
  },
  {
    intent: 'search_contact',
    keywords: [
      'contato',
      'contatos',
      'cliente',
      'clientes',
      'buscar contato',
      'procurar contato',
      'achar contato',
      'encontrar contato',
      'pesquisar contato',
    ],
    examples: ['buscar contato joao', 'ache o cliente maria', 'procure o telefone 119'],
  },
  {
    intent: 'list_conversations',
    keywords: [
      'conversa',
      'conversas',
      'conversacoes',
      'conversas recentes',
      'ultimas conversas',
      'inbox',
      'caixa de entrada',
      'mensagens recentes',
    ],
    examples: ['liste conversas recentes', 'conversas abertas', 'mostra a inbox'],
  },
  {
    intent: 'send_message_via_channel',
    keywords: [
      'enviar mensagem',
      'enviar msg',
      'mandar mensagem',
      'mandar msg',
      'disparar mensagem',
      'enviar para',
      'manda para',
    ],
    examples: ['envia mensagem para 1199999 dizendo ola', 'manda msg para maria'],
  },
  {
    intent: 'query_revenue_summary',
    keywords: [
      'receita',
      'faturamento',
      'vendas',
      'revenue',
      'ganhos',
      'lucro',
      'quanto vendeu',
      'quanto faturei',
      'resumo de vendas',
      'resumo financeiro',
      'financeiro',
    ],
    examples: ['resumo de receita', 'quanto faturei esse mes', 'qual o faturamento'],
  },
  {
    intent: 'inspect_self',
    keywords: [
      'analise a si mesmo',
      'analise voce mesmo',
      'olhe para si',
      'olhe para voce',
      'veja a si mesmo',
      'auto-diagnostico',
      'autodiagnostico',
      'auto diagnostico',
      'introspeccao',
      'estado cognitivo',
      'autoconsciencia',
      'o que falta em voce',
      'o que falta pra voce',
      'o que falta para voce',
      'o que nao funciona em voce',
      'o que nao funciona em ti',
      'diagnostico interno',
      'percorra a si mesmo',
      'teste a si mesmo',
      'seu estado interno',
      'como voce esta por dentro',
      'inspecione a si mesmo',
    ],
    examples: [
      'analise a si mesmo e diga o que falta',
      'qual seu estado cognitivo',
      'o que nao funciona em voce',
      'faca um auto-diagnostico',
    ],
  },
];

const UNSUPPORTED_FALLBACK_KEYWORDS = [
  'site',
  'landing',
  'pagina',
  'anuncio',
  'anuncios',
  'campanha',
  'email',
  'relatorio',
  'relatorios',
  'dashboard',
  'configurar',
  'integração',
  'integracao',
];

export function detectOperatorIntent(rawText: string): string | null {
  const normalized = rawText.toLowerCase().trim();

  for (const pattern of OPERATOR_INTENT_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        return pattern.intent;
      }
    }
  }

  for (const keyword of UNSUPPORTED_FALLBACK_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return 'unsupported_fallback';
    }
  }

  return null;
}

export function isUnsupportedFallback(intent: string | null): boolean {
  return intent === 'unsupported_fallback';
}
