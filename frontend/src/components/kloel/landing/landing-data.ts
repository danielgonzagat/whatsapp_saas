import { colors } from '@/lib/design-tokens';

export interface StepData {
  n: string;
  h: string;
  d: string;
  t: string;
}

export interface FeatureGroup {
  c: string;
  items: string[];
}

export interface PricingTool {
  tool: string;
  price: string;
}

export interface TestimonialData {
  n: string;
  r: string;
  t: string;
  m: string;
  c: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

export type MultiChannelKey = 'wa' | 'ig' | 'em';
export type MultiChannelFlowType = 'lead' | 'ai' | 'ok';

export interface MultiChannelMessage {
  ch: MultiChannelKey;
  f: MultiChannelFlowType;
  text: string;
  t: string;
  n?: string;
}

export interface LandingContent {
  steps: StepData[];
  featureGroups: FeatureGroup[];
  pricingTools: PricingTool[];
  testimonials: TestimonialData[];
  faqItems: FaqItem[];
  multiChannelFlow: MultiChannelMessage[];
}

const E = colors.ember.primary;

export const DEFAULT_LANDING_CONTENT: LandingContent = {
  steps: [
    {
      n: '01',
      h: 'Conecte',
      d: 'Cadastre produto. Conecte WhatsApp oficial pela Meta. Configure preço e regras.',
      t: 'A IA aprende com o produto. Quanto mais detalhes, melhor vende.',
    },
    {
      n: '02',
      h: 'Configure',
      d: 'Escolha canais. Defina limites de desconto, tom, horarios, follow-up.',
      t: 'Controle total. A IA nunca ultrapassa suas regras.',
    },
    {
      n: '03',
      h: 'A IA opera',
      d: 'Responde, qualifica, negocia, fecha, faz follow-up, recupera carrinho. 24/7.',
      t: 'Dashboard tempo real. Assuma qualquer conversa quando quiser.',
    },
  ],

  featureGroups: [
    {
      c: 'VENDA',
      items: [
        'Checkout inteligente',
        'Pix, cartão, boleto',
        'Assinaturas',
        'Order bump / upsell',
        'Recuperação de carrinho',
        'Split de comissões',
      ],
    },
    {
      c: 'IA EM 6 CANAIS',
      items: ['WhatsApp', 'Instagram DM', 'Facebook Messenger', 'Email marketing', 'SMS', 'TikTok'],
    },
    {
      c: 'CONSTRUA',
      items: [
        'Site builder com IA',
        'Landing pages',
        'Funis de venda',
        'Domínio + hospedagem',
        'SSL automático',
        'Canva integrado',
      ],
    },
    {
      c: 'GERENCIE',
      items: [
        'Dashboard tempo real',
        'CRM + pipeline',
        'Afiliados',
        'Área de membros',
        'Relatórios + UTM',
        'Meta/Google/TikTok Ads',
      ],
    },
  ],

  pricingTools: [
    { tool: 'Automação email', price: 'R$189' },
    { tool: 'Chatbot', price: 'R$75' },
    { tool: 'Funis', price: 'R$500' },
    { tool: 'Hospedagem', price: 'R$45' },
    { tool: 'CRM', price: 'R$300' },
    { tool: 'Chat', price: 'R$90' },
    { tool: 'SMS', price: 'R$120' },
    { tool: 'Afiliados', price: 'R$200' },
  ],

  testimonials: [
    {
      n: 'Carolina M.',
      r: 'Infoprodutora',
      t: 'A IA respondeu 800 mensagens em 5 dias e fechou 23 vendas. Não toquei no celular.',
      m: '23 vendas / 5 dias',
      c: E,
    },
    {
      n: 'Ricardo T.',
      r: 'Mentor',
      t: 'Economizei R$1.400/mes. As vendas subiram porque a IA nunca esquece o follow-up.',
      m: 'R$1.400/mes economizados',
      c: colors.semantic.purple,
    },
    {
      n: 'Fernanda L.',
      r: 'E-commerce',
      t: 'Monitorei 3 dias. No terceiro entendi: a IA responde melhor do que eu. Mais rapido, mais consistente.',
      m: 'Conversao +40%',
      c: colors.semantic.success,
    },
  ],

  faqItems: [
    {
      q: 'A IA realmente vende sozinha?',
      a: 'Sim. Analisa contexto, negocia dentro das suas regras, e fecha. Você pode intervir quando quiser.',
    },
    { q: 'Quanto custa?', a: 'R$0/mês. Taxa apenas sobre vendas realizadas.' },
    {
      q: 'Preciso programar?',
      a: 'Não. Cadastre produto, conecte WhatsApp, configure regras.',
    },
    {
      q: 'Como a IA sabe o que responder?',
      a: 'Aprende com o cadastro do produto — preço, benefícios, objeções, limites.',
    },
    {
      q: 'Posso responder manualmente?',
      a: 'Sim. A IA para quando você entra e volta quando você sai.',
    },
    { q: 'É seguro?', a: 'Criptografia ponta a ponta, servidores isolados, LGPD.' },
  ],

  multiChannelFlow: [
    { ch: 'wa', f: 'lead', n: 'Marina C.', text: 'Vi o anuncio, quanto custa?', t: '09:02' },
    { ch: 'ig', f: 'lead', n: 'Pedro A.', text: 'Amei o produto! Como compro?', t: '09:03' },
    {
      ch: 'wa',
      f: 'ai',
      text: 'Ola Marina! R$497 a vista ou 12x. Posso enviar o link?',
      t: '09:02',
    },
    {
      ch: 'em',
      f: 'ai',
      n: 'Email',
      text: 'Assunto: Julia, seu bonus expira hoje — 30% OFF',
      t: '09:04',
    },
    {
      ch: 'ig',
      f: 'ai',
      text: 'Ola Pedro! Acesso vitalício por R$497. Cupom INSTA20 = 20% OFF!',
      t: '09:03',
    },
    { ch: 'wa', f: 'lead', n: 'Marina C.', text: 'Quero sim!', t: '09:05' },
    { ch: 'wa', f: 'ai', text: 'Link: pay.kloel.com/ck/abc — Pix, cartão ou boleto.', t: '09:05' },
    { ch: 'ig', f: 'lead', n: 'Pedro A.', text: 'Me manda o link!', t: '09:06' },
    { ch: 'em', f: 'ai', n: 'Evento', text: 'Julia clicou no link — checkout aberto', t: '09:06' },
    { ch: 'ig', f: 'ai', text: 'pay.kloel.com/ck/pedro — Cupom INSTA20 já aplicado!', t: '09:06' },
    { ch: 'wa', f: 'ok', text: 'Pagamento confirmado — R$397 via Pix', t: '09:08' },
    { ch: 'ig', f: 'ok', text: 'Pagamento confirmado — R$397,60 via cartão', t: '09:09' },
    { ch: 'em', f: 'ok', text: 'Pagamento confirmado — R$347,90 via Pix', t: '09:10' },
  ],
};
