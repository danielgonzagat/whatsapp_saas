import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { BrainEventSpineService } from './brain-event-spine.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { AbiBuilderService, type AbiBuildInput } from './abi/abi-builder.service';
import type { IdentityAudience } from './lineage/identity-projector.service';
import { MindPerceptionService } from './mind-perception.service';
import { MemoryProjector } from './commem/memory.projector';
import type { MindPerceptEvent } from './mind.types';
import type { SpineEventRef } from './mind/mind.types';
import type {
  AbiConsolidatedRef,
  AbiEpisodicRef,
  AbiSalientEvent,
  AbiValence,
  AbiWorkingMemoryItem,
} from './abi/abi-schema';

type UnknownRecord = Record<string, unknown>;

export interface CapabilityResult {
  ok: boolean;
  data?: UnknownRecord | UnknownRecord[];
  error?: string;
}

function readOptionalNum(value: unknown, fb: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fb;
}

function readOptionalStr(value: unknown, fb = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fb;
}

/**
 * Derive an HONEST gap list from the REAL cognitive-state ABI object.
 * Nothing here is hardcoded: it walks the actual returned structure and
 * reports which cognitive loops are still empty/unclosed. Missing paths
 * are simply skipped (no invented field names). This is the data the
 * self-introspection organ surfaces so Kloel can tell, through the chat,
 * what is genuinely not working in itself.
 */
function computeCognitiveGaps(abi: unknown): string[] {
  const gaps: string[] = [];
  if (!abi || typeof abi !== 'object') {
    return ['cognitive_state_unavailable'];
  }
  const root = abi as Record<string, unknown>;
  const at = (path: readonly string[]): unknown =>
    path.reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
      root,
    );
  const isEmptyArray = (v: unknown): boolean => Array.isArray(v) && v.length === 0;

  const arrayChecks: ReadonlyArray<readonly [readonly string[], string]> = [
    [['capabilities'], 'no_capabilities_declared'],
    [['capabilities', 'available'], 'no_capabilities_available'],
    [['beliefs'], 'no_beliefs_formed'],
    [['memory', 'workingMemory'], 'working_memory_empty'],
    [['memory', 'episodicRefs'], 'no_episodic_memory'],
    [['memory', 'consolidatedRefs'], 'no_consolidated_memory'],
    [['predictions', 'active'], 'no_active_predictions'],
    [['perception', 'recentSalientEvents'], 'perception_loop_silent'],
  ];
  for (const [path, label] of arrayChecks) {
    if (isEmptyArray(at(path))) {
      gaps.push(label);
    }
  }

  const lineageStatus = at(['lineage', 'status']);
  if (typeof lineageStatus === 'string' && lineageStatus !== 'intact') {
    gaps.push(`lineage_${lineageStatus}`);
  }
  const pulseVerdict = at(['pulseTruth', 'certificationVerdict']);
  if (typeof pulseVerdict === 'string' && pulseVerdict !== 'PASS') {
    gaps.push(`pulse_${pulseVerdict.toLowerCase()}`);
  }
  return gaps;
}

@Injectable()
export class BrainCapabilityExecutorService {
  private readonly logger = StructuredLogger.from(BrainCapabilityExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: BrainEventSpineService,
    private readonly planLimits: PlanLimitsService,
    private readonly abiBuilder: AbiBuilderService,
    private readonly mindPerception: MindPerceptionService,
  ) {}

  private readonly memoryProjector = new MemoryProjector();

