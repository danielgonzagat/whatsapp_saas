export interface GapCheckInput {
  workspaceId: string;
  customDomain: string | null | undefined;
  billingSuspended: boolean;
  apiKeyCount: number;
  webhookCount: number;
  agentCount: number;
  flowCount: number;
  campaignCount: number;
  productCount: number;
}

interface GapCheckResult {
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
}

type GapChecker = (input: GapCheckInput) => GapCheckResult;

const checkBillingGap: GapChecker = (input) => ({
  kind: 'billing_update_required',
  entityType: 'workspace',
  entityId: input.workspaceId,
  state: input.billingSuspended ? 'BLOCKED' : 'COMPLETED',
  title: input.billingSuspended
    ? 'Billing da conta exige ação'
    : 'Billing da conta está operacional',
  summary: input.billingSuspended
    ? 'A conta está suspensa por billing e exige intervenção estrutural.'
    : 'Billing operacional sem bloqueio estrutural.',
  priority: 100,
  utility: input.billingSuspended ? 100 : 0,
  requiresApproval: true,
  requiresInput: input.billingSuspended,
  approvalState: input.billingSuspended ? 'REQUIRED' : null,
  inputState: input.billingSuspended ? 'REQUIRED' : null,
  blockedBy: input.billingSuspended ? { reason: 'billing_suspended' } : null,
  evidence: { billingSuspended: input.billingSuspended },
  metadata: { capabilityCode: 'BILLING_CONFIGURATION' },
});

const checkDomainGap: GapChecker = (input) => ({
  kind: 'domain_gap',
  entityType: 'workspace',
  entityId: input.workspaceId,
  state: input.customDomain ? 'COMPLETED' : 'OPEN',
  title: input.customDomain ? 'Domínio da conta configurado' : 'Conta sem domínio configurado',
  summary: input.customDomain
    ? `Domínio ativo: ${input.customDomain}`
    : 'A conta ainda não possui domínio próprio configurado.',
  priority: 48,
  utility: input.customDomain ? 0 : 48,
  requiresApproval: true,
  requiresInput: !input.customDomain,
  approvalState: input.customDomain ? null : 'REQUIRED',
  inputState: input.customDomain ? null : 'REQUIRED',
  blockedBy: null,
  evidence: { customDomain: input.customDomain || null },
  metadata: { capabilityCode: 'DOMAIN_CONFIGURATION' },
});

const checkWebhookGap: GapChecker = (input) => ({
  kind: 'webhook_gap',
  entityType: 'workspace',
  entityId: input.workspaceId,
  state: input.webhookCount > 0 ? 'COMPLETED' : 'OPEN',
  title: input.webhookCount > 0 ? 'Webhooks configurados' : 'Conta sem webhooks ativos',
  summary:
    input.webhookCount > 0
      ? `${input.webhookCount} webhook(s) ativo(s).`
      : 'A conta ainda não possui webhook ativo configurado.',
  priority: 44,
  utility: input.webhookCount > 0 ? 0 : 44,
  requiresApproval: true,
  requiresInput: input.webhookCount === 0,
  approvalState: input.webhookCount > 0 ? null : 'REQUIRED',
  inputState: input.webhookCount > 0 ? null : 'REQUIRED',
  blockedBy: null,
  evidence: { activeWebhookCount: input.webhookCount },
  metadata: { capabilityCode: 'WEBHOOK_CONFIGURATION' },
});

const checkApiKeyGap: GapChecker = (input) => ({
  kind: 'api_key_gap',
  entityType: 'workspace',
  entityId: input.workspaceId,
  state: input.apiKeyCount > 0 ? 'COMPLETED' : 'OPEN',
  title: input.apiKeyCount > 0 ? 'API keys configuradas' : 'Conta sem API key',
  summary:
    input.apiKeyCount > 0
      ? `${input.apiKeyCount} API key(s) cadastrada(s).`
      : 'A conta ainda não possui API key configurada.',
  priority: 42,
  utility: input.apiKeyCount > 0 ? 0 : 42,
  requiresApproval: true,
  requiresInput: input.apiKeyCount === 0,
  approvalState: input.apiKeyCount > 0 ? null : 'REQUIRED',
  inputState: input.apiKeyCount > 0 ? null : 'REQUIRED',
  blockedBy: null,
  evidence: { apiKeyCount: input.apiKeyCount },
  metadata: { capabilityCode: 'API_KEY_CONFIGURATION' },
});

