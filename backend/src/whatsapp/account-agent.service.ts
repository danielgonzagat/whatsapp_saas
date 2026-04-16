import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueDedupId, buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue } from '../queue/queue';
import {
  ACCOUNT_CAPABILITY_REGISTRY,
  ACCOUNT_CAPABILITY_REGISTRY_VERSION,
  CONVERSATION_ACTION_REGISTRY,
  CONVERSATION_ACTION_REGISTRY_VERSION,
} from './account-agent.registry';
import {
  buildProductDescription,
  buildProductFaq,
  detectCatalogGap,
  extractMaxInstallments,
  extractMoneyValues,
  extractPercentages,
  extractUrls,
  parseOfferLines,
  slugifyCatalogKey,
} from './account-agent.util';
import { AgentEventsService } from './agent-events.service';

type ApprovalStatus = 'OPEN' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

type InputSessionStatus =
  | 'WAITING_DESCRIPTION'
  | 'WAITING_OFFERS'
  | 'WAITING_COMPANY'
  | 'COMPLETED';

export interface AccountApprovalPayload {
  id: string;
  kind: 'product_creation';
  status: ApprovalStatus;
  requestedProductName: string;
  normalizedProductName: string;
  contactId: string | null;
  contactName: string | null;
  phone: string | null;
  conversationId: string | null;
  customerMessage: string;
  operatorPrompt: string;
  source: 'inbound_catalog_gap';
  firstDetectedAt: string;
  lastDetectedAt: string;
  inputSessionId?: string | null;
  materializedProductId?: string | null;
}

export interface AccountInputSessionPayload {
  id: string;
  approvalId: string;
  kind: 'product_creation';
  status: InputSessionStatus;
  productName: string;
  normalizedProductName: string;
  contactId: string | null;
  contactName: string | null;
  phone: string | null;
  customerMessage: string;
  answers: {
    description?: string | null;
    offers?: string | null;
    company?: string | null;
  };
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  materializedProductId?: string | null;
}

export interface AccountApprovalListItem extends AccountApprovalPayload {
  memoryId: string;
  approvalRequestId: string;
  canonical: true;
  respondedAt: string | null;
}

export interface AccountInputSessionListItem extends AccountInputSessionPayload {
  memoryId: string;
  inputCollectionSessionId: string;
  canonical: true;
  currentPrompt: string;
}

@Injectable()
export class AccountAgentService {
  private readonly logger = new Logger(AccountAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentEvents: AgentEventsService,
  ) {}

  async detectCatalogGap(input: {
    workspaceId: string;
    contactId?: string | null;
    phone?: string | null;
    conversationId?: string | null;
    messageContent: string;
  }) {
    const messageContent = String(input.messageContent || '').trim();
    if (!messageContent) {
      return {
        created: false,
        approval: null,
        reason: 'empty_message' as const,
      };
    }

    const productNames = await this.listCatalogProductNames(input.workspaceId);
    const detection = detectCatalogGap({
      messageContent,
      productNames,
    });

    if (!detection.buyingIntent) {
      return {
        created: false,
        approval: null,
        reason: 'no_buying_intent' as const,
      };
    }

    if (detection.matchedProducts.length > 0) {
      return {
        created: false,
        approval: null,
        reason: 'catalog_match_found' as const,
      };
    }

    const missingProductName = String(detection.missingProductName || '').trim();
    if (!missingProductName) {
      return {
        created: false,
        approval: null,
        reason: 'candidate_not_found' as const,
      };
    }

    const normalizedProductName = slugifyCatalogKey(missingProductName);
    if (!normalizedProductName) {
      return {
        created: false,
        approval: null,
        reason: 'candidate_not_normalized' as const,
      };
    }

    const key = this.buildApprovalKey(normalizedProductName);
    const existing = await this.prisma.kloelMemory.findUnique({
      where: {
        workspaceId_key: {
          workspaceId: input.workspaceId,
          key,
        },
      },
    });

    const contact = input.contactId
      ? typeof this.prisma.contact.findFirst === 'function'
        ? await this.prisma.contact.findFirst({
            where: { id: input.contactId, workspaceId: input.workspaceId },
            select: { id: true, name: true, phone: true },
          })
        : await this.prisma.contact.findUnique({
            where: { id: input.contactId },
            select: { id: true, name: true, phone: true },
          })
      : null;

    const now = new Date().toISOString();
    const previous = ((existing?.value as Record<string, any> | null) ||
      null) as AccountApprovalPayload | null;

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

    await this.upsertMemory(input.workspaceId, key, {
      value: approval,
      category: 'account_approval',
      type: 'product_creation',
      content: approval.operatorPrompt,
      metadata: {
        status: approval.status,
        contactId: approval.contactId,
        phone: approval.phone,
        requestedProductName: approval.requestedProductName,
      },
    });
    await this.upsertApprovalRequest(input.workspaceId, approval);
    await this.upsertAccountWorkItem(input.workspaceId, {
      kind: 'catalog_gap_detected',
      entityType: 'product',
      entityId: approval.normalizedProductName,
      state:
        approval.status === 'REJECTED'
          ? 'BLOCKED'
          : approval.status === 'COMPLETED'
            ? 'COMPLETED'
            : 'WAITING_APPROVAL',
      title: `Criar produto ${approval.requestedProductName}`,
      summary: approval.operatorPrompt,
      priority: 95,
      utility: 95,
      requiresApproval: true,
      requiresInput: approval.status === 'APPROVED' && !!approval.inputSessionId,
      approvalState: approval.status,
      inputState: approval.inputSessionId ? 'OPEN' : null,
      blockedBy:
        approval.status === 'REJECTED'
          ? {
              reason: 'operator_rejected_product_creation',
              approvalId: approval.id,
            }
          : null,
      evidence: {
        approvalId: approval.id,
        requestedProductName: approval.requestedProductName,
        contactId: approval.contactId,
        phone: approval.phone,
      },
      metadata: {
        source: approval.source,
        conversationId: approval.conversationId,
      },
    });

    if (!existing) {
      await this.agentEvents.publish({
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
    }

    return {
      created: !existing,
      approval,
      reason: !existing ? 'created' : 'updated',
    };
  }

  async listApprovals(workspaceId: string): Promise<AccountApprovalListItem[]> {
    const rows = await this.prisma.approvalRequest.findMany({
      where: { workspaceId, kind: 'product_creation' },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        workspaceId: true,
        kind: true,
        state: true,
        payload: true,
        response: true,
        respondedAt: true,
        updatedAt: true,
      },
    });

    return rows.flatMap((row) => {
      const payload = this.parseApprovalPayload(row.payload);
      if (!payload) {
        return [];
      }

      return [
        {
          ...payload,
          memoryId: row.id,
          approvalRequestId: row.id,
          canonical: true,
          status: this.normalizeApprovalStatus(row.state),
          respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
        },
      ];
    });
  }

  async listInputSessions(workspaceId: string): Promise<AccountInputSessionListItem[]> {
    const rows = await this.prisma.inputCollectionSession.findMany({
      where: { workspaceId, kind: 'product_creation' },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        workspaceId: true,
        kind: true,
        state: true,
        payload: true,
        answers: true,
        completedAt: true,
        updatedAt: true,
      },
    });

    return rows.flatMap((row) => {
      const payload = this.parseInputSessionPayload(row.payload);
      if (!payload) {
        return [];
      }

      const status = this.normalizeInputSessionStatus(row.state);
      const answers = this.asRecord(row.answers) ?? this.asRecord(payload.answers) ?? {};
      const productName =
        typeof payload.productName === 'string' && payload.productName.trim()
          ? payload.productName
          : 'o produto';

      return [
        {
          ...payload,
          memoryId: row.id,
          inputCollectionSessionId: row.id,
          canonical: true,
          status,
          answers: {
            description:
              typeof answers.description === 'string'
                ? answers.description
                : payload.answers.description,
            offers: typeof answers.offers === 'string' ? answers.offers : payload.answers.offers,
            company:
              typeof answers.company === 'string' ? answers.company : payload.answers.company,
          },
          currentPrompt: this.getPromptForStage(status, productName),
        },
      ];
    });
  }

