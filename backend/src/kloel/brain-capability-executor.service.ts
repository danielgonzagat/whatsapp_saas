import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { BrainEventSpineService } from './brain-event-spine.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { AbiBuilderService, type AbiBuildInput } from './abi/abi-builder.service';
import type { IdentityAudience } from './lineage/identity-projector.service';
import { MindPerceptionService } from './mind-perception.service';
import { OPERATOR_CAPABILITIES } from './brain-capabilities.const';
import { MemoryProjector } from './commem/memory.projector';
import type { MindPerceptEvent } from './mind.types';
import type { SpineEventRef } from './mind/mind.types';
import type {
  AbiBelief,
  AbiConsolidatedRef,
  AbiEpisodicRef,
  AbiPredictions,
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
/**
 * Canonical B17 commercial surfaces and their PCI.6 event-domain
 * prefixes. This MIRRORS the frozen contract
 * `docs/contracts/pci/06-b17-surfaces.md` / PCI.1 — it is the contract,
 * not invented behavior (same status as ABI_VERSION / OPERATOR_CAPABILITIES
 * consts). If the PCI changes, this must change with it.
 */
const PCI_B17_SURFACES: ReadonlyArray<{
  readonly surface: string;
  readonly domains: readonly string[];
  /** Substrate kinds that count as REAL (non-canonical) activity today. */
  readonly partialKinds: readonly string[];
}> = [
  {
    surface: 'checkout_wallet_billing',
    domains: ['commerce.cart', 'commerce.payment'],
    partialKinds: ['sale', 'order', 'checkout', 'payment'],
  },
  {
    surface: 'crm',
    domains: ['commerce.crm', 'commerce.lead'],
    partialKinds: ['lead', 'deal', 'stage'],
  },
  {
    surface: 'whatsapp_inbox',
    domains: ['commerce.whatsapp'],
    partialKinds: ['message.received', 'message.sent', 'autopilot'],
  },
  {
    surface: 'campaigns_ads',
    domains: ['commerce.campaign'],
    partialKinds: ['campaign', 'click', 'conversion'],
  },
  {
    surface: 'member_affiliate',
    domains: ['commerce.member_area', 'commerce.affiliate'],
    partialKinds: ['member', 'affiliate', 'enroll'],
  },
  { surface: 'kyc_auth', domains: ['commerce.kyc'], partialKinds: ['kyc', 'document'] },
  {
    surface: 'post_sale',
    domains: ['commerce.post_sale'],
    partialKinds: ['delivery', 'activation', 'churn', 'testimonial', 'repurchase'],
  },
];

/** A dissolution gap derived from REAL substrate counts vs the PCI.6 contract. */
interface DissolutionGap {
  readonly surface: string;
  readonly canonicalDomains: readonly string[];
  readonly canonicalEvents: number;
  readonly partialActivity: number;
  readonly status: 'dissolved' | 'partial' | 'silent';
}

/**
 * The PCI-grounded work queue: for each frozen B17 surface, how many
 * CANONICAL cognitive events vs raw partial activity exist in the live
 * substrate. `silent` = surface emits nothing (not dissolved); `partial`
 * = it is active but not yet emitting canonical PCI events (EVENT-EMIT
 * pending); `dissolved` = canonical cognitive events flowing. 100% real
 * counts from the workspace substrate — zero hardcode, zero synthetic.
 */
function computeDissolutionGaps(substrateKinds: readonly string[]): DissolutionGap[] {
  const lower = substrateKinds.map((k) => k.toLowerCase());
  return PCI_B17_SURFACES.map((s) => {
    const canonicalEvents = lower.filter((k) => s.domains.some((d) => k.startsWith(d))).length;
    const partialActivity = lower.filter((k) => s.partialKinds.some((p) => k.includes(p))).length;
    const status: DissolutionGap['status'] =
      canonicalEvents > 0 ? 'dissolved' : partialActivity > 0 ? 'partial' : 'silent';
    return {
      surface: s.surface,
      canonicalDomains: s.domains,
      canonicalEvents,
      partialActivity,
      status,
    };
  });
}

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
    dissolution: DissolutionGap[];
    beliefs: AbiBelief[];
    predictions: AbiPredictions;
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

    const dissolution = computeDissolutionGaps(events.map((e) => e.kind));

    // Belief induction (frequency + valence, Beta(1,1) posterior mean).
    // 100% derived from real workspace events. Epistemically honest: thin
    // evidence ⇒ confidence stays near 0.5 (no overclaim); a kind needs
    // ≥3 occurrences to crystallize a belief. truthMode='inferred'.
    const byKind = new Map<string, { n: number; pos: number; last: Date }>();
    for (const e of events) {
      const k = e.kind;
      const cur = byKind.get(k) ?? { n: 0, pos: 0, last: e.occurredAt };
      cur.n += 1;
      if (valenceOf(k) === 'positive') cur.pos += 1;
      if (e.occurredAt > cur.last) cur.last = e.occurredAt;
      byKind.set(k, cur);
    }
    const beliefs: AbiBelief[] = [...byKind.entries()]
      .filter(([, s]) => s.n >= 3)
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 20)
      .map(([kind, s]) => ({
        beliefId: `blf_${kind.replace(/[^a-z0-9]/gi, '_').slice(0, 40)}`,
        subject: kind.split(/[._]/)[0] || kind,
        proposition: `evento "${kind}" recorre no workspace (n=${s.n}, janela 7d)`,
        confidence: (s.pos + 1) / (s.n + 2),
        evidenceCount: s.n,
        lastUpdated: s.last.toISOString(),
        truthMode: 'inferred' as const,
      }));

    // Prediction generation (base-rate). Honest: only when total ≥ 5
    // (else empty — no fabrication on thin data). recentSurprises stays
    // [] because true surprise detection requires PERSISTED prior
    // predictions to compare against (a later cycle / pillar #1).
    const total = events.length;
    const topKind = [...byKind.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    const predictions: AbiPredictions =
      total >= 5 && topKind
        ? {
            active: [
              {
                predictionId: `prd_next_${Date.now().toString(36)}`,
                about: 'próximo evento cognitivo do workspace',
                expectedOutcome: `mais provável: "${topKind[0]}"`,
                confidence: topKind[1].n / total,
                horizonHours: 24,
              },
            ],
            recentSurprises: [],
          }
        : { active: [], recentSurprises: [] };

    return {
      recentSalientEvents,
      workingMemory,
      episodicRefs,
      consolidatedRefs,
      dissolution,
      beliefs,
      predictions,
    };
  }

  /**
   * Runtime self-awareness organ (phase 3/4). Kloel reads its OWN
   * deploy/runtime state. Backend self-metrics (uptime/node/memory)
   * are always real and secret-free. Railway/Vercel deploy state is
   * read ONLY if the corresponding read token is present in the env —
   * absent ⇒ an HONEST `configured:false` (never faked). Tokens are
   * read from env, never logged, never returned.
   */
  async inspectRuntime(workspaceId: string): Promise<CapabilityResult> {
    const startedAt = Date.now();
    try {
      const mem = process.memoryUsage();
      const self = {
        nodeVersion: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        rssMb: Math.round(mem.rss / 1048576),
        heapUsedMb: Math.round(mem.heapUsed / 1048576),
        env: process.env.NODE_ENV ?? 'unknown',
      };

      const railwayToken = process.env.RAILWAY_TOKEN;
      const railwayProjectId = process.env.RAILWAY_PROJECT_ID;
      const railwayEnvId = process.env.RAILWAY_ENV_ID;
      const railwayServiceId = process.env.RAILWAY_BACKEND_SERVICE_ID;
      let railway: Record<string, unknown> = { configured: false };
      if (railwayToken && railwayProjectId && railwayEnvId && railwayServiceId) {
        try {
          const q = {
            query: `query{deployments(first:1,input:{projectId:"${railwayProjectId}",environmentId:"${railwayEnvId}",serviceId:"${railwayServiceId}"}){edges{node{status createdAt}}}}`,
          };
          const r = await fetch('https://backboard.railway.app/graphql/v2', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${railwayToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(q),
            signal: AbortSignal.timeout(8000),
          });
          const j = (await r.json()) as {
            data?: { deployments?: { edges?: Array<{ node?: Record<string, unknown> }> } };
          };
          const node = j.data?.deployments?.edges?.[0]?.node;
          railway = node
            ? { configured: true, status: node.status, createdAt: node.createdAt }
            : { configured: true, status: 'unknown' };
        } catch (e: unknown) {
          railway = {
            configured: true,
            error: e instanceof Error ? e.message : 'railway_query_failed',
          };
        }
      }

      const vercelToken = process.env.VERCEL_TOKEN;
      const vercelProjectId = process.env.VERCEL_PROJECT_ID;
      const vercelTeamId = process.env.VERCEL_TEAM_ID;
      let vercel: Record<string, unknown> = { configured: false };
      if (vercelToken && vercelProjectId) {
        try {
          const teamQ = vercelTeamId ? `&teamId=${vercelTeamId}` : '';
          const r = await fetch(
            `https://api.vercel.com/v6/deployments?projectId=${vercelProjectId}&target=production&limit=1${teamQ}`,
            {
              headers: { Authorization: `Bearer ${vercelToken}` },
              signal: AbortSignal.timeout(8000),
            },
          );
          const j = (await r.json()) as { deployments?: Array<Record<string, unknown>> };
          const d = j.deployments?.[0];
          vercel = d
            ? { configured: true, state: d.state, createdAt: d.created }
            : { configured: true, state: 'unknown' };
        } catch (e: unknown) {
          vercel = {
            configured: true,
            error: e instanceof Error ? e.message : 'vercel_query_failed',
          };
        }
      }

      await this.emitCapabilityInvoked(workspaceId, 'inspect_runtime', startedAt, true);
      return { ok: true, data: { self, railway, vercel } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`inspect_runtime failed: ${msg}`);
      await this.emitCapabilityInvoked(workspaceId, 'inspect_runtime', startedAt, false);
      return { ok: false, error: msg };
    }
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
        capabilityIds: [...OPERATOR_CAPABILITIES],
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
      const dissolution = cognitiveSubstrate.dissolution;
      const silentSurfaces = dissolution
        .filter((d) => d.status !== 'dissolved')
        .map((d) => d.surface);
      const workQueue = [
        ...gaps,
        ...dissolution
          .filter((d) => d.status === 'silent')
          .map((d) => `dissolve_surface:${d.surface}`),
        ...dissolution
          .filter((d) => d.status === 'partial')
          .map((d) => `emit_canonical_events:${d.surface}`),
      ];
      await this.emitCapabilityInvoked(workspaceId, 'inspect_self', startedAt, true);
      return {
        ok: true,
        data: {
          cognitiveState: result.abi as unknown as UnknownRecord,
          gaps,
          dissolution,
          workQueue,
          emergent: gaps.length === 0 && silentSurfaces.length === 0,
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
