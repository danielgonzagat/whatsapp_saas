'use client';

import { colors } from '@/lib/design-tokens';

import { useState } from 'react';
import type { JsonRecord, JsonValue } from './product-nerve-center.shared';
import { normalizeColorPickerValue } from './ProductNerveCenterCheckoutsTab.sections';

export function useCheckoutConfigForm(
  ckEdit: string,
  ckCfg: JsonRecord | null,
  rawCheckouts: JsonRecord[],
  rawPlans: JsonRecord[],
  saveCkCfg: (payload: JsonRecord) => Promise<unknown>,
  syncCheckoutLinks: (checkoutId: string, planIds: string[]) => Promise<unknown>,
  updatePlan: (planId: string, payload: JsonRecord) => Promise<unknown>,
  showToast: (message: string, variant: 'success' | 'error') => void,
  setCkEdit: (value: string | null) => void,
) {
  const [ckLocal, setCkLocal] = useState<JsonRecord>(() => (ckCfg ? (ckCfg as JsonRecord) : {}));
  const [ckSaving, setCkSaving] = useState(false);
  const [ckSaved, setCkSaved] = useState(false);
  const [ckError, setCkError] = useState('');
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const checkoutForCk = rawCheckouts.find((checkout) => checkout.id === ckEdit);

  // Re-hydrate the editable config whenever the incoming `ckCfg` changes.
  // Adjusting state during render (with a tracked previous value) avoids the
  // extra render pass and cascading-render lint a mount effect would cause.
  const [lastCkCfg, setLastCkCfg] = useState(ckCfg);
  if (ckCfg !== lastCkCfg) {
    setLastCkCfg(ckCfg);
    setCkError('');
    if (ckCfg) {
      setCkLocal(ckCfg as JsonRecord);
    }
  }

  const computeLinkedPlanIds = (checkout: JsonRecord | undefined): string[] => {
    const nextPlanIds = Array.isArray(checkout?.checkoutLinks)
      ? (checkout.checkoutLinks as JsonRecord[])
          .map((link) => String(link?.planId || (link?.plan as JsonRecord)?.id || '').trim())
          .filter((value: string): value is string => Boolean(value))
      : [];
    return Array.from(new Set(nextPlanIds)) as string[];
  };

  const [linkedPlanIds, setLinkedPlanIds] = useState<string[]>(() =>
    computeLinkedPlanIds(checkoutForCk),
  );
  const [originalLinkedPlanIds, setOriginalLinkedPlanIds] = useState<string[]>(() =>
    computeLinkedPlanIds(checkoutForCk),
  );

  // Re-derive linked plans whenever the resolved checkout changes.
  const [lastCheckoutForCk, setLastCheckoutForCk] = useState(checkoutForCk);
  if (checkoutForCk !== lastCheckoutForCk) {
    setLastCheckoutForCk(checkoutForCk);
    const uniquePlanIds = computeLinkedPlanIds(checkoutForCk);
    setLinkedPlanIds(uniquePlanIds);
    setOriginalLinkedPlanIds(uniquePlanIds);
  }

  const patch = (key: string, value: JsonValue) => {
    setCkError('');
    setCkSaved(false);
    setCkLocal((current) => ({ ...current, [key]: value }));
  };

  const selectedPlans = rawPlans.filter((planCandidate) =>
    linkedPlanIds.includes(String(planCandidate.id)),
  );

  const availablePlans = rawPlans.filter(
    (planCandidate) => !linkedPlanIds.includes(String(planCandidate.id)),
  );

  const normalizeCheckoutConfigColor = (value: JsonValue | undefined, fallback: string) =>
    normalizeColorPickerValue(String(value ?? ''), fallback);

  const getCheckoutBackgroundFallback = (config: JsonRecord | null | undefined) =>
    String(config?.theme ?? 'BLANC') === 'NOIR' ? colors.background.void : colors.text.silver;

  const buildConfigSignature = (config: JsonRecord | null | undefined) =>
    JSON.stringify({
      brandName: config?.brandName || '',
      enableCreditCard: config?.enableCreditCard !== false,
      enablePix: config?.enablePix !== false,
      enableBoleto: Boolean(config?.enableBoleto),
      enableCoupon: config?.enableCoupon !== false,
      autoCouponCode: config?.autoCouponCode || '',
      enableTimer: Boolean(config?.enableTimer),
      timerMinutes: Number(config?.timerMinutes || 15),
      timerMessage: config?.timerMessage || '',
      accentColor: normalizeCheckoutConfigColor(config?.accentColor, colors.ember.primary),
      backgroundColor: normalizeCheckoutConfigColor(
        config?.backgroundColor,
        getCheckoutBackgroundFallback(config),
      ),
      btnFinalizeText: config?.btnFinalizeText || 'Finalizar compra',
      theme: config?.theme || 'BLANC',
      enableTestimonials: config?.enableTestimonials !== false,
      enableGuarantee: config?.enableGuarantee !== false,
      showCouponPopup: Boolean(config?.showCouponPopup),
    });

  const currentConfigSignature = buildConfigSignature(ckLocal);
  const originalConfigSignature = buildConfigSignature(ckCfg);

  const hasUnsavedChanges =
    currentConfigSignature !== originalConfigSignature ||
    JSON.stringify(linkedPlanIds) !== JSON.stringify(originalLinkedPlanIds);

  const handleSave = async () => {
    const brandName = String(ckLocal.brandName ?? '').trim();
    if (!brandName) {
      const message = 'Informe o nome/descrição do checkout antes de salvar.';
      setCkError(message);
      setCkSaved(false);
      showToast(message, 'error');
      return false;
    }

    setCkSaving(true);
    try {
      const {
        id: _id,
        planId: _planId,
        plan: _plan,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        pixels: _pixels,
        ...rest
      } = ckLocal;
      const normalizedAccentColor = normalizeCheckoutConfigColor(
        rest.accentColor,
        colors.ember.primary,
      );
      const normalizedBackgroundColor = normalizeCheckoutConfigColor(
        rest.backgroundColor,
        getCheckoutBackgroundFallback(rest),
      );
      await saveCkCfg({
        ...rest,
        brandName,
        accentColor: normalizedAccentColor,
        backgroundColor: normalizedBackgroundColor,
      });
      await syncCheckoutLinks(ckEdit, linkedPlanIds);
      if (checkoutForCk && brandName !== checkoutForCk.name) {
        await updatePlan(ckEdit, { name: brandName });
      }
      setCkError('');
      setCkSaved(true);
      setTimeout(() => setCkSaved(false), 2000);
      showToast('Checkout salvo', 'success');
      return true;
    } catch (error) {
      console.error('Checkout config save error:', error);
      showToast(error instanceof Error ? error.message : 'Erro ao salvar checkout', 'error');
      return false;
    } finally {
      setCkSaving(false);
    }
  };

  const handleBack = async (saveBeforeExit: boolean) => {
    if (saveBeforeExit) {
      const didSave = await handleSave();
      if (!didSave) {
        return;
      }
    }
    setShowExitConfirm(false);
    setCkEdit(null);
  };

  return {
    ckLocal,
    ckSaving,
    ckSaved,
    ckError,
    linkedPlanIds,
    setLinkedPlanIds,
    showExitConfirm,
    setShowExitConfirm,
    checkoutForCk,
    selectedPlans,
    availablePlans,
    hasUnsavedChanges,
    patch,
    handleSave,
    handleBack,
  };
}
