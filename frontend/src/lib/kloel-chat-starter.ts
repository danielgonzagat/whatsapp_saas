'use client';

export type KloelStarterSurface = 'landing' | 'dashboard';

export type KloelStarterActionKind =
  | 'send_prompt'
  | 'connect_whatsapp'
  | 'open_auth_signup'
  | 'open_auth_login';

export interface KloelStarterAction {
  id: string;
  label: string;
  kind: KloelStarterActionKind;
  prompt?: string;
}

export interface KloelStarterConfig {
  greeting: string;
  placeholder: string;
  suggestedPrompts: string[];
  quickActions: KloelStarterAction[];
  ctaLabel?: string;
}

export interface KloelStarterOptions {
  surface: KloelStarterSurface;
  isAuthenticated?: boolean;
  isWhatsAppConnected?: boolean;
  justSignedUp?: boolean;
  hasCompletedOnboarding?: boolean;
  userName?: string | null;
}

function firstName(value?: string | null): string {
  return (
    String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)[0] || ''
  );
}

const LANDING_PROMPTS = [
  'Vendo um infoproduto de R$497 no WhatsApp. Como você fecharia isso?',
  'Tenho leads frios e carrinhos abertos. Como você recupera isso sem equipe?',
  'Vendo consultoria high-ticket. Como você qualifica sem parecer robô?',
];

const DASHBOARD_DISCONNECTED_PROMPTS = [
  'Quero conectar meu WhatsApp agora.',
  'Antes de conectar, me explique como você vai vender por mim.',
  'Vou te explicar minha oferta antes de ligar o WhatsApp.',
];

const DASHBOARD_CONNECTED_PROMPTS = [
  'Analise minha operação e me diga a próxima melhor ação.',
  'Crie um follow-up para leads que esfriaram.',
  'Me ajude a responder uma objeção de preço agora.',
];

export function getKloelStarterConfig(options: KloelStarterOptions): KloelStarterConfig {
  const name = firstName(options.userName);
  const signedGreeting = name ? `, ${name}` : '';

  if (options.surface === 'landing') {
    return {
      greeting:
        'Eu sou o Kloel. Me diga o que você vende, ticket e canal principal que eu te mostro como eu operaria essa venda e qual seria o próximo passo para ligar a máquina.',
      placeholder: 'Descreva sua oferta ou peça um exemplo real de abordagem…',
      suggestedPrompts: LANDING_PROMPTS,
      quickActions: [],
      ctaLabel: 'Criar conta e ligar meu WhatsApp',
    };
  }

  if (!options.isAuthenticated) {
    return {
      greeting:
        'Eu sou o Kloel. Posso te mostrar uma abordagem comercial real agora e, quando fizer sentido, você cria a conta para ligar a operação.',
      placeholder: 'Descreva sua oferta ou peça uma abordagem real de venda…',
      suggestedPrompts: LANDING_PROMPTS,
      quickActions: [
        {
          id: 'open-auth-signup',
          label: 'Criar conta grátis',
          kind: 'open_auth_signup',
        },
        {
          id: 'show-demo',
          label: 'Quero ver uma abordagem real',
          kind: 'send_prompt',
          prompt: LANDING_PROMPTS[0],
        },
      ],
      ctaLabel: 'Criar conta e ligar meu WhatsApp',
    };
  }

  if (!options.isWhatsAppConnected) {
    const isNewlyActivated = options.justSignedUp || !options.hasCompletedOnboarding;

    return {
      greeting: isNewlyActivated
        ? `Perfeito${signedGreeting}. Agora vamos ligar sua operação. O primeiro marco é conectar seu WhatsApp para eu responder, qualificar e vender por você. Se quiser, eu te guio agora.`
        : `Seu próximo ganho real está aqui${signedGreeting}: conectar o WhatsApp para eu operar sua entrada comercial ao vivo. Se quiser, eu puxo isso com você agora.`,
      placeholder: 'Peça para eu ligar seu WhatsApp ou me diga o que você vende…',
      suggestedPrompts: DASHBOARD_DISCONNECTED_PROMPTS,
      quickActions: [
        {
          id: 'connect-whatsapp',
          label: 'Conectar WhatsApp agora',
          kind: 'connect_whatsapp',
        },
        {
          id: 'show-activation-strategy',
          label: 'Como você vai vender por mim?',
          kind: 'send_prompt',
          prompt: 'Antes de conectar, me explique como você vai vender por mim.',
        },
        {
          id: 'teach-offer',
          label: 'Vou te explicar minha oferta',
          kind: 'send_prompt',
          prompt:
            'Vou te explicar minha oferta antes de ligar o WhatsApp. Quero que você entenda ticket, objeções e promessa.',
        },
      ],
    };
  }

  return {
    greeting: `Tudo certo${signedGreeting}. Seu Kloel está pronto. Me diga o que você quer que eu faça agora e eu puxo a próxima melhor ação comercial.`,
    placeholder: 'Peça uma ação, análise ou resposta comercial…',
    suggestedPrompts: DASHBOARD_CONNECTED_PROMPTS,
    quickActions: [
      {
        id: 'diagnose-operation',
        label: 'Diagnosticar operação',
        kind: 'send_prompt',
        prompt: 'Analise minha operação e me diga a próxima melhor ação.',
      },
      {
        id: 'create-followup',
        label: 'Criar follow-up',
        kind: 'send_prompt',
        prompt: 'Crie um follow-up para leads que esfriaram.',
      },
      {
        id: 'answer-objection',
        label: 'Responder objeção',
        kind: 'send_prompt',
        prompt: 'Me ajude a responder uma objeção de preço agora.',
      },
    ],
  };
}
