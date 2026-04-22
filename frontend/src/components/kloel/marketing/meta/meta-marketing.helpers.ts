import type { ReactNode } from 'react';

export type MetaMarketingChannelKey = 'whatsapp' | 'instagram' | 'facebook';

export interface ChannelRealData {
  messages: number;
  leads: number;
  sales: number;
  status: string;
}

export interface MarketingConnectStatus {
  meta?: {
    connected?: boolean;
    tokenExpired?: boolean;
    pageName?: string | null;
    pageId?: string | null;
    instagramUsername?: string | null;
    updatedAt?: string | null;
  };
  channels?: {
    whatsapp?: {
      provider?: string;
      connected?: boolean;
      status?: string;
      authUrl?: string;
      phoneNumberId?: string | null;
      whatsappBusinessId?: string | null;
      phoneNumber?: string | null;
      pushName?: string | null;
      degradedReason?: string | null;
    };
    instagram?: {
      connected?: boolean;
      status?: string;
      authUrl?: string;
      instagramAccountId?: string | null;
      username?: string | null;
      pageName?: string | null;
    };
    facebook?: {
      connected?: boolean;
      status?: string;
      authUrl?: string;
      pageId?: string | null;
      pageName?: string | null;
    };
  };
}

export interface MetaLiveFeedMessage {
  id?: string;
  content?: string;
  direction?: string;
  type?: string;
  channel?: string;
  contactName?: string;
  createdAt?: string;
  status?: string;
}

export interface InstagramProfileData {
  username?: string;
  name?: string;
  followers?: number;
  followersCount?: number;
  followers_count?: number;
  posts?: number;
  mediaCount?: number;
  media_count?: number;
  bio?: string;
}

export interface InstagramInsightsData {
  impressions?: number;
  reach?: number;
  engagement?: number;
  follower_count?: number;
  followersCount?: number;
}

export interface MetaMarketingTabItem {
  id: 'conversas' | 'whatsapp' | 'instagram' | 'facebook' | 'email' | 'tiktok';
  href: string;
  label: string;
  icon: ReactNode;
}

export const MARKETING_META_TABS: readonly MetaMarketingTabItem[] = [
  { id: 'conversas', href: '/marketing', label: 'Conversas', icon: 'AI' },
  { id: 'whatsapp', href: '/marketing/whatsapp', label: 'WhatsApp', icon: 'WA' },
  { id: 'instagram', href: '/marketing/instagram', label: 'Instagram', icon: 'IG' },
  { id: 'facebook', href: '/marketing/facebook', label: 'Messenger', icon: 'FB' },
  { id: 'email', href: '/marketing/email', label: 'Email', icon: 'EM' },
  { id: 'tiktok', href: '/marketing/tiktok', label: 'TikTok', icon: 'TT' },
] as const;

export function compactNumber(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return `${value}`;
}

export function formatStatusLabel(status?: string | null, connected?: boolean): string {
  const normalized = String(status || '')
    .trim()
    .toLowerCase();

  if (connected || normalized === 'connected') return 'Conectado';
  if (normalized === 'connection_incomplete') return 'Vínculo incompleto';
  if (normalized === 'connecting') return 'Conectando';
  if (normalized === 'permission_missing') return 'Permissão pendente';
  if (normalized === 'token_expired') return 'Token expirado';
  if (normalized === 'callback_failed') return 'Callback falhou';
  if (normalized === 'degraded') return 'Degradado';
  if (normalized === 'disconnected') return 'Desconectado';
  return normalized ? normalized.replace(/_/g, ' ') : 'Desconectado';
}

export function filterFeedByChannel(
  messages: MetaLiveFeedMessage[],
  channel: MetaMarketingChannelKey,
): MetaLiveFeedMessage[] {
  const expected =
    channel === 'facebook'
      ? 'MESSENGER'
      : channel === 'instagram'
        ? 'INSTAGRAM'
        : 'WHATSAPP';

  return messages.filter((message) => String(message.channel || '').toUpperCase() === expected);
}

export function formatFeedTimestamp(value?: string): string {
  if (!value) return 'agora';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'agora';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

export function toChannelData(
  realChannels: Record<string, ChannelRealData>,
  channel: MetaMarketingChannelKey,
): ChannelRealData {
  const mapping: Record<MetaMarketingChannelKey, string> = {
    whatsapp: 'WHATSAPP',
    instagram: 'INSTAGRAM',
    facebook: 'FACEBOOK',
  };

  return (
    realChannels[mapping[channel]] || {
      messages: 0,
      leads: 0,
      sales: 0,
      status: 'disconnected',
    }
  );
}
