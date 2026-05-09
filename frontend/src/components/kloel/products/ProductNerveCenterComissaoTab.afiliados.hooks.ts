'use client';

import { apiFetch } from '@/lib/api';
import { useState } from 'react';
import { unwrapApiPayload, type JsonRecord } from './product-nerve-center.shared';

export function useAfiliadoActions(
  productId: string,
  setAffiliateSummary: (v: JsonRecord | null) => void,
) {
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [linkActionId, setLinkActionId] = useState<string | null>(null);

  const handleRequestAction = async (requestId: string, action: 'approve' | 'reject') => {
    setRequestActionId(`${action}-${requestId}`);
    try {
      const summary = unwrapApiPayload<JsonRecord | null>(
        await apiFetch(`/products/${productId}/affiliates/requests/${requestId}/${action}`, {
          method: 'POST',
        }),
      );
      setAffiliateSummary(summary);
    } catch (e) {
      console.error('Affiliate request action error', { action, error: e });
    } finally {
      setRequestActionId(null);
    }
  };

  const handleLinkToggle = async (linkId: string, active: boolean) => {
    setLinkActionId(linkId);
    try {
      const summary = unwrapApiPayload<JsonRecord | null>(
        await apiFetch(`/products/${productId}/affiliates/links/${linkId}`, {
          method: 'PUT',
          body: { active },
        }),
      );
      setAffiliateSummary(summary);
    } catch (e) {
      console.error('Affiliate link toggle error:', e);
    } finally {
      setLinkActionId(null);
    }
  };

  return { requestActionId, linkActionId, handleRequestAction, handleLinkToggle };
}
