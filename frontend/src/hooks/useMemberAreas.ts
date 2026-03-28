'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

interface MemberAreaStats {
  totalAreas: number;
  totalStudents: number;
  avgCompletion: number;
  avgRating: number;
}

interface MemberAreasResponse {
  areas?: unknown[];
}

export function useMemberAreas() {
  const { data, isLoading, error, mutate } = useSWR('/member-areas', swrFetcher);
  const d = data as MemberAreasResponse | unknown[] | undefined;
  const areas = (d && typeof d === 'object' && 'areas' in d) ? (d.areas || []) : (Array.isArray(d) ? d : []);
  return { areas, isLoading, error, mutate };
}

export function useMemberAreaStats() {
  const { data, isLoading, error } = useSWR<MemberAreaStats>('/member-areas/stats', swrFetcher);
  return {
    stats: (data as MemberAreaStats) || { totalAreas: 0, totalStudents: 0, avgCompletion: 0, avgRating: 0 },
    isLoading,
    error,
  };
}