  async getWorkItems(workspaceId: string) {
    await this.materializeAccountCapabilityGaps(workspaceId);
    return this.listAccountWorkItems(workspaceId);
  }

  async getRuntime(workspaceId: string) {
    await this.materializeAccountCapabilityGaps(workspaceId);
    const [approvals, inputSessions, workItems] = await Promise.all([
      this.listApprovals(workspaceId),
      this.listInputSessions(workspaceId),
      this.listAccountWorkItems(workspaceId),
    ]);

    const openApprovals = approvals.filter((item) => item.status === 'OPEN');
    const pendingInputs = inputSessions.filter((item) => item.status !== 'COMPLETED');
    const actionableWorkItems = workItems.filter((item: any) =>
      ['OPEN', 'WAITING_APPROVAL', 'WAITING_INPUT', 'BLOCKED'].includes(String(item.state || '')),
    );
    const noLegalActions =
      actionableWorkItems.length === 0 && openApprovals.length === 0 && pendingInputs.length === 0;

    return {
      objective: 'revenue',
      mode:
        openApprovals.length > 0 || pendingInputs.length > 0 ? 'HUMAN_INPUT_REQUIRED' : 'ACTIVE',
      openApprovalCount: openApprovals.length,
      pendingInputCount: pendingInputs.length,
      completedApprovalCount: approvals.filter((item) => item.status === 'COMPLETED').length,
      openApprovals: openApprovals.slice(0, 10),
      pendingInputs: pendingInputs.slice(0, 10),
      workItems: workItems.slice(0, 20),
      openWorkItemCount: workItems.filter((item: any) => item.state !== 'COMPLETED').length,
      noLegalActions,
      noLegalActionReasons: noLegalActions
        ? ['account_universe_exhausted_for_current_registry']
        : [],
      capabilityRegistryVersion: ACCOUNT_CAPABILITY_REGISTRY_VERSION,
      capabilityCount: ACCOUNT_CAPABILITY_REGISTRY.length,
      conversationActionRegistryVersion: CONVERSATION_ACTION_REGISTRY_VERSION,
      conversationActionCount: CONVERSATION_ACTION_REGISTRY.length,
      lastMeaningfulActionAt:
        approvals[0]?.lastDetectedAt ||
        pendingInputs[0]?.updatedAt ||
        workItems[0]?.updatedAt ||
        null,
    };
  }

  getCapabilityRegistry() {
    return {
      version: ACCOUNT_CAPABILITY_REGISTRY_VERSION,
      items: ACCOUNT_CAPABILITY_REGISTRY,
    };
  }

  getConversationActionRegistry() {
    return {
      version: CONVERSATION_ACTION_REGISTRY_VERSION,
      items: CONVERSATION_ACTION_REGISTRY,
    };
  }

  async approveCatalogApproval(workspaceId: string, approvalId: string) {
    const { record, approval } = await this.findApproval(workspaceId, approvalId);
    const session = await this.ensureInputSession(workspaceId, approval);
    const now = new Date().toISOString();

    const nextApproval: AccountApprovalPayload = {
      ...approval,
      status: 'APPROVED',
      inputSessionId: session.id,
      lastDetectedAt: now,
    };

    await this.prisma.kloelMemory.update({
      where: {
        workspaceId_key: {
          workspaceId,
          key: record.key,
        },
      },
      data: {
        value: this.toJson(nextApproval),
        metadata: {
          ...((record.metadata as Record<string, any>) || {}),
          status: nextApproval.status,
          inputSessionId: session.id,
        },
      },
    });
    await this.upsertApprovalRequest(workspaceId, nextApproval);
    await this.upsertInputCollectionSession(workspaceId, session);
    await this.upsertAccountWorkItem(workspaceId, {
      kind: 'catalog_gap_detected',
      entityType: 'product',
      entityId: approval.normalizedProductName,
      state: 'WAITING_INPUT',
      title: `Criar produto ${approval.requestedProductName}`,
      summary: approval.operatorPrompt,
      priority: 95,
      utility: 95,
      requiresApproval: true,
      requiresInput: true,
      approvalState: nextApproval.status,
      inputState: session.status,
      blockedBy: null,
      evidence: {
        approvalId: approval.id,
        inputSessionId: session.id,
      },
      metadata: {
        conversationId: approval.conversationId,
        contactId: approval.contactId,
        phone: approval.phone,
      },
    });

    const prompt = this.getPromptForStage(session.status, session.productName);
    await this.agentEvents.publish({
      type: 'prompt',
      workspaceId,
      phase: 'account_input_description',
      persistent: true,
      message: prompt,
      meta: {
        approvalId,
        inputSessionId: session.id,
        stage: session.status,
      },
    });

    return {
      approved: true,
      approvalId,
      inputSessionId: session.id,
      nextPrompt: prompt,
      session,
    };
  }

