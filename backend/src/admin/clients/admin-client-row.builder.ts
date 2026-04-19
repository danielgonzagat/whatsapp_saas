/**
 * Builder for admin client rows. Delegates metric extraction to
 * ./admin-client-metrics so Lizard measures each helper independently
 * (TypeScript grammar bundles neighbouring small functions into the
 * closest exported symbol).
 */
import type { AdminClientRow } from './admin-clients.service';
import { computeGrowthRate, computeHealthScore } from './admin-clients.metrics';
import { type AdminClientMetricsSnapshot, extractClientMetrics } from './admin-client-metrics';

export type ClientWorkspaceRow = {
  id: string;
  name: string;
  customDomain: string | null;
  createdAt: Date;
  agents: Array<{ email: string | null; name: string | null; kycStatus: string | null }>;
  subscription: { plan: string | null; status: string | null } | null;
};

export interface AdminClientMetricMaps {
  currentGmvMap: Map<string, number>;
  previousGmvMap: Map<string, number>;
  lastSaleMap: Map<string, string | null>;
  productMap: Map<string, number>;
}

function projectClientIdentity(
  workspace: ClientWorkspaceRow,
): Pick<AdminClientRow, 'workspaceId' | 'name' | 'ownerEmail' | 'ownerName' | 'createdAt'> {
  const owner = workspace.agents[0] ?? null;
  return {
    workspaceId: workspace.id,
    name: workspace.name,
    ownerEmail: owner?.email ?? null,
    ownerName: owner?.name ?? null,
    createdAt: workspace.createdAt.toISOString(),
  };
}

function projectClientSubscription(
  workspace: ClientWorkspaceRow,
): Pick<AdminClientRow, 'plan' | 'subscriptionStatus' | 'customDomain'> {
  return {
    plan: workspace.subscription?.plan ?? null,
    subscriptionStatus: workspace.subscription?.status ?? null,
    customDomain: workspace.customDomain ?? null,
  };
}

function computeRowHealthScore(
  workspace: ClientWorkspaceRow,
  metrics: AdminClientMetricsSnapshot,
): number {
  return computeHealthScore({
    gmvLast30dInCents: metrics.currentGmv,
    previousGmvLast30dInCents: metrics.previousGmv,
    lastSaleAt: metrics.lastSaleAt,
    kycStatus: metrics.kycStatus,
    customDomain: workspace.customDomain ?? null,
    productCount: metrics.productCount,
  });
}

export function buildAdminClientRow(
  workspace: ClientWorkspaceRow,
  maps: AdminClientMetricMaps,
): AdminClientRow {
  const metrics = extractClientMetrics(workspace, maps);
  return {
    ...projectClientIdentity(workspace),
    kycStatus: metrics.kycStatus,
    gmvLast30dInCents: metrics.currentGmv,
    previousGmvLast30dInCents: metrics.previousGmv,
    growthRate: computeGrowthRate(metrics.currentGmv, metrics.previousGmv),
    lastSaleAt: metrics.lastSaleAt,
    productCount: metrics.productCount,
    ...projectClientSubscription(workspace),
    healthScore: computeRowHealthScore(workspace, metrics),
  };
}