const checkTeamGap: GapChecker = (input) => ({
  kind: 'team_configuration_gap',
  entityType: 'workspace',
  entityId: input.workspaceId,
  state: input.agentCount > 0 ? 'COMPLETED' : 'OPEN',
  title: input.agentCount > 0 ? 'Time configurado' : 'Conta sem agentes',
  summary:
    input.agentCount > 0
      ? `${input.agentCount} agente(s) cadastrado(s).`
      : 'A conta ainda não possui agentes/equipe configurados.',
  priority: 40,
  utility: input.agentCount > 0 ? 0 : 40,
  requiresApproval: true,
  requiresInput: input.agentCount === 0,
  approvalState: input.agentCount > 0 ? null : 'REQUIRED',
  inputState: input.agentCount > 0 ? null : 'REQUIRED',
  blockedBy: null,
  evidence: { agentCount: input.agentCount },
  metadata: { capabilityCode: 'TEAM_CONFIGURATION' },
});

const checkFlowGap: GapChecker = (input) => ({
  kind: 'flow_creation_candidate',
  entityType: 'workspace',
  entityId: input.workspaceId,
  state: input.flowCount > 0 ? 'COMPLETED' : 'OPEN',
  title: input.flowCount > 0 ? 'Flows configurados' : 'Conta sem flow comercial',
  summary:
    input.flowCount > 0
      ? `${input.flowCount} flow(s) disponível(is).`
      : 'A conta ainda não possui flow comercial configurado.',
  priority: 32,
  utility: input.flowCount > 0 ? 0 : 32,
  requiresApproval: false,
  requiresInput: input.flowCount === 0,
  approvalState: null,
  inputState: input.flowCount > 0 ? null : 'REQUIRED',
  blockedBy: null,
  evidence: { flowCount: input.flowCount },
  metadata: { capabilityCode: 'FLOW_CONFIGURATION' },
});

const checkCampaignGap: GapChecker = (input) => ({
  kind: 'campaign_launch_candidate',
  entityType: 'workspace',
  entityId: input.workspaceId,
  state: input.campaignCount > 0 ? 'COMPLETED' : 'OPEN',
  title: input.campaignCount > 0 ? 'Campanhas configuradas' : 'Conta sem campanha ativa',
  summary:
    input.campaignCount > 0
      ? `${input.campaignCount} campanha(s) cadastrada(s).`
      : 'A conta ainda não possui campanha comercial configurada.',
  priority: 28,
  utility: input.campaignCount > 0 ? 0 : 28,
  requiresApproval: false,
  requiresInput: input.campaignCount === 0,
  approvalState: null,
  inputState: input.campaignCount > 0 ? null : 'REQUIRED',
  blockedBy: null,
  evidence: { campaignCount: input.campaignCount },
  metadata: { capabilityCode: 'CAMPAIGN_CONFIGURATION' },
});

const checkCatalogProductGap: GapChecker = (input) => ({
  kind: 'catalog_gap_detected',
  entityType: 'catalog',
  entityId: 'primary',
  state: input.productCount > 0 ? 'COMPLETED' : 'OPEN',
  title: input.productCount > 0 ? 'Catálogo ativo' : 'Conta sem produto ativo',
  summary:
    input.productCount > 0
      ? `${input.productCount} produto(s) ativo(s) no catálogo.`
      : 'A conta ainda não possui produto ativo no catálogo.',
  priority: 60,
  utility: input.productCount > 0 ? 0 : 60,
  requiresApproval: true,
  requiresInput: input.productCount === 0,
  approvalState: input.productCount > 0 ? null : 'REQUIRED',
  inputState: input.productCount > 0 ? null : 'REQUIRED',
  blockedBy: null,
  evidence: { activeProductCount: input.productCount },
  metadata: { capabilityCode: 'CATALOG_PRODUCT_CREATE' },
});

export const ALL_GAP_CHECKERS: GapChecker[] = [
  checkBillingGap,
  checkDomainGap,
  checkWebhookGap,
  checkApiKeyGap,
  checkTeamGap,
  checkFlowGap,
  checkCampaignGap,
  checkCatalogProductGap,
];
