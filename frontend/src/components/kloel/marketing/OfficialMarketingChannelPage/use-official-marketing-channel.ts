import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { apiFetch } from '@/lib/api';
import {
  addChannelArsenal,
  completeChannelSetup,
  getChannelSetup,
  saveChannelConfig,
  saveChannelProducts,
  type ChannelSetupArsenal,
  type ChannelSetupState,
} from '@/lib/api/channel-setup';
import {
  type ChannelConnectionStatus,
  type ChannelKey,
  type ConnectStatus,
  type TikTokStatus,
  type GoogleAdsStatus,
  type TikTokModeData,
  statusText,
  trustedExternalUrl,
} from '../OfficialMarketingChannelPage.helpers';
import {
  type ProductOption,
  type ChannelSetup,
  DEFAULT_SETUP,
  normalizeSetup,
  normalizeProduct,
} from './use-official-marketing-channel.helpers';
export type { ProductOption, ChannelSetup };
interface UseOfficialMarketingChannelOptions {
  channel: ChannelKey;
  initialStep?: number | undefined;
}
function readConnectChannelStatus(
  currentStatus: ConnectStatus | null,
  channel: ChannelKey,
): ChannelConnectionStatus | null {
  const channels = currentStatus?.channels as
    | Partial<Record<ChannelKey, ChannelConnectionStatus>>
    | undefined;
  return channels?.[channel] || null;
}
function serializeChannelArsenal(asset: ChannelSetupArsenal): string {
  const originalName =
    typeof asset.metadata?.originalName === 'string' ? asset.metadata.originalName : '';
  const description = asset.label?.trim() || originalName || asset.storageRef;
  return JSON.stringify({
    assetId: asset.assetId,
    description,
    productId: '',
    storageRef: asset.storageRef,
    type: asset.type,
    uploadedAt: asset.uploadedAt || '',
  });
}

function readSetupStringValue(value: unknown, keys: string[], fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return fallback;
}

function mergeRealChannelSetup(base: ChannelSetup, realSetup: ChannelSetupState | null): ChannelSetup {
  if (!realSetup) {
    return base;
  }
  const realStep = Number(realSetup.setup?.currentStep);
  const realConfig = realSetup.config;
  return {
    ...base,
    currentStep: Number.isInteger(realStep)
      ? Math.max(base.currentStep, Math.min(3, Math.max(0, realStep)))
      : base.currentStep,
    selectedProductIds: realSetup.selectedProductIds,
    arsenal: realSetup.arsenal.map(serializeChannelArsenal),
    config: realConfig
      ? {
          ...base.config,
          tone: realConfig.tone || base.config.tone,
          aggressiveness: realConfig.aggressiveness || base.config.aggressiveness,
          workingHours: readSetupStringValue(realConfig.businessHours, ['display', 'value', 'raw'], base.config.workingHours),
          followUpEnabled: realConfig.followupEnabled,
          proactiveDailyLimit: realConfig.dailyMessageLimit,
          language: realConfig.language || base.config.language,
          handoffCriteria: readSetupStringValue(realConfig.transferCriteria, ['display', 'criteria', 'value', 'raw'], base.config.handoffCriteria),
        }
      : base.config,
  };
}

function toRealChannelConfig(config: ChannelSetup['config']): Record<string, unknown> {
  return {
    tone: config.tone,
    aggressiveness: config.aggressiveness,
    businessHours: { display: config.workingHours },
    followupEnabled: config.followUpEnabled,
    dailyMessageLimit: config.proactiveDailyLimit,
    transferCriteria: { display: config.handoffCriteria },
    language: config.language,
  };
}

function inferArsenalType(file: File): string {
  const mime = file.type.toLowerCase();
  if (mime.startsWith('image/')) {
    return 'image';
  }
  if (mime.startsWith('audio/')) {
    return 'audio';
  }
  if (mime.startsWith('video/')) {
    return 'video';
  }
  if (mime === 'text/plain' || mime === 'text/csv') {
    return 'text';
  }
  return 'document';
}

