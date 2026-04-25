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
 * Encapsulates the local state of the configuration sub-tab (toggles + commission inputs).
 */
export function useCommissionConfigState(p: Record<string, unknown>) {
  const [affEnabled, setAffEnabled] = useState<boolean>(Boolean(p.affiliateEnabled));
  const [affVisible, setAffVisible] = useState<boolean>(Boolean(p.affiliateVisible));
  const [affAutoApprove, setAffAutoApprove] = useState<boolean>(p.affiliateAutoApprove !== false);
  const [affAccessData, setAffAccessData] = useState<boolean>(p.affiliateAccessData !== false);
  const [affAccessAbandoned, setAffAccessAbandoned] = useState<boolean>(
    p.affiliateAccessAbandoned !== false,
  );
  const [affFirstInstallment, setAffFirstInstallment] = useState<boolean>(
    Boolean(p.affiliateFirstInstallment),
  );
  const [comType, setComType] = useState<string>(
    typeof p.commissionType === 'string' ? p.commissionType : 'last_click',
  );
  const [comCookie, setComCookie] = useState(() =>
    clampIntegerValue(p.commissionCookieDays ?? 180, 180, 1, 3650),
  );
  const [comPercent, setComPercent] = useState(() => formatPercentInput(p.commissionPercent, 30));
  const [comLastClick, setComLastClick] = useState(() =>
    formatPercentInput(p.commissionLastClickPercent, 70),
  );
  const [comOther, setComOther] = useState(() =>
    formatPercentInput(p.commissionOtherClicksPercent, 30),
  );
  const [comSaving, setComSaving] = useState(false);
  const [comSaved, setComSaved] = useState(false);

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
