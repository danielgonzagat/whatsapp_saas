'use client';

export type KloelStarterSurface = 'landing' | 'dashboard';

export type KloelStarterActionKind =
  | 'send_prompt'
  | 'connect_whatsapp'
  | 'open_whatsapp_panel'
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
  whatsAppStatus?: string | null;
  whatsAppDegradedReason?: string | null;
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
  'Quero conectar meu WhatsApp via Meta oficial agora.',
  'Me explique o que acontece depois que eu conectar a Meta.',
  'Vou te explicar minha oferta antes de ligar a operação.',
];

const DASHBOARD_CONNECTED_PROMPTS = [
  'Analise minha operação e me diga a próxima melhor ação.',
  'Crie um follow-up para leads que esfriaram hoje.',
  'Me ajude a responder a objeção que mais trava minhas vendas.',
];

export function getKloelStarterConfig(options: KloelStarterOptions): KloelStarterConfig {
  const name = firstName(options.userName);
  const signedGreeting = name ? `, ${name}` : '';
  const normalizedStatus = String(options.whatsAppStatus || '')
    .trim()
    .toLowerCase();
  const degradedReason = String(options.whatsAppDegradedReason || '').trim();

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
    const isConnectionIncomplete = normalizedStatus === 'connection_incomplete';
    const disconnectedGreeting = isConnectionIncomplete
      ? `Sua conexão oficial da Meta ainda não foi concluída${signedGreeting}. Vamos retomar isso agora para eu assumir seu WhatsApp pelo canal oficial, sem runtime legado nem improviso.`
      : degradedReason
        ? `Seu canal oficial precisa de atenção${signedGreeting}. ${degradedReason} Se quiser, eu abro a conexão da Meta e te acompanho até o canal voltar ao ar.`
        : isNewlyActivated
          ? `Perfeito${signedGreeting}. Agora vamos ligar sua operação. O primeiro marco é conectar seu WhatsApp oficial na Meta para eu responder, qualificar e vender por você. Se quiser, eu te guio agora.`
          : `Seu próximo ganho real está aqui${signedGreeting}: conectar o WhatsApp oficial da Meta para eu operar sua entrada comercial ao vivo. Se quiser, eu puxo isso com você agora.`;

    return {
      greeting: disconnectedGreeting,
      placeholder: 'Peça para eu ligar sua Meta oficial ou me diga o que você vende…',
      suggestedPrompts: DASHBOARD_DISCONNECTED_PROMPTS,
      quickActions: [
        {
          id: 'connect-whatsapp',
          label: 'Conectar WhatsApp oficial',
          kind: 'connect_whatsapp',
        },
        {
          id: 'show-activation-strategy',
          label: 'O que acontece depois?',
          kind: 'send_prompt',
          prompt: 'Me explique o que acontece depois que eu conectar a Meta.',
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
    greeting: degradedReason
      ? `Seu canal oficial está conectado${signedGreeting}, mas precisa de atenção. ${degradedReason} Posso revisar o canal agora ou seguir operando sua próxima ação comercial.`
      : `Tudo certo${signedGreeting}. Seu canal oficial está pronto. Me diga o que você quer que eu opere agora e eu puxo a próxima melhor ação comercial.`,
    placeholder: 'Peça uma ação, análise, follow-up ou revisão do canal oficial…',
    suggestedPrompts: DASHBOARD_CONNECTED_PROMPTS,
    quickActions: [
      {
        id: 'diagnose-operation',
        label: 'Diagnosticar operação',
        kind: 'send_prompt',
        prompt: 'Analise minha operação e me diga a próxima melhor ação.',
      },
      {
        id: 'review-whatsapp-panel',
        label: 'Revisar canal oficial',
        kind: 'open_whatsapp_panel',
      },
      {
        id: 'answer-objection',
        label: 'Responder objeção',
        kind: 'send_prompt',
        prompt: 'Me ajude a responder a objeção que mais trava minhas vendas.',
      },
    ],
  };
}
