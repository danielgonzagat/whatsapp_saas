'use client';

import { useProducts } from '@/hooks/useProducts';
import { affiliateApi } from '@/lib/api/affiliate';
import {
  type WhatsAppConnectionStatus,
  getWhatsAppQrImageOnly,
  getWhatsAppStatus,
} from '@/lib/api/whatsapp';
import { swrFetcher } from '@/lib/fetcher';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  type SelectableProduct,
  type WhatsAppSetupState,
  SESSION_EXPIRED_MESSAGE,
  buildDefaultSetup,
  getErrorMessage,
  getErrorStatus,
  normalizeAffiliateProducts,
  normalizeOwnedProduct,
  normalizeSetup,
  serializeSetup,
} from './WhatsAppExperience.helpers';
import {
  type LiveStatusShape,
  type MarketingWhatsAppConnection,
  buildEffectiveConnection,
  resolveConnectedPhone,
  resolveEffectiveProvider,
  resolveProfileName,
  resolveStatusLabel,
} from './WhatsAppExperience.connection-panes';
import type { SummaryProductCard } from './WhatsAppExperience.dashboard-cards';
import { useWhatsAppSetupActions } from './WhatsAppExperience.actions';
import { useWhatsAppConnectionEffects } from './WhatsAppExperience.effects';

/**
 * Minimum scan-progress percentage advanced by an out-of-band QR refresh
 * so the UI does not visually regress while a fresh code is fetched.
 */
const QR_REFRESH_MIN_PROGRESS = 28;

export interface WhatsAppSummaryResponse {
  configured: boolean;
  sessionName: string;
  configuredAt: string | null;
  activatedAt: string | null;
  arsenalCount: number;
  tone: string | null;
  maxDiscount: number;
  followUpEnabled: boolean;
  selectedProducts: SummaryProductCard[];
}

export interface WorkspaceSettingsResponse {
  providerSettings?: Record<string, unknown>;
}

export interface ChannelRealData {
  messages: number;
  leads: number;
  sales: number;
  status: string;
}

export interface WhatsAppExperienceControllerProps {
  workspaceId: string;
  operator?: string | null;
  mode?: string;
  channelData: ChannelRealData | null;
  liveFeed: string[];
  connection?: MarketingWhatsAppConnection;
  onConnectionRefresh?: () => Promise<unknown> | unknown;
}

