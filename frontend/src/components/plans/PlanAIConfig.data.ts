// Data constants for PlanAIConfigTab
// This file is intentionally not 'use client' — it contains only static data.

export const B_X_B_RE = /\bX\b/;

export const GENDERS = ['Homens', 'Mulheres', 'Todos'];
export const AGE_RANGES = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
export const LIFE_MOMENTS = [
  'Começando a pesquisar',
  'Já tentou outros produtos',
  'Urgência/necessidade imediata',
  'Comprando como presente',
  'Compra recorrente',
  'Comparando opções',
  'Foi indicado por alguém',
  'Viu um anúncio',
];
export const KNOWLEDGE_LEVELS = [
  { v: 'LAYPERSON', l: 'Leigo' },
  { v: 'BASIC', l: 'Básico' },
  { v: 'INFORMED', l: 'Informado' },
  { v: 'SPECIALIST', l: 'Especialista' },
  { v: 'MIXED', l: 'Misto' },
];
export const BUYING_POWER = [
  { v: 'ECONOMIC', l: 'Econômico' },
  { v: 'COST_BENEFIT', l: 'Custo-benefício' },
  { v: 'PREMIUM', l: 'Premium' },
  { v: 'LUXURY', l: 'Luxo' },
];
export const PROBLEMS = [
  'Saúde — Dor/inflamação',
  'Saúde — Imunidade baixa',
  'Saúde — Anemia/ferro',
  'Beleza — Pele/rugas',
  'Beleza — Cabelo/queda',
  'Emagrecimento',
  'Energia/disposição',
  'Sono/ansiedade',
  'Finanças — Dívidas',
  'Finanças — Investir',
  'Relacionamento',
  'Educação — Aprender skill',
  'Produtividade',
  'Marketing — Vender mais',
  'Outro',
];
export const TIERS = [
  { v: 'ENTRY', l: 'Entrada/Isca' },
  { v: 'MAIN', l: 'Principal' },
  { v: 'PREMIUM', l: 'Premium/VIP' },
  { v: 'ECONOMIC', l: 'Econômico' },
  { v: 'WHOLESALE', l: 'Atacado' },
  { v: 'SUBSCRIPTION', l: 'Assinatura' },
  { v: 'UNIQUE', l: 'Único' },
];
export const WHEN_TO_OFFER = [
  'Primeira opção apresentada',
  'Cliente quer o mais barato',
  'Cliente quer o mais completo',
  'Cliente pede desconto',
  'Como upsell após compra',
  'Quando há urgência',
  'Cliente indeciso',
  'Compra em volume',
];
export const DIFFERENTIATORS = [
  'Mais unidades',
  'Preço menor por unidade',
  'Brinde exclusivo',
  'Frete grátis',
  'Garantia estendida',
  'Acesso exclusivo',
  'Suporte VIP',
  'Desconto progressivo',
  'Bônus digital',
  'Embalagem premium',
  'Resultados mais rápidos',
  'Fornecimento por mais tempo',
  'Nada de especial',
];
export const SCARCITY = [
  { v: 'NONE', l: 'Sem escassez' },
  { v: 'LIMITED_STOCK', l: 'Estoque limitado' },
  { v: 'LIMITED_OFFER', l: 'Oferta por tempo limitado' },
  { v: 'PRICE_INCREASE', l: 'Preço vai subir' },
  { v: 'LAST_UNITS', l: 'Últimas unidades' },
  { v: 'WEEKLY_BONUS', l: 'Bônus só esta semana' },
  { v: 'SPECIAL_BATCH', l: 'Lote especial' },
];

export const OBJECTIONS = [
  {
    id: 'expensive',
    label: 'Está caro',
    responses: [
      'Valor e resultado',
      'Comparação custo-benefício',
      'Parcelamento',
      'Garantia de satisfação',
      'Economia a longo prazo',
      'Prova social de quem comprou',
      'Desconto especial',
    ],
  },
  {
    id: 'think',
    label: 'Preciso pensar',
    responses: [
      'Validar a dúvida',
      'Escassez sutil',
      'Resumo dos benefícios',
      'Oferecer garantia',
      'Compartilhar depoimento',
      'Perguntar o que falta decidir',
    ],
  },
  {
    id: 'works',
    label: 'Não sei se funciona',
    responses: [
      'Prova social',
      'Dados científicos',
      'Garantia de resultado',
      'Depoimento em vídeo',
      'Período de teste',
      'Explicar mecanismo de ação',
    ],
  },
  {
    id: 'tried',
    label: 'Já tentei outros',
    responses: [
      'Diferencial claro',
      'Garantia ou teste',
      'Explicar por que é diferente',
      'Depoimento de quem também tentou outros',
    ],
  },
  {
    id: 'cheaper',
    label: 'Achei mais barato',
    responses: [
      'Qualidade vs preço',
      'Composição superior',
      'Garantia inclusa',
      'Atendimento diferenciado',
      'Frete e entrega',
    ],
  },
  {
    id: 'trust',
    label: 'Não confio em compra online',
    responses: [
      'Certificados de segurança',
      'Política de devolução',
      'Empresa estabelecida',
      'Avaliações reais',
      'Pagamento na entrega',
      'Nota fiscal',
    ],
  },
  {
    id: 'deadline',
    label: 'Prazo é muito longo',
    responses: [
      'Explicar logística',
      'Oferecer SEDEX',
      'Rastreamento em tempo real',
      'Compensar com bônus',
      'Prazo real vs estimado',
    ],
  },
  {
    id: 'human',
    label: 'Quero falar com alguém',
    responses: [
      'Transferir para humano',
      'Oferecer WhatsApp',
      'Ligar para o cliente',
      'Agendar callback',
      'Esclarecer a dúvida primeiro',
    ],
  },
  {
    id: 'notforme',
    label: 'Não é para mim',
    responses: [
      'Confirmar perfil ideal',
      'Mostrar caso similar',
      'Oferecer alternativa',
      'Respeitar e encerrar',
      'Salvar para futuro',
    ],
  },
  {
    id: 'later',
    label: 'Compro depois',
    responses: [
      'Escassez temporal',
      'Bônus expirando',
      'Lembrete agendado',
      'Desconto relâmpago',
      'Salvar carrinho',
    ],
  },
];

