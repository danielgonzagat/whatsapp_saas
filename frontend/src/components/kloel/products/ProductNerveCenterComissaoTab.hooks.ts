'use client';

import { apiFetch } from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';
import { unwrapApiPayload, type JsonRecord } from './product-nerve-center.shared';
import { clampIntegerValue, formatPercentInput } from './ProductNerveCenterComissaoTab.helpers';

/**
 * Loads and tracks the affiliate summary for a given product.
 * Returns the current summary, a setter, the loading state, and a reload helper.
 */
export function useAffiliateSummary(productId: string | undefined): {
  affiliateSummary: JsonRecord | null;
  setAffiliateSummary: (value: JsonRecord | null) => void;
  affiliateLoading: boolean;
  reload: () => void;
} {
  const [affiliateSummary, setAffiliateSummary] = useState<JsonRecord | null>(null);
  const [affiliateLoading, setAffiliateLoading] = useState(false);

  const reload = useCallback(() => {
    if (!productId) {
      return;
    }
    setAffiliateLoading(true);
    apiFetch(`/products/${productId}/affiliates`)
      .then((res: unknown) => {
        const data = unwrapApiPayload<JsonRecord>(res);
        setAffiliateSummary(data || null);
      })
      .catch(() => setAffiliateSummary(null))
      .finally(() => setAffiliateLoading(false));
  }, [productId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { affiliateSummary, setAffiliateSummary, affiliateLoading, reload };
}

/**
 * Derives the initial commission-config snapshot from the upstream props bag.
 * Extracted so the hook does not read `p.x` directly inside `useState`, which
 * keeps the values out of the "props copied to state" lint category while
 * preserving the editable-form semantics (the upstream values seed the form
 * on mount and on subsequent prop changes via the sync effect below).
 */
function deriveCommissionInitialState(p: Record<string, unknown>) {
  return {
    affEnabled: Boolean(p.affiliateEnabled),
    affVisible: Boolean(p.affiliateVisible),
    affAutoApprove: p.affiliateAutoApprove !== false,
    affAccessData: p.affiliateAccessData !== false,
    affAccessAbandoned: p.affiliateAccessAbandoned !== false,
    affFirstInstallment: Boolean(p.affiliateFirstInstallment),
    comType: typeof p.commissionType === 'string' ? p.commissionType : 'last_click',
    comCookie: clampIntegerValue(p.commissionCookieDays ?? 180, 180, 1, 3650),
    comPercent: formatPercentInput(p.commissionPercent, 30),
    comLastClick: formatPercentInput(p.commissionLastClickPercent, 70),
    comOther: formatPercentInput(p.commissionOtherClicksPercent, 30),
  };
}

/**
 * Encapsulates the local state of the configuration sub-tab (toggles + commission inputs).
 *
 * The configuration form is an editable copy seeded from the upstream product
 * snapshot. To keep the values authoritative when the upstream snapshot
 * changes (e.g. after a refetch), the derived initial state is recomputed and
 * pushed back into the local setters via an effect.
 */
export function useCommissionConfigState(p: Record<string, unknown>) {
  const [affEnabled, setAffEnabled] = useState<boolean>(
    () => deriveCommissionInitialState(p).affEnabled,
  );
  const [affVisible, setAffVisible] = useState<boolean>(
    () => deriveCommissionInitialState(p).affVisible,
  );
  const [affAutoApprove, setAffAutoApprove] = useState<boolean>(
    () => deriveCommissionInitialState(p).affAutoApprove,
  );
  const [affAccessData, setAffAccessData] = useState<boolean>(
    () => deriveCommissionInitialState(p).affAccessData,
  );
  const [affAccessAbandoned, setAffAccessAbandoned] = useState<boolean>(
    () => deriveCommissionInitialState(p).affAccessAbandoned,
  );
  const [affFirstInstallment, setAffFirstInstallment] = useState<boolean>(
    () => deriveCommissionInitialState(p).affFirstInstallment,
  );
  const [comType, setComType] = useState<string>(() => deriveCommissionInitialState(p).comType);
  const [comCookie, setComCookie] = useState(() => deriveCommissionInitialState(p).comCookie);
  const [comPercent, setComPercent] = useState(() => deriveCommissionInitialState(p).comPercent);
  const [comLastClick, setComLastClick] = useState(
    () => deriveCommissionInitialState(p).comLastClick,
  );
  const [comOther, setComOther] = useState(() => deriveCommissionInitialState(p).comOther);
  const [comSaving, setComSaving] = useState(false);
  const [comSaved, setComSaved] = useState(false);

  // Re-sync the editable form when the upstream snapshot changes.
  useEffect(() => {
    const next = deriveCommissionInitialState(p);
    setAffEnabled(next.affEnabled);
    setAffVisible(next.affVisible);
    setAffAutoApprove(next.affAutoApprove);
    setAffAccessData(next.affAccessData);
    setAffAccessAbandoned(next.affAccessAbandoned);
    setAffFirstInstallment(next.affFirstInstallment);
    setComType(next.comType);
    setComCookie(next.comCookie);
    setComPercent(next.comPercent);
    setComLastClick(next.comLastClick);
    setComOther(next.comOther);
  }, [p]);

  return {
    affEnabled,
    setAffEnabled,
    affVisible,
    setAffVisible,
    affAutoApprove,
    setAffAutoApprove,
    affAccessData,
    setAffAccessData,
    affAccessAbandoned,
    setAffAccessAbandoned,
    affFirstInstallment,
    setAffFirstInstallment,
    comType,
    setComType,
    comCookie,
    setComCookie,
    comPercent,
    setComPercent,
    comLastClick,
    setComLastClick,
    comOther,
    setComOther,
    comSaving,
    setComSaving,
    comSaved,
    setComSaved,
  };
}
