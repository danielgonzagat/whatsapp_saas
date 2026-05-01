import { randomUUID } from 'node:crypto';
import { forEachSequential } from '../../common/async-sequence';
import { toPrismaJsonValue } from '../../common/prisma/prisma-json.util';

import type { PrismaService } from '../../prisma/prisma.service';
import type { AgentEventsService } from '../agent-events.service';
import type { AccountApprovalPayload, AccountInputSessionPayload } from '../account-agent.types';
import {
  buildProductDescription,
  buildProductFaq,
  detectCatalogGap as detectGap,
  extractMaxInstallments,
  extractMoneyValues,
  extractPercentages,
  extractUrls,
  parseOfferLines,
  slugifyCatalogKey,
} from '../account-agent.util';
import {
  asRecord,
  getPromptForStage,
  parseApprovalPayload,
  readString,
} from '../account-agent.parsers';
import { asProviderSettings } from '../provider-settings.types';

export type AccountDeps = {
  prisma: PrismaService;
  agentEvents: AgentEventsService;
};

function toJson(value: unknown): any {
  return toPrismaJsonValue(value);
}

function buildApprovalKey(np: string) {
  return `account_approval:product_creation:${np}`;
}
export async function detectCatalogGapExt(
  deps: AccountDeps,
  input: {
    workspaceId: string;
    contactId?: string | null;
    phone?: string | null;
    conversationId?: string | null;
    messageContent: string;
  },
) {
  const messageContent = String(input.messageContent || '').trim();
  if (!messageContent) return { created: false, approval: null, reason: 'empty_message' as const };
  const [products, memoryProducts] = await Promise.all([
    deps.prisma.product.findMany({
      where: { workspaceId: input.workspaceId, active: true },
      select: { name: true },
      take: 100,
    }),
    deps.prisma.kloelMemory.findMany({
      where: {
        workspaceId: input.workspaceId,
        OR: [{ type: 'product' }, { category: 'products' }],
      },
      select: { value: true },
      take: 100,
    }),
  ]);
  const productNames = Array.from(
    new Set(
      [
        ...products.map((p) => p.name),
        ...memoryProducts
          .map((m) => readString(asRecord(m.value)?.name))
          .filter((n): n is string => Boolean(n)),
      ]
        .map((n) => String(n || '').trim())
        .filter(Boolean),
    ),
  );
  const detection = detectGap({ messageContent, productNames });
  if (!detection.buyingIntent)
    return { created: false, approval: null, reason: 'no_buying_intent' as const };
  if (detection.matchedProducts.length > 0)
    return { created: false, approval: null, reason: 'catalog_match_found' as const };
  const missingProductName = String(detection.missingProductName || '').trim();
  if (!missingProductName)
    return { created: false, approval: null, reason: 'candidate_not_found' as const };
  const normalizedProductName = slugifyCatalogKey(missingProductName);
  if (!normalizedProductName)
    return { created: false, approval: null, reason: 'candidate_not_normalized' as const };
  const key = buildApprovalKey(normalizedProductName);
  const existing = await deps.prisma.kloelMemory.findUnique({
    where: { workspaceId_key: { workspaceId: input.workspaceId, key } },
  });
  const contact = input.contactId
    ? await deps.prisma.contact.findFirst({
        where: { id: input.contactId, workspaceId: input.workspaceId },
        select: { id: true, name: true, phone: true },
      })
    : null;
  const now = new Date().toISOString();
  const previous = parseApprovalPayload(existing?.value);
  const approval: AccountApprovalPayload = {
    id: previous?.id || randomUUID(),
    kind: 'product_creation',
    status:
      previous?.status === 'APPROVED' ||
      previous?.status === 'REJECTED' ||
      previous?.status === 'COMPLETED'
        ? previous.status
        : 'OPEN',
    requestedProductName: previous?.requestedProductName || missingProductName,
    normalizedProductName,
    contactId: input.contactId || previous?.contactId || null,
    contactName: contact?.name || previous?.contactName || null,
    phone: input.phone || contact?.phone || previous?.phone || null,
    conversationId: input.conversationId || previous?.conversationId || null,
    customerMessage: messageContent,
    operatorPrompt:
      previous?.operatorPrompt ||
      `Cliente ${contact?.name || input.phone || 'sem nome'} está querendo comprar ${missingProductName}. Deseja criar esse produto?`,
    source: 'inbound_catalog_gap',
    firstDetectedAt: previous?.firstDetectedAt || now,
    lastDetectedAt: now,
    inputSessionId: previous?.inputSessionId || null,
    materializedProductId: previous?.materializedProductId || null,
  };
  await deps.prisma.kloelMemory.upsert({
    where: { workspaceId_key: { workspaceId: input.workspaceId, key } },
    create: {
      workspaceId: input.workspaceId,
      key,
      value: toJson(approval),
      category: 'account_approval',
      type: 'product_creation',
      content: approval.operatorPrompt,
      metadata: toJson({
        status: approval.status,
        contactId: approval.contactId,
        phone: approval.phone,
        requestedProductName: approval.requestedProductName,
      }),
    },
    update: {
      value: toJson(approval),
      category: 'account_approval',
      type: 'product_creation',
      content: approval.operatorPrompt,
      metadata: toJson({
        status: approval.status,
        contactId: approval.contactId,
        phone: approval.phone,
        requestedProductName: approval.requestedProductName,
      }),
    },
  });
  await deps.prisma.approvalRequest.upsert({
    where: { id: approval.id },
    create: {
      id: approval.id,
      workspaceId: input.workspaceId,
      kind: approval.kind,
      scope: 'account',
      entityType: 'product',
      entityId: approval.normalizedProductName,
      state: approval.status,
      title: `Criar produto ${approval.requestedProductName}`,
      prompt: approval.operatorPrompt,
      payload: toJson(approval),
      respondedAt:
        approval.status === 'APPROVED' ||
        approval.status === 'REJECTED' ||
        approval.status === 'COMPLETED'
          ? new Date(approval.lastDetectedAt)
          : undefined,
    },
    update: {
      state: approval.status,
      prompt: approval.operatorPrompt,
      payload: toJson(approval),
      respondedAt:
        approval.status === 'APPROVED' ||
        approval.status === 'REJECTED' ||
        approval.status === 'COMPLETED'
          ? new Date(approval.lastDetectedAt)
          : null,
    },
  });
  if (!existing)
    await deps.agentEvents.publish({
      type: 'prompt',
      workspaceId: input.workspaceId,
      phase: 'account_catalog_gap',
      persistent: true,
      message: approval.operatorPrompt,
      meta: {
        approvalId: approval.id,
        requestedProductName: approval.requestedProductName,
        contactId: approval.contactId,
        phone: approval.phone,
        options: [
          { id: 'approve', label: 'Sim' },
          { id: 'reject', label: 'Não' },
        ],
      },
    });
  return {
    created: !existing,
    approval,
    reason: !existing ? ('created' as const) : ('updated' as const),
  };
}