export function useWhatsAppExperienceController({
  workspaceId,
  operator,
  mode,
  channelData,
  liveFeed,
  connection,
  onConnectionRefresh,
}: WhatsAppExperienceControllerProps) {
  const fid = useId();
  const { products } = useProducts();
  const ownedProducts = Array.isArray(products) ? products : [];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hydratedRef = useRef(false);
  const hydratedSetupKeyRef = useRef<string | null>(null);
  const autoStartRef = useRef(false);
  const advancedRef = useRef(false);
  const pollCountRef = useRef(0);
  const qrRequestInFlightRef = useRef(false);

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<WhatsAppSetupState>(() => buildDefaultSetup(workspaceId));
  const [reconfiguring, setReconfiguring] = useState(mode === 'reconfigure');
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [sessionExpired, setSessionExpired] = useState(false);

  const { data: affiliateResponse } = useSWR(
    workspaceId ? `affiliate/my-products/${workspaceId}` : null,
    async () => {
      const response = await affiliateApi.myProducts();
      return response.data;
    },
    { revalidateOnFocus: false },
  );

  const { data: settingsData, mutate: mutateSettings } = useSWR<WorkspaceSettingsResponse>(
    workspaceId ? `/workspace/${workspaceId}/settings` : null,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const { data: summaryData, mutate: mutateSummary } = useSWR<WhatsAppSummaryResponse>(
    workspaceId ? '/marketing/whatsapp/summary' : null,
    swrFetcher,
    { refreshInterval: 30000, revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const { data: liveStatus, mutate: mutateLiveStatus } = useSWR<WhatsAppConnectionStatus>(
    workspaceId ? `whatsapp/session-status/${workspaceId}` : null,
    () => getWhatsAppStatus(workspaceId),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const refreshConnection = useCallback(async () => {
    await Promise.all([mutateLiveStatus(), Promise.resolve(onConnectionRefresh?.())]);
  }, [mutateLiveStatus, onConnectionRefresh]);

  const savedSetup = useMemo(
    () => normalizeSetup(settingsData?.providerSettings?.whatsappSetup, workspaceId),
    [settingsData, workspaceId],
  );
  const savedSetupKey = useMemo(() => JSON.stringify(serializeSetup(savedSetup)), [savedSetup]);

  const sessionSnapshot =
    settingsData?.providerSettings &&
    typeof settingsData.providerSettings === 'object' &&
    settingsData.providerSettings.whatsappApiSession &&
    typeof settingsData.providerSettings.whatsappApiSession === 'object'
      ? (settingsData.providerSettings.whatsappApiSession as Record<string, unknown>)
      : {};

  const { isWahaProvider, effectiveProvider } = resolveEffectiveProvider(
    liveStatus?.provider,
    connection?.provider,
    settingsData?.providerSettings?.whatsappProvider,
    sessionSnapshot.provider,
    sessionSnapshot.phoneNumberId,
  );

  const effectiveConnection = useMemo(
    () =>
      buildEffectiveConnection({
        sessionSnapshot,
        liveStatus: liveStatus as LiveStatusShape | undefined,
        connection,
        effectiveProvider,
        isWahaProvider,
      }),
    [connection, effectiveProvider, isWahaProvider, liveStatus, sessionSnapshot],
  );

  const requestQrCodeRef = useRef<
    (opts?: { silent?: boolean }) => Promise<{
      qrCode: string | null;
      connected: boolean;
      status?: string;
      message?: string;
    } | null>
  >(async () => null);

  const requestQrCode = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (qrRequestInFlightRef.current) {
      return null;
    }
    qrRequestInFlightRef.current = true;
    try {
      const qr = await getWhatsAppQrImageOnly(workspaceId);
      if (qr.qrCode) {
        setQrCode(qr.qrCode);
        setScanProgress((current) => Math.max(current, QR_REFRESH_MIN_PROGRESS));
      } else if (qr.connected) {
        setQrCode('');
      }
      return qr;
    } catch (err: unknown) {
      if (getErrorStatus(err) === 401) {
        setSessionExpired(true);
        setError(SESSION_EXPIRED_MESSAGE);
      } else if (!silent) {
        setError(getErrorMessage(err, 'Não foi possível carregar o QR Code.'));
      }
      return null;
    } finally {
      qrRequestInFlightRef.current = false;
    }
  };
  requestQrCodeRef.current = requestQrCode;

  const selectableProducts = useMemo(() => {
    const own = ownedProducts
      .map((product) => normalizeOwnedProduct(product))
      .filter((product): product is SelectableProduct => Boolean(product));
    const affiliates = normalizeAffiliateProducts(affiliateResponse);
    const deduped = new Map<string, SelectableProduct>();
    for (const product of [...own, ...affiliates]) {
      if (!deduped.has(product.id)) {
        deduped.set(product.id, product);
      }
    }
    return Array.from(deduped.values());
  }, [affiliateResponse, ownedProducts]);

  const productMap = useMemo(
    () => new Map(selectableProducts.map((product) => [product.id, product])),
    [selectableProducts],
  );

  const selectedIds = useMemo(
    () => new Set(draft.selectedProducts.map((product) => product.id)),
    [draft.selectedProducts],
  );

  const selectedProductsList = useMemo(
    () => draft.selectedProducts.map((product) => productMap.get(product.id) || product),
    [draft.selectedProducts, productMap],
  );

  const summaryProducts = useMemo(() => {
    if (summaryData?.selectedProducts?.length) {
      return summaryData.selectedProducts;
    }
    return selectedProductsList.map((product) => ({ ...product, salesCount: 0, revenue: 0 }));
  }, [selectedProductsList, summaryData]);

  const isActivated = Boolean(summaryData?.activatedAt || draft.activatedAt);
  const hasConfiguredSetup =
    isActivated && (summaryData?.selectedProducts?.length || draft.selectedProducts.length) > 0;
  const showWizard = reconfiguring || !effectiveConnection.connected || !hasConfiguredSetup;

  useWhatsAppConnectionEffects({
    mode,
    workspaceId,
    savedSetup,
    savedSetupKey,
    draft,
    step,
    showWizard,
    isActivated,
    isWahaProvider,
    sessionExpired,
    effectiveConnection,
    hydratedRef,
    hydratedSetupKeyRef,
    autoStartRef,
    advancedRef,
    pollCountRef,
    qrRequestInFlightRef,
    requestQrCodeRef,
    refreshConnection,
    setDraft,
    setReconfiguring,
    setStep,
    setBusyKey,
    setError,
    setQrCode,
    setScanProgress,
    setSessionExpired,
    setActivated,
    activated,
  });

  const {
    toggleSelectAllProducts,
    toggleProduct,
    saveProductsStep,
    updateArsenalItem,
    removeArsenalItem,
    handleMediaUpload,
    goToConfigStep,
    updateConfig,
    toggleFollowUp,
    activateAi,
    refreshQrCode,
  } = useWhatsAppSetupActions({
    workspaceId,
    draft,
    selectableProducts,
    productMap,
    effectiveConnection,
    refreshConnection,
    requestQrCode,
    mutateSettings: async () => {
      await mutateSettings();
    },
    mutateSummary: async () => {
      await mutateSummary();
    },
    mutateLiveStatus: async () => {
      await mutateLiveStatus();
    },
    setDraft,
    setStep,
    setError,
    setBusyKey,
    setUploadingCount,
    setActivated,
    setScanProgress,
    setSessionExpired,
  });

  const reconfigure = () => {
    setReconfiguring(true);
    setStep(effectiveConnection.connected ? 1 : 0);
    setError(null);
  };

  return {
    fid,
    step,
    draft,
    error,
    busyKey,
    qrCode,
    scanProgress,
    uploadingCount,
    effectiveConnection,
    isWahaProvider,
    selectableProducts,
    selectedIds,
    selectedProductsList,
    fileInputRef,
    showWizard,
    activated,
    summaryData,
    summaryProducts,
    channelData,
    liveFeed,
    setStep,
    toggleSelectAllProducts,
    toggleProduct,
    saveProductsStep,
    updateArsenalItem,
    removeArsenalItem,
    handleMediaUpload,
    goToConfigStep,
    updateConfig,
    toggleFollowUp,
    activateAi,
    refreshQrCode,
    reconfigure,
    resolveProfileName,
    resolveConnectedPhone,
    resolveStatusLabel,
    workspaceId,
    operator,
  } as const;
}
