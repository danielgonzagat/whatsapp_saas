'use client';
import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';

interface MarketingStats {
  totalMessages: number;
  totalLeads: number;
  totalSales: number;
  totalRevenue: number;
}

interface ChannelData {
  status: string;
  messages: number;
  leads: number;
  sales: number;
}

interface LiveFeedMessage {
  id?: string;
  [key: string]: unknown;
}

interface LiveFeedResponse {
  messages: LiveFeedMessage[];
}

interface ChannelStats {
  channel: string;
  status: string;
  totalMessages: number;
  totalConversations: number;
  openConversations: number;
  responseRate: number;
  conversionRate: number;
}

interface AIBrainData {
  productsLoaded: number;
  activeConversations: number;
  objectionsMapped: number;
  avgResponseTime: string;
  status: string;
  [key: string]: unknown;
}

/** Use marketing stats. */
export function useMarketingStats() {
  const { data, isLoading, error } = useSWR<MarketingStats>('/marketing/stats', swrFetcher, {
    refreshInterval: 30000,
  });
  return {
    stats: data || { totalMessages: 0, totalLeads: 0, totalSales: 0, totalRevenue: 0 },
    isLoading,
    error,
  };
}

/** Use marketing channels. */
export function useMarketingChannels() {
  const { data, isLoading, error } = useSWR<Record<string, ChannelData>>(
    '/marketing/channels',
    swrFetcher,
    { refreshInterval: 30000 },
  );
  return { channels: data || ({} as Record<string, ChannelData>), isLoading, error };
}

/** Use marketing live feed. */
export function useMarketingLiveFeed() {
  const { data, isLoading, error, mutate } = useSWR<LiveFeedResponse>(
    '/marketing/live-feed',
    swrFetcher,
    { refreshInterval: 30000 },
  );
  return { messages: data?.messages || [], isLoading, error, mutate };
}

/** Use channel stats. */
export function useChannelStats(channel: string | null) {
  const { data, isLoading } = useSWR<ChannelStats>(
    channel ? `/marketing/channel/${channel}/stats` : null,
    swrFetcher,
  );
  return { stats: data, isLoading };
}

/** Use ai brain. */
export function useAIBrain() {
  const { data, isLoading, error } = useSWR<AIBrainData>('/marketing/ai-brain', swrFetcher, {
    refreshInterval: 30000,
  });
  return { brain: data || ({} as AIBrainData), isLoading, error };
}
