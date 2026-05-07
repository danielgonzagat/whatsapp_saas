'use client';

import { swrFetcher } from '@/lib/fetcher';
import { api } from '@/lib/api/core';
import useSWR from 'swr';
import { useCallback, useState } from 'react';
import { useWorkspaceId } from './useWorkspaceId';
import type { MindBelief, MindLift, MindTick, MindNarrateOutput } from '@/lib/mind-client';

function mindUrl(path: string, params?: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) search.set(k, v);
    }
  }
  const qs = search.toString();
  return `${path}${qs ? `?${qs}` : ''}`;
}

const KNOWN_PREDICATES = [
  'P(reply|template,hour,channel)',
  'P(conversion|segment,price_band,channel,hour)',
] as const;

const KNOWN_DECISION_TYPES = ['followup_timing', 'send_window', 'offer_discount'] as const;

export function useMindNarrate() {
  const wsId = useWorkspaceId();
  const key = wsId ? `/mind/${wsId}/narrate` : null;
  const { data, error, isLoading, mutate } = useSWR<MindNarrateOutput>(key, swrFetcher, {
    keepPreviousData: true,
    refreshInterval: 120_000,
  });
  return { narrate: data, isLoading, error, mutate };
}

export function useMindBeliefs(predicate: string, subject?: string) {
  const wsId = useWorkspaceId();
  const key = wsId ? `/mind/${wsId}/beliefs${mindUrl('', { predicate, subject })}` : null;
  const { data, error, isLoading, mutate } = useSWR<MindBelief[]>(key, swrFetcher, {
    keepPreviousData: true,
    refreshInterval: 60_000,
  });
  return { beliefs: data ?? [], isLoading, error, mutate };
}

export function useMindAllBeliefs() {
  return {
    replyBeliefs: useMindBeliefs(KNOWN_PREDICATES[0]),
    conversionBeliefs: useMindBeliefs(KNOWN_PREDICATES[1]),
  };
}

export function useMindLift(decisionType: string, sinceDays = 14) {
  const wsId = useWorkspaceId();
  const key = wsId
    ? `/mind/${wsId}/lift/${encodeURIComponent(decisionType)}?sinceDays=${sinceDays}`
    : null;
  const { data, error, isLoading, mutate } = useSWR<MindLift>(key, swrFetcher, {
    keepPreviousData: true,
    refreshInterval: 120_000,
  });
  return { lift: data, isLoading, error, mutate };
}

export function useMindAllLifts(sinceDays = 14) {
  return {
    followup: useMindLift(KNOWN_DECISION_TYPES[0], sinceDays),
    sendWindow: useMindLift(KNOWN_DECISION_TYPES[1], sinceDays),
    offerDiscount: useMindLift(KNOWN_DECISION_TYPES[2], sinceDays),
  };
}

export function useMindTick() {
  const wsId = useWorkspaceId();
  const [tick, setTick] = useState<MindTick | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trigger = useCallback(async () => {
    if (!wsId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<MindTick>(`/mind/${wsId}/tick`);
      setTick(res.data);
      return res.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'tick_failed';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [wsId]);

  return { tick, isLoading, error, trigger };
}
