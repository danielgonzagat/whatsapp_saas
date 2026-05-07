import { colors } from '@/lib/design-tokens';

export type ChannelKey = 'whatsapp' | 'instagram' | 'facebook' | 'email' | 'tiktok';

export interface ChannelConnection {
  connected?: boolean;
  status?: string;
  authUrl?: string;
  phoneNumberId?: string | null;
  whatsappBusinessId?: string | null;
  phoneNumber?: string | null;
  pageName?: string | null;
  pageId?: string | null;
  username?: string | null;
  instagramAccountId?: string | null;
}

export interface ConnectStatus {
  channels?: {
    whatsapp?: ChannelConnection;
    instagram?: ChannelConnection;
    facebook?: ChannelConnection;
    email?: ChannelConnection & {
      provider?: string;
      providerAvailable?: boolean;
      fromEmail?: string;
      fromName?: string;
    };
  };
}

export interface TikTokStatus {
  connected?: boolean;
  status?: string;
  kind?: string | null;
  openId?: string | null;
  advertiserIds?: string[];
  expiresAt?: string | null;
  secretConfigured?: boolean;
}

export const CHANNEL_META: Record<
  ChannelKey,
  { label: string; color: string; summary: string; proof: string[]; steps: string[] }
> = {
  whatsapp: {
    label: 'WhatsApp',
    color: colors.ember.primary,
    summary: 'Conecte o WABA e o número do cliente pelo Embedded Signup oficial da Meta.',
    proof: ['Conta comercial', 'Número próprio', 'Envio e respostas automáticas'],
    steps: [
      'Abrir Embedded Signup oficial da Meta',
      'Selecionar ou criar WABA e número do cliente',
      'Voltar para o KLOEL com WhatsApp ativo',
    ],
  },
  instagram: {
    label: 'Instagram Direct',
    color: colors.ember.primary,
    summary: 'Conecte a conta Meta com Instagram Business para operar Direct e comentários.',
    proof: ['Instagram Business', 'Permissões de mensagens', 'Perfil e insights reais'],
    steps: [
      'Abrir login oficial da Meta',
      'Selecionar a Page com Instagram Business vinculado',
      'Voltar para o KLOEL com Direct e comentários autorizados',
    ],
  },
  facebook: {
    label: 'Messenger Facebook',
    color: colors.ember.primary,
    summary: 'Conecte a Page Meta para automatizar conversas do Messenger.',
    proof: ['Página vinculada', 'Caixa de entrada autorizada', 'Messenger ativo'],
    steps: [
      'Abrir login oficial da Meta',
      'Selecionar a Page do cliente',
      'Voltar para o KLOEL com Messenger autorizado',
    ],
  },
  email: {
    label: 'Email',
    color: colors.text.silver,
    summary: 'Ative o canal configurado para enviar testes e campanhas.',
    proof: ['Canal de envio', 'Remetente configurado', 'Envio de teste'],
    steps: [
      'Validar canal de envio',
      'Ativar o canal de email do workspace',
      'Enviar teste real para confirmar entrega',
    ],
  },
  tiktok: {
    label: 'TikTok',
    color: colors.ember.primary,
    summary: 'Conecte creator e advertiser pelos fluxos oficiais do TikTok.',
    proof: ['Creator OAuth', 'Advertiser OAuth', 'Tokens salvos no workspace'],
    steps: [
      'Conectar a conta TikTok do usuário',
      'Conectar a conta comercial autorizada',
      'Voltar para o KLOEL com tokens do workspace salvos',
    ],
  },
};

export function trustedExternalUrl(value: string, allowedHosts: string[]) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && allowedHosts.includes(url.hostname);
  } catch {
    return false;
  }
}

export function statusText(connected?: boolean, status?: string) {
  if (connected) {
    return 'Conectado';
  }
  return status === 'server_not_configured' ? 'Configuração pendente' : 'Desconectado';
}