export const SOCIAL_PROOF = [
  'Mais de X clientes',
  'Avaliação X estrelas',
  'Mais vendido',
  'Recomendado por especialistas',
  'Aprovado ANVISA',
  'Mais de X avaliações',
];
export const GUARANTEE = [
  'Garantia X dias',
  'Devolução grátis',
  'Pagamento seguro SSL',
  'Empresa com X anos',
  'Nota X Reclame Aqui',
  'Milhares satisfeitos',
];
export const BENEFITS = [
  'Economia X%',
  'Frete grátis',
  'Bônus exclusivo',
  'Suporte VIP',
  'Acesso grupo exclusivo',
  'Fornecimento X meses',
  'Resultados em X',
  'Desconto exclusivo',
];
export const URGENCY = [
  'Oferta válida até...',
  'Últimas X unidades',
  'Preço vai subir',
  'Bônus só próximos X',
  'Desconto só via link',
];

import { AlertTriangle, BookOpen, Heart, MessageSquare, Sparkles, Zap } from 'lucide-react';

export const TONES: { v: string; l: string; icon: typeof MessageSquare; desc: string }[] = [
  {
    v: 'CONSULTIVE',
    l: 'Consultivo',
    icon: MessageSquare,
    desc: 'Faz perguntas, entende a necessidade e recomenda.',
  },
  { v: 'DIRECT', l: 'Direto', icon: Zap, desc: 'Vai direto ao ponto, objetivo e rápido.' },
  {
    v: 'EMPATHETIC',
    l: 'Empático',
    icon: Heart,
    desc: 'Acolhe, valida sentimentos e cria conexão.',
  },
  {
    v: 'EDUCATIVE',
    l: 'Educativo',
    icon: BookOpen,
    desc: 'Explica com detalhes, ensina antes de vender.',
  },
  {
    v: 'URGENT',
    l: 'Urgente',
    icon: AlertTriangle,
    desc: 'Cria senso de urgência, foco em ação imediata.',
  },
  {
    v: 'AUTO',
    l: 'Automático',
    icon: Sparkles,
    desc: 'A IA escolhe o melhor tom conforme o contexto.',
  },
];
export const USAGE_MODES = [
  'Cápsulas (X por dia)',
  'Aplicar X vezes ao dia',
  'Gotas sublinguais',
  'Conforme orientação médica',
  'Conteúdo digital (acesso)',
  'Instruções na embalagem',
];
export const DURATIONS = [
  '15 dias',
  '30 dias',
  '60 dias',
  '90 dias',
  '180 dias',
  '365 dias',
  'Uso único',
  'Acesso vitalício',
];
export const CONTRAINDICATIONS = [
  'Gestantes',
  'Lactantes',
  'Menores de 18 anos',
  'Hipertensos',
  'Diabéticos',
  'Alérgicos a componentes',
  'Uso de anticoagulantes',
  'Doença renal',
  'Doença hepática',
  'Cardiopatas',
];
export const RESULTS = [
  '1-2 semanas',
  '2-4 semanas',
  '1-2 meses',
  '2-3 meses',
  '3-6 meses',
  '6-12 meses',
  'Imediato',
  'Varia por pessoa',
  'Uso contínuo recomendado',
];

export const UPSELL_WHEN = [
  'Cliente pergunta sobre o plano principal',
  'Cliente aceita o preço',
  'Cliente quer mais resultados',
  'Cliente compra pela segunda vez',
  'Cliente pergunta por garantia estendida',
  'Cliente demonstra poder aquisitivo',
];
export const UPSELL_ARGUMENTS = [
  'Mais resultados por pouco a mais',
  'Melhor custo-benefício a longo prazo',
  'Brindes e bônus exclusivos',
  'Garantia estendida inclusa',
  'Suporte prioritário',
];
export const DOWNSELL_WHEN = [
  'Cliente diz que está caro',
  'Cliente quer pensar',
  'Cliente compara com concorrente',
  'Cliente quer apenas experimentar',
  'Cliente desiste do carrinho',
];
export const DOWNSELL_ARGUMENTS = [
  'Versão mais acessível',
  'Teste sem compromisso',
  'Menos unidades, mesmo resultado',
  'Garantia mantida',
];
