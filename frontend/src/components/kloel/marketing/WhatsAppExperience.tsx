'use client';

import { useProducts } from '@/hooks/useProducts';
import { affiliateApi } from '@/lib/api/misc';
import {
  type WhatsAppConnectionStatus,
  getWhatsAppQrImageOnly,
  getWhatsAppStatus,
  initiateWhatsAppConnection,
} from '@/lib/api/whatsapp';
import { workspaceApi } from '@/lib/api/workspace';
import { swrFetcher } from '@/lib/fetcher';
import { uploadGenericMedia } from '@/lib/media-upload';
import { secureRandomFloat } from '@/lib/secure-random';
import { type ChangeEvent, useEffect, useMemo, useRef, useState, useId } from 'react';
import useSWR from 'swr';

import {
  type ArsenalItem,
  type SelectableProduct,
  type WhatsAppSetupConfig,
  type WhatsAppSetupState,
  buildDefaultSetup,
  getErrorMessage,
  getErrorStatus,
  normalizeAffiliateProducts,
  normalizeOwnedProduct,
  normalizeSetup,
  nowIso,
  serializeSetup,
  SESSION_EXPIRED_MESSAGE,
} from './WhatsAppExperience.helpers';

import {
  type MarketingWhatsAppConnection,
  type LiveStatusShape,
  resolveEffectiveProvider,
  buildEffectiveConnection,
  resolveStatusLabel,
  resolveProfileName,
  resolveConnectedPhone,
  ActivatedScreen,
} from './WhatsAppExperience.connection-panes';

import type { SummaryProductCard } from './WhatsAppExperience.dashboard-cards';
import { WizardPanel, OperationalPanel } from './WhatsAppExperience.panels';

