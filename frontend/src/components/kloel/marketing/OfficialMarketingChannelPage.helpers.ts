export type ChannelKey = 'whatsapp' | 'instagram' | 'facebook' | 'tiktok' | 'google-ads' | 'email';

export interface ChannelConnectionStatus {
  connected?: boolean;
  status?: string | null;
  [key: string]: unknown;
}

export interface ConnectStatus {
  channels?: Partial<Record<ChannelKey, ChannelConnectionStatus>>;
  [key: string]: unknown;
}

export interface TikTokStatus {
  connected?: boolean;
  status?: string | null;
  [key: string]: unknown;
}

export interface GoogleAdsStatus {
  connected?: boolean;
  status?: string | null;
  customerIds?: string[];
  loginCustomerId?: string | null;
  expiresAt?: string | null;
  clientConfigured?: boolean;
  secretConfigured?: boolean;
  developerTokenConfigured?: boolean;
  apiVersion?: string;
  [key: string]: unknown;
}

export type TikTokMode = 'sell' | 'listen' | 'blocked';

export interface TikTokModeData {
  mode: TikTokMode;
  details: {
    clientConfigured: boolean;
    secretConfigured: boolean;
    outboundApproved: boolean;
    tokenValid: boolean;
    recentOutbound: boolean;
    missingVariables: string[];
    requiredSteps: string[];
  };
}

interface ChannelMeta {
  label: string;
  summary: string;
  color: string;
  proof: string[];
}

const CHANNEL_COLORS: Record<ChannelKey, string> = {
  whatsapp: 'rgb(37, 211, 102)',
  instagram: 'rgb(225, 48, 108)',
  facebook: 'rgb(24, 119, 242)',
  tiktok: 'rgb(0, 0, 0)',
  'google-ads': 'rgb(251, 188, 4)',
  email: 'rgb(234, 67, 53)',
};

const CHANNEL_SUMMARIES: Record<ChannelKey, string> = {
  whatsapp: 'Gerencie conversas, automatize respostas e escale vendas pelo WhatsApp.',
  instagram: 'Conecte seu Instagram para responder DMs e automatizar interações.',
  facebook: 'Integre sua página do Facebook para gerenciar mensagens do Messenger.',
  tiktok: 'Conecte o TikTok for Business para unificar dados de campanha.',
  'google-ads': 'Conecte Google Ads para ler contas, campanhas e métricas do workspace.',
  email: 'Configure seu email para campanhas automatizadas de marketing.',
};

const CHANNEL_PROOFS: Record<ChannelKey, string[]> = {
  whatsapp: ['Mensagens ilimitadas', 'Respostas automáticas', 'Integração oficial'],
  instagram: ['DMs automatizadas', 'Métricas de engajamento', 'Integração oficial'],
  facebook: ['Chat no Messenger', 'Automação de respostas', 'Integração oficial'],
  tiktok: ['Campanhas integradas', 'Dados unificados', 'Conexão oficial'],
  'google-ads': ['OAuth oficial', 'Contas acessíveis', 'Campanhas em leitura'],
  email: ['Campanhas automáticas', 'Métricas de abertura', 'Integração SMTP'],
};

export const CHANNEL_META: Record<ChannelKey, ChannelMeta> = {
  whatsapp: {
    label: 'WhatsApp',
    summary: CHANNEL_SUMMARIES.whatsapp,
    color: CHANNEL_COLORS.whatsapp,
    proof: CHANNEL_PROOFS.whatsapp,
  },
  instagram: {
    label: 'Instagram',
    summary: CHANNEL_SUMMARIES.instagram,
    color: CHANNEL_COLORS.instagram,
    proof: CHANNEL_PROOFS.instagram,
  },
  facebook: {
    label: 'Facebook',
    summary: CHANNEL_SUMMARIES.facebook,
    color: CHANNEL_COLORS.facebook,
    proof: CHANNEL_PROOFS.facebook,
  },
  tiktok: {
    label: 'TikTok',
    summary: CHANNEL_SUMMARIES.tiktok,
    color: CHANNEL_COLORS.tiktok,
    proof: CHANNEL_PROOFS.tiktok,
  },
  'google-ads': {
    label: 'Google Ads',
    summary: CHANNEL_SUMMARIES['google-ads'],
    color: CHANNEL_COLORS['google-ads'],
    proof: CHANNEL_PROOFS['google-ads'],
  },
  email: {
    label: 'Email',
    summary: CHANNEL_SUMMARIES.email,
    color: CHANNEL_COLORS.email,
    proof: CHANNEL_PROOFS.email,
  },
};

export function statusText(connected?: boolean, status?: string | null): string {
  if (connected) {
    return 'Conectado';
  }
  if (status === 'server_not_configured') {
    return 'Indisponível';
  }
  if (status === 'unavailable') {
    return 'Indisponível';
  }
  return 'Desconectado';
}

export function trustedExternalUrl(url: string, hosts: string[]): boolean {
  try {
    const parsed = new URL(url);
    return hosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host));
  } catch {
    return false;
  }
}
