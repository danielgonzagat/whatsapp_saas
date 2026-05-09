'use client';

import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';
import type { CapabilityCategory, CapabilityRole, CapabilityStatus } from '@/lib/capability-data/types';

export interface FrontendCapability {
  icon: string;
  title: string;
  desc: string;
  badge?: string;
  category: CapabilityCategory;
  roles: CapabilityRole[];
  status: CapabilityStatus;
  route: string;
  roadmapActions?: string[];
}

import { FRONTEND_CAPABILITIES as STATIC_CAPABILITIES } from '@/lib/capability-data';
import type { FrontendCapability as StaticCapability } from '@/lib/capability-data';

function toFrontendCapability(c: StaticCapability): FrontendCapability {
  return {
    icon: c.icon,
    title: c.title,
    desc: c.desc,
    badge: c.badge,
    category: c.category,
    roles: [...c.roles],
    status: c.status,
    route: c.route,
    roadmapActions: c.roadmapActions ? [...c.roadmapActions] : undefined,
  };
}

const FALLBACK_CAPABILITIES: FrontendCapability[] = STATIC_CAPABILITIES.map(toFrontendCapability);

export function useCapabilities() {
  const { data, error, isLoading } = useSWR<FrontendCapability[]>(
    '/capabilities',
    swrFetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    },
  );

  const capabilities = Array.isArray(data) && data.length > 0 ? data : FALLBACK_CAPABILITIES;
  const apiError = error ? (error as Error).message : null;

  return { capabilities, isLoading, error: apiError };
}
