import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MindMessageService, type MindMessage } from './aliases/mind-message.service';
import { MindMemoryItemService, type MindMemoryItem } from './aliases/mind-memory-item.service';

/**
 * Brain → Mind unification — Phase 1 canonical facade (Wave5 L8, Y-6).
 *
 * `MindCanonicalService` is the SINGLE read/write entrypoint that new code
 * should use for the Mind data layer. It is purely additive: it composes the
 * existing alias services (`MindMessageService` over `RAC_KloelMessage`,
 * `MindMemoryItemService` over `RAC_KloelMemory`) and the already-shipped
 * `MindCase` / `MindPolicy` / `MindGraphNode` Prisma models.
 *
 * NO schema change, NO data migration, NO new table — every method hits the
 * SAME physical Postgres rows the legacy callers already use. A later PR
 * (Phase ≥2 of the unification plan) introduces the canonical `RAC_Mind*`
 * tables and a backfill; until then this facade lets new code converge on one
 * vocabulary (`getConversationHistory` / `appendMessage` / `getMemoryItem` /
 * `upsertMemory` / `recordCase` / `recordPolicy` / `addGraphNode`) without
 * touching the storage layer.
 *
 * Workspace isolation is enforced on every method — `workspaceId` is required
 * and threaded into each query/mutation.
 *
 * @see docs/architecture/BRAIN_MIND_UNIFICATION_PLAN.md (Phase 1 Adopter Path)
 */
@Injectable()
export class MindCanonicalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MindMessageService,
    private readonly memory: MindMemoryItemService,
  ) {}

  // ── Conversation (RAC_KloelMessage via MindMessageService) ──────────────

  /**
   * Canonical conversation-history read. Returns the workspace's messages as a
   * stable `{id, role, content, timestamp}` projection, oldest→newest.
   * Delegates to {@link MindMessageService.getHistory}.
   */
  async getConversationHistory(
    workspaceId: string,
    take = 50,
  ): Promise<{ id: string; role: string; content: string; timestamp: Date }[]> {
    return this.messages.getHistory(workspaceId, take);
  }

  /**
   * Canonical conversation-append write. Persists a single role/content pair
   * under the workspace scope. Delegates to
   * {@link MindMessageService.appendToConversation}.
   */
  async appendMessage(workspaceId: string, role: string, content: string): Promise<MindMessage> {
    return this.messages.appendToConversation(workspaceId, role, content);
  }

  // ── Memory (RAC_KloelMemory via MindMemoryItemService) ──────────────────

  /**
   * Canonical memory-item read by `(workspaceId, key)`. Returns `null` when the
   * key is absent. Delegates to {@link MindMemoryItemService.findByKey}.
   */
  async getMemoryItem(workspaceId: string, key: string): Promise<MindMemoryItem | null> {
    return this.memory.findByKey(workspaceId, key);
  }

  /**
   * Canonical memory-item write (upsert by `(workspaceId, key)`).
   * Delegates to {@link MindMemoryItemService.upsert}.
   */
  async upsertMemory(
    workspaceId: string,
    key: string,
    payload: {
      value: Prisma.InputJsonValue;
      category?: string;
      type?: string;
      content?: string;
    },
  ): Promise<MindMemoryItem> {
    return this.memory.upsert(workspaceId, key, payload);
  }

  // ── Case memory (RAC_MindCase) ──────────────────────────────────────────

  /**
   * Canonical case-record write into `RAC_MindCase`. The `id` is generated
   * here because the model has no DB-side default. Workspace-scoped.
   */
  async recordCase(input: {
    workspaceId: string;
    subject: string;
    caseType: string;
    text: string;
    tokens: string[];
    features: Prisma.InputJsonValue;
    action: string;
    occurredAt: Date;
    outcome?: number | null;
  }) {
    return this.prisma.mindCase.create({
      data: {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        subject: input.subject,
        caseType: input.caseType,
        text: input.text,
        tokens: input.tokens,
        features: input.features,
        action: input.action,
        outcome: input.outcome ?? null,
        occurredAt: input.occurredAt,
      },
    });
  }

  // ── Policy ledger (RAC_MindPolicy) ──────────────────────────────────────

  /**
   * Canonical policy-decision write into `RAC_MindPolicy`. Append-only
   * decision ledger; `id` generated here. Workspace-scoped.
   */
  async recordPolicy(input: {
    workspaceId: string;
    subject: string;
    decisionType: string;
    context: Prisma.InputJsonValue;
    candidates: Prisma.InputJsonValue;
    chosen: string;
    baseline: string;
    calcSteps: Prisma.InputJsonValue;
    epsilon: number;
    utilitySuccess: number;
    utilityFail: number;
    fallbackActive: boolean;
    reasonInternal?: string | null;
    outcomeKey?: string | null;
    outcome?: number | null;
    baselineOutcome?: number | null;
    fallbackReason?: string | null;
  }) {
    return this.prisma.mindPolicy.create({
      data: {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        subject: input.subject,
        decisionType: input.decisionType,
        context: input.context,
        candidates: input.candidates,
        chosen: input.chosen,
        baseline: input.baseline,
        calcSteps: input.calcSteps,
        epsilon: input.epsilon,
        utilitySuccess: input.utilitySuccess,
        utilityFail: input.utilityFail,
        fallbackActive: input.fallbackActive,
        reasonInternal: input.reasonInternal ?? null,
        outcomeKey: input.outcomeKey ?? null,
        outcome: input.outcome ?? null,
        baselineOutcome: input.baselineOutcome ?? null,
        fallbackReason: input.fallbackReason ?? null,
      },
    });
  }

  // ── Knowledge graph nodes (RAC_MindGraphNode) ───────────────────────────

  /**
   * Canonical graph-node upsert into `RAC_MindGraphNode`. Idempotent on the
   * `(workspaceId, kind, label)` unique key — re-adding the same node updates
   * its `weight`/`metadata` rather than duplicating. `id` generated on create.
   */
  async addGraphNode(input: {
    workspaceId: string;
    kind: string;
    label: string;
    weight?: number;
    metadata?: Prisma.InputJsonValue;
  }) {
    const weight = input.weight ?? 1;
    const metadata = input.metadata ?? {};
    return this.prisma.mindGraphNode.upsert({
      where: {
        workspaceId_kind_label: {
          workspaceId: input.workspaceId,
          kind: input.kind,
          label: input.label,
        },
      },
      create: {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        kind: input.kind,
        label: input.label,
        weight,
        metadata,
      },
      update: {
        weight,
        metadata,
      },
    });
  }
}