export async function materializeProductExt(
  deps: AccountDeps,
  workspaceId: string,
  session: AccountInputSessionPayload,
) {
  const da = String(session.answers.description || '').trim();
  const oa = String(session.answers.offers || '').trim();
  const ca = String(session.answers.company || '').trim();
  const offers = parseOfferLines(oa);
  const urls = extractUrls(oa);
  const prices = extractMoneyValues(oa);
  const maxDiscount = extractPercentages(oa);
  const maxInstallments = extractMaxInstallments(oa);
  const faq = buildProductFaq({
    productName: session.productName,
    descriptionAnswer: da,
    offersAnswer: oa,
    companyAnswer: ca,
  });
  const description = buildProductDescription({
    productName: session.productName,
    descriptionAnswer: da,
    offers,
    companyAnswer: ca,
  });
  const existingProducts = await deps.prisma.product.findMany({
    where: { workspaceId },
    select: { id: true, name: true },
    take: 200,
  });
  const existing = existingProducts.find(
    (p) => slugifyCatalogKey(p.name) === session.normalizedProductName,
  );
  const meta = toJson({
    createdBy: 'account_agent',
    faq,
    offers,
    companyProfile: { raw: ca },
    operatorInputs: { description: da, offers: oa, company: ca },
    negotiation: {
      maxDiscountPercent: maxDiscount.length > 0 ? Math.max(...maxDiscount) : null,
      maxInstallments,
    },
  });
  const product = existing
    ? await (async () => {
        await deps.prisma.product.updateMany({
          where: { id: existing.id, workspaceId },
          data: {
            description,
            price: prices[0] || 0,
            paymentLink: urls[0] || null,
            active: true,
            metadata: meta,
          },
        });
        return deps.prisma.product.findFirstOrThrow({ where: { id: existing.id, workspaceId } });
      })()
    : await deps.prisma.product.create({
        data: {
          workspaceId,
          name: session.productName,
          description,
          price: prices[0] || 0,
          paymentLink: urls[0] || null,
          active: true,
          metadata: meta,
        },
      });
  await deps.prisma.kloelMemory.upsert({
    where: { workspaceId_key: { workspaceId, key: 'company_info:primary' } },
    create: {
      workspaceId,
      key: 'company_info:primary',
      value: toJson({
        source: 'account_agent',
        productName: session.productName,
        raw: ca,
        updatedAt: new Date().toISOString(),
      }),
      category: 'business',
      type: 'company_info',
      content: ca.slice(0, 1000),
      metadata: toJson({ productId: product.id }),
    },
    update: {
      value: toJson({
        source: 'account_agent',
        productName: session.productName,
        raw: ca,
        updatedAt: new Date().toISOString(),
      }),
      category: 'business',
      type: 'company_info',
      content: ca.slice(0, 1000),
      metadata: toJson({ productId: product.id }),
    },
  });
  await deps.prisma.kloelMemory.upsert({
    where: {
      workspaceId_key: { workspaceId, key: `faq:product:${session.normalizedProductName}` },
    },
    create: {
      workspaceId,
      key: `faq:product:${session.normalizedProductName}`,
      value: toJson({
        productId: product.id,
        productName: session.productName,
        items: faq,
        updatedAt: new Date().toISOString(),
      }),
      category: 'catalog_asset',
      type: 'faq',
      content: faq
        .map((q) => q.question)
        .join(' | ')
        .slice(0, 1000),
      metadata: toJson({ productId: product.id }),
    },
    update: {
      value: toJson({
        productId: product.id,
        productName: session.productName,
        items: faq,
        updatedAt: new Date().toISOString(),
      }),
      category: 'catalog_asset',
      type: 'faq',
      content: faq
        .map((q) => q.question)
        .join(' | ')
        .slice(0, 1000),
      metadata: toJson({ productId: product.id }),
    },
  });
  const existingLinks = await deps.prisma.externalPaymentLink.findMany({
    where: { workspaceId, productName: session.productName },
    select: { paymentUrl: true },
    take: 100,
  });
  const eUrls = new Set(existingLinks.map((l) => l.paymentUrl));
  await forEachSequential(
    offers.filter((o) => o.url && !eUrls.has(String(o.url))),
    async (offer) => {
      await deps.prisma.externalPaymentLink.create({
        data: {
          workspaceId,
          platform: 'other',
          productName: session.productName,
          price: offer.price || prices[0] || 0,
          paymentUrl: offer.url,
          checkoutUrl: offer.url,
          isActive: true,
        },
      });
    },
  );
  return { productId: product.id };
}

