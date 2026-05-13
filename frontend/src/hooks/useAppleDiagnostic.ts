'use client';

import { useEffect, useMemo, useState } from 'react';
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
    [probe?.at],
  );

  const lastProbeResult = useMemo(
    () =>
      probe?.result === 'PASS' || probe?.result === 'FAIL'
        ? (probe.result as 'PASS' | 'FAIL')
        : null,
    [probe?.result],
  );

  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!configured || !lastProbeAt || lastProbeResult !== 'PASS') {
      setReady(false);
      return;
    }

    const probeMs = lastProbeAt.getTime();

    const check = () => {
      setReady(Date.now() - probeMs <= SEVEN_DAYS_MS);
    };

    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [configured, lastProbeAt, lastProbeResult]);

  return {
    ready,
    configured,
    lastProbeAt,
    lastProbeResult,
  };
}
