import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException  } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
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
import { detectCatalogGapExt } from './account-agent.gap-detector';
import { respondToInputSessionExt } from './account-agent.input-session';
import {
  listAccountWorkItems,
  materializeAccountCapabilityGaps,
  upsertAccountWorkItem,
  upsertApprovalRequest,
  upsertInputCollectionSession,
} from './account-agent.work-items';

type AccountAgentMetadata = Record<string, unknown>;

@Injectable()
export class AccountAgentService {
  private readonly logger = StructuredLogger.from(AccountAgentService.name);
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
      await upsertAccountWorkItem(
        { prisma: this.prisma, agentEvents: this.agentEvents },
        input.workspaceId,
        {
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
        },
      );
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
      if (!p) {
        return [];
      }
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
      if (!p) {
        return [];
      }
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
            description: typeof a.description === 'string' ? a.description : null,
            offers: typeof a.offers === 'string' ? a.offers : null,
            company: typeof a.company === 'string' ? a.company : null,
          },
          currentPrompt: getPromptForStage(s, pn),
        },
      ];
    });
  }

  async getWorkItems(workspaceId: string) {
    await materializeAccountCapabilityGaps(
      { prisma: this.prisma, agentEvents: this.agentEvents },
      workspaceId,
    );
    return listAccountWorkItems({ prisma: this.prisma }, workspaceId);
  }

  async getRuntime(workspaceId: string) {
    await materializeAccountCapabilityGaps(
      { prisma: this.prisma, agentEvents: this.agentEvents },
      workspaceId,
    );
    const [approvals, inputSessions, workItems] = await Promise.all([
      this.listApprovals(workspaceId),
      this.listInputSessions(workspaceId),
      listAccountWorkItems({ prisma: this.prisma }, workspaceId),
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
    await upsertApprovalRequest({ prisma: this.prisma }, workspaceId, next);
    await upsertInputCollectionSession({ prisma: this.prisma }, workspaceId, session);
    await upsertAccountWorkItem(
      { prisma: this.prisma, agentEvents: this.agentEvents },
      workspaceId,
      {
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
      },
    );
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
    await upsertApprovalRequest({ prisma: this.prisma }, workspaceId, next);
    await upsertAccountWorkItem(
      { prisma: this.prisma, agentEvents: this.agentEvents },
      workspaceId,
      {
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
      },
    );
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
    if (!a) {
      throw new NotFoundException('Aprovação de conta não encontrada');
    }
    const key = this.buildApprovalKey(a.normalizedProductName);
    const record = await this.prisma.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });
    if (!record) {
      throw new NotFoundException('Registro de aprovação não encontrado');
    }
    return { record, approval: a };
  }

  private async findInputSession(workspaceId: string, sessionId: string) {
    const sessions = await this.listInputSessions(workspaceId);
    const s = sessions.find((i) => i.id === sessionId);
    if (!s) {
      throw new NotFoundException('Sessão de input não encontrada');
    }
    const key = this.buildInputSessionKey(s.normalizedProductName);
    const record = await this.prisma.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });
    if (!record) {
      throw new NotFoundException('Registro da sessão não encontrado');
    }
    const recordTyped = {
      key: record.key,
      metadata:
        record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
          ? (record.metadata as AccountAgentMetadata)
          : null,
    };
    return { record: recordTyped, session: s };
  }

  private async ensureInputSession(workspaceId: string, approval: AccountApprovalPayload) {
    const key = this.buildInputSessionKey(approval.normalizedProductName);
    const existing = await this.prisma.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });
    if (existing?.value) {
      const p = parseInputSessionPayload(existing.value);
      if (p) {
        return p;
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
    await upsertInputCollectionSession({ prisma: this.prisma }, workspaceId, session);
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
    await upsertApprovalRequest({ prisma: this.prisma }, workspaceId, next);
  }

  private async enqueueContactResumption(workspaceId: string, session: AccountInputSessionPayload) {
    if (!session.contactId && !session.phone) {
      return;
    }
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
      Sentry.captureException(e, {
        tags: { type: 'whatsapp_alert', operation: 'enqueue_scan_contact' },
        extra: { workspaceId, contactId: session.contactId, phone: session.phone },
        level: 'warning',
      });
    }
  }
}
