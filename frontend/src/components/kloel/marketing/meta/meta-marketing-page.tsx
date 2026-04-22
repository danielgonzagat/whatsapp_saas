'use client';

import { useMarketingChannels, useMarketingLiveFeed } from '@/hooks/useMarketing';
import { apiFetch } from '@/lib/api';
import { swrFetcher } from '@/lib/fetcher';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { FacebookMetaMarketingSurface } from './meta-marketing-facebook';
import {
  type InstagramInsightsData,
  type InstagramProfileData,
  type MarketingConnectStatus,
  type MetaMarketingChannelKey,
  filterFeedByChannel,
  toChannelData,
} from './meta-marketing.helpers';
import { InstagramMetaMarketingSurface } from './meta-marketing-instagram';
import { MetaMarketingShell } from './meta-marketing-shell';
import { WhatsAppMetaMarketingSurface } from './meta-marketing-whatsapp';

const COPY: Record<MetaMarketingChannelKey, { eyebrow: string; title: string; description: string }> =
  {
    whatsapp: {
      eyebrow: 'Marketing / WhatsApp',
      title: 'WhatsApp oficial em produção',
      description:
        'Esta superfície usa exclusivamente o vínculo oficial da Meta para o canal do workspace. O objetivo aqui é mostrar o estado real, o asset real e o próximo passo real.',
    },
    instagram: {
      eyebrow: 'Marketing / Instagram',
      title: 'Instagram Direct oficial',
      description:
        'Conexão oficial Meta, sem placeholder e sem “Em breve”. A tela mostra o que realmente foi vinculado para este workspace e o que ainda depende de ativo ou permissão externa.',
    },
    facebook: {
      eyebrow: 'Marketing / Facebook',
      title: 'Facebook Messenger oficial',
      description:
        'Page binding, status real e operação honesta do Messenger. Nada de dead-end visual nem sucesso inventado.',
    },
  };

export default function MetaMarketingPage({ channel }: { channel: MetaMarketingChannelKey }) {
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [bannerOverride, setBannerOverride] = useState<string | null>(null);

  const { channels } = useMarketingChannels();
  const { messages, mutate: mutateFeed } = useMarketingLiveFeed();
  const { data: connectionStatus, mutate: mutateConnectionStatus } = useSWR<MarketingConnectStatus>(
    '/marketing/connect/status',
    swrFetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const { data: instagramProfile, mutate: mutateInstagramProfile } = useSWR<InstagramProfileData>(
    channel === 'instagram' && connectionStatus?.channels?.instagram?.connected
      ? '/meta/instagram/profile'
      : null,
    swrFetcher,
  );

  const { data: instagramInsights, mutate: mutateInstagramInsights } =
    useSWR<InstagramInsightsData>(
      channel === 'instagram' && connectionStatus?.channels?.instagram?.connected
        ? '/meta/instagram/insights/account'
        : null,
      swrFetcher,
    );

  const banner = useMemo(() => {
    if (bannerOverride) return bannerOverride;
    const meta = searchParams?.get('meta');
    const reason = searchParams?.get('reason');

    if (meta === 'success') {
      return 'Conta Meta conectada com sucesso e retornada para a aba certa do Marketing.';
    }

    if (meta === 'error') {
      return `Falha na conexão Meta${reason ? `: ${reason}` : '.'}`;
    }

    return null;
  }, [bannerOverride, searchParams]);

  const refreshAll = useCallback(async () => {
    setBusy('refresh');
    setBannerOverride(null);
    try {
      await Promise.all([
        mutateConnectionStatus(),
        mutateFeed(),
        mutateInstagramProfile(),
        mutateInstagramInsights(),
      ]);
    } finally {
      setBusy(null);
    }
  }, [mutateConnectionStatus, mutateFeed, mutateInstagramInsights, mutateInstagramProfile]);

  const connect = useCallback(async () => {
    setBusy('connect');
    setBannerOverride(null);
    try {
      const response = await apiFetch<{ url?: string }>(
        `/meta/auth/url?channel=${channel}&returnTo=/marketing/${channel}`,
      );
      const url = String(response.data?.url || '').trim();
      if (!url) {
        throw new Error('Nao foi possivel gerar a URL oficial da Meta.');
      }
      window.location.href = url;
    } catch (error: unknown) {
      setBannerOverride(error instanceof Error ? error.message : 'Falha ao iniciar a Meta.');
      setBusy(null);
    }
  }, [channel]);

  const disconnect = useCallback(async () => {
    setBusy('disconnect');
    setBannerOverride(null);
    try {
      await apiFetch('/meta/auth/disconnect', { method: 'POST' });
      await refreshAll();
      setBannerOverride('Conexão Meta removida deste workspace.');
    } catch (error: unknown) {
      setBannerOverride(error instanceof Error ? error.message : 'Falha ao desconectar a Meta.');
      setBusy(null);
    }
  }, [refreshAll]);

  const channelData = toChannelData(channels, channel);
  const feed = filterFeedByChannel(messages, channel);
  const shellCopy = COPY[channel];

  return (
    <MetaMarketingShell
      eyebrow={shellCopy.eyebrow}
      title={shellCopy.title}
      description={shellCopy.description}
      banner={banner}
    >
      {channel === 'whatsapp' ? (
        <WhatsAppMetaMarketingSurface
          connectionStatus={connectionStatus || null}
          channelData={channelData}
          feed={feed}
          busy={busy}
          onConnect={() => void connect()}
          onDisconnect={() => void disconnect()}
          onRefresh={() => void refreshAll()}
        />
      ) : null}

      {channel === 'instagram' ? (
        <InstagramMetaMarketingSurface
          connectionStatus={connectionStatus || null}
          profile={instagramProfile || null}
          insights={instagramInsights || null}
          channelData={channelData}
          feed={feed}
          busy={busy}
          onConnect={() => void connect()}
          onDisconnect={() => void disconnect()}
          onRefresh={() => void refreshAll()}
        />
      ) : null}

      {channel === 'facebook' ? (
        <FacebookMetaMarketingSurface
          connectionStatus={connectionStatus || null}
          channelData={channelData}
          feed={feed}
          busy={busy}
          onConnect={() => void connect()}
          onDisconnect={() => void disconnect()}
          onRefresh={() => void refreshAll()}
        />
      ) : null}
    </MetaMarketingShell>
  );
}