  /**
   * Builds Kloel's REAL cognitive substrate from the live perception
   * substrate (autopilot events, messages, sales, orders via
   * MindPerceptionService) and projects it into memory dimensions via
   * the pure MemoryProjector. This is the perception→memory loop
   * closure: the data is 100% derived from real workspace events — no
   * hardcode, no synthetic fill. Impurity (DB reads) lives HERE, not in
   * the PURE AbiBuilderService.
   */
  private async buildCognitiveSubstrate(workspaceId: string): Promise<{
    recentSalientEvents: AbiSalientEvent[];
    workingMemory: AbiWorkingMemoryItem[];
    episodicRefs: AbiEpisodicRef[];
    consolidatedRefs: AbiConsolidatedRef[];
  }> {
    const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const events = await this.mindPerception.since(workspaceId, new Date(sinceMs));

    const valenceOf = (kind: string): AbiValence => {
      if (/\b(error|failed|fail|abandon|chargeback|refund)\b/i.test(kind)) {
        return 'negative';
      }
      if (/\b(sale|order|paid|converted|executed|success)\b/i.test(kind)) {
        return 'positive';
      }
      return 'neutral';
    };
    const eventId = (e: MindPerceptEvent, i: number): string =>
      `evt_${new Date(e.occurredAt).getTime().toString(36)}_${i.toString(36)}`;

    const ordered = [...events].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const recentSalientEvents: AbiSalientEvent[] = ordered.slice(0, 30).map((e, i) => ({
      eventId: eventId(e, i),
      eventName: e.kind,
      occurredAt: e.occurredAt.toISOString(),
      summary: `${e.kind} — ${e.subject}`,
      valence: valenceOf(e.kind),
    }));

    const spineEvents: SpineEventRef[] = events.map((e, i) => ({
      eventId: eventId(e, i),
      eventName: e.kind,
      workspaceId,
      occurredAt: e.occurredAt.toISOString(),
      truthMode: 'observed',
      valence: valenceOf(e.kind),
      payload: e.payload as Readonly<Record<string, unknown>>,
    }));
    const projections = this.memoryProjector.projectAll({
      events: spineEvents,
      workspaceId,
      dimensions: ['working', 'episodic', 'consolidated'],
    });
    const byDim = (dim: string) => projections.find((p) => p.dimension === dim);

    const workingMemory: AbiWorkingMemoryItem[] = (byDim('working')?.items ?? [])
      .slice(0, 50)
      .map((it) => ({
        itemId: it.id,
        kind: 'fact' as const,
        content: `${it.sourceEventName} (${it.tags.join(',') || 'event'})`,
        addedAt: it.occurredAt,
      }));
    const episodicRefs: AbiEpisodicRef[] = (byDim('episodic')?.items ?? [])
      .slice(0, 50)
      .map((it) => ({
        episodeId: it.id,
        summary: it.sourceEventName,
        occurredAt: it.occurredAt,
      }));
    const consolidatedRefs: AbiConsolidatedRef[] = (byDim('consolidated')?.items ?? [])
      .slice(0, 50)
      .map((it) => ({
        skillId: it.id,
        summary: it.sourceEventName,
        consolidatedAt: it.occurredAt,
      }));

    return { recentSalientEvents, workingMemory, episodicRefs, consolidatedRefs };
  }

  /**
   * Self-introspection organ. Returns Kloel's REAL current cognitive-state
   * ABI (the same self-model surface that is observed externally) plus an
   * honestly-derived list of which cognitive loops are still unclosed.
   * No hardcoded verdict: the snapshot comes from AbiBuilderService and the
   * gaps are computed from that live object. This is how Kloel can answer,
   * through the chat, what genuinely does not work in itself yet.
   */
  async inspectSelf(workspaceId: string, args?: UnknownRecord): Promise<CapabilityResult> {
    const startedAt = Date.now();
    try {
      const requested = readOptionalStr(args?.audience);
      const audience: IdentityAudience = (
        ['public', 'technical', 'origin', 'internal'] as const
      ).includes(requested as IdentityAudience)
        ? (requested as IdentityAudience)
        : 'internal';
      const cognitiveSubstrate = await this.buildCognitiveSubstrate(workspaceId);
      const input: AbiBuildInput = {
        audience,
        currentInput: {
          raw: readOptionalStr(args?.message, 'self-introspection'),
          channel: 'chat',
          arrivalTimestamp: new Date().toISOString(),
        },
        perceptionSnapshot: { channel: 'chat', workspaceId },
        cognitiveSubstrate,
      };
      const result = await this.abiBuilder.build(input);
      if (result.status !== 'ok') {
        await this.emitCapabilityInvoked(workspaceId, 'inspect_self', startedAt, false);
        return {
          ok: true,
          data: { lineageCompromised: true, reason: result.reason, gaps: ['lineage_compromised'] },
        };
      }
      const gaps = computeCognitiveGaps(result.abi);
      await this.emitCapabilityInvoked(workspaceId, 'inspect_self', startedAt, true);
      return {
        ok: true,
        data: {
          cognitiveState: result.abi as unknown as UnknownRecord,
          gaps,
          emergent: gaps.length === 0,
        },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`inspect_self failed: ${msg}`);
      await this.emitCapabilityInvoked(workspaceId, 'inspect_self', startedAt, false);
      return { ok: false, error: msg };
    }
  }