interface WhatsAppSummaryResponse {
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

interface WorkspaceSettingsResponse {
  providerSettings?: Record<string, unknown>;
}

interface ChannelRealData {
  messages: number;
  leads: number;
  sales: number;
  status: string;
}

interface WhatsAppExperienceProps {
  workspaceId: string;
  operator?: string | null;
  mode?: string;
  channelData: ChannelRealData | null;
  liveFeed: string[];
  connection?: MarketingWhatsAppConnection;
  onConnectionRefresh?: () => Promise<unknown> | unknown;
}

export { QRCodePane } from './WhatsAppExperience.qr-pane';

/** Whats app experience. */
export default function WhatsAppExperience({
  workspaceId,
  operator,
  mode,
  channelData,
  liveFeed,
  connection,
  onConnectionRefresh,
}: WhatsAppExperienceProps) {
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

  useEffect(() => {
    setReconfiguring(mode === 'reconfigure');
  }, [mode]);

  useEffect(() => {
    if (hydratedRef.current && hydratedSetupKeyRef.current === savedSetupKey) {
      return;
    }
    hydratedRef.current = true;
    hydratedSetupKeyRef.current = savedSetupKey;
    setDraft(savedSetup);
  }, [savedSetup, savedSetupKey]);

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

  useEffect(() => {
    if (effectiveConnection.connected) {
      qrRequestInFlightRef.current = false;
      setQrCode('');
      setSessionExpired(false);
    }
  }, [effectiveConnection.connected]);

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
        setScanProgress((current) => Math.max(current, 28));
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

  useEffect(() => {
    if (!showWizard) {
      advancedRef.current = false;
      return;
    }
    if (!effectiveConnection.connected) {
      setStep(0);
      return;
    }
    if (!draft.selectedProducts.length) {
      setStep(1);
      return;
    }
    if (!isActivated) {
      setStep(Math.min(3, Math.max(1, draft.lastCompletedStep + 1)));
    }
  }, [
    draft.lastCompletedStep,
    draft.selectedProducts.length,
    effectiveConnection.connected,
    isActivated,
    showWizard,
  ]);

  useEffect(() => {
    if (
      !showWizard ||
      step !== 0 ||
      effectiveConnection.connected ||
      autoStartRef.current ||
      !isWahaProvider ||
      sessionExpired
    ) {
      return;
    }
    autoStartRef.current = true;
    void (async () => {
      setBusyKey('connect');
      setError(null);
      setSessionExpired(false);
      setScanProgress((current) => Math.max(current, 12));
      try {
        await initiateWhatsAppConnection(workspaceId);
        void requestQrCodeRef.current({ silent: true });
        try {
          await Promise.all([mutateLiveStatus(), Promise.resolve(onConnectionRefresh?.())]);
        } catch (err) {
          if (getErrorStatus(err) === 401) {
            setSessionExpired(true);
            setError(SESSION_EXPIRED_MESSAGE);
            return;
          }
          throw err;
        }
      } catch (err: unknown) {
        if (getErrorStatus(err) === 401) {
          setSessionExpired(true);
          setError(SESSION_EXPIRED_MESSAGE);
          return;
        }
        setError(getErrorMessage(err, 'Não foi possível iniciar a sessão do WhatsApp.'));
      } finally {
        setBusyKey(null);
      }
    })();
  }, [
    effectiveConnection.connected,
    isWahaProvider,
    mutateLiveStatus,
    onConnectionRefresh,
    sessionExpired,
    showWizard,
    step,
    workspaceId,
  ]);

  useEffect(() => {
    if (
      !showWizard ||
      step !== 0 ||
      effectiveConnection.connected ||
      !isWahaProvider ||
      sessionExpired
    ) {
      autoStartRef.current = false;
      pollCountRef.current = 0;
      qrRequestInFlightRef.current = false;
      return;
    }
    const intervalId = window.setInterval(() => {
      pollCountRef.current += 1;
      setScanProgress((current) => Math.min(92, Math.max(18, current + secureRandomFloat() * 5)));
      void (async () => {
        try {
          await Promise.all([mutateLiveStatus(), Promise.resolve(onConnectionRefresh?.())]);
        } catch (err) {
          if (getErrorStatus(err) === 401) {
            setSessionExpired(true);
            setError(SESSION_EXPIRED_MESSAGE);
            window.clearInterval(intervalId);
          }
        }
      })();
      if (!qrRequestInFlightRef.current) {
        void (async () => {
          const qr = await requestQrCodeRef.current({ silent: true });
          if (!qr?.qrCode && !qr?.connected && pollCountRef.current % 6 === 0) {
            autoStartRef.current = false;
          }
        })();
      }
    }, 1200);
    return () => {
      qrRequestInFlightRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [
    effectiveConnection.connected,
    isWahaProvider,
    mutateLiveStatus,
    onConnectionRefresh,
    sessionExpired,
    showWizard,
    step,
  ]);

  useEffect(() => {
    if (!showWizard || step !== 0 || !effectiveConnection.connected || advancedRef.current) return;
    advancedRef.current = true;
    setScanProgress(100);
    const timeoutId = window.setTimeout(() => {
      setStep(
        draft.selectedProducts.length ? Math.min(3, Math.max(1, draft.lastCompletedStep + 1)) : 1,
      );
    }, 150);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    draft.lastCompletedStep,
    draft.selectedProducts.length,
    effectiveConnection.connected,
    showWizard,
    step,
  ]);

  useEffect(() => {
    if (!activated) return;
    const timeoutId = window.setTimeout(() => {
      setActivated(false);
      setReconfiguring(false);
    }, 1500);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activated]);

  const persistSetup = async (
    nextDraft: WhatsAppSetupState,
    extraPatch?: Record<string, unknown>,
  ) => {
    const response = await workspaceApi.updateSettings({
      whatsappSetup: serializeSetup(nextDraft),
      ...(extraPatch || {}),
    });
    const resp = response as unknown as Record<string, unknown> | undefined;
    if (resp?.error) throw new Error(String(resp.error));
    await Promise.all([
      mutateSettings(),
      mutateSummary(),
      mutateLiveStatus(),
      Promise.resolve(onConnectionRefresh?.()),
    ]);
  };

  const refreshQrCode = async () => {
    setBusyKey('connect');
    setError(null);
    setSessionExpired(false);
    setScanProgress((current) => Math.max(current, 12));
    try {
      await initiateWhatsAppConnection(workspaceId);
      try {
        await Promise.all([
          requestQrCode(),
          Promise.all([mutateLiveStatus(), Promise.resolve(onConnectionRefresh?.())]),
        ]);
      } catch (err) {
        if (getErrorStatus(err) === 401) {
          setSessionExpired(true);
          setError(SESSION_EXPIRED_MESSAGE);
          return;
        }
        throw err;
      }
    } catch (err: unknown) {
      if (getErrorStatus(err) === 401) {
        setSessionExpired(true);
        setError(SESSION_EXPIRED_MESSAGE);
        return;
      }
      setError(getErrorMessage(err, 'Não foi possível atualizar o QR Code.'));
    } finally {
      setBusyKey(null);
    }
  };

  const updateConfig = <K extends keyof WhatsAppSetupConfig>(
    key: K,
    nextValue: WhatsAppSetupConfig[K],
  ) => {
    setDraft((current) => ({
      ...current,
      config: { ...current.config, [key]: nextValue },
      updatedAt: nowIso(),
    }));
  };

  const toggleSelectAllProducts = () => {
    setDraft((current) => ({
      ...current,
      selectedProducts:
        current.selectedProducts.length === selectableProducts.length
          ? []
          : selectableProducts.map((p) => ({ ...p })),
      updatedAt: nowIso(),
    }));
  };

  const updateArsenalItem = (updated: ArsenalItem) => {
    setDraft((current) => ({
      ...current,
      arsenal: current.arsenal.map((m) => (m.id === updated.id ? updated : m)),
      updatedAt: nowIso(),
    }));
  };

  const removeArsenalItem = (id: string) => {
    setDraft((current) => ({
      ...current,
      arsenal: current.arsenal.filter((m) => m.id !== id),
      updatedAt: nowIso(),
    }));
  };

  const toggleFollowUp = () => {
    setDraft((current) => ({
      ...current,
      config: { ...current.config, followUp: !current.config.followUp },
      updatedAt: nowIso(),
    }));
  };

  const toggleProduct = (id: string) => {
    const product = productMap.get(id);
    if (!product) return;
    setDraft((current) => ({
      ...current,
      selectedProducts: current.selectedProducts.some((item) => item.id === id)
        ? current.selectedProducts.filter((item) => item.id !== id)
        : [...current.selectedProducts, { ...product }],
      updatedAt: nowIso(),
    }));
  };

  const saveProductsStep = async () => {
    if (draft.selectedProducts.length === 0) {
      setError('Selecione pelo menos um produto para avançar.');
      return;
    }
    setBusyKey('products');
    setError(null);
    const nextDraft = {
      ...draft,
      sessionName: workspaceId,
      lastCompletedStep: Math.max(draft.lastCompletedStep, 1),
      updatedAt: nowIso(),
    };
    try {
      await persistSetup(nextDraft);
      setDraft(nextDraft);
      setStep(2);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Não foi possível salvar os produtos selecionados.'));
    } finally {
      setBusyKey(null);
    }
  };

  const handleMediaUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    setUploadingCount((count) => count + files.length);
    setError(null);
    try {
      const uploaded = await Promise.all(
        files.map(async (file) => {
          const url = await uploadGenericMedia(file, { folder: `whatsapp/${workspaceId}/arsenal` });
          return {
            id: crypto.randomUUID(),
            fileName: file.name,
            url,
            type: '' as ArsenalItem['type'],
            productId: '',
            description: '',
            mimeType: file.type || null,
            size: file.size,
          } satisfies ArsenalItem;
        }),
      );
      setDraft((current) => ({
        ...current,
        arsenal: [...current.arsenal, ...uploaded],
        updatedAt: nowIso(),
      }));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha ao enviar as mídias do arsenal.'));
    } finally {
      setUploadingCount((count) => Math.max(0, count - files.length));
    }
  };

  const goToConfigStep = async () => {
    const invalidMedia = draft.arsenal.some(
      (item) => item.type === '' || item.productId === '' || item.description.trim() === '',
    );
    if (invalidMedia) {
      setError('Preencha tipo, produto e descrição em todas as mídias antes de continuar.');
      return;
    }
    setBusyKey('arsenal');
    setError(null);
    const nextDraft = {
      ...draft,
      lastCompletedStep: Math.max(draft.lastCompletedStep, 2),
      updatedAt: nowIso(),
    };
    try {
      await persistSetup(nextDraft);
      setDraft(nextDraft);
      setStep(3);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Não foi possível salvar o arsenal.'));
    } finally {
      setBusyKey(null);
    }
  };

  const activateAi = async () => {
    if (!effectiveConnection.connected) {
      setError('Conecte o WhatsApp antes de ativar a IA.');
      setStep(0);
      return;
    }
    if (draft.selectedProducts.length === 0) {
      setError('Selecione pelo menos um produto antes de ativar a IA.');
      setStep(1);
      return;
    }
    setBusyKey('activate');
    setError(null);
    const timestamp = nowIso();
    const nextDraft = {
      ...draft,
      configuredAt: draft.configuredAt || timestamp,
      activatedAt: timestamp,
      lastCompletedStep: 3,
      updatedAt: timestamp,
    };
    try {
      await persistSetup(nextDraft, { autopilot: { enabled: true }, autonomy: { mode: 'LIVE' } });
      setDraft(nextDraft);
      setActivated(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Não foi possível salvar e ativar a IA.'));
    } finally {
      setBusyKey(null);
    }
  };

  if (!workspaceId) return null;
  if (activated) return <ActivatedScreen />;

  if (showWizard) {
    return (
      <WizardPanel
        fid={fid}
        step={step}
        draft={draft}
        error={error}
        busyKey={busyKey}
        qrCode={qrCode}
        scanProgress={scanProgress}
        uploadingCount={uploadingCount}
        effectiveConnection={effectiveConnection}
        isWahaProvider={isWahaProvider}
        selectableProducts={selectableProducts}
        selectedIds={selectedIds}
        selectedProductsList={selectedProductsList}
        fileInputRef={fileInputRef}
        onSetStep={setStep}
        onToggleSelectAll={toggleSelectAllProducts}
        onToggleProduct={toggleProduct}
        onSaveProducts={() => void saveProductsStep()}
        onUpdateArsenalItem={updateArsenalItem}
        onRemoveArsenalItem={removeArsenalItem}
        onMediaUpload={handleMediaUpload}
        onGoToConfigStep={() => void goToConfigStep()}
        onUpdateConfig={updateConfig}
        onToggleFollowUp={toggleFollowUp}
        onActivateAi={() => void activateAi()}
        onRefreshQrCode={() => void refreshQrCode()}
      />
    );
  }

  const profileName = resolveProfileName(effectiveConnection.pushName, operator);
  const connectedPhone = resolveConnectedPhone(
    effectiveConnection.phoneNumber,
    effectiveConnection.phoneNumberId,
  );
  const statusLabel = resolveStatusLabel(effectiveConnection.status, effectiveConnection.connected);

  return (
    <OperationalPanel
      statusLabel={statusLabel}
      profileName={profileName}
      connectedPhone={connectedPhone}
      channelData={channelData}
      summaryProducts={summaryProducts}
      liveFeed={liveFeed}
      summaryData={summaryData}
      draft={draft}
      workspaceId={workspaceId}
      effectiveConnection={effectiveConnection}
      onReconfigure={() => {
        setReconfiguring(true);
        setStep(effectiveConnection.connected ? 1 : 0);
        setError(null);
      }}
    />
  );
}
