import { apiFetch } from './core';

export const partnershipsApi = {
  affiliatePerformance: (affiliateId: string) =>
    apiFetch<{
      monthlyPerformance: number[];
      totalSales: number;
      totalRevenue: number;
      commission: number;
      lastSaleAt?: string;
    }>(`/partnerships/affiliates/${encodeURIComponent(affiliateId)}/performance`),
};
