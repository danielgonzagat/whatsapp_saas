import type { Prisma } from '@prisma/client';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import type { PrismaService } from '../prisma/prisma.service';
import { AccountDeps } from './account-agent.gap-detector';
import { asProviderSettings } from './provider-settings.types';

function toJson(value: unknown): Prisma.InputJsonValue {
  return toPrismaJsonValue(value);
}

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
  const billingSuspended =
    asProviderSettings(workspace?.providerSettings).billingSuspended === true;
  const doUpsert = async (input: {
    kind: string;
    entityType: string;
    entityId: string;
    state: string;
    title: string;
    summary: string;
    priority: number;
    utility: number;
    requiresApproval: boolean;
    requiresInput: boolean;
    approvalState: string | null;
    inputState: string | null;
    blockedBy: Record<string, unknown> | null;
    evidence: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }) => {
    const id = `${workspaceId}:${input.kind}:${input.entityType}:${input.entityId}`;
    const prev = await deps.prisma.agentWorkItem.findFirst({
      where: { id, workspaceId },
      select: { id: true, state: true, title: true, summary: true, priority: true, utility: true },
    });
    const upd = {
      state: input.state,
      owner: input.state === 'BLOCKED' ? 'RULES' : 'AGENT',
      title: input.title,
      summary: input.summary || null,
      priority: input.priority,
      utility: input.utility,
      blockedBy: input.blockedBy ? toJson(input.blockedBy) : null,
      requiresApproval: input.requiresApproval,
      requiresInput: input.requiresInput,
      approvalState: input.approvalState || null,
      inputState: input.inputState || null,
      evidence: toJson(input.evidence),
      metadata: toJson(input.metadata),
    };
    await deps.prisma.agentWorkItem.upsert({
      where: { id },
      update: upd,
      create: {
        id,
        workspaceId,
        kind: input.kind,
        entityType: input.entityType,
        entityId: input.entityId,
        ...upd,
      },
    });
    const changed =
      !prev ||
      prev.state !== input.state ||
      prev.title !== input.title ||
      String(prev.summary || '') !== String(input.summary || '') ||
      Number(prev.priority || 0) !== Number(input.priority || 0) ||
      Number(prev.utility || 0) !== Number(input.utility || 0);
    if (changed)
      await deps.agentEvents.publish({
        type: 'account',
        workspaceId,
        phase: prev ? 'account_work_item_updated' : 'account_work_item_created',
        persistent: input.state === 'BLOCKED',
        message: prev
          ? `Atualizei ${input.title} para ${input.state}.`
          : `Materializei ${input.title} no universo operacional da conta.`,
        meta: {
          workItemId: id,
          kind: input.kind,
          entityType: input.entityType,
          entityId: input.entityId,
          state: input.state,
          previousState: prev?.state || null,
          priority: input.priority,
          utility: input.utility,
          requiresApproval: input.requiresApproval,
          requiresInput: input.requiresInput,
          capabilityCode: input.metadata.capabilityCode || null,
        },
      });
  };
  const mk = (
    kind: string,
    eType: string,
    eId: string,
    state: string,
    title: string,
    summary: string,
    priority: number,
    utility: number,
    reqApproval: boolean,
    reqInput: boolean,
    apprState: string | null,
    inpState: string | null,
    blocked: Record<string, unknown> | null,
    evidence: Record<string, unknown>,
    metadata: Record<string, unknown>,
  ) =>
    doUpsert({
      kind,
      entityType: eType,
      entityId: eId,
      state,
      title,
      summary,
      priority,
      utility,
      requiresApproval: reqApproval,
      requiresInput: reqInput,
      approvalState: apprState,
      inputState: inpState,
      blockedBy: blocked,
      evidence,
      metadata,
    });

  await Promise.all([
    mk(
      'billing_update_required',
      'workspace',
      workspaceId,
      billingSuspended ? 'BLOCKED' : 'COMPLETED',
      billingSuspended ? 'Billing da conta exige ação' : 'Billing da conta está operacional',
      billingSuspended
        ? 'A conta está suspensa por billing e exige intervenção estrutural.'
        : 'Billing operacional sem bloqueio estrutural.',
      100,
      billingSuspended ? 100 : 0,
      true,
      billingSuspended,
      billingSuspended ? 'REQUIRED' : null,
      billingSuspended ? 'REQUIRED' : null,
      billingSuspended ? { reason: 'billing_suspended' } : null,
      { billingSuspended },
      { capabilityCode: 'BILLING_CONFIGURATION' },
    ),
    mk(
      'domain_gap',
      'workspace',
      workspaceId,
      workspace?.customDomain ? 'COMPLETED' : 'OPEN',
      workspace?.customDomain ? 'Domínio da conta configurado' : 'Conta sem domínio configurado',
      workspace?.customDomain
        ? `Domínio ativo: ${workspace.customDomain}`
        : 'A conta ainda não possui domínio próprio configurado.',
      48,
      workspace?.customDomain ? 0 : 48,
      true,
      !workspace?.customDomain,
      workspace?.customDomain ? null : 'REQUIRED',
      workspace?.customDomain ? null : 'REQUIRED',
      null,
      { customDomain: workspace?.customDomain || null },
      { capabilityCode: 'DOMAIN_CONFIGURATION' },
    ),
    mk(
      'webhook_gap',
      'workspace',
      workspaceId,
      webhookCount > 0 ? 'COMPLETED' : 'OPEN',
      webhookCount > 0 ? 'Webhooks configurados' : 'Conta sem webhooks ativos',
      webhookCount > 0
        ? `${webhookCount} webhook(s) ativo(s).`
        : 'A conta ainda não possui webhook ativo configurado.',
      44,
      webhookCount > 0 ? 0 : 44,
      true,
      webhookCount === 0,
      webhookCount > 0 ? null : 'REQUIRED',
      webhookCount > 0 ? null : 'REQUIRED',
      null,
      { activeWebhookCount: webhookCount },
      { capabilityCode: 'WEBHOOK_CONFIGURATION' },
    ),
    mk(
      'api_key_gap',
      'workspace',
      workspaceId,
      apiKeyCount > 0 ? 'COMPLETED' : 'OPEN',
      apiKeyCount > 0 ? 'API keys configuradas' : 'Conta sem API key',
      apiKeyCount > 0
        ? `${apiKeyCount} API key(s) cadastrada(s).`
        : 'A conta ainda não possui API key configurada.',
      42,
      apiKeyCount > 0 ? 0 : 42,
      true,
      apiKeyCount === 0,
      apiKeyCount > 0 ? null : 'REQUIRED',
      apiKeyCount > 0 ? null : 'REQUIRED',
      null,
      { apiKeyCount },
      { capabilityCode: 'API_KEY_CONFIGURATION' },
    ),
    mk(
      'team_configuration_gap',
      'workspace',
      workspaceId,
      agentCount > 0 ? 'COMPLETED' : 'OPEN',
      agentCount > 0 ? 'Time configurado' : 'Conta sem agentes',
      agentCount > 0
        ? `${agentCount} agente(s) cadastrado(s).`
        : 'A conta ainda não possui agentes/equipe configurados.',
      40,
      agentCount > 0 ? 0 : 40,
      true,
      agentCount === 0,
      agentCount > 0 ? null : 'REQUIRED',
      agentCount > 0 ? null : 'REQUIRED',
      null,
      { agentCount },
      { capabilityCode: 'TEAM_CONFIGURATION' },
    ),
    mk(
      'flow_creation_candidate',
      'workspace',
      workspaceId,
      flowCount > 0 ? 'COMPLETED' : 'OPEN',
      flowCount > 0 ? 'Flows configurados' : 'Conta sem flow comercial',
      flowCount > 0
        ? `${flowCount} flow(s) disponível(is).`
        : 'A conta ainda não possui flow comercial configurado.',
      32,
      flowCount > 0 ? 0 : 32,
      false,
      flowCount === 0,
      null,
      flowCount > 0 ? null : 'REQUIRED',
      null,
      { flowCount },
      { capabilityCode: 'FLOW_CONFIGURATION' },
    ),
    mk(
      'campaign_launch_candidate',
      'workspace',
      workspaceId,
      campaignCount > 0 ? 'COMPLETED' : 'OPEN',
      campaignCount > 0 ? 'Campanhas configuradas' : 'Conta sem campanha ativa',
      campaignCount > 0
        ? `${campaignCount} campanha(s) cadastrada(s).`
        : 'A conta ainda não possui campanha comercial configurada.',
      28,
      campaignCount > 0 ? 0 : 28,
      false,
      campaignCount === 0,
      null,
      campaignCount > 0 ? null : 'REQUIRED',
      null,
      { campaignCount },
      { capabilityCode: 'CAMPAIGN_CONFIGURATION' },
    ),
    mk(
      'catalog_gap_detected',
      'catalog',
      'primary',
      productCount > 0 ? 'COMPLETED' : 'OPEN',
      productCount > 0 ? 'Catálogo ativo' : 'Conta sem produto ativo',
      productCount > 0
        ? `${productCount} produto(s) ativo(s) no catálogo.`
        : 'A conta ainda não possui produto ativo no catálogo.',
      60,
      productCount > 0 ? 0 : 60,
      true,
      productCount === 0,
      productCount > 0 ? null : 'REQUIRED',
      productCount > 0 ? null : 'REQUIRED',
      null,
      { activeProductCount: productCount },
      { capabilityCode: 'CATALOG_PRODUCT_CREATE' },
    ),
  ]);
}