  async rejectCatalogApproval(workspaceId: string, approvalId: string) {
    const { record, approval } = await this.findApproval(workspaceId, approvalId);
    const nextApproval: AccountApprovalPayload = {
      ...approval,
      status: 'REJECTED',
      lastDetectedAt: new Date().toISOString(),
    };

    await this.prisma.kloelMemory.update({
      where: {
        workspaceId_key: {
          workspaceId,
          key: record.key,
        },
      },
      data: {
        value: this.toJson(nextApproval),
        metadata: {
          ...((record.metadata as Record<string, any>) || {}),
          status: nextApproval.status,
        },
      },
    });
    await this.upsertApprovalRequest(workspaceId, nextApproval);
    await this.upsertAccountWorkItem(workspaceId, {
      kind: 'catalog_gap_detected',
      entityType: 'product',
      entityId: approval.normalizedProductName,
      state: 'BLOCKED',
      title: `Criar produto ${approval.requestedProductName}`,
      summary: approval.operatorPrompt,
      priority: 95,
      utility: 0,
      requiresApproval: true,
      requiresInput: false,
      approvalState: nextApproval.status,
      inputState: null,
      blockedBy: {
        reason: 'operator_rejected_product_creation',
        approvalId: approval.id,
      },
      evidence: {
        approvalId: approval.id,
      },
      metadata: {
        conversationId: approval.conversationId,
        contactId: approval.contactId,
        phone: approval.phone,
      },
    });

    await this.agentEvents.publish({
      type: 'status',
      workspaceId,
      phase: 'account_catalog_gap_rejected',
      persistent: true,
      message: `Entendido. Não vou criar ${approval.requestedProductName} sem sua autorização.`,
      meta: {
        approvalId,
        requestedProductName: approval.requestedProductName,
      },
    });

    return {
      rejected: true,
      approvalId,
    };
  }

  async respondToInputSession(workspaceId: string, sessionId: string, answer: string) {
    const trimmedAnswer = String(answer || '').trim();
    if (!trimmedAnswer) {
      throw new BadRequestException('Resposta vazia');
    }

    const { record, session } = await this.findInputSession(workspaceId, sessionId);
    const next = {
      ...session,
      answers: {
        ...session.answers,
      },
      updatedAt: new Date().toISOString(),
    } as AccountInputSessionPayload;

    let nextPrompt: string | null = null;
    let completed = false;
    let productId: string | null = null;

    switch (session.status) {
      case 'WAITING_DESCRIPTION':
        next.answers.description = trimmedAnswer;
        next.status = 'WAITING_OFFERS';
        nextPrompt = this.getPromptForStage(next.status, next.productName);
        break;
      case 'WAITING_OFFERS':
        next.answers.offers = trimmedAnswer;
        next.status = 'WAITING_COMPANY';
        nextPrompt = this.getPromptForStage(next.status, next.productName);
        break;
      case 'WAITING_COMPANY': {
        next.answers.company = trimmedAnswer;
        const materialized = await this.materializeProduct(workspaceId, next);
        next.status = 'COMPLETED';
        next.completedAt = new Date().toISOString();
        next.materializedProductId = materialized.productId;
        productId = materialized.productId;
        completed = true;
        nextPrompt = null;
        break;
      }
      case 'COMPLETED':
      default:
        return {
          completed: true,
          session: next,
          nextPrompt: null,
        };
    }

    await this.prisma.kloelMemory.update({
      where: {
        workspaceId_key: {
          workspaceId,
          key: record.key,
        },
      },
      data: {
        value: this.toJson(next),
        metadata: {
          ...((record.metadata as Record<string, any>) || {}),
          status: next.status,
        },
      },
    });
    await this.upsertInputCollectionSession(workspaceId, next);

    if (completed) {
      await this.finishApprovalFromSession(workspaceId, next.approvalId, productId);
      await this.upsertAccountWorkItem(workspaceId, {
        kind: 'catalog_gap_detected',
        entityType: 'product',
        entityId: next.normalizedProductName,
        state: 'COMPLETED',
        title: `Criar produto ${next.productName}`,
        summary: `${next.productName} criado e pronto para venda.`,
        priority: 95,
        utility: 100,
        requiresApproval: true,
        requiresInput: true,
        approvalState: 'COMPLETED',
        inputState: next.status,
        blockedBy: null,
        evidence: {
          approvalId: next.approvalId,
          inputSessionId: next.id,
          productId,
        },
        metadata: {
          contactId: next.contactId,
          phone: next.phone,
        },
      });
      await this.upsertAccountWorkItem(workspaceId, {
        kind: 'conversation_reply',
        entityType: 'contact',
        entityId: next.contactId || next.phone || next.id,
        state: 'OPEN',
        title: `Retomar conversa sobre ${next.productName}`,
        summary: `Produto ${next.productName} já existe e a conversa precisa ser retomada.`,
        priority: 98,
        utility: 98,
        requiresApproval: false,
        requiresInput: false,
        approvalState: null,
        inputState: null,
        blockedBy: null,
        evidence: {
          productId,
          sourceWorkItem: `catalog_gap_detected:product:${next.normalizedProductName}`,
        },
        metadata: {
          contactId: next.contactId,
          phone: next.phone,
          customerMessage: next.customerMessage,
        },
      });
      await this.agentEvents.publish({
        type: 'status',
        workspaceId,
        phase: 'account_product_materialized',
        persistent: true,
        message: `${next.productName} foi criado, enriquecido e está pronto para venda.`,
        meta: {
          inputSessionId: next.id,
          productId,
          requestedProductName: next.productName,
        },
      });
      await this.enqueueContactResumption(workspaceId, next);
    } else if (nextPrompt) {
      await this.upsertAccountWorkItem(workspaceId, {
        kind: 'catalog_gap_detected',
        entityType: 'product',
        entityId: next.normalizedProductName,
        state: 'WAITING_INPUT',
        title: `Criar produto ${next.productName}`,
        summary: nextPrompt,
        priority: 95,
        utility: 95,
        requiresApproval: true,
        requiresInput: true,
        approvalState: 'APPROVED',
        inputState: next.status,
        blockedBy: null,
        evidence: {
          approvalId: next.approvalId,
          inputSessionId: next.id,
        },
        metadata: {
          contactId: next.contactId,
          phone: next.phone,
        },
      });
      await this.agentEvents.publish({
        type: 'prompt',
        workspaceId,
        phase: next.status === 'WAITING_OFFERS' ? 'account_input_offers' : 'account_input_company',
        persistent: true,
        message: nextPrompt,
        meta: {
          inputSessionId: next.id,
          stage: next.status,
        },
      });
    }

    return {
      completed,
      productId,
      session: next,
      nextPrompt,
    };
  }

