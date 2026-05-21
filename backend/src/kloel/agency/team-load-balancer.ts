/**
 * UTP-AGENCY-006 — Team Load Balancer.
 *
 * Balances team allocation across clients. Identifies
 * overworked and underutilized team members based on
 * capacity vs assigned clients. Produces actionable
 * recommendations.
 *
 * Pure function — stateless computation from assignments.
 */

import type { ClientContextBundle, LoadInput, TeamLoadBalance, TeamMemberLoad } from './types';
import { OVERLOAD_THRESHOLD, UNDERLOAD_THRESHOLD } from './types';

export interface BalanceResult {
  readonly balance: TeamLoadBalance;
  readonly needsRebalance: boolean;
}

function computeMemberLoad(
  member: { readonly memberId: string; readonly memberName: string; readonly maxCapacity: number },
  assignedClients: readonly string[],
  bundles: readonly ClientContextBundle[],
): TeamMemberLoad {
  const assignedSet = new Set(assignedClients);
  let totalRevenue = 0n;
  for (const b of bundles) {
    if (assignedSet.has(b.clientId)) {
      totalRevenue += b.monthlyRevenueCents;
    }
  }

  const clientCount = assignedClients.length;
  const loadPercent = member.maxCapacity > 0 ? clientCount / member.maxCapacity : 0;

  return {
    memberId: member.memberId,
    memberName: member.memberName,
    assignedClients: clientCount,
    maxCapacity: member.maxCapacity,
    loadPercent: Math.round(loadPercent * 100) / 100,
    totalClientRevenueCents: totalRevenue,
  };
}

function buildRecommendation(
  overworked: readonly string[],
  underutilized: readonly string[],
): string {
  if (overworked.length === 0 && underutilized.length === 0) {
    return 'Carga balanceada — nenhum ajuste necessario.';
  }
  if (overworked.length > 0 && underutilized.length > 0) {
    return `${overworked.length} membro(s) sobrecarregado(s), ${underutilized.length} subutilizado(s). Redistribuir clientes.`;
  }
  if (overworked.length > 0) {
    return `${overworked.length} membro(s) sobrecarregado(s). Contratar ou redistribuir carga.`;
  }
  return `${underutilized.length} membro(s) subutilizado(s). Alocar novos clientes.`;
}

export function balanceLoad(input: LoadInput): BalanceResult {
  const nowMs = input.nowMs ?? Date.now();

  const memberLoads: TeamMemberLoad[] = input.members.map((member) => {
    const assigned = input.assignments[member.memberId] ?? [];
    return computeMemberLoad(member, assigned, input.bundles);
  });

  const overworkedMembers = memberLoads
    .filter((m) => m.loadPercent >= OVERLOAD_THRESHOLD)
    .map((m) => m.memberId);

  const underutilizedMembers = memberLoads
    .filter((m) => m.loadPercent <= UNDERLOAD_THRESHOLD && m.loadPercent > 0)
    .map((m) => m.memberId);

  const recommendation = buildRecommendation(overworkedMembers, underutilizedMembers);

  const balance: TeamLoadBalance = {
    workspaceId: input.workspaceId,
    teamMembers: memberLoads,
    overworkedMembers,
    underutilizedMembers,
    recommendation,
    assessedAt: new Date(nowMs).toISOString(),
  };

  const needsRebalance = overworkedMembers.length > 0 || underutilizedMembers.length > 0;

  return { balance, needsRebalance };
}
