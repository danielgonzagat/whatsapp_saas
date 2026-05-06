'use client';

import { initiateWhatsAppConnection } from '@/lib/api/whatsapp';
import { workspaceApi } from '@/lib/api/workspace';
import { uploadGenericMedia } from '@/lib/media-upload';
import { type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import {
  type ArsenalItem,
  type SelectableProduct,
  type WhatsAppSetupConfig,
  type WhatsAppSetupState,
  getErrorMessage,
  getErrorStatus,
  nowIso,
  serializeSetup,
  SESSION_EXPIRED_MESSAGE,
} from './WhatsAppExperience.helpers';

interface ConnectionShape {
  connected: boolean;
}

interface WhatsAppSetupActionsProps {
  workspaceId: string;
  draft: WhatsAppSetupState;
  selectableProducts: SelectableProduct[];
  productMap: Map<string, SelectableProduct>;
  effectiveConnection: ConnectionShape;
  refreshConnection: () => Promise<unknown>;
  requestQrCode: (opts?: { silent?: boolean }) => Promise<unknown>;
  mutateSettings: () => Promise<unknown>;
  mutateSummary: () => Promise<unknown>;
  mutateLiveStatus: () => Promise<unknown>;
  setDraft: Dispatch<SetStateAction<WhatsAppSetupState>>;
  setStep: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  setUploadingCount: Dispatch<SetStateAction<number>>;
  setActivated: Dispatch<SetStateAction<boolean>>;
  setScanProgress: Dispatch<SetStateAction<number>>;
  setSessionExpired: Dispatch<SetStateAction<boolean>>;
}

export function useWhatsAppSetupActions({
  workspaceId,
  draft,
  selectableProducts,
  productMap,
  effectiveConnection,
  refreshConnection,
  requestQrCode,
  mutateSettings,
  mutateSummary,
  mutateLiveStatus,
  setDraft,
  setStep,
  setError,
  setBusyKey,
  setUploadingCount,
  setActivated,
  setScanProgress,
  setSessionExpired,
}: WhatsAppSetupActionsProps) {
  const persistSetup = async (
    nextDraft: WhatsAppSetupState,
    extraPatch?: Record<string, unknown>,
  ) => {
    const response = await workspaceApi.updateSettings({
      whatsappSetup: serializeSetup(nextDraft),
      ...(extraPatch || {}),
    });
    if (response?.error) throw new Error(String(response.error));
    await Promise.all([mutateSettings(), mutateSummary(), mutateLiveStatus(), refreshConnection()]);
  };

  const refreshQrCode = async () => {
    setBusyKey('connect');
    setError(null);
    setSessionExpired(false);
    setScanProgress((current) => Math.max(current, 12));
    try {
      await initiateWhatsAppConnection(workspaceId);
      await Promise.all([requestQrCode(), refreshConnection()]);
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

  return {
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
  } as const;
}