export async function respondToInputSessionExt(
  deps: AccountDeps,
  {
    workspaceId,
    sessionId,
    answer,
    findInputSessionFn,
    finishApprovalFn,
    enqueueContactResumptionFn,
  }: {
    workspaceId: string;
    sessionId: string;
    answer: string;
    findInputSessionFn: (
      workspaceId: string,
      sessionId: string,
    ) => Promise<{ record: any; session: AccountInputSessionPayload }>;
    finishApprovalFn: (
      workspaceId: string,
      approvalId: string,
      productId: string | null,
    ) => Promise<void>;
    enqueueContactResumptionFn: (
      workspaceId: string,
      session: AccountInputSessionPayload,
    ) => Promise<void>;
  },
) {
  const trimmed = String(answer || '').trim();
  const { record, session } = await findInputSessionFn(workspaceId, sessionId);
  const next = {
    ...session,
    answers: { ...session.answers },
    updatedAt: new Date().toISOString(),
  } as AccountInputSessionPayload;
  let nextPrompt: string | null = null;
  let completed = false;
  let productId: string | null = null;
  switch (session.status) {
    case 'WAITING_DESCRIPTION':
      next.answers.description = trimmed;
      next.status = 'WAITING_OFFERS';
      nextPrompt = getPromptForStage(next.status, next.productName);
      break;
    case 'WAITING_OFFERS':
      next.answers.offers = trimmed;
      next.status = 'WAITING_COMPANY';
      nextPrompt = getPromptForStage(next.status, next.productName);
      break;
    case 'WAITING_COMPANY': {
      next.answers.company = trimmed;
      const m = await materializeProductExt(deps, workspaceId, next);
      next.status = 'COMPLETED';
      next.completedAt = new Date().toISOString();
      next.materializedProductId = m.productId;
      productId = m.productId;
      completed = true;
      nextPrompt = null;
      break;
    }
    case 'COMPLETED':
    default:
      return { completed: true, session: next, nextPrompt: null };
  }
  await deps.prisma.kloelMemory.update({
    where: { workspaceId_key: { workspaceId, key: record.key } },
    data: {
      value: toJson(next),
      metadata: { ...(asRecord(record.metadata) ?? {}), status: next.status },
    },
  });
  await deps.prisma.inputCollectionSession.upsert({
    where: { id: next.id },
    create: {
      id: next.id,
      workspaceId,
      kind: next.kind,
      state: next.status,
      entityType: 'product',
      entityId: next.normalizedProductName,
      prompt: getPromptForStage(next.status, next.productName),
      answers: toJson(next.answers || {}),
      payload: toJson(next),
      completedAt: next.completedAt ? new Date(next.completedAt) : undefined,
    },
    update: {
      state: next.status,
      prompt: getPromptForStage(next.status, next.productName),
      answers: toJson(next.answers || {}),
      payload: toJson(next),
      completedAt: next.completedAt ? new Date(next.completedAt) : null,
    },
  });
  if (completed) {
    await finishApprovalFn(workspaceId, next.approvalId, productId);
    await deps.agentEvents.publish({
      type: 'status',
      workspaceId,
      phase: 'account_product_materialized',
      persistent: true,
      message: `${next.productName} foi criado, enriquecido e está pronto para venda.`,
      meta: { inputSessionId: next.id, productId, requestedProductName: next.productName },
    });
    await enqueueContactResumptionFn(workspaceId, next);
  } else if (nextPrompt)
    await deps.agentEvents.publish({
      type: 'prompt',
      workspaceId,
      phase: next.status === 'WAITING_OFFERS' ? 'account_input_offers' : 'account_input_company',
      persistent: true,
      message: nextPrompt,
      meta: { inputSessionId: next.id, stage: next.status },
    });
  return { completed, productId, session: next, nextPrompt };
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
    const existing = await deps.prisma.agentWorkItem.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (existing) {
      await deps.prisma.agentWorkItem.updateMany({ where: { id, workspaceId }, data: upd });
    } else {
      await deps.prisma.agentWorkItem.create({
        data: {
          id,
          workspaceId,
          kind: input.kind,
          entityType: input.entityType,
          entityId: input.entityId,
          ...upd,
        },
      });
    }
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