  private async listCatalogProductNames(workspaceId: string) {
    const [products, memoryProducts] = await Promise.all([
      this.prisma.product.findMany({
        where: { workspaceId, active: true },
        select: { name: true },
        take: 100,
      }),
      this.prisma.kloelMemory.findMany({
        where: {
          workspaceId,
          OR: [{ type: 'product' }, { category: 'products' }],
        },
        select: { value: true },
        take: 100,
      }),
    ]);

    return Array.from(
      new Set(
        [
          ...products.map((item) => item.name),
          ...(memoryProducts
            .map((item) => (item.value as Record<string, any> | null)?.name)
            .filter(Boolean) as string[]),
        ]
          .map((item) => String(item || '').trim())
          .filter(Boolean),
      ),
    );
  }

  private buildApprovalKey(normalizedProductName: string) {
    return `account_approval:product_creation:${normalizedProductName}`;
  }

  private buildInputSessionKey(normalizedProductName: string) {
    return `account_input_session:product_creation:${normalizedProductName}`;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private readNullableString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
    return null;
  }

  private normalizeApprovalStatus(value: unknown): ApprovalStatus {
    switch (value) {
      case 'APPROVED':
      case 'REJECTED':
      case 'COMPLETED':
        return value;
      case 'OPEN':
      default:
        return 'OPEN';
    }
  }

  private normalizeInputSessionStatus(value: unknown): InputSessionStatus {
    switch (value) {
      case 'WAITING_OFFERS':
      case 'WAITING_COMPANY':
      case 'COMPLETED':
        return value;
      case 'WAITING_DESCRIPTION':
      default:
        return 'WAITING_DESCRIPTION';
    }
  }

  private parseApprovalPayload(value: unknown): AccountApprovalPayload | null {
    const payload = this.asRecord(value);
    if (!payload) {
      return null;
    }

    const id = this.readString(payload.id);
    const requestedProductName = this.readString(payload.requestedProductName);
    const normalizedProductName = this.readString(payload.normalizedProductName);
    const customerMessage = this.readString(payload.customerMessage);
    const operatorPrompt = this.readString(payload.operatorPrompt);
    const firstDetectedAt = this.readString(payload.firstDetectedAt);
    const lastDetectedAt = this.readString(payload.lastDetectedAt);

    if (
      !id ||
      !requestedProductName ||
      !normalizedProductName ||
      !customerMessage ||
      !operatorPrompt ||
      !firstDetectedAt ||
      !lastDetectedAt
    ) {
      return null;
    }

    return {
      id,
      kind: 'product_creation',
      status: this.normalizeApprovalStatus(payload.status),
      requestedProductName,
      normalizedProductName,
      contactId: this.readNullableString(payload.contactId),
      contactName: this.readNullableString(payload.contactName),
      phone: this.readNullableString(payload.phone),
      conversationId: this.readNullableString(payload.conversationId),
      customerMessage,
      operatorPrompt,
      source: 'inbound_catalog_gap',
      firstDetectedAt,
      lastDetectedAt,
      inputSessionId: this.readNullableString(payload.inputSessionId),
      materializedProductId: this.readNullableString(payload.materializedProductId),
    };
  }

  private parseInputSessionPayload(value: unknown): AccountInputSessionPayload | null {
    const payload = this.asRecord(value);
    if (!payload) {
      return null;
    }

    const id = this.readString(payload.id);
    const approvalId = this.readString(payload.approvalId);
    const productName = this.readString(payload.productName);
    const normalizedProductName = this.readString(payload.normalizedProductName);
    const customerMessage = this.readString(payload.customerMessage);
    const createdAt = this.readString(payload.createdAt);
    const updatedAt = this.readString(payload.updatedAt);

    if (
      !id ||
      !approvalId ||
      !productName ||
      !normalizedProductName ||
      !customerMessage ||
      !createdAt ||
      !updatedAt
    ) {
      return null;
    }

    const answers = this.asRecord(payload.answers) ?? {};

    return {
      id,
      approvalId,
      kind: 'product_creation',
      status: this.normalizeInputSessionStatus(payload.status),
      productName,
      normalizedProductName,
      contactId: this.readNullableString(payload.contactId),
      contactName: this.readNullableString(payload.contactName),
      phone: this.readNullableString(payload.phone),
      customerMessage,
      answers: {
        description: this.readNullableString(answers.description),
        offers: this.readNullableString(answers.offers),
        company: this.readNullableString(answers.company),
      },
      createdAt,
      updatedAt,
      completedAt: this.readNullableString(payload.completedAt),
      materializedProductId: this.readNullableString(payload.materializedProductId),
    };
  }

