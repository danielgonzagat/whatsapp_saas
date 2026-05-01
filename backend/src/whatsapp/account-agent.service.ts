import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  asRecord,
  getPromptForStage,
  normalizeApprovalStatus,
  normalizeInputSessionStatus,
  parseApprovalPayload,
  parseInputSessionPayload,
} from './account-agent.parsers';
import type {
  AccountApprovalListItem,
  AccountApprovalPayload,
  AccountInputSessionListItem,
  AccountInputSessionPayload,
} from './account-agent.types';
export type {
  AccountApprovalListItem,
  AccountApprovalPayload,
  AccountInputSessionListItem,
  AccountInputSessionPayload,
} from './account-agent.types';
import { AgentEventsService } from './agent-events.service';
import {
  detectCatalogGapExt,
  respondToInputSessionExt,
  materializeAccountCapabilityGapsExt,
} from './__companions__/account-agent.service.companion';

type WorkItemUpsertInput = {
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
  blockedBy?: Record<string, unknown> | null;
  evidence?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class AccountAgentService {
  private readonly logger = new Logger(AccountAgentService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentEvents: AgentEventsService,
  ) {}

  // ═══ PUBLIC ═══

  async detectCatalogGap(input: {
    workspaceId: string;
    contactId?: string | null;
    phone?: string | null;
    conversationId?: string | null;
    messageContent: string;
  }) {
    const result = await detectCatalogGapExt(
      { prisma: this.prisma, agentEvents: this.agentEvents },
      input,
    );
    if (result.approval) {
      await this.upsertAccountWorkItem(input.workspaceId, {
        kind: 'catalog_gap_detected',
        entityType: 'product',
        entityId: result.approval.normalizedProductName,
        state:
          result.approval.status === 'REJECTED'
            ? 'BLOCKED'
            : result.approval.status === 'COMPLETED'
              ? 'COMPLETED'
              : 'WAITING_APPROVAL',
        title: `Criar produto ${result.approval.requestedProductName}`,
        summary: result.approval.operatorPrompt,
        priority: 95,
        utility: 95,
        requiresApproval: true,
        requiresInput: result.approval.status === 'APPROVED' && !!result.approval.inputSessionId,
        approvalState: result.approval.status,
        inputState: result.approval.inputSessionId ? 'OPEN' : null,
        blockedBy:
          result.approval.status === 'REJECTED'
            ? { reason: 'operator_rejected_product_creation', approvalId: result.approval.id }
            : null,
        evidence: {
          approvalId: result.approval.id,
          requestedProductName: result.approval.requestedProductName,
          contactId: result.approval.contactId,
          phone: result.approval.phone,
        },
        metadata: {
          source: result.approval.source,
          conversationId: result.approval.conversationId,
        },
      });
    }
    return result;
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
    return rows.flatMap((r) => {
      const p = parseApprovalPayload(r.payload);
      if (!p) return [];
      return [
        {
          ...p,
          memoryId: r.id,
          approvalRequestId: r.id,
          canonical: true,
          status: normalizeApprovalStatus(r.state),
          respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
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
    return rows.flatMap((r) => {
      const p = parseInputSessionPayload(r.payload);
      if (!p) return [];
      const s = normalizeInputSessionStatus(r.state);
      const a = asRecord(r.answers) ?? asRecord(p.answers) ?? {};
      const pn =
        typeof p.productName === 'string' && p.productName.trim() ? p.productName : 'o produto';
      return [
        {
          ...p,
          memoryId: r.id,
          inputCollectionSessionId: r.id,
          canonical: true,
          status: s,
          answers: {
            description: typeof a.description === 'string' ? a.description : p.answers.description,
            offers: typeof a.offers === 'string' ? a.offers : p.answers.offers,
            company: typeof a.company === 'string' ? a.company : p.answers.company,
          },
          currentPrompt: getPromptForStage(s, pn),
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
    const oa = approvals.filter((a) => a.status === 'OPEN');
    const pi = inputSessions.filter((a) => a.status !== 'COMPLETED');
    const aw = workItems.filter((w) =>
      ['OPEN', 'WAITING_APPROVAL', 'WAITING_INPUT', 'BLOCKED'].includes(String(w.state || '')),
    );
    const noLegal = aw.length === 0 && oa.length === 0 && pi.length === 0;
    return {
      objective: 'revenue',
      mode: oa.length > 0 || pi.length > 0 ? 'HUMAN_INPUT_REQUIRED' : 'ACTIVE',
      openApprovalCount: oa.length,
      pendingInputCount: pi.length,
      completedApprovalCount: approvals.filter((a) => a.status === 'COMPLETED').length,
      openApprovals: oa.slice(0, 10),
      pendingInputs: pi.slice(0, 10),
      workItems: workItems.slice(0, 20),
      openWorkItemCount: workItems.filter((w) => w.state !== 'COMPLETED').length,
      noLegalActions: noLegal,
      noLegalActionReasons: noLegal ? ['account_universe_exhausted_for_current_registry'] : [],
      capabilityRegistryVersion: ACCOUNT_CAPABILITY_REGISTRY_VERSION,
      capabilityCount: ACCOUNT_CAPABILITY_REGISTRY.length,
      conversationActionRegistryVersion: CONVERSATION_ACTION_REGISTRY_VERSION,
      conversationActionCount: CONVERSATION_ACTION_REGISTRY.length,
      lastMeaningfulActionAt:
        approvals[0]?.lastDetectedAt || pi[0]?.updatedAt || workItems[0]?.updatedAt || null,
    };
  }

  getCapabilityRegistry() {
    return { version: ACCOUNT_CAPABILITY_REGISTRY_VERSION, items: ACCOUNT_CAPABILITY_REGISTRY };
  }
  getConversationActionRegistry() {
    return { version: CONVERSATION_ACTION_REGISTRY_VERSION, items: CONVERSATION_ACTION_REGISTRY };
  }

  async approveCatalogApproval(workspaceId: string, approvalId: string) {
    const { record, approval } = await this.findApproval(workspaceId, approvalId);
    const session = await this.ensureInputSession(workspaceId, approval);
    const now = new Date().toISOString();
    const next: AccountApprovalPayload = {
      ...approval,
      status: 'APPROVED',
      inputSessionId: session.id,
      lastDetectedAt: now,
    };
    await this.prisma.kloelMemory.update({
      where: { workspaceId_key: { workspaceId, key: record.key } },
      data: {
        value: this.toJson(next),
        metadata: {
          ...(asRecord(record.metadata) ?? {}),
          status: next.status,
          inputSessionId: session.id,
        },
      },
    });
    await this.upsertApprovalRequest(workspaceId, next);
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
      approvalState: next.status,
      inputState: session.status,
      blockedBy: null,
      evidence: { approvalId, inputSessionId: session.id },
      metadata: {
        conversationId: approval.conversationId,
        contactId: approval.contactId,
        phone: approval.phone,
      },
    });
    const prompt = getPromptForStage(session.status, session.productName);
    await this.agentEvents.publish({
      type: 'prompt',
      workspaceId,
      phase: 'account_input_description',
      persistent: true,
      message: prompt,
      meta: { approvalId, inputSessionId: session.id, stage: session.status },
    });
    return { approved: true, approvalId, inputSessionId: session.id, nextPrompt: prompt, session };
  }

  async rejectCatalogApproval(workspaceId: string, approvalId: string) {
    const { record, approval } = await this.findApproval(workspaceId, approvalId);
    const next: AccountApprovalPayload = {
      ...approval,
      status: 'REJECTED',
      lastDetectedAt: new Date().toISOString(),
    };
    await this.prisma.kloelMemory.update({
      where: { workspaceId_key: { workspaceId, key: record.key } },
      data: {
        value: this.toJson(next),
        metadata: { ...(asRecord(record.metadata) ?? {}), status: next.status },
      },
    });
    await this.upsertApprovalRequest(workspaceId, next);
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
      approvalState: next.status,
      inputState: null,
      blockedBy: { reason: 'operator_rejected_product_creation', approvalId: approval.id },
      evidence: { approvalId: approval.id },
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
      meta: { approvalId, requestedProductName: approval.requestedProductName },
    });
    return { rejected: true, approvalId };
  }

  async respondToInputSession(workspaceId: string, sessionId: string, answer: string) {
    return respondToInputSessionExt(
      { prisma: this.prisma, agentEvents: this.agentEvents },
      {
        workspaceId,
        sessionId,
        answer,
        findInputSessionFn: (w, s) => this.findInputSession(w, s),
        finishApprovalFn: (w, a, p) => this.finishApprovalFromSession(w, a, p),
        enqueueContactResumptionFn: (w, s) => this.enqueueContactResumption(w, s),
      },
    );
  }

  // ═══ PRIVATE (thin wrappers & helpers) ═══

  private toJson(v: unknown): Prisma.InputJsonValue {
    return toPrismaJsonValue(v);
  }

  private buildApprovalKey(np: string) {
    return `account_approval:product_creation:${np}`;
  }
  private buildInputSessionKey(np: string) {
    return `account_input_session:product_creation:${np}`;
  }

  private async findApproval(workspaceId: string, approvalId: string) {
    const approvals = await this.listApprovals(workspaceId);
    const a = approvals.find((i) => i.id === approvalId);
    if (!a) throw new NotFoundException('Aprovação de conta não encontrada');
    const key = this.buildApprovalKey(a.normalizedProductName);
    const record = await this.prisma.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });
    if (!record) throw new NotFoundException('Registro de aprovação não encontrado');
    return { record, approval: a };
  }

  private async findInputSession(workspaceId: string, sessionId: string) {
    const sessions = await this.listInputSessions(workspaceId);
    const s = sessions.find((i) => i.id === sessionId);
    if (!s) throw new NotFoundException('Sessão de input não encontrada');
    const key = this.buildInputSessionKey(s.normalizedProductName);
    const record = await this.prisma.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });
    if (!record) throw new NotFoundException('Registro da sessão não encontrado');
    return { record, session: s };
  }

  private async ensureInputSession(workspaceId: string, approval: AccountApprovalPayload) {
    const key = this.buildInputSessionKey(approval.normalizedProductName);
    const existing = await this.prisma.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });
    if (existing?.value) {
      const p = parseInputSessionPayload(existing.value);
      if (p) return p;
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
    await this.prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key } },
      create: {
        workspaceId,
        key,
        value: this.toJson(session),
        category: 'account_input_session',
        type: 'product_creation',
        content: `Coleta guiada para criar ${approval.requestedProductName}`,
        metadata: this.toJson({
          approvalId: approval.id,
          status: session.status,
          requestedProductName: approval.requestedProductName,
        }),
      },
      update: {
        value: this.toJson(session),
        category: 'account_input_session',
        type: 'product_creation',
        content: `Coleta guiada para criar ${approval.requestedProductName}`,
        metadata: this.toJson({
          approvalId: approval.id,
          status: session.status,
          requestedProductName: approval.requestedProductName,
        }),
      },
    });
    await this.upsertInputCollectionSession(workspaceId, session);
    return session;
  }

  private async finishApprovalFromSession(
    workspaceId: string,
    approvalId: string,
    productId: string | null,
  ) {
    const { record, approval } = await this.findApproval(workspaceId, approvalId);
    const next: AccountApprovalPayload = {
      ...approval,
      status: 'COMPLETED',
      materializedProductId: productId,
      lastDetectedAt: new Date().toISOString(),
    };
    await this.prisma.kloelMemory.update({
      where: { workspaceId_key: { workspaceId, key: record.key } },
      data: {
        value: this.toJson(next),
        metadata: { ...(asRecord(record.metadata) ?? {}), status: next.status, productId },
      },
    });
    await this.upsertApprovalRequest(workspaceId, next);
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
    } catch (e: unknown) {
      this.logger.warn(
        `Failed to enqueue scan-contact: ${(e instanceof Error ? e : new Error(String(e))).message}`,
      );
    }
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
    return materializeAccountCapabilityGapsExt(
      { prisma: this.prisma, agentEvents: this.agentEvents },
      workspaceId,
    );
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
        prompt: getPromptForStage(session.status, session.productName),
        answers: this.toJson(session.answers || {}),
        payload: this.toJson(session),
        completedAt: session.completedAt ? new Date(session.completedAt) : undefined,
      },
      update: {
        state: session.status,
        prompt: getPromptForStage(session.status, session.productName),
        answers: this.toJson(session.answers || {}),
        payload: this.toJson(session),
        completedAt: session.completedAt ? new Date(session.completedAt) : null,
      },
    });
  }

  private async findPreviousWorkItem(workspaceId: string, id: string) {
    return this.prisma.agentWorkItem.findFirst({
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
    });
  }

  private buildWorkItemUpdateData(
    input: WorkItemUpsertInput,
    missingValue: Prisma.InputJsonValue | null | undefined,
  ) {
    return {
      state: input.state,
      owner: input.state === 'BLOCKED' ? 'RULES' : 'AGENT',
      title: input.title,
      summary: input.summary || null,
      priority: input.priority,
      utility: input.utility,
      blockedBy: input.blockedBy ? this.toJson(input.blockedBy) : missingValue,
      requiresApproval: input.requiresApproval,
      requiresInput: input.requiresInput,
      approvalState: input.approvalState || null,
      inputState: input.inputState || null,
      evidence: input.evidence ? this.toJson(input.evidence) : missingValue,
      metadata: input.metadata ? this.toJson(input.metadata) : missingValue,
    };
  }

  private isWorkItemChanged(
    prev: {
      state: string;
      title: string;
      summary: string | null;
      priority: number;
      utility: number;
    } | null,
    input: WorkItemUpsertInput,
  ): boolean {
    if (!prev) return true;
    return (
      prev.state !== input.state ||
      prev.title !== input.title ||
      String(prev.summary || '') !== String(input.summary || '') ||
      Number(prev.priority || 0) !== Number(input.priority || 0) ||
      Number(prev.utility || 0) !== Number(input.utility || 0)
    );
  }

  private async upsertAccountWorkItem(workspaceId: string, input: WorkItemUpsertInput) {
    const entityKey = String(input.entityId || 'global');
    const id = `${workspaceId}:${input.kind}:${input.entityType}:${entityKey}`;
    const previous = await this.findPreviousWorkItem(workspaceId, id);
    const updateData = this.buildWorkItemUpdateData(input, null);
    const createData = {
      id,
      workspaceId,
      kind: input.kind,
      entityType: input.entityType,
      entityId: input.entityId || null,
      ...this.buildWorkItemUpdateData(input, undefined),
    };
    const existing = await this.prisma.agentWorkItem.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.agentWorkItem.updateMany({ where: { id, workspaceId }, data: updateData });
    } else {
      await this.prisma.agentWorkItem.create({ data: createData });
    }
    if (this.isWorkItemChanged(previous, input)) {
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
  }
}
