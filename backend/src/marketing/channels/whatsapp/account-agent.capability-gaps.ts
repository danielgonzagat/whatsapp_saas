import { AccountDeps } from './account-agent.gap-detector';
import { asProviderSettings } from './provider-settings.types';
import { ALL_GAP_CHECKERS, type GapCheckInput } from './account-agent.gap-checkers';
import { upsertWorkItem, type WorkItemInput } from './account-agent.work-item-upsert';

export async function materializeAccountCapabilityGapsExt(deps: AccountDeps, workspaceId: string) {
  const [workspace, apiKeyCount, webhookCount, agentCount, flowCount, campaignCount, productCount] =
    await Promise.all([
      deps.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, customDomain: true, providerSettings: true },
      }),
      deps.prisma.apiKey.count({ where: { workspaceId } }),
      deps.prisma.webhookSubscription.count({ where: { workspaceId, isActive: true } }),
      deps.prisma.agent.count({ where: { workspaceId } }),
      deps.prisma.flow.count({ where: { workspaceId } }),
      deps.prisma.campaign.count({ where: { workspaceId } }),
      deps.prisma.product.count({ where: { workspaceId, active: true } }),
    ]);

  const checkInput: GapCheckInput = {
    workspaceId,
    customDomain: workspace?.customDomain,
    billingSuspended: asProviderSettings(workspace?.providerSettings).billingSuspended === true,
    apiKeyCount,
    webhookCount,
    agentCount,
    flowCount,
    campaignCount,
    productCount,
  };

  const results: WorkItemInput[] = ALL_GAP_CHECKERS.map((checker) => checker(checkInput));

  await Promise.all(results.map((r) => upsertWorkItem(deps, workspaceId, r)));
}