  private getPromptForStage(stage: InputSessionStatus, productName: string) {
    switch (stage) {
      case 'WAITING_DESCRIPTION':
        return `Descreva ${productName} com o máximo de detalhes que puder. Quanto melhor a descrição, mais vendas eu consigo fazer.`;
      case 'WAITING_OFFERS':
        return `Descreva todos os planos de ${productName}: oferta, quantidade, o que você entrega, o que o cliente recebe, preço, desconto máximo, parcelamento e links de compra. Quanto mais detalhe, mais vendas eu consigo gerar.`;
      case 'WAITING_COMPANY':
        return `Por último: informe o nome da empresa responsável, CNPJ e o máximo de contexto comercial e institucional sobre ${productName}. Quanto melhor e maior a descrição, mais vendas eu consigo fazer.`;
      case 'COMPLETED':
      default:
        return `${productName} já está pronto para venda.`;
    }
  }

  private async ensureInputSession(workspaceId: string, approval: AccountApprovalPayload) {
    const key = this.buildInputSessionKey(approval.normalizedProductName);
    const existing = await this.prisma.kloelMemory.findUnique({
      where: {
        workspaceId_key: {
          workspaceId,
          key,
        },
      },
    });

    if (existing?.value) {
      const parsed = this.parseInputSessionPayload(existing.value);
      if (parsed) {
        return parsed;
      }
    }

    const session: AccountInputSessionPayload = {
      id: randomUUID(),
      approvalId: approval.id,
      kind: 'product_creation',
      status: 'WAITING_DESCRIPTION',
      productName: approval.requestedProductName,
      normalizedProductName: approval.normalizedProductName,
      contactId: approval.contactId,
      contactName: approval.contactName,
      phone: approval.phone,
      customerMessage: approval.customerMessage,
      answers: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.upsertMemory(workspaceId, key, {
      value: session,
      category: 'account_input_session',
      type: 'product_creation',
      content: `Coleta guiada para criar ${approval.requestedProductName}`,
      metadata: {
        approvalId: approval.id,
        status: session.status,
        requestedProductName: approval.requestedProductName,
      },
    });
    await this.upsertInputCollectionSession(workspaceId, session);

    return session;
  }

  private async materializeProduct(workspaceId: string, session: AccountInputSessionPayload) {
    const descriptionAnswer = String(session.answers.description || '').trim();
    const offersAnswer = String(session.answers.offers || '').trim();
    const companyAnswer = String(session.answers.company || '').trim();
    const offers = parseOfferLines(offersAnswer);
    const urls = extractUrls(offersAnswer);
    const prices = extractMoneyValues(offersAnswer);
    const maxDiscount = extractPercentages(offersAnswer);
    const maxInstallments = extractMaxInstallments(offersAnswer);
    const faq = buildProductFaq({
      productName: session.productName,
      descriptionAnswer,
      offersAnswer,
      companyAnswer,
    });
    const description = buildProductDescription({
      productName: session.productName,
      descriptionAnswer,
      offers,
      companyAnswer,
    });

    const existingProducts = await this.prisma.product.findMany({
      where: { workspaceId },
      select: { id: true, name: true },
      take: 200,
    });
    const existing = existingProducts.find(
      (item) => slugifyCatalogKey(item.name) === session.normalizedProductName,
    );

    const product = existing
      ? await (async () => {
          await this.prisma.product.updateMany({
            where: { id: existing.id, workspaceId },
            data: {
              description,
              price: prices[0] || 0,
              paymentLink: urls[0] || null,
              active: true,
              metadata: this.toJson({
                createdBy: 'account_agent',
                faq,
                offers,
                companyProfile: {
                  raw: companyAnswer,
                },
                operatorInputs: {
                  description: descriptionAnswer,
                  offers: offersAnswer,
                  company: companyAnswer,
                },
                negotiation: {
                  maxDiscountPercent: maxDiscount.length > 0 ? Math.max(...maxDiscount) : null,
                  maxInstallments,
                },
              }),
            },
          });

          return this.prisma.product.findFirstOrThrow({
            where: { id: existing.id, workspaceId },
          });
        })()
      : await this.prisma.product.create({
          data: {
            workspaceId,
            name: session.productName,
            description,
            price: prices[0] || 0,
            paymentLink: urls[0] || null,
            active: true,
            metadata: this.toJson({
              createdBy: 'account_agent',
              faq,
              offers,
              companyProfile: {
                raw: companyAnswer,
              },
              operatorInputs: {
                description: descriptionAnswer,
                offers: offersAnswer,
                company: companyAnswer,
              },
              negotiation: {
                maxDiscountPercent: maxDiscount.length > 0 ? Math.max(...maxDiscount) : null,
                maxInstallments,
              },
            }),
          },
        });

    await this.upsertMemory(workspaceId, `company_info:primary`, {
      value: {
        source: 'account_agent',
        productName: session.productName,
        raw: companyAnswer,
        updatedAt: new Date().toISOString(),
      },
      category: 'business',
      type: 'company_info',
      content: companyAnswer.slice(0, 1000),
      metadata: {
        productId: product.id,
      },
    });

    await this.upsertMemory(workspaceId, `faq:product:${session.normalizedProductName}`, {
      value: {
        productId: product.id,
        productName: session.productName,
        items: faq,
        updatedAt: new Date().toISOString(),
      },
      category: 'catalog_asset',
      type: 'faq',
      content: faq
        .map((item) => item.question)
        .join(' | ')
        .slice(0, 1000),
      metadata: {
        productId: product.id,
      },
    });

    const existingLinks = await this.prisma.externalPaymentLink.findMany({
      where: {
        workspaceId,
        productName: session.productName,
      },
      select: { paymentUrl: true },
      take: 100,
    });
    const existingUrls = new Set(existingLinks.map((item) => item.paymentUrl));

    // biome-ignore lint/performance/noAwaitInLoops: sequential offer creation with unique constraints
    for (const offer of offers.filter((item) => item.url && !existingUrls.has(String(item.url)))) {
      // PULSE:OK — each external link has unique URL/price; createMany doesn't return created records
      await this.prisma.externalPaymentLink.create({
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
    }

    this.logger.log(
      `Account agent materialized product ${session.productName} (${product.id}) for workspace ${workspaceId}`,
    );

    return {
      productId: product.id,
    };
  }

  private async finishApprovalFromSession(
    workspaceId: string,
    approvalId: string,
    productId: string | null,
  ) {
    const { record, approval } = await this.findApproval(workspaceId, approvalId);
    const nextApproval: AccountApprovalPayload = {
      ...approval,
      status: 'COMPLETED',
      materializedProductId: productId,
      lastDetectedAt: new Date().toISOString(),
    };

    await this.prisma.kloelMemory.update({
      where: {
        workspaceId_key: {
          workspaceId,
          key: record.key,
        },
      },
      data: {
        value: this.toJson(nextApproval),
        metadata: {
          ...((record.metadata as Record<string, any>) || {}),
          status: nextApproval.status,
          productId,
        },
      },
    });
    await this.upsertApprovalRequest(workspaceId, nextApproval);
  }

  private async enqueueContactResumption(workspaceId: string, session: AccountInputSessionPayload) {
    if (!session.contactId && !session.phone) return;

    try {
      await autopilotQueue.add(
        'scan-contact',
        {
          workspaceId,
          contactId: session.contactId || undefined,
          phone: session.phone || undefined,
          messageContent: session.customerMessage,
        },
        {
          jobId: buildQueueJobId(
            'scan-contact',
            workspaceId,
            session.contactId || session.phone || session.id,
            session.id,
          ),
          deduplication: {
            id: buildQueueDedupId(
              'scan-contact',
              workspaceId,
              session.contactId || session.phone || session.id,
            ),
            ttl: 5_000,
          },
          removeOnComplete: true,
        },
      );
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.warn(
        `Failed to enqueue scan-contact after product creation: ${errorInstanceofError.message}`,
      );
    }
  }

  private async findApproval(workspaceId: string, approvalId: string) {
    const approvals = await this.listApprovals(workspaceId);
    const approval = approvals.find((item) => item.id === approvalId);
    if (!approval) {
      throw new NotFoundException('Aprovação de conta não encontrada');
    }

    const key = this.buildApprovalKey(approval.normalizedProductName);
    const record = await this.prisma.kloelMemory.findUnique({
      where: {
        workspaceId_key: {
          workspaceId,
          key,
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Registro de aprovação não encontrado');
    }

    return {
      record,
      approval,
    };
  }

  private async findInputSession(workspaceId: string, sessionId: string) {
    const sessions = await this.listInputSessions(workspaceId);
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new NotFoundException('Sessão de input não encontrada');
    }

    const key = this.buildInputSessionKey(session.normalizedProductName);
    const record = await this.prisma.kloelMemory.findUnique({
      where: {
        workspaceId_key: {
          workspaceId,
          key,
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Registro da sessão não encontrado');
    }

    return {
      record,
      session,
    };
  }

  private async listAccountWorkItems(workspaceId: string) {
    return this.prisma.agentWorkItem.findMany({
      where: { workspaceId },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        workspaceId: true,
        kind: true,
        entityType: true,
        entityId: true,
        state: true,
        owner: true,
        title: true,
        summary: true,
        priority: true,
        utility: true,
        eligibleAt: true,
        requiresApproval: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  private async materializeAccountCapabilityGaps(workspaceId: string) {
    const [
      workspace,
      apiKeyCount,
      webhookCount,
      agentCount,
      flowCount,
      campaignCount,
      productCount,
    ] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          id: true,
          customDomain: true,
          providerSettings: true,
        },
      }),
      this.prisma.apiKey.count({ where: { workspaceId } }),
      this.prisma.webhookSubscription.count({
        where: { workspaceId, isActive: true },
      }),
      this.prisma.agent.count({ where: { workspaceId } }),
      this.prisma.flow.count({ where: { workspaceId } }),
      this.prisma.campaign.count({ where: { workspaceId } }),
      this.prisma.product.count({ where: { workspaceId, active: true } }),
    ]);

    const settings = (workspace?.providerSettings as Record<string, any> | null) || {};
    const billingSuspended = settings?.billingSuspended === true;

    await Promise.all([
      this.upsertAccountWorkItem(workspaceId, {
        kind: 'billing_update_required',
        entityType: 'workspace',
        entityId: workspaceId,
        state: billingSuspended ? 'BLOCKED' : 'COMPLETED',
        title: billingSuspended
          ? 'Billing da conta exige ação'
          : 'Billing da conta está operacional',
        summary: billingSuspended
          ? 'A conta está suspensa por billing e exige intervenção estrutural.'
          : 'Billing operacional sem bloqueio estrutural.',
        priority: 100,
        utility: billingSuspended ? 100 : 0,
        requiresApproval: true,
        requiresInput: billingSuspended,
        approvalState: billingSuspended ? 'REQUIRED' : null,
        inputState: billingSuspended ? 'REQUIRED' : null,
        blockedBy: billingSuspended ? { reason: 'billing_suspended' } : null,
        evidence: { billingSuspended },
        metadata: { capabilityCode: 'BILLING_CONFIGURATION' },
      }),
      this.upsertAccountWorkItem(workspaceId, {
        kind: 'domain_gap',
        entityType: 'workspace',
        entityId: workspaceId,
        state: workspace?.customDomain ? 'COMPLETED' : 'OPEN',
        title: workspace?.customDomain
          ? 'Domínio da conta configurado'
          : 'Conta sem domínio configurado',
        summary: workspace?.customDomain
          ? `Domínio ativo: ${workspace.customDomain}`
          : 'A conta ainda não possui domínio próprio configurado.',
        priority: 48,
        utility: workspace?.customDomain ? 0 : 48,
        requiresApproval: true,
        requiresInput: !workspace?.customDomain,
        approvalState: workspace?.customDomain ? null : 'REQUIRED',
        inputState: workspace?.customDomain ? null : 'REQUIRED',
        blockedBy: null,
        evidence: { customDomain: workspace?.customDomain || null },
        metadata: { capabilityCode: 'DOMAIN_CONFIGURATION' },
      }),
      this.upsertAccountWorkItem(workspaceId, {
        kind: 'webhook_gap',
        entityType: 'workspace',
        entityId: workspaceId,
        state: webhookCount > 0 ? 'COMPLETED' : 'OPEN',
        title: webhookCount > 0 ? 'Webhooks configurados' : 'Conta sem webhooks ativos',
        summary:
          webhookCount > 0
            ? `${webhookCount} webhook(s) ativo(s).`
            : 'A conta ainda não possui webhook ativo configurado.',
        priority: 44,
        utility: webhookCount > 0 ? 0 : 44,
        requiresApproval: true,
        requiresInput: webhookCount === 0,
        approvalState: webhookCount > 0 ? null : 'REQUIRED',
        inputState: webhookCount > 0 ? null : 'REQUIRED',
        blockedBy: null,
        evidence: { activeWebhookCount: webhookCount },
        metadata: { capabilityCode: 'WEBHOOK_CONFIGURATION' },
      }),
      this.upsertAccountWorkItem(workspaceId, {
        kind: 'api_key_gap',
        entityType: 'workspace',
        entityId: workspaceId,
        state: apiKeyCount > 0 ? 'COMPLETED' : 'OPEN',
        title: apiKeyCount > 0 ? 'API keys configuradas' : 'Conta sem API key',
        summary:
          apiKeyCount > 0
            ? `${apiKeyCount} API key(s) cadastrada(s).`
            : 'A conta ainda não possui API key configurada.',
        priority: 42,
        utility: apiKeyCount > 0 ? 0 : 42,
        requiresApproval: true,
        requiresInput: apiKeyCount === 0,
        approvalState: apiKeyCount > 0 ? null : 'REQUIRED',
        inputState: apiKeyCount > 0 ? null : 'REQUIRED',
        blockedBy: null,
        evidence: { apiKeyCount },
        metadata: { capabilityCode: 'API_KEY_CONFIGURATION' },
      }),
      this.upsertAccountWorkItem(workspaceId, {
        kind: 'team_configuration_gap',
        entityType: 'workspace',
        entityId: workspaceId,
        state: agentCount > 0 ? 'COMPLETED' : 'OPEN',
        title: agentCount > 0 ? 'Time configurado' : 'Conta sem agentes',
        summary:
          agentCount > 0
            ? `${agentCount} agente(s) cadastrado(s).`
            : 'A conta ainda não possui agentes/equipe configurados.',
        priority: 40,
        utility: agentCount > 0 ? 0 : 40,
        requiresApproval: true,
        requiresInput: agentCount === 0,
        approvalState: agentCount > 0 ? null : 'REQUIRED',
        inputState: agentCount > 0 ? null : 'REQUIRED',
        blockedBy: null,
        evidence: { agentCount },
        metadata: { capabilityCode: 'TEAM_CONFIGURATION' },
      }),
      this.upsertAccountWorkItem(workspaceId, {
        kind: 'flow_creation_candidate',
        entityType: 'workspace',
        entityId: workspaceId,
        state: flowCount > 0 ? 'COMPLETED' : 'OPEN',
        title: flowCount > 0 ? 'Flows configurados' : 'Conta sem flow comercial',
        summary:
          flowCount > 0
            ? `${flowCount} flow(s) disponível(is).`
            : 'A conta ainda não possui flow comercial configurado.',
        priority: 32,
        utility: flowCount > 0 ? 0 : 32,
        requiresApproval: false,
        requiresInput: flowCount === 0,
        approvalState: null,
        inputState: flowCount > 0 ? null : 'REQUIRED',
        blockedBy: null,
        evidence: { flowCount },
        metadata: { capabilityCode: 'FLOW_CONFIGURATION' },
      }),
      this.upsertAccountWorkItem(workspaceId, {
        kind: 'campaign_launch_candidate',
        entityType: 'workspace',
        entityId: workspaceId,
        state: campaignCount > 0 ? 'COMPLETED' : 'OPEN',
        title: campaignCount > 0 ? 'Campanhas configuradas' : 'Conta sem campanha ativa',
        summary:
          campaignCount > 0
            ? `${campaignCount} campanha(s) cadastrada(s).`
            : 'A conta ainda não possui campanha comercial configurada.',
        priority: 28,
        utility: campaignCount > 0 ? 0 : 28,
        requiresApproval: false,
        requiresInput: campaignCount === 0,
        approvalState: null,
        inputState: campaignCount > 0 ? null : 'REQUIRED',
        blockedBy: null,
        evidence: { campaignCount },
        metadata: { capabilityCode: 'CAMPAIGN_CONFIGURATION' },
      }),
      this.upsertAccountWorkItem(workspaceId, {
        kind: 'catalog_gap_detected',
        entityType: 'catalog',
        entityId: 'primary',
        state: productCount > 0 ? 'COMPLETED' : 'OPEN',
        title: productCount > 0 ? 'Catálogo ativo' : 'Conta sem produto ativo',
        summary:
          productCount > 0
            ? `${productCount} produto(s) ativo(s) no catálogo.`
            : 'A conta ainda não possui produto ativo no catálogo.',
        priority: 60,
        utility: productCount > 0 ? 0 : 60,
        requiresApproval: true,
        requiresInput: productCount === 0,
        approvalState: productCount > 0 ? null : 'REQUIRED',
        inputState: productCount > 0 ? null : 'REQUIRED',
        blockedBy: null,
        evidence: { activeProductCount: productCount },
        metadata: { capabilityCode: 'CATALOG_PRODUCT_CREATE' },
      }),
    ]);
  }

  private async upsertApprovalRequest(workspaceId: string, approval: AccountApprovalPayload) {
    return this.prisma.approvalRequest.upsert({
      where: { id: approval.id },
      create: {
        id: approval.id,
        workspaceId,
        kind: approval.kind,
        scope: 'account',
        entityType: 'product',
        entityId: approval.normalizedProductName,
        state: approval.status,
        title: `Criar produto ${approval.requestedProductName}`,
        prompt: approval.operatorPrompt,
        payload: this.toJson(approval),
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
        payload: this.toJson(approval),
        respondedAt:
          approval.status === 'APPROVED' ||
          approval.status === 'REJECTED' ||
          approval.status === 'COMPLETED'
            ? new Date(approval.lastDetectedAt)
            : null,
      },
    });
  }

  private async upsertInputCollectionSession(
    workspaceId: string,
    session: AccountInputSessionPayload,
  ) {
    return this.prisma.inputCollectionSession.upsert({
      where: { id: session.id },
      create: {
        id: session.id,
        workspaceId,
        kind: session.kind,
        state: session.status,
        entityType: 'product',
        entityId: session.normalizedProductName,
        prompt: this.getPromptForStage(session.status, session.productName),
        answers: this.toJson(session.answers || {}),
        payload: this.toJson(session),
        completedAt: session.completedAt ? new Date(session.completedAt) : undefined,
      },
      update: {
        state: session.status,
        prompt: this.getPromptForStage(session.status, session.productName),
        answers: this.toJson(session.answers || {}),
        payload: this.toJson(session),
        completedAt: session.completedAt ? new Date(session.completedAt) : null,
      },
    });
  }

  private async upsertAccountWorkItem(
    workspaceId: string,
    input: {
      kind: string;
      entityType: string;
      entityId?: string | null;
      state: string;
      title: string;
      summary?: string | null;
      priority: number;
      utility: number;
      requiresApproval: boolean;
      requiresInput: boolean;
      approvalState?: string | null;
      inputState?: string | null;
      blockedBy?: Record<string, any> | null;
      evidence?: Record<string, any> | null;
      metadata?: Record<string, any> | null;
    },
  ) {
    const entityKey = String(input.entityId || 'global');
    const id = `${workspaceId}:${input.kind}:${input.entityType}:${entityKey}`;
    const previous =
      typeof this.prisma.agentWorkItem.findFirst === 'function'
        ? await this.prisma.agentWorkItem.findFirst({
            where: { id, workspaceId },
            select: {
              id: true,
              state: true,
              title: true,
              summary: true,
              priority: true,
              utility: true,
              metadata: true,
            },
          })
        : await this.prisma.agentWorkItem.findUnique({
            where: { id },
            select: {
              id: true,
              state: true,
              title: true,
              summary: true,
              priority: true,
              utility: true,
              metadata: true,
            },
          });

    const record = await this.prisma.agentWorkItem.upsert({
      where: { id },
      create: {
        id,
        workspaceId,
        kind: input.kind,
        entityType: input.entityType,
        entityId: input.entityId || null,
        state: input.state,
        owner: input.state === 'BLOCKED' ? 'RULES' : 'AGENT',
        title: input.title,
        summary: input.summary || null,
        priority: input.priority,
        utility: input.utility,
        blockedBy: input.blockedBy ? this.toJson(input.blockedBy) : undefined,
        requiresApproval: input.requiresApproval,
        requiresInput: input.requiresInput,
        approvalState: input.approvalState || null,
        inputState: input.inputState || null,
        evidence: input.evidence ? this.toJson(input.evidence) : undefined,
        metadata: input.metadata ? this.toJson(input.metadata) : undefined,
      },
      update: {
        state: input.state,
        owner: input.state === 'BLOCKED' ? 'RULES' : 'AGENT',
        title: input.title,
        summary: input.summary || null,
        priority: input.priority,
        utility: input.utility,
        blockedBy: input.blockedBy ? this.toJson(input.blockedBy) : null,
        requiresApproval: input.requiresApproval,
        requiresInput: input.requiresInput,
        approvalState: input.approvalState || null,
        inputState: input.inputState || null,
        evidence: input.evidence ? this.toJson(input.evidence) : null,
        metadata: input.metadata ? this.toJson(input.metadata) : null,
      },
    });

    const changed =
      !previous ||
      previous.state !== input.state ||
      previous.title !== input.title ||
      String(previous.summary || '') !== String(input.summary || '') ||
      Number(previous.priority || 0) !== Number(input.priority || 0) ||
      Number(previous.utility || 0) !== Number(input.utility || 0);

    if (changed) {
      await this.agentEvents.publish({
        type: 'account',
        workspaceId,
        phase: previous ? 'account_work_item_updated' : 'account_work_item_created',
        persistent: input.state === 'BLOCKED',
        message: previous
          ? `Atualizei ${input.title} para ${input.state}.`
          : `Materializei ${input.title} no universo operacional da conta.`,
        meta: {
          workItemId: id,
          kind: input.kind,
          entityType: input.entityType,
          entityId: input.entityId || null,
          state: input.state,
          previousState: previous?.state || null,
          priority: input.priority,
          utility: input.utility,
          requiresApproval: input.requiresApproval,
          requiresInput: input.requiresInput,
          capabilityCode: input.metadata?.capabilityCode || null,
        },
      });
    }

    return record;
  }

  private async upsertMemory(
    workspaceId: string,
    key: string,
    input: {
      value: Record<string, any>;
      category: string;
      type: string;
      content?: string;
      metadata?: Record<string, any>;
    },
  ) {
    await this.prisma.kloelMemory.upsert({
      where: {
        workspaceId_key: {
          workspaceId,
          key,
        },
      },
      create: {
        workspaceId,
        key,
        value: this.toJson(input.value),
        category: input.category,
        type: input.type,
        content: input.content,
        metadata: input.metadata ? this.toJson(input.metadata) : undefined,
      },
      update: {
        value: this.toJson(input.value),
        category: input.category,
        type: input.type,
        content: input.content,
        metadata: input.metadata ? this.toJson(input.metadata) : undefined,
      },
    });
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return toPrismaJsonValue(value);
  }
}
