'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { ReportFilters, SetFilters, SetPage } from './analytics.types';

const VISIBLE_REPORT_TABS = new Set(['vendas', 'abandonos', 'assinaturas', 'estornos']);

export function normalizeVisibleReportTab(tab: string | null | undefined): string {
  return tab && VISIBLE_REPORT_TABS.has(tab) ? tab : 'vendas';
}

const defaultStartDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
const defaultEndDate = new Date().toISOString().split('T')[0];

export function useAnalyticsFilters() {
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get('tab');

  const [active, setActive] = useState<string>(normalizeVisibleReportTab(tabParam));
  const [page, setPage] = useState<number>(1);
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
  });

  const baseFilters: ReportFilters & { page: number; perPage: number } = {
    ...filters,
    page,
    perPage: 10,
  };

  return {
    active,
    setActive,
    page,
    setPage: setPage as SetPage,
    showFilter,
    setShowFilter,
    filters,
    setFilters: setFilters as SetFilters,
    baseFilters,
    visibleTabs: VISIBLE_REPORT_TABS,
  };
}
