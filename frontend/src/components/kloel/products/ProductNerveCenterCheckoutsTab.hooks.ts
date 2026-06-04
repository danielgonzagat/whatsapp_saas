'use client';

import { colors } from '@/lib/design-tokens';

import { useState } from 'react';
import type { JsonRecord, JsonValue } from './product-nerve-center.shared';

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
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const checkoutForCk = rawCheckouts.find((checkout) => checkout.id === ckEdit);

  // Re-hydrate the editable config whenever the incoming `ckCfg` changes.
  // Adjusting state during render (with a tracked previous value) avoids the
  // extra render pass and cascading-render lint a mount effect would cause.
  const [lastCkCfg, setLastCkCfg] = useState(ckCfg);
  if (ckCfg !== lastCkCfg) {
    setLastCkCfg(ckCfg);
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

  const patch = (key: string, value: JsonValue) =>
    setCkLocal((current) => ({ ...current, [key]: value }));

  const selectedPlans = rawPlans.filter((planCandidate) =>
    linkedPlanIds.includes(String(planCandidate.id)),
  );

  const availablePlans = rawPlans.filter(
    (planCandidate) => !linkedPlanIds.includes(String(planCandidate.id)),
  );

  const currentConfigSignature = JSON.stringify({
    brandName: ckLocal.brandName || '',
    enableCreditCard: ckLocal.enableCreditCard !== false,
    enablePix: ckLocal.enablePix !== false,
    enableBoleto: Boolean(ckLocal.enableBoleto),
    enableCoupon: ckLocal.enableCoupon !== false,
    autoCouponCode: ckLocal.autoCouponCode || '',
    enableTimer: Boolean(ckLocal.enableTimer),
    timerMinutes: Number(ckLocal.timerMinutes || 15),
    timerMessage: ckLocal.timerMessage || '',
    accentColor: ckLocal.accentColor || colors.ember.primary,
  });

  const originalConfigSignature = JSON.stringify({
    brandName: ckCfg?.brandName || '',
    enableCreditCard: ckCfg?.enableCreditCard !== false,
    enablePix: ckCfg?.enablePix !== false,
    enableBoleto: Boolean(ckCfg?.enableBoleto),
    enableCoupon: ckCfg?.enableCoupon !== false,
    autoCouponCode: ckCfg?.autoCouponCode || '',
    enableTimer: Boolean(ckCfg?.enableTimer),
    timerMinutes: Number(ckCfg?.timerMinutes || 15),
    timerMessage: ckCfg?.timerMessage || '',
    accentColor: ckCfg?.accentColor || colors.ember.primary,
  });

  const hasUnsavedChanges =
    currentConfigSignature !== originalConfigSignature ||
    JSON.stringify(linkedPlanIds) !== JSON.stringify(originalLinkedPlanIds);

  const handleSave = async () => {
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
      await saveCkCfg(rest);
      await syncCheckoutLinks(ckEdit, linkedPlanIds);
      if (checkoutForCk && ckLocal.brandName !== checkoutForCk.name) {
        await updatePlan(ckEdit, { name: ckLocal.brandName || checkoutForCk.name });
      }
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