const pendingChannelLoads = new Map<string, Promise<unknown>>();

function dedupePendingLoad<T>(key: string, load: () => Promise<T>): Promise<T> {
  const pending = pendingChannelLoads.get(key) as Promise<T> | undefined;
  if (pending) {
    return pending;
  }

  const next = load();
  pendingChannelLoads.set(key, next);
  next.then(
    () => {
      if (pendingChannelLoads.get(key) === next) {
        pendingChannelLoads.delete(key);
      }
    },
    () => {
      if (pendingChannelLoads.get(key) === next) {
        pendingChannelLoads.delete(key);
      }
    },
  );
  return next;
}

export function useOfficialMarketingChannel({ channel, initialStep }: UseOfficialMarketingChannelOptions) {
  const { products } = useProducts();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [tiktokStatus, setTikTokStatus] = useState<TikTokStatus | null>(null);
  const [googleAdsStatus, setGoogleAdsStatus] = useState<GoogleAdsStatus | null>(null);
  const [tiktokMode, setTikTokMode] = useState<TikTokModeData | null>(null);
  const [setup, setSetup] = useState<ChannelSetup>(DEFAULT_SETUP);
  const [setupLoaded, setSetupLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [disconnectArmed, setDisconnectArmed] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeMessage, setCompleteMessage] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const initialStepApplied = useRef(false);
  const productOptions = useMemo(() => {
    if (!Array.isArray(products)) {
      return [];
    }
    return products.flatMap((product) => {
      const normalized = normalizeProduct(product);
      return normalized ? [normalized] : [];
    });
  }, [products]);
  const channelSession = useMemo(() => {
    if (channel === 'tiktok') {
      return {
        connected: tiktokStatus?.connected,
        status: tiktokStatus?.status,
      };
    }
    if (channel === 'google-ads') {
      return {
        connected: googleAdsStatus?.connected,
        status: googleAdsStatus?.status,
      };
    }
    return readConnectChannelStatus(status, channel);
  }, [channel, googleAdsStatus, status, tiktokStatus]);
  const refresh = useCallback(async (): Promise<ConnectStatus | null> => {
    setIsLoading(true);
    setSetupLoaded(false);
    setLoadError(null);
    try {
      const nextStatus = await dedupePendingLoad('/marketing/connect/status', () =>
        apiFetch<ConnectStatus>('/marketing/connect/status'),
      );
      if (nextStatus.error) {
        throw new Error(nextStatus.error);
      }
      const nextConnectStatus = nextStatus.data || null;
      setStatus(nextConnectStatus);
      if (channel === 'google-ads') {
        const nextGoogleAds = await dedupePendingLoad('/marketing/connect/google-ads/status', () =>
          apiFetch<GoogleAdsStatus>('/marketing/connect/google-ads/status'),
        );
        if (nextGoogleAds.error) {
          throw new Error(nextGoogleAds.error);
        }
        setGoogleAdsStatus(nextGoogleAds.data || null);
        setSetup(DEFAULT_SETUP);
        setCompleted(Boolean(nextGoogleAds.data?.connected));
        setSetupLoaded(true);
        return nextConnectStatus;
      }
      const setupUrl = `/marketing/connect/channel-setup?channel=${encodeURIComponent(channel)}`;
      const setupResponse = await dedupePendingLoad(setupUrl, () =>
        apiFetch<{ setup?: unknown; completedAt?: string | null }>(setupUrl),
      );
      if (setupResponse.error) {
        throw new Error(setupResponse.error);
      }
      const realSetup = await dedupePendingLoad(`channel-setup:${channel}`, () =>
        getChannelSetup(channel),
      );
      setSetup(mergeRealChannelSetup(normalizeSetup(setupResponse.data?.setup), realSetup));
      setCompleted(Boolean(setupResponse.data?.completedAt || realSetup.completed));
      setSetupLoaded(true);
      if (channel === 'tiktok') {
        const nextTikTok = await dedupePendingLoad('/marketing/connect/tiktok/status', () =>
          apiFetch<TikTokStatus>('/marketing/connect/tiktok/status'),
        );
        if (nextTikTok.error) {
          throw new Error(nextTikTok.error);
        }
        setTikTokStatus(nextTikTok.data || null);
        const nextMode = await dedupePendingLoad('/marketing/tiktok/mode', () =>
          apiFetch<TikTokModeData>('/marketing/tiktok/mode'),
        );
        if (!nextMode.error) {
          setTikTokMode(nextMode.data || null);
        }
      }
      return nextConnectStatus;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Falha ao carregar status.');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [channel]);
  const persistSetup = useCallback(
    async (nextSetup: ChannelSetup, successMessage?: string) => {
      setBusy('setup');
      setMessage(null);
      const response = await apiFetch<{ setup?: unknown }>('/marketing/connect/channel-setup', {
        method: 'POST',
        body: {
          channel,
          currentStep: nextSetup.currentStep,
          selectedProductIds: nextSetup.selectedProductIds,
          arsenal: nextSetup.arsenal,
          config: nextSetup.config,
        },
      });
      setBusy(null);
      if (response.error) {
        setMessage(response.error);
        return;
      }
      setSetup(normalizeSetup(response.data?.setup));
      setSetupLoaded(true);
      setMessage(successMessage || 'Progresso salvo.');
    },
    [channel],
  );
  const setCurrentStep = useCallback(
    (nextStep: number) => {
      const normalized = Math.min(3, Math.max(0, nextStep));
      setSetup((currentSetup) => {
        const nextSetup = { ...currentSetup, currentStep: normalized };
        void persistSetup(nextSetup);
        return nextSetup;
      });
    },
    [persistSetup],
  );
  const toggleProduct = useCallback(
    (productId: string) => {
      const selected = new Set(setup.selectedProductIds);
      if (selected.has(productId)) {
        selected.delete(productId);
      } else {
        selected.add(productId);
      }
      setSetup({ ...setup, selectedProductIds: Array.from(selected) });
    },
    [setup],
  );
  const updateConfig = useCallback((patch: Partial<ChannelSetup['config']>) => {
    setSetup((current) => ({ ...current, config: { ...current.config, ...patch } }));
  }, []);
  useEffect(() => {
    queueMicrotask(refresh);
  }, [refresh]);
  useEffect(() => {
    if (
      initialStep !== undefined &&
      initialStep > setup.currentStep &&
      setupLoaded &&
      !initialStepApplied.current
    ) {
      initialStepApplied.current = true;
      setSetup((current) => ({
        ...current,
        currentStep: Math.min(3, Math.max(0, initialStep)),
      }));
    }
  }, [initialStep, setup.currentStep, setupLoaded]);
  const openMeta = useCallback(async () => {
    setMessage(null);
    if (
      channelSession?.status === 'meta_oauth_configuration_missing' ||
      channelSession?.status === 'server_not_configured' ||
      channelSession?.status === 'unavailable'
    ) {
      setBusy(null);
      setDisconnectArmed(false);
      setMessage('Meta nao configurado neste ambiente.');
      return;
    }

    setBusy('meta');
    setDisconnectArmed(false);
    try {
      const returnTo = `/marketing/${channel}`;
      const response = await apiFetch<{ url?: string }>(
        `/meta/auth/url?channel=${encodeURIComponent(channel)}&returnTo=${encodeURIComponent(returnTo)}`,
      );
      const url = String(response.data?.url || '').trim();
      if (
        !url ||
        !trustedExternalUrl(url, [
          'facebook.com',
          'www.facebook.com',
          'business.facebook.com',
          'instagram.com',
          'www.instagram.com',
          'api.instagram.com',
        ])
      ) {
        throw new Error('URL oficial da Meta indisponivel.');
      }
      window.location.assign(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao abrir Meta.');
      setBusy(null);
    }
  }, [channel, channelSession?.status]);
  const disconnectMeta = useCallback(async () => {
    if (!disconnectArmed) {
      setDisconnectArmed(true);
      setMessage('Clique novamente em Confirmar desconexão para revogar a conexão Meta.');
      return;
    }
    if (
      !window.confirm(
        'Desconectar a Meta revoga WhatsApp, Instagram e Facebook deste workspace. Confirmar?',
      )
    ) {
      setDisconnectArmed(false);
      return;
    }
    setBusy('meta-disconnect');
    setMessage(null);
    const response = await apiFetch('/meta/auth/disconnect', { method: 'POST' });
    setBusy(null);
    setDisconnectArmed(false);
    if (response.error) {
      setMessage(response.error);
      return;
    }
    setMessage('Conexão Meta revogada.');
    await refresh();
  }, [disconnectArmed, refresh]);
  const toggleEmail = useCallback(
    async (enabled: boolean): Promise<boolean> => {
      setBusy('email');
      setMessage(null);
      const response = await apiFetch('/marketing/connect/email', {
        method: 'POST',
        body: { enabled },
      });
      setBusy(null);
      if (response.error) {
        setMessage(response.error);
        return false;
      }
      const nextStatus = await refresh();
      const connected = Boolean(readConnectChannelStatus(nextStatus, 'email')?.connected);
      setMessage(
        enabled
          ? connected
            ? 'Email ativado.'
            : 'Email solicitado, mas backend ainda nao confirmou conexao.'
          : 'Email desativado.',
      );
      return connected;
    },
    [refresh],
  );
  const uploadArsenalFiles = useCallback(
    async (files: FileList): Promise<boolean> => {
      const fileList = Array.from(files);
      if (fileList.length === 0) {
        return false;
      }
      setBusy('arsenal-upload');
      setMessage(null);
      try {
        let latestState: ChannelSetupState | null = null;
        for (const file of fileList) {
          latestState = await addChannelArsenal(channel, {
            file,
            label: file.name,
            type: inferArsenalType(file),
          });
        }
        if (latestState) {
          setSetup((current) => mergeRealChannelSetup(current, latestState));
          setSetupLoaded(true);
        }
        setMessage('Arsenal do canal atualizado.');
        return true;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Falha ao enviar arsenal.');
        return false;
      } finally {
        setBusy(null);
      }
    },
    [channel],
  );
  const saveSelectedProducts = useCallback(async (): Promise<boolean> => {
    setBusy('products');
    setMessage(null);
    try {
      const realSetup = await saveChannelProducts(channel, setup.selectedProductIds);
      setSetup((current) => mergeRealChannelSetup({ ...current, currentStep: 2 }, realSetup));
      setSetupLoaded(true);
      setMessage('Produtos do canal salvos.');
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao salvar produtos do canal.');
      return false;
    } finally {
      setBusy(null);
    }
  }, [channel, setup.selectedProductIds]);
  const sendEmailTest = useCallback(async () => {
    setBusy('email-test');
    setMessage(null);
    const response = await apiFetch<{ toEmail?: string; provider?: string }>(
      '/marketing/connect/email/test',
      { method: 'POST', body: {} },
    );
    setBusy(null);
    setMessage(
      response.error || `Email de teste enviado via ${response.data?.provider || 'provider'}.`,
    );
  }, []);
  const openTikTok = useCallback(async (kind: 'creator' | 'advertiser') => {
    setMessage(null);
    if (
      tiktokStatus?.configReady === false ||
      tiktokStatus?.clientConfigured === false ||
      tiktokStatus?.secretConfigured === false ||
      tiktokMode?.details.clientConfigured === false ||
      tiktokMode?.details.secretConfigured === false
    ) {
      setBusy(null);
      setMessage('TikTok nao configurado neste ambiente.');
      return;
    }
    setBusy(`tiktok-${kind}`);
    try {
      const response = await apiFetch<{ url?: string }>(
        `/marketing/connect/tiktok/url?kind=${kind}`,
      );
      const url = String(response.data?.url || '').trim();
      const hosts =
        kind === 'advertiser' ? ['business-api.tiktok.com'] : ['www.tiktok.com', 'tiktok.com'];
      if (!url || !trustedExternalUrl(url, hosts)) {
        throw new Error('URL oficial do TikTok indisponivel.');
      }
      window.location.assign(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao abrir TikTok.');
      setBusy(null);
    }
  }, [tiktokMode, tiktokStatus]);
  const openGoogleAds = useCallback(async () => {
    setMessage(null);
    if (
      googleAdsStatus?.clientConfigured === false ||
      googleAdsStatus?.secretConfigured === false ||
      googleAdsStatus?.developerTokenConfigured === false
    ) {
      setBusy(null);
      setMessage('Google Ads nao configurado neste ambiente.');
      return;
    }
    setBusy('google-ads');
    try {
      const response = await apiFetch<{ url?: string }>('/marketing/connect/google-ads/url');
      const url = String(response.data?.url || '').trim();
      if (!url || !trustedExternalUrl(url, ['accounts.google.com'])) {
        throw new Error('URL oficial do Google Ads indisponivel.');
      }
      window.location.assign(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao abrir Google Ads.');
      setBusy(null);
    }
  }, [googleAdsStatus]);

  const handleComplete = useCallback(async (): Promise<boolean> => {
    setCompleteBusy(true);
    setCompleteMessage(null);
    setMessage(null);
    try {
      const configuredState = await saveChannelConfig(channel, toRealChannelConfig(setup.config));
      setSetup((current) =>
        mergeRealChannelSetup({ ...current, currentStep: 3 }, configuredState),
      );
      const completedState = await completeChannelSetup(channel);
      setSetup((current) =>
        mergeRealChannelSetup({ ...current, currentStep: 3 }, completedState),
      );
      setCompleted(Boolean(completedState.completed));
      setSetupLoaded(true);
      setCompleteMessage('Setup concluido. O canal esta liberado para operacao.');
      await refresh();
      return true;
    } catch (error) {
      setCompleteMessage(error instanceof Error ? error.message : 'Falha ao concluir setup.');
      return false;
    } finally {
      setCompleteBusy(false);
    }
  }, [channel, refresh, setup.config]);
  const details = channel === 'tiktok' ? tiktokStatus : channelSession;
  const metaOAuthUnavailable =
    channelSession?.status === 'meta_oauth_configuration_missing' ||
    channelSession?.status === 'server_not_configured' ||
    channelSession?.status === 'unavailable';
  const tiktokSetupUnavailable =
    channel === 'tiktok' &&
    (tiktokStatus?.configReady === false ||
      tiktokStatus?.clientConfigured === false ||
      tiktokStatus?.secretConfigured === false ||
      tiktokMode?.details.clientConfigured === false ||
      tiktokMode?.details.secretConfigured === false);
  const googleAdsSetupUnavailable =
    channel === 'google-ads' &&
    (googleAdsStatus?.clientConfigured === false ||
      googleAdsStatus?.secretConfigured === false ||
      googleAdsStatus?.developerTokenConfigured === false);
  const setupUnavailable =
    metaOAuthUnavailable || tiktokSetupUnavailable || googleAdsSetupUnavailable;
  const badgeStatus = isLoading
    ? 'Carregando'
    : statusText(channelSession?.connected, channelSession?.status);
  const handleAdvanceStep = useCallback(() => {
    setCurrentStep(setup.currentStep + 1);
  }, [setCurrentStep, setup.currentStep]);
  const handleArsenalChange = useCallback((value: string) => {
    setSetup((current) => ({
      ...current,
      arsenal: value
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    }));
  }, []);
  return {
    productOptions,
    channelSession,
    setup,
    setupLoaded,
    busy,
    message,
    isLoading,
    loadError,
    disconnectArmed,
    completeBusy,
    completeMessage,
    completed,
    tiktokMode,
    details,
    setupUnavailable,
    badgeStatus,
    setCurrentStep,
    toggleProduct,
    saveSelectedProducts,
    updateConfig,
    persistSetup,
    refresh,
    openMeta,
    disconnectMeta,
    toggleEmail,
    uploadArsenalFiles,
    sendEmailTest,
    openTikTok,
    openGoogleAds,
    handleComplete,
    handleAdvanceStep,
    handleArsenalChange,
  };
}
