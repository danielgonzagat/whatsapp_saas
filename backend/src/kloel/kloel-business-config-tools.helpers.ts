/**
 * Pure helpers extracted from KloelBusinessConfigToolsService.
 * No DB or external service access — only data shaping, validation, and
 * predicate logic. Tested via the service spec (covers the call sites).
 */
import { Prisma } from '@prisma/client';

/** Generic tool result shape returned by KloelBusinessConfigToolsService methods. */
export interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

export interface ToolListLeadsArgs {
  limit?: number;
  status?: string;
  query?: string;
}

export interface ToolGetLeadDetailsArgs {
  phone?: string;
  leadId?: string;
}

export interface ToolSaveBusinessInfoArgs {
  businessName?: string;
  description?: string;
  segment?: string;
  businessHours?: Record<string, unknown>;
  socialChannels?: Record<string, unknown>;
}

export interface ToolSetBusinessHoursArgs {
  weekdayStart?: string;
  weekdayEnd?: string;
  saturdayStart?: string;
  saturdayEnd?: string;
  workOnSunday?: boolean;
}

export interface ToolCreateCampaignArgs {
  name: string;
  message: string;
  targetAudience?: string;
}

export interface ToolUpdateBillingInfoArgs {
  returnUrl?: string;
}

export interface ToolChangePlanArgs {
  newPlan: string;
  immediate?: boolean;
}

/** Fiscal/banking fields accepted by toolSaveBusinessInfo (extension). */
export interface FiscalArgs {
  cnpj?: string;
  cpf?: string;
  cep?: string;
  bankCode?: string;
  agency?: string;
  account?: string;
}

const QUERY_PREFIX_RE =
  /^(busca|procura|pesquisa|lead|contato|cliente|comprador|compradora)(\s+(lead|contato|cliente|comprador|compradora))?\s+/i;

/**
 * Strips lead-search prefixes ("busca lead X", "procura cliente Y") leaving the
 * actual search term. Returns an empty string for no-op inputs.
 */
export function sanitizeLeadQuery(query: unknown): string {
  if (typeof query !== 'string') {
    return '';
  }
  return query.replace(QUERY_PREFIX_RE, '').trim();
}

/**
 * Build the Prisma where clause for KloelBusinessConfigToolsService.toolListLeads.
 * Workspace isolation is always enforced.
 */
export function buildListLeadsWhere(
  workspaceId: string,
  args: ToolListLeadsArgs,
): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { workspaceId };
  if (args.status === 'qualified' || args.status === 'hot') {
    where.leadScore = { gte: 70 };
  } else if (args.status === 'cold') {
    where.leadScore = { lt: 30 };
  }
  const cleaned = sanitizeLeadQuery(args.query);
  if (cleaned) {
    where.name = { contains: cleaned, mode: 'insensitive' };
  }
  return where;
}

/** Lead row shape returned by toolListLeads (subset). */
export interface LeadListRow {
  id: string;
  name: string | null;
  phone: string;
  leadScore: number | null;
  sentiment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Project a Contact row into the public-facing lead summary. */
export function mapLeadListRow(c: LeadListRow) {
  return {
    id: c.id,
    name: c.name || 'Sem nome',
    phone: c.phone,
    score: c.leadScore || 0,
    sentiment: c.sentiment,
    lastUpdate: c.updatedAt,
  };
}

/** Project a Contact-with-tags-and-conversations row into the lead-details payload. */
export interface LeadDetailRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  sentiment: string | null;
  leadScore: number | null;
  tags: Array<{ name: string }>;
  conversations: Array<{
    messages: Array<{ content: string | null; direction: string; createdAt: Date }>;
  }>;
}

export function mapLeadDetail(contact: LeadDetailRow) {
  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    sentiment: contact.sentiment,
    score: contact.leadScore,
    tags: contact.tags.map((t) => t.name),
    recentMessages:
      contact.conversations[0]?.messages.map((m) => ({
        content: m.content?.substring(0, 100),
        direction: m.direction,
        date: m.createdAt,
      })) || [],
  };
}

/** Build the fiscal fields delta (only defined entries). */
export function extractFiscalFields(args: FiscalArgs): Record<string, unknown> {
  const fiscalFields: Record<string, unknown> = {};
  if (args.cnpj) {
    fiscalFields.cnpj = args.cnpj;
  }
  if (args.cpf) {
    fiscalFields.cpf = args.cpf;
  }
  if (args.cep) {
    fiscalFields.cep = args.cep;
  }
  if (args.bankCode) {
    fiscalFields.bankCode = args.bankCode;
  }
  if (args.agency) {
    fiscalFields.agency = args.agency;
  }
  if (args.account) {
    fiscalFields.account = args.account;
  }
  return fiscalFields;
}

/**
 * Compose the provider-settings JSON for toolSaveBusinessInfo.
 * Pure function — caller is responsible for actually writing it.
 */
export function buildBusinessProviderSettings(
  currentSettings: Record<string, unknown>,
  description: string | undefined,
  segment: string | undefined,
  fiscalFields: Record<string, unknown>,
): Record<string, unknown> {
  const hasFiscal = Object.keys(fiscalFields).length > 0;
  const existingFiscal =
    typeof currentSettings.fiscal === 'object' && currentSettings.fiscal !== null
      ? (currentSettings.fiscal as Record<string, unknown>)
      : {};
  return {
    ...currentSettings,
    ...(description ? { businessDescription: description } : {}),
    ...(segment ? { businessSegment: segment } : {}),
    ...(hasFiscal
      ? {
          fiscal: {
            ...existingFiscal,
            ...fiscalFields,
          },
        }
      : {}),
  };
}

