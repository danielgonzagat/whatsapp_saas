'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

interface MemberAreaStats {
  totalAreas: number;
  totalStudents: number;
  avgCompletion: number;
  avgRating: number;
}

export function useMemberAreas() {
  const { data, isLoading, error, mutate } = useSWR('/member-areas', swrFetcher);
  const d = data as any;
  const areas = d?.areas || (Array.isArray(d) ? d : []);
  return { areas, isLoading, error, mutate };
}

export function useMemberAreaStats() {
  const { data, isLoading } = useSWR<MemberAreaStats>('/member-areas/stats', swrFetcher);
  return {
    stats: (data as MemberAreaStats) || { totalAreas: 0, totalStudents: 0, avgCompletion: 0, avgRating: 0 },
    isLoading,
  };
}
