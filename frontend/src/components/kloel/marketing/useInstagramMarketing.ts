'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';
import type {
  MarketingConnectStatus,
  IgProfileData,
  IgInsightsData,
  InstagramChannelConnection,
} from './MarketingTypes';
import type { IgAccount, IgPostData, IgInsightData } from '@/lib/api/meta';

export interface UseInstagramMarketingReturn {
  igProfile: IgProfileData | null;
  igInsights: IgInsightsData | null;
  connection: InstagramChannelConnection | undefined;
  isConnected: boolean;
  accounts: IgAccount[];
  accountsLoading: boolean;
  posts: IgPostData[];
  postsTotal: number;
  postsLoading: boolean;
  postsError: string | undefined;
  insightsHistory: IgInsightData[];
  insightsHistoryLoading: boolean;
  publishPost: (imageUrl: string, caption?: string) => Promise<{
    post?: IgPostData | undefined;
    error?: string | undefined;
  }>;
  refreshPosts: () => void;
  refreshInsights: () => void;
}

export function useInstagramMarketing(
  connectionStatus?: MarketingConnectStatus | null,
): UseInstagramMarketingReturn {
  const isConnected = connectionStatus?.channels?.instagram?.connected === true;

  const { data: igProfile } = useSWR<IgProfileData>(
    isConnected ? '/meta/instagram/profile' : null,
    swrFetcher,
  );

  const { data: igInsights } = useSWR<IgInsightsData>(
    isConnected ? '/meta/instagram/insights/account' : null,
    swrFetcher,
  );

  const {
    data: accountsData,
    isLoading: accountsLoading,
  } = useSWR<{ accounts: IgAccount[] }>(
    '/marketing/instagram/accounts',
    swrFetcher,
    { refreshInterval: 120_000 },
  );

  const {
    data: postsData,
    error: postsError,
    isLoading: postsLoading,
    mutate: refreshPosts,
  } = useSWR<{ posts: IgPostData[]; total: number }>(
    '/marketing/instagram/posts?limit=50&offset=0',
    swrFetcher,
    { refreshInterval: 60_000 },
  );

  const {
    data: insightsHistoryData,
    isLoading: insightsHistoryLoading,
    mutate: refreshInsights,
  } = useSWR<{ insights: IgInsightData[] }>(
    isConnected ? '/marketing/instagram/insights/history' : null,
    swrFetcher,
    { refreshInterval: 120_000 },
  );

  const publishPost = async (imageUrl: string, caption?: string) => {
    const res = await apiFetch<{
      post: IgPostData;
      metaResponse: Record<string, unknown>;
    }>('/marketing/instagram/posts', {
      method: 'POST',
      body: { imageUrl, caption },
    });
    if (res.error) {
      return { error: res.error };
    }
    await refreshPosts();
    return { post: res.data?.post };
  };

  return {
    igProfile: igProfile ?? null,
    igInsights: igInsights ?? null,
    connection: connectionStatus?.channels?.instagram,
    isConnected,
    accounts: accountsData?.accounts ?? [],
    accountsLoading,
    posts: postsData?.posts ?? [],
    postsTotal: postsData?.total ?? 0,
    postsLoading,
    postsError: postsError?.message ?? undefined,
    insightsHistory: insightsHistoryData?.insights ?? [],
    insightsHistoryLoading,
    publishPost,
    refreshPosts,
    refreshInsights,
  };
}