/** Compose the human-readable success message for toolSaveBusinessInfo. */
export function buildSaveBusinessInfoMessage(fiscalFields: Record<string, unknown>): string {
  const keys = Object.keys(fiscalFields);
  return keys.length > 0
    ? `Dados ${keys.join(', ')} salvos com sucesso.`
    : 'Informações do negócio salvas com sucesso.';
}

/** Build the business-hours payload from raw args. */
export function buildBusinessHoursPayload(args: ToolSetBusinessHoursArgs) {
  return {
    weekday: { start: args.weekdayStart || '09:00', end: args.weekdayEnd || '18:00' },
    saturday: args.saturdayStart ? { start: args.saturdayStart, end: args.saturdayEnd } : null,
    sunday: args.workOnSunday ? { start: '09:00', end: '13:00' } : null,
  };
}

/** Build the campaign audience contact filter (workspace-scoped). */
export function buildCampaignContactFilter(
  workspaceId: string,
  targetAudience: string | undefined,
): Prisma.ContactWhereInput {
  const contactFilter: Prisma.ContactWhereInput = { workspaceId };
  if (targetAudience === 'leads_quentes') {
    contactFilter.leadScore = { gte: 70 };
  } else if (targetAudience === 'novos') {
    contactFilter.createdAt = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
  }
  return contactFilter;
}

/** Document-type label lookup for toolUploadDocument. */
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  identidade: 'Documento de identidade',
  contrato: 'Contrato social / Cartão CNPJ',
  cnpj: 'Cartão CNPJ',
};

export function documentTypeLabel(docType: string): string {
  return DOCUMENT_TYPE_LABELS[docType.toLowerCase()] || 'Documento';
}

/** Affiliate-config args known fields. Caller mutates the target safely. */
const AFFILIATE_FIELDS = [
  'participate',
  'visibleInStore',
  'autoApproval',
  'accessData',
  'accessAbandonments',
  'commissionFirstInstallment',
  'attributionModel',
  'cookieDays',
  'commissionPercent',
] as const;

export function applyAffiliateConfig(
  affiliate: Record<string, unknown>,
  args: Record<string, unknown>,
): Record<string, unknown> {
  for (const field of AFFILIATE_FIELDS) {
    if (args[field] !== undefined) {
      affiliate[field] = args[field];
    }
  }
  return affiliate;
}

/** Build the affiliate-config success message from the args bag. */
export function buildAffiliateConfigMessage(args: Record<string, unknown>): string {
  const fields = Object.keys(args)
    .filter((k) => k !== 'productName' && args[k] !== undefined)
    .join(', ');
  return `Configuracao de afiliados atualizada${fields ? ': ' + fields : ''}.`;
}

/** Build the social-channels view from a workspace row. */
export interface SocialChannelsWorkspace {
  providerSettings: Record<string, unknown> | null;
  metaConnections: Array<unknown> | null;
}

export function buildSocialChannelsView(workspace: SocialChannelsWorkspace) {
  const settings = workspace.providerSettings || {};
  const channels = (settings.channels as Record<string, unknown>) || {};
  const hasMetaConnection = !!(workspace.metaConnections && workspace.metaConnections.length > 0);
  return {
    whatsapp: { connected: !!settings.whatsappPhoneNumberId, label: 'WhatsApp' },
    instagram: { connected: hasMetaConnection, label: 'Instagram' },
    facebook: { connected: hasMetaConnection, label: 'Facebook' },
    tiktok: { connected: !!channels.tiktok, label: 'TikTok' },
    email: { connected: !!settings.emailProvider, label: 'Email' },
  };
}

const CONNECTABLE_CHANNELS = ['instagram', 'facebook', 'tiktok', 'email'];

/** Normalize a channel arg and report whether it is a known oauth target. */
export function normalizeConnectableChannel(raw: unknown): {
  channel: string;
  isValid: boolean;
} {
  const channel = typeof raw === 'string' ? raw.toLowerCase() : '';
  return { channel, isValid: CONNECTABLE_CHANNELS.includes(channel) };
}

const VALID_PLANS = ['starter', 'pro', 'enterprise', 'free'];

/**
 * Validate the input to toolChangePlan. Returns an error string when the input
 * is invalid (missing or unknown plan), null when valid.
 */
export function validatePlanInput(newPlan: string | undefined): string | null {
  if (!newPlan) {
    return 'Parâmetro obrigatório: newPlan (starter, pro, enterprise)';
  }
  if (!VALID_PLANS.includes(newPlan.toLowerCase())) {
    return `Plano inválido. Opções: ${VALID_PLANS.join(', ')}`;
  }
  return null;
}

/** Convert a plan code to the canonical uppercase form. */
export function canonicalPlan(plan: string): string {
  return plan.toUpperCase();
}

/** Build the billing-status response from a workspace row + settings. */
export interface BillingStatusWorkspace {
  stripeCustomerId: string | null;
  providerSettings: unknown;
  subscription: { plan: string | null; stripeId: string | null } | null;
}

export function buildBillingStatusResponse(workspace: BillingStatusWorkspace): ToolResult {
  const settings = (workspace.providerSettings as Record<string, unknown> | null) || {};
  const plan = String(workspace.subscription?.plan || 'FREE');
  const subscriptionId = workspace.subscription?.stripeId || null;
  const suspended = !!settings.billingSuspended;
  return {
    success: true,
    plan,
    status: suspended ? 'SUSPENDED' : 'ACTIVE',
    hasPaymentMethod: !!workspace.stripeCustomerId,
    subscriptionId,
    message: suspended
      ? 'Cobrança suspensa. Regularize para continuar usando.'
      : `Plano ${plan} ativo`,
  };
}
