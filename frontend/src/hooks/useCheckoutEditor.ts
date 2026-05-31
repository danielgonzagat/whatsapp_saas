'use client';
import { apiFetch } from '@/lib/api';
import { swrFetcher } from '@/lib/fetcher';
import { useCallback, useRef } from 'react';
import useSWR from 'swr';

import {
  DEFAULT_CONFIG,
  normalizeConfigForEditor,
  type CheckoutConfig,
} from './useCheckoutEditor.helpers';

/* ── Re-exports (only the symbols imported externally; rest live in helpers) ── */

export { DEFAULT_CONFIG } from './useCheckoutEditor.helpers';
export type { CheckoutConfig } from './useCheckoutEditor.helpers';

/* ── Hook ── */

export function useCheckoutEditor(planId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<Record<string, unknown>>(
    planId ? `/checkout/plans/${planId}/config` : null,
    swrFetcher,
  );

  const config: CheckoutConfig = data
    ? normalizeConfigForEditor(data as Record<string, unknown>)
    : DEFAULT_CONFIG;

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  const updateConfig = useCallback(
    async (patch: Partial<CheckoutConfig>) => {
      if (!planId) {
        return;
      }

      const next = { ...config, ...patch };
      mutate(next, false);

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      return new Promise<void>((resolve) => {
        saveTimerRef.current = setTimeout(async () => {
          savingRef.current = true;
          try {
            await apiFetch(`/checkout/plans/${planId}/config`, {
              method: 'PATCH',
              body: next,
            });
            mutate();
          } finally {
            savingRef.current = false;
          }
          resolve();
        }, 800);
      });
    },
    [planId, config, mutate],
  );

  return { config, isLoading, error, mutate, updateConfig };
}
