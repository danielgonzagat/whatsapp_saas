export interface ChannelAvailability {
  blocked: boolean;
  title: string | null;
  description: string | null;
}

const CHANNEL_AVAILABILITY: Record<string, ChannelAvailability> = {
  whatsapp: { blocked: false, title: null, description: null },
  instagram: { blocked: false, title: null, description: null },
  facebook: { blocked: false, title: null, description: null },
  email: { blocked: false, title: null, description: null },
  tiktok: {
    blocked: true,
    title: 'Em breve',
    description: 'TikTok Marketing está sendo finalizado.',
  },
};

export function getChannelAvailability(channelKey: string): ChannelAvailability {
  return CHANNEL_AVAILABILITY[channelKey] || { blocked: false, title: null, description: null };
}
