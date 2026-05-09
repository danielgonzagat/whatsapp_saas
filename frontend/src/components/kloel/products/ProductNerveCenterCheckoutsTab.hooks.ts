'use client';

import { useEffect, useState } from 'react';
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
  const [ckLocal, setCkLocal] = useState<JsonRecord>({});
  const [ckSaving, setCkSaving] = useState(false);
  const [ckSaved, setCkSaved] = useState(false);
  const [linkedPlanIds, setLinkedPlanIds] = useState<string[]>([]);
  const [originalLinkedPlanIds, setOriginalLinkedPlanIds] = useState<string[]>([]);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const checkoutForCk = rawCheckouts.find((checkout) => checkout.id === ckEdit);

  useEffect(() => {
    if (ckCfg) {
      setCkLocal(ckCfg as JsonRecord);
    }
  }, [ckCfg]);

  useEffect(() => {
    const nextPlanIds = Array.isArray(checkoutForCk?.checkoutLinks)
      ? (checkoutForCk.checkoutLinks as JsonRecord[])
          .map((link) => String(link?.planId || (link?.plan as JsonRecord)?.id || '').trim())
          .filter((value: string): value is string => Boolean(value))
      : [];
    const uniquePlanIds = Array.from(new Set(nextPlanIds)) as string[];
    setLinkedPlanIds(uniquePlanIds);
    setOriginalLinkedPlanIds(uniquePlanIds);
  }, [checkoutForCk]);

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
    accentColor: ckLocal.accentColor || 'colors.ember.primary',
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
    accentColor: ckCfg?.accentColor || 'colors.ember.primary',
  });

  const hasUnsavedChanges =
    currentConfigSignature !== originalConfigSignature ||
    JSON.stringify(linkedPlanIds) !== JSON.stringify(originalLinkedPlanIds);

  const handleSave = async () => {
    setCkSaving(true);
    try {
      const { id, planId, plan, createdAt, updatedAt, pixels, ...rest } = ckLocal;
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
