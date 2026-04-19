export type BillingWorkspaceStatus = 'none' | 'trial' | 'active' | 'expired' | 'suspended';

export interface WhatsAppIntegrationSnapshot {
  connected?: boolean;
  authUrl?: string | null;
  status?: string | null;
  phone?: string | null;
  pushName?: string | null;
}

export interface MetaIntegrationSnapshot {
  connected?: boolean;
  tokenExpired?: boolean;
  pageName?: string | null;
  instagramUsername?: string | null;
  phoneNumber?: string | null;
}

export interface AppsIntegrationCard {
  key: 'whatsapp' | 'meta' | 'billing' | 'crm';
  name: string;
  status: string;
  connected: boolean;
  cta: string;
  target: 'inbox' | 'marketing-whatsapp' | 'anuncios' | 'marketing-meta' | 'billing' | 'crm';
}

function buildWhatsAppStatus(snapshot?: WhatsAppIntegrationSnapshot | null) {
  if (snapshot?.connected) {
    const headline = snapshot.pushName || snapshot.phone || 'WhatsApp oficial ativo';
    return {
      connected: true,
      status:
        headline === 'WhatsApp oficial ativo'
          ? headline
          : `WhatsApp oficial ativo • ${headline}`,
      cta: 'Abrir inbox',
      target: 'inbox' as const,
    };
  }

  const rawStatus = String(snapshot?.status || '')
    .trim()
    .toLowerCase();
  const isPending = rawStatus === 'connection_incomplete' || rawStatus === 'connecting';

  if (snapshot?.authUrl || isPending) {
    return {
      connected: false,
      status: 'Conexão pendente',
      cta: 'Concluir conexão',
      target: 'marketing-whatsapp' as const,
    };
  }

  return {
    connected: false,
    status: 'Desconectado',
    cta: 'Conectar canal',
    target: 'marketing-whatsapp' as const,
  };
}

function buildMetaStatus(snapshot?: MetaIntegrationSnapshot | null) {
  if (snapshot?.tokenExpired) {
    return {
      connected: false,
      status: 'Token expirado',
      cta: 'Reconectar Meta',
      target: 'marketing-meta' as const,
    };
  }

  if (snapshot?.connected) {
    const detail = [snapshot.pageName, snapshot.instagramUsername ? `@${snapshot.instagramUsername}` : null, snapshot.phoneNumber]
      .filter(Boolean)
      .join(' • ');
    return {
      connected: true,
      status: detail || 'Ativo',
      cta: 'Abrir anúncios',
      target: 'anuncios' as const,
    };
  }

  return {
    connected: false,
    status: 'Desconectado',
    cta: 'Conectar Meta',
    target: 'marketing-meta' as const,
  };
}

function buildBillingStatus(subscriptionStatus: BillingWorkspaceStatus, creditsBalance: number) {
  switch (subscriptionStatus) {
    case 'active':
      return {
        connected: true,
        status: creditsBalance > 0 ? `Plano ativo • ${creditsBalance} créditos` : 'Plano ativo',
        cta: 'Abrir billing',
        target: 'billing' as const,
      };
    case 'trial':
      return {
        connected: true,
        status: creditsBalance > 0 ? `Trial ativo • ${creditsBalance} créditos` : 'Trial ativo',
        cta: 'Abrir billing',
        target: 'billing' as const,
      };
    case 'expired':
      return {
        connected: false,
        status: 'Plano expirado',
        cta: 'Regularizar plano',
        target: 'billing' as const,
      };
    case 'suspended':
      return {
        connected: false,
        status: 'Plano suspenso',
        cta: 'Revisar billing',
        target: 'billing' as const,
      };
    default:
      return {
        connected: false,
        status: 'Sem plano ativo',
        cta: 'Escolher plano',
        target: 'billing' as const,
      };
  }
}

export function buildAppsIntegrationCards(input: {
  whatsapp?: WhatsAppIntegrationSnapshot | null;
  meta?: MetaIntegrationSnapshot | null;
  subscriptionStatus: BillingWorkspaceStatus;
  creditsBalance: number;
}): AppsIntegrationCard[] {
  const whatsapp = buildWhatsAppStatus(input.whatsapp);
  const meta = buildMetaStatus(input.meta);
  const billing = buildBillingStatus(input.subscriptionStatus, input.creditsBalance);

  return [
    {
      key: 'whatsapp',
      name: 'WhatsApp e Inbox',
      status: whatsapp.status,
      connected: whatsapp.connected,
      cta: whatsapp.cta,
      target: whatsapp.target,
    },
    {
      key: 'meta',
      name: 'Meta Platform',
      status: meta.status,
      connected: meta.connected,
      cta: meta.cta,
      target: meta.target,
    },
    {
      key: 'billing',
      name: 'Plano e cobrança Kloel',
      status: billing.status,
      connected: billing.connected,
      cta: billing.cta,
      target: billing.target,
    },
    {
      key: 'crm',
      name: 'CRM e analytics',
      status: 'Disponível',
      connected: true,
      cta: 'Abrir configurações',
      target: 'crm',
    },
  ];
}
