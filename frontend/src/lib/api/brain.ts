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
  {
    intent: 'inspect_runtime',
    keywords: [
      'estado do runtime',
      'estado do deploy',
      'status do deploy',
      'status do servidor',
      'como esta o deploy',
      'como esta o servidor',
      'seu runtime',
      'seu deploy',
      'railway',
      'vercel',
      'voce esta no ar',
      'esta deployado',
      'uptime',
      'saude do sistema',
      'estado de producao',
    ],
    examples: [
      'como esta seu deploy no railway',
      'qual o estado do runtime',
      'voce esta no ar em producao',
      'status do servidor e do vercel',
    ],
  },
];

const MAX_FRONTEND_OPERATOR_ROUTER_CHARS = 320;

const EXPLICIT_OPERATOR_INTENT_PATTERNS: Array<{
  intent: string;
  patterns: RegExp[];
}> = [
  {
    intent: 'list_products',
    patterns: [
      /^(?:kloel[\s,.:;-]+)?(?:liste|lista|listar|mostra|mostre|ver|veja|consulta|consulte|quais|qual)\b.{0,90}\b(produto|produtos|catalogo)\b/,
      /^(?:meus\s+)?produtos(?:\s+(?:ativos|cadastrados|disponiveis))?$/,
    ],
  },
  {
    intent: 'search_contact',
    patterns: [
      /^(?:kloel[\s,.:;-]+)?(?:buscar|busque|procure|procurar|achar|encontrar|mostra|mostre|consulta|consulte)\b.{0,90}\b(contato|contatos|cliente|clientes)\b/,
    ],
  },
  {
    intent: 'list_conversations',
    patterns: [
      /^(?:kloel[\s,.:;-]+)?(?:liste|lista|listar|mostra|mostre|ver|veja|consulta|consulte|busque|buscar|procure|procurar|abra|abrir)\b.{0,90}\b(conversa|conversas|conversacoes|inbox|caixa de entrada|mensagens recentes)\b/,
      /^(?:minhas\s+)?(?:ultimas\s+)?conversas(?:\s+(?:recentes|abertas|fechadas))?$/,
    ],
  },
  {
    intent: 'send_message_via_channel',
    patterns: [
      /^(?:kloel[\s,.:;-]+)?(?:enviar|envie|manda|mande|mandar|disparar|dispare)\b.{0,90}\b(mensagem|msg)\b/,
    ],
  },
  {
    intent: 'query_revenue_summary',
    patterns: [
      /^(?:kloel[\s,.:;-]+)?(?:resumo|resuma|mostra|mostre|consulta|consulte|quanto|qual)\b.{0,90}\b(receita|faturamento|vendas|financeiro|ganhos|lucro)\b/,
    ],
  },
  {
    intent: 'inspect_self',
    patterns: [
      /^(?:kloel[\s,.:;-]+)?(?:analise|analisar|inspecione|inspecionar|teste|testar|veja|olhe|mostra|mostre|faca|faz)\b.{0,90}\b(a si mesmo|voce mesmo|seu estado|estado cognitivo|autodiagnostico|autoconsciencia|diagnostico interno)\b/,
      /^o que falta (?:em|pra|para) voce\b/,
    ],
  },
  {
    intent: 'inspect_runtime',
    patterns: [
      /^(?:kloel[\s,.:;-]+)?(?:estado|status|como esta|verifique|verificar|cheque|checar|mostra|mostre)\b.{0,90}\b(runtime|deploy|servidor|railway|vercel|producao|saude do sistema)\b/,
    ],
  },
];

const UNSUPPORTED_FALLBACK_RE =
  /^(?:kloel[\s,.:;-]+)?(?:crie|criar|gera|gerar|configure|configurar|monte|faca|faz|envie|mande)\b.{0,90}\b(site|landing|pagina|anuncio|anuncios|campanha|email|relatorio|relatorios|dashboard|integracao)\b/;

function normalizeIntentText(rawText: string): string {
  return rawText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function detectOperatorIntent(rawText: string): string | null {
  const normalized = normalizeIntentText(rawText);
  if (!normalized || normalized.length > MAX_FRONTEND_OPERATOR_ROUTER_CHARS) {
    return null;
  }

  for (const entry of EXPLICIT_OPERATOR_INTENT_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(normalized))) {
      return entry.intent;
    }
  }

  if (UNSUPPORTED_FALLBACK_RE.test(normalized)) {
    return 'unsupported_fallback';
  }

  return null;
}

export function isUnsupportedFallback(intent: string | null): boolean {
  return intent === 'unsupported_fallback';
}
