/**
 * MindCapabilityExecutor — canonical capability execution service
 * (ADR-0013 Wave M1).
 *
 * Executes Kloel's tier-1 capabilities (inspect_runtime, inspect_self,
 * list_products, search_contact, list_conversations, send_message_via_channel,
 * query_revenue_summary, search_code, read_source_file,
 * list_capabilities_detail, run_safe_query) over the real Prisma surface and
 * emits `brain.capability.invoked` events via the canonical event spine.
 *
 * Cross-domain callers: unified-agent.service, kloel-thinker.service,
 * kloel-thinker.helpers, unified-agent.cognitive-state.helpers.
 *
 * Legacy shim: `backend/src/kloel/brain-capability-executor.service.ts`
 * re-exports `MindCapabilityExecutor` under the deprecated alias
 * `BrainCapabilityExecutorService`.
 *
 * @cluster Mind/Coordination
 * @canonical backend/src/kloel/mind/coordination/mind-capability-executor.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import { MindEventSpine } from './mind-event-spine.service';
import { PlanLimitsService } from '../../../billing/plan-limits.service';
import { AbiBuilderService, type AbiBuildInput } from '../../abi/abi-builder.service';
import type { IdentityAudience } from '../../lineage/identity-projector.service';
import { MindPerceptionService } from '../perception/mind-perception.service';
import { OPERATOR_CAPABILITIES } from './mind-capabilities.const';
import { MemoryProjector } from '../../commem/memory.projector';

import { buildCognitiveSubstrate as buildCognitiveSubstrateImpl } from './mind-capability-executor.substrate';
import {
  buildRailwayDeploymentsQuery,
  buildSelfRuntimeSnapshot,
  buildVercelDeploymentsUrl,
  computeCognitiveGaps,
  getRailwayRuntimeConfig,
  getVercelRuntimeConfig,
  parseRailwayDeploymentResponse,
  parseVercelDeploymentResponse,
  readOptionalNum,
  readOptionalStr,
  runtimeErrorMessage,
} from './mind-capability-executor.helpers';

import { CapabilityRegistryV2Service } from '../../capability-registry-v2/capability-registry-v2.service';
import { CodeAccessService } from '../../self-awareness/code-access.service';
import { SafeQueryService } from '../../self-awareness/safe-query.service';
import type { UnknownRecord } from '../../../common/types';

export interface CapabilityResult {
  ok: boolean;
  data?: UnknownRecord | UnknownRecord[];
  error?: string;
}

@Injectable()
export class MindCapabilityExecutor {
  private readonly logger = StructuredLogger.from(MindCapabilityExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: MindEventSpine,
    private readonly planLimits: PlanLimitsService,
    private readonly abiBuilder: AbiBuilderService,
    private readonly mindPerception: MindPerceptionService,
    private readonly capRegistry: CapabilityRegistryV2Service,
    private readonly codeAccess: CodeAccessService,
    private readonly safeQuery: SafeQueryService,
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
  async buildCognitiveSubstrate(workspaceId: string) {
    return buildCognitiveSubstrateImpl(
      {
        prisma: this.prisma,
        mindPerception: this.mindPerception,
        memoryProjector: this.memoryProjector,
      },
      workspaceId,
    );
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
      const self = buildSelfRuntimeSnapshot({
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
        uptimeSeconds: process.uptime(),
        nodeEnv: process.env.NODE_ENV,
      });

      const railway = await this.fetchRailwayDeploymentStatus();
      const vercel = await this.fetchVercelDeploymentStatus();

      await this.emitCapabilityInvoked(workspaceId, 'inspect_runtime', startedAt, true);
      return { ok: true, data: { self, railway, vercel } };
    } catch (error: unknown) {
      const msg = runtimeErrorMessage(error, 'unknown');
      this.logger.error(`inspect_runtime failed: ${msg}`);
      await this.emitCapabilityInvoked(workspaceId, 'inspect_runtime', startedAt, false);
      return { ok: false, error: msg };
    }
  }

  private async fetchRailwayDeploymentStatus(): Promise<Record<string, unknown>> {
    const config = getRailwayRuntimeConfig(process.env);
    if (!config) {
      return { configured: false };
    }
    try {
      const response = await fetch('https://backboard.railway.app/graphql/v2', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          buildRailwayDeploymentsQuery({
            projectId: config.projectId,
            envId: config.envId,
            serviceId: config.serviceId,
          }),
        ),
        signal: AbortSignal.timeout(8000),
      });
      return parseRailwayDeploymentResponse(await response.json());
    } catch (e: unknown) {
      return { configured: true, error: runtimeErrorMessage(e, 'railway_query_failed') };
    }
  }

  private async fetchVercelDeploymentStatus(): Promise<Record<string, unknown>> {
    const config = getVercelRuntimeConfig(process.env);
    if (!config) {
      return { configured: false };
    }
    try {
      const url = buildVercelDeploymentsUrl({
        projectId: config.projectId,
        ...(config.teamId !== undefined ? { teamId: config.teamId } : {}),
      });
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${config.token}` },
        signal: AbortSignal.timeout(8000),
      });
      return parseVercelDeploymentResponse(await response.json());
    } catch (e: unknown) {
      return { configured: true, error: runtimeErrorMessage(e, 'vercel_query_failed') };
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
          cognitiveState: result.abi,
          gaps,
          dissolution,
          workQueue,
          emergent: gaps.length === 0 && silentSurfaces.length === 0,
        },
      };
    } catch (error: unknown) {
      const msg = runtimeErrorMessage(error, 'unknown');
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
      const msg = runtimeErrorMessage(error, 'unknown');
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
      const msg = runtimeErrorMessage(error, 'unknown');
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
      const msg = runtimeErrorMessage(error, 'unknown');
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
      const msg = runtimeErrorMessage(error, 'unknown');
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
      const msg = runtimeErrorMessage(error, 'unknown');
      this.logger.error(`query_revenue_summary failed: ${msg}`);
      await this.emitCapabilityInvoked(workspaceId, 'query_revenue_summary', startedAt, false);
      return { ok: false, error: msg };
    }
  }

  /** Search the codebase (read-only) */
  async searchCode(_workspaceId: string, args?: UnknownRecord): Promise<CapabilityResult> {
    const query = String(args?.query ?? '');
    if (!query.trim()) {
      return { ok: false, error: 'query_required' };
    }
    const glob = typeof args?.glob === 'string' ? args.glob : undefined;
    const max = typeof args?.max === 'number' ? args.max : undefined;
    const hits = this.codeAccess.search(query, {
      ...(glob !== undefined ? { glob } : {}),
      ...(max !== undefined ? { max } : {}),
    });
    return { ok: true, data: hits as unknown as UnknownRecord[] };
  }

  /** Read a specific source file */
  async readSourceFile(_workspaceId: string, args?: UnknownRecord): Promise<CapabilityResult> {
    const filePath = String(args?.path ?? '');
    if (!filePath.trim()) {
      return { ok: false, error: 'path_required' };
    }
    const startLine = typeof args?.startLine === 'number' ? args.startLine : undefined;
    const endLine = typeof args?.endLine === 'number' ? args.endLine : undefined;
    const result = this.codeAccess.read(filePath, startLine, endLine);
    return result;
  }

  /** List capabilities with their status */
  async listCapabilitiesDetail(_workspaceId: string): Promise<CapabilityResult> {
    const caps = this.capRegistry.list();
    const grouped = this.capRegistry.groupedByTier();
    return {
      ok: true,
      data: {
        total: caps.length,
        byTier: Object.entries(grouped).map(([tier, items]) => ({
          tier: parseInt(tier),
          count: items.length,
          capabilities: items.map((c) => ({
            id: c.id,
            title: c.title,
            category: c.category,
            requiresConfirmation: c.requiresConfirmation,
          })),
        })),
      },
    };
  }
  /** Run a safe read-only SQL query */
  async runSafeQuery(_workspaceId: string, args?: UnknownRecord): Promise<CapabilityResult> {
    const sql = String(args?.sql ?? '');
    if (!sql.trim()) {
      return { ok: false, error: 'sql_required' };
    }
    return this.safeQuery.query(_workspaceId, sql);
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

/**
 * @deprecated Use {@link MindCapabilityExecutor} instead.
 * Alias preserved during ADR-0013 Wave M1 (4-week alias window) so existing
 * DI tokens / imports keep working unchanged.
 */
export { MindCapabilityExecutor as BrainCapabilityExecutorService };
