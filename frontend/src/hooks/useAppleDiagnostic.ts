'use client';

import { useEffect, useMemo, useReducer } from 'react';
import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';
import type { AppleDiagnosticResponse } from '@/lib/api/apple';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface AppleDiagnosticState {
  ready: boolean;
  configured: boolean;
  lastProbeAt: Date | null;
  lastProbeResult: 'PASS' | 'FAIL' | null;
}

interface ReadyAction {
  type: 'RECALC';
  configured: boolean;
  lastProbeAt: Date | null;
  lastProbeResult: 'PASS' | 'FAIL' | null;
}

function readyReducer(_prev: boolean, action: ReadyAction): boolean {
  if (!action.configured || !action.lastProbeAt || action.lastProbeResult !== 'PASS') {
    return false;
  }
  return Date.now() - action.lastProbeAt.getTime() <= SEVEN_DAYS_MS;
}

export function useAppleDiagnostic(): AppleDiagnosticState {
  const { data } = useSWR<AppleDiagnosticResponse>(
    '/auth/apple/diagnostic',
    swrFetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    },
  );

  const configured = data?.configured ?? false;
  const probe = data?.lastProbe ?? null;

  const lastProbeAt = useMemo(
    () => (probe?.at ? new Date(probe.at) : null),
    [probe],
  );
  const lastProbeResult =
    probe?.result === 'PASS' || probe?.result === 'FAIL'
      ? (probe.result as 'PASS' | 'FAIL')
      : null;

  const [ready, dispatch] = useReducer(readyReducer, false);

  useEffect(() => {
    dispatch({ type: 'RECALC', configured, lastProbeAt, lastProbeResult });

    if (!configured || !lastProbeAt || lastProbeResult !== 'PASS') {
      return;
    }

    const interval = setInterval(() => {
      dispatch({ type: 'RECALC', configured, lastProbeAt, lastProbeResult });
    }, 30000);
    return () => clearInterval(interval);
  }, [configured, lastProbeAt, lastProbeResult]);

  return {
    ready,
    configured,
    lastProbeAt,
    lastProbeResult,
  };
}