  async listProducts(workspaceId: string, args?: UnknownRecord): Promise<CapabilityResult> {
    const startedAt = Date.now();
    try {
      const search = readOptionalStr(args?.search);
      const limit = Math.min(readOptionalNum(args?.limit, 50), 100);
      const products = await this.prisma.product.findMany({
        where: {
          workspaceId,
          ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
        },
        select: { id: true, name: true, price: true, active: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      await this.emitCapabilityInvoked(workspaceId, 'list_products', startedAt, true);
      return { ok: true, data: products };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`list_products failed: ${msg}`);
      await this.emitCapabilityInvoked(workspaceId, 'list_products', startedAt, false);
      return { ok: false, error: msg };
    }
  }

  async searchContact(workspaceId: string, args?: UnknownRecord): Promise<CapabilityResult> {
    const startedAt = Date.now();
    try {
      const query = readOptionalStr(args?.query);
      if (!query) {
        return { ok: false, error: 'query_required' };
      }
      const limit = Math.min(readOptionalNum(args?.limit, 20), 50);
      const contacts = await this.prisma.contact.findMany({
        where: {
          workspaceId,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, phone: true, email: true, tags: true, leadScore: true },
        orderBy: { name: 'asc' },
        take: limit,
      });
      await this.emitCapabilityInvoked(workspaceId, 'search_contact', startedAt, true);
      return { ok: true, data: contacts };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`search_contact failed: ${msg}`);
      await this.emitCapabilityInvoked(workspaceId, 'search_contact', startedAt, false);
      return { ok: false, error: msg };
    }
  }

  async listConversations(workspaceId: string, args?: UnknownRecord): Promise<CapabilityResult> {
    const startedAt = Date.now();
    try {
      const limit = Math.min(readOptionalNum(args?.limit, 20), 50);
      const statusFilter = readOptionalStr(args?.status, 'all');
      // lastMessagePreview doesn't exist on Conversation in current schema;
      // surface a derived preview by joining the most recent message text.
      const conversations = await this.prisma.conversation.findMany({
        where: {
          workspaceId,
          ...(statusFilter === 'open' ? { status: { not: 'closed' } } : {}),
          ...(statusFilter === 'closed' ? { status: 'closed' } : {}),
        },
        select: {
          id: true,
          contact: { select: { id: true, name: true, phone: true } },
          status: true,
          lastMessageAt: true,
          channel: true,
          assignedAgent: { select: { id: true, name: true } },
          messages: {
            select: { content: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: limit,
      });
      await this.emitCapabilityInvoked(workspaceId, 'list_conversations', startedAt, true);
      return { ok: true, data: conversations };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`list_conversations failed: ${msg}`);
      await this.emitCapabilityInvoked(workspaceId, 'list_conversations', startedAt, false);
      return { ok: false, error: msg };
    }
  }

  async sendMessageViaChannel(
    workspaceId: string,
    args?: UnknownRecord,
  ): Promise<CapabilityResult> {
    const startedAt = Date.now();
    try {
      const phone = readOptionalStr(args?.phone);
      const message = readOptionalStr(args?.message);
      if (!phone) {
        return { ok: false, error: 'phone_required' };
      }
      if (!message) {
        return { ok: false, error: 'message_required' };
      }

      await this.planLimits.ensureTokenBudget(workspaceId);

      await this.events.record({
        workspaceId,
        action: 'message.sent',
        intent: 'send_message_via_channel',
        status: 'executed',
        meta: {
          phone,
          messagePreview: message.slice(0, 120),
          channel: readOptionalStr(args?.channel, 'whatsapp'),
        },
      });

      await this.emitCapabilityInvoked(workspaceId, 'send_message_via_channel', startedAt, true);

      return {
        ok: true,
        data: {
          phone,
          messagePreview: message.slice(0, 120),
          channel: readOptionalStr(args?.channel, 'whatsapp'),
          queued: true,
        },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`send_message_via_channel failed: ${msg}`);
      await this.emitCapabilityInvoked(workspaceId, 'send_message_via_channel', startedAt, false);
      return { ok: false, error: msg };
    }
  }

  async queryRevenueSummary(workspaceId: string, args?: UnknownRecord): Promise<CapabilityResult> {
    const startedAt = Date.now();
    try {
      const days = Math.min(readOptionalNum(args?.days, 30), 365);
      const start = new Date();
      start.setDate(start.getDate() - days);
      start.setHours(0, 0, 0, 0);

      const [agg, total, paid] = await Promise.all([
        this.prisma.checkoutOrder.aggregate({
          where: { workspaceId, createdAt: { gte: start } },
          _sum: { totalInCents: true },
          _avg: { totalInCents: true },
        }),
        this.prisma.checkoutOrder.count({
          where: { workspaceId, createdAt: { gte: start } },
        }),
        this.prisma.checkoutOrder.count({
          where: { workspaceId, createdAt: { gte: start }, status: 'PAID' },
        }),
      ]);

      const summary = {
        totalRevenue: agg._sum.totalInCents || 0,
        ticketMedio: Math.round(agg._avg.totalInCents || 0),
        totalCount: total,
        paidCount: paid,
        conversao: total > 0 ? Math.round((paid / total) * 10000) / 100 : 0,
        periodDays: days,
      };

      await this.emitCapabilityInvoked(workspaceId, 'query_revenue_summary', startedAt, true);
      return { ok: true, data: summary };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`query_revenue_summary failed: ${msg}`);
      await this.emitCapabilityInvoked(workspaceId, 'query_revenue_summary', startedAt, false);
      return { ok: false, error: msg };
    }
  }

  private async emitCapabilityInvoked(
    workspaceId: string,
    capability: string,
    startedAt: number,
    ok: boolean,
  ): Promise<void> {
    try {
      await this.events.record({
        workspaceId,
        action: 'brain.capability.invoked',
        intent: capability,
        status: ok ? 'executed' : 'error',
        meta: {
          capability,
          latencyMs: Date.now() - startedAt,
          ok,
        },
      });
    } catch {
      /* event emission is best-effort for observability */
    }
  }
}
