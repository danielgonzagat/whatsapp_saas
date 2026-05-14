import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { apiFetch } from '@/lib/api';
import {
  type ChannelConnectionStatus,
  type ChannelKey,
  type ConnectStatus,
  type TikTokStatus,
  type TikTokModeData,
  statusText,
  trustedExternalUrl,
} from '../OfficialMarketingChannelPage.helpers';
export interface ProductOption {
  id: string;
  name: string;
}
export interface ChannelSetup {
  currentStep: number;
  selectedProductIds: string[];
  arsenal: string[];
  config: {
    tone: string;
    aggressiveness: string;
    workingHours: string;
    followUpEnabled: boolean;
    proactiveDailyLimit: number;
    language: string;
    handoffCriteria: string;
  };
}
const DEFAULT_SETUP: ChannelSetup = {
  currentStep: 0,
  selectedProductIds: [],
  arsenal: [],
  config: {
    tone: 'consultivo',
    aggressiveness: 'moderado',
    workingHours: '08:00-22:00',
    followUpEnabled: true,
    proactiveDailyLimit: 25,
    language: 'pt-BR',
    handoffCriteria: '',
  },
};
function normalizeSetup(raw: unknown): ChannelSetup {
  const record =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const config =
    record.config && typeof record.config === 'object' && !Array.isArray(record.config)
      ? (record.config as Record<string, unknown>)
      : {};
  const currentStep = Number(record.currentStep);
  return {
    currentStep: Number.isInteger(currentStep) ? Math.min(3, Math.max(0, currentStep)) : 0,
    selectedProductIds: Array.isArray(record.selectedProductIds)
      ? record.selectedProductIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [],
    arsenal: Array.isArray(record.arsenal)
      ? record.arsenal.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    config: {
      ...DEFAULT_SETUP.config,
      tone: typeof config.tone === 'string' ? config.tone : DEFAULT_SETUP.config.tone,
      aggressiveness:
        typeof config.aggressiveness === 'string'
          ? config.aggressiveness
          : DEFAULT_SETUP.config.aggressiveness,
      workingHours:
        typeof config.workingHours === 'string'
          ? config.workingHours
          : DEFAULT_SETUP.config.workingHours,
      followUpEnabled:
        typeof config.followUpEnabled === 'boolean'
          ? config.followUpEnabled
          : DEFAULT_SETUP.config.followUpEnabled,
      proactiveDailyLimit:
        typeof config.proactiveDailyLimit === 'number'
          ? config.proactiveDailyLimit
          : DEFAULT_SETUP.config.proactiveDailyLimit,
      language:
        typeof config.language === 'string' ? config.language : DEFAULT_SETUP.config.language,
      handoffCriteria:
        typeof config.handoffCriteria === 'string'
          ? config.handoffCriteria
          : DEFAULT_SETUP.config.handoffCriteria,
    },
  };
}
function normalizeProduct(raw: unknown): ProductOption | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const id = String(record.id || '').trim();
  if (!id) {
    return null;
  }
  return {
    id,
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : 'Produto',
  };
}
interface UseOfficialMarketingChannelOptions {
  channel: ChannelKey;
  initialStep?: number | undefined;
}
export function useOfficialMarketingChannel({ channel, initialStep }: UseOfficialMarketingChannelOptions) {
  const { products } = useProducts();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [tiktokStatus, setTikTokStatus] = useState<TikTokStatus | null>(null);
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
  const connection = useMemo(() => {
    if (channel === 'tiktok') {
      return {
        connected: tiktokStatus?.connected,
        status: tiktokStatus?.status,
      };
    }
    const channelStatus = status?.channels as
      | Partial<Record<ChannelKey, ChannelConnectionStatus>>
      | undefined;
    return channelStatus?.[channel] || null;
  }, [channel, status, tiktokStatus]);
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setSetupLoaded(false);
    setLoadError(null);
    try {
      const nextStatus = await apiFetch<ConnectStatus>('/marketing/connect/status');
      if (nextStatus.error) {
        throw new Error(nextStatus.error);
      }
      setStatus(nextStatus.data || null);
      const setupResponse = await apiFetch<{ setup?: unknown }>(
        `/marketing/connect/channel-setup?channel=${encodeURIComponent(channel)}`,
      );
      if (setupResponse.error) {
        throw new Error(setupResponse.error);
      }
      setSetup(normalizeSetup(setupResponse.data?.setup));
      setSetupLoaded(true);
      if (channel === 'tiktok') {
        const nextTikTok = await apiFetch<TikTokStatus>('/marketing/connect/tiktok/status');
        if (nextTikTok.error) {
          throw new Error(nextTikTok.error);
        }
        setTikTokStatus(nextTikTok.data || null);
        const nextMode = await apiFetch<TikTokModeData>('/marketing/tiktok/mode');
        if (!nextMode.error) {
          setTikTokMode(nextMode.data || null);
        }
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Falha ao carregar status.');
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
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (
      initialStep !== undefined &&
      initialStep > setup.currentStep &&
      setupLoaded &&
      !initialStepApplied.current
    ) {
      initialStepApplied.current = true;
      setCurrentStep(initialStep);
    }
  }, [initialStep, setup.currentStep, setupLoaded, setCurrentStep]);
  const openMeta = useCallback(async () => {
    setBusy('meta');
    setMessage(null);
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
  }, [channel]);
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
    async (enabled: boolean) => {
      setBusy('email');
      setMessage(null);
      const response = await apiFetch('/marketing/connect/email', {
        method: 'POST',
        body: { enabled },
      });
      setBusy(null);
      if (response.error) {
        setMessage(response.error);
        return;
      }
      setMessage(enabled ? 'Email ativado.' : 'Email desativado.');
      await refresh();
    },
    [refresh],
  );
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
    setBusy(`tiktok-${kind}`);
    setMessage(null);
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
  }, []);
  const handleComplete = useCallback(async () => {
    setCompleteBusy(true);
    setCompleteMessage(null);
    const response = await apiFetch<{ completedAt?: string }>(
      '/marketing/connect/channel-setup/complete',
      { method: 'POST', body: { channel } },
    );
    setCompleteBusy(false);
    if (response.error) {
      setCompleteMessage(response.error);
      return;
    }
    setCompleteMessage('Setup concluido. O canal esta liberado para operacao.');
    setSetup({ ...setup, currentStep: 3 });
    setSetupLoaded(true);
    await refresh();
  }, [channel, setup, refresh]);
  const details = channel === 'tiktok' ? tiktokStatus : connection;
  const setupUnavailable =
    connection?.status === 'server_not_configured' || connection?.status === 'unavailable';
  const badgeStatus = isLoading
    ? 'Carregando'
    : statusText(connection?.connected, connection?.status);
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
    connection,
    setup,
    setupLoaded,
    busy,
    message,
    isLoading,
    loadError,
    disconnectArmed,
    completeBusy,
    completeMessage,
    tiktokMode,
    details,
    setupUnavailable,
    badgeStatus,
    setCurrentStep,
    toggleProduct,
    updateConfig,
    persistSetup,
    refresh,
    openMeta,
    disconnectMeta,
    toggleEmail,
    sendEmailTest,
    openTikTok,
    handleComplete,
    handleAdvanceStep,
    handleArsenalChange,
  };
}
