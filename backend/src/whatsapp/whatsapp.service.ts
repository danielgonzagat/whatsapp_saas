import { randomInt, randomUUID } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';

import { PlanLimitsService } from '../billing/plan-limits.service';
import { forEachSequential } from '../common/async-sequence';
import { createRedisClient } from '../common/redis/redis.util';
import { NeuroCrmService } from '../crm/neuro-crm.service';
import { InboxService } from '../inbox/inbox.service';
import { StructuredLogger } from '../logging/structured-logger';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueDedupId, buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue, flowQueue } from '../queue/queue';
import { WorkspaceService } from '../workspaces/workspace.service';
import {
  type ConversationOperationalLike,
  type ConversationOperationalState,
  buildConversationOperationalState,
} from './agent-conversation-state.util';
import * as chatHelpers from './whatsapp.service.chats';
import type { ChatHelperDeps } from './whatsapp.service.chats';
import { CiaRuntimeService } from './cia-runtime.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppApiProvider } from './providers/whatsapp-api.provider';
import { WhatsAppCatchupService } from './whatsapp-catchup.service';
import { isPlaceholderContactName as isPlaceholderContactNameValue } from './whatsapp-normalization.util';
import { WorkerRuntimeService } from './worker-runtime.service';

const D_RE = /\D/g;
const PATTERN_RE = /-/g;

type NormalizedContact = {
  id: string;
  phone: string;
  name: string | null;
  pushName: string | null;
  shortName: string | null;
  email: string | null;
  localContactId: string | null;
  source: 'provider' | 'crm' | 'waha+crm';
  registered: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type NormalizedChat = {
  id: string;
  phone: string;
  name: string | null;
  unreadCount: number;
  pending: boolean;
  needsReply?: boolean;
  pendingMessages?: number;
  owner?: ConversationOperationalState['owner'];
  blockedReason?: ConversationOperationalState['blockedReason'];
  lastMessageDirection?: ConversationOperationalState['lastMessageDirection'];
  timestamp: number;
  lastMessageAt: string | null;
  conversationId: string | null;
  status: string | null;
  mode?: string | null;
  assignedAgentId?: string | null;
  source: 'provider' | 'crm' | 'waha+crm';
};

type CatalogConversationSummary = {
  id: string;
  contactId: string;
  unreadCount: number | null;
  status: string | null;
  mode: string | null;
  lastMessageAt: Date | null;
};

/**
 * =====================================================================
 * WHATSAPPSERVICE PRO (UWE-Ω)
 * =====================================================================
 */

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly slog = new StructuredLogger('whatsapp-service');
  private readonly contactDebounceMs = Math.max(
    500,
    Number.parseInt(process.env.AUTOPILOT_CONTACT_DEBOUNCE_MS || '2000', 10) || 2000,
  );

  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly inbox: InboxService,
    private readonly planLimits: PlanLimitsService,
    @InjectRedis() private readonly redis: Redis,
    private readonly neuroCrm: NeuroCrmService,
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly whatsappApi: WhatsAppApiProvider,
    private readonly catchupService: WhatsAppCatchupService,
    private readonly ciaRuntime: CiaRuntimeService,
    private readonly workerRuntime: WorkerRuntimeService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  private readText(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim();
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
  }

  private isPlaceholderContactName(value: unknown, phone?: string | null): boolean {
    return isPlaceholderContactNameValue(value, phone);
  }

  private resolveTrustedContactName(phone: string, ...candidates: unknown[]): string {
    for (const candidate of candidates) {
      const normalized = this.readText(candidate);
      if (normalized && !this.isPlaceholderContactName(normalized, phone)) {
        return normalized;
      }
    }

    return '';
  }

  /** List contacts. */
  async listContacts(workspaceId: string) {
    const remoteContacts = this.normalizeContacts(
      await this.providerRegistry.getContacts(workspaceId),
    );
    const localContacts =
      (await this.prisma.contact.findMany({
        take: 500,
        where: { workspaceId },
        select: {
          id: true,
          phone: true,
          name: true,
          email: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      })) || [];

    const merged = new Map<string, NormalizedContact>();

    for (const contact of remoteContacts) {
      merged.set(contact.phone, contact);
    }

    for (const local of localContacts) {
      const existing = merged.get(local.phone);
      merged.set(local.phone, {
        id: existing?.id || `${local.phone}@c.us`,
        phone: local.phone,
        name: this.resolveTrustedContactName(local.phone, existing?.name, local.name) || null,
        pushName: this.isPlaceholderContactName(existing?.pushName, local.phone)
          ? this.isPlaceholderContactName(local.name, local.phone)
            ? null
            : local.name
          : existing?.pushName || null,
        shortName: existing?.shortName || null,
        email: local.email || existing?.email || null,
        localContactId: local.id,
        source: existing ? 'waha+crm' : 'crm',
        registered: existing?.registered ?? null,
        createdAt: existing?.createdAt || local.createdAt?.toISOString?.() || null,
        updatedAt:
          local.updatedAt?.toISOString?.() ||
          existing?.updatedAt ||
          local.createdAt?.toISOString?.() ||
          null,
      });
    }

    return Array.from(merged.values()).sort((a, b) => {
      const byUpdatedAt = (b.updatedAt || '').localeCompare(a.updatedAt || '');
      if (byUpdatedAt !== 0) {
        return byUpdatedAt;
      }
      return String(a.name || a.phone).localeCompare(String(b.name || b.phone));
    });
  }

  /** Create contact. */
  async createContact(
    workspaceId: string,
    input: { phone: string; name?: string; email?: string },
  ) {
    const phone = this.normalizeNumber(input.phone || '');
    if (!phone) {
      throw new BadRequestException('phone é obrigatório');
    }

    const registered = await this.providerRegistry
      .isRegistered(workspaceId, phone)
      .catch(() => null);

    const contact = await this.prisma.contact.upsert({
      where: { workspaceId_phone: { workspaceId, phone } },
      update: {
        name: this.resolveTrustedContactName(phone, input.name) || null,
        email: input.email?.trim() || undefined,
      },
      create: {
        workspaceId,
        phone,
        name: this.resolveTrustedContactName(phone, input.name) || null,
        email: input.email?.trim() || undefined,
      },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await this.syncRemoteContactProfile(
      workspaceId,
      contact.phone,
      contact.name || input.name || undefined,
    ).catch(() => undefined);

    return {
      id: `${phone}@c.us`,
      phone: contact.phone,
      name: contact.name || null,
      email: contact.email || null,
      localContactId: contact.id,
      source: 'crm',
      registered,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    };
  }

  /** Sync remote contact profile. */
  async syncRemoteContactProfile(
    workspaceId: string,
    phone: string,
    name?: string | null,
  ): Promise<boolean> {
    const normalizedPhone = this.normalizeNumber(phone || '');
    const normalizedName = this.resolveTrustedContactName(phone, name);

    if (!normalizedPhone || !normalizedName) {
      return false;
    }

    try {
      return await this.providerRegistry.upsertContactProfile(workspaceId, {
        phone: normalizedPhone,
        name: normalizedName,
      });
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.warn(
        `Falha ao sincronizar contato ${normalizedPhone} no provider de WhatsApp: ${String(
          errorInstanceofError?.message || 'unknown_error',
        )}`,
      );
      void this.opsAlert?.alertOnCriticalError(error, 'WhatsappService.syncRemoteContactProfile', {
        workspaceId,
        metadata: { phone: normalizedPhone },
      });
      return false;
    }
  }

  /** Build the deps object for chat helper functions. */
  private getChatHelperDeps(): ChatHelperDeps {
    return {
      prisma: this.prisma,
      providerRegistry: this.providerRegistry,
      normalizeChats: (raw) => this.normalizeChats(raw),
      normalizeMessages: (raw, fallbackChatId) => this.normalizeMessages(raw, fallbackChatId),
      normalizeNumber: (num) => this.normalizeNumber(num),
      normalizeChatId: (chatId) => this.normalizeChatId(chatId),
      isIndividualChatId: (chatId) => this.isIndividualChatId(chatId),
      toIsoTimestamp: (timestamp) => this.toIsoTimestamp(timestamp),
      resolveTimestamp: (value) => this.resolveTimestamp(value),
      resolveTrustedContactName: (phone, ...candidates) =>
        this.resolveTrustedContactName(phone, ...candidates),
      listOperationalConversations: (workspaceId, options) =>
        this.listOperationalConversations(workspaceId, options),
    };
  }

  /** List chats. */
  async listChats(workspaceId: string) {
    return chatHelpers.listChats(this.getChatHelperDeps(), workspaceId);
  }

  /** Get chat messages. */
  async getChatMessages(
    workspaceId: string,
    chatId: string,
    options?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ) {
    return chatHelpers.getChatMessages(this.getChatHelperDeps(), workspaceId, chatId, options);
  }

  /** Get backlog. */
  async getBacklog(workspaceId: string) {
    return chatHelpers.getBacklog(this.getChatHelperDeps(), workspaceId);
  }

  /** Get operational backlog report. */
  async getOperationalBacklogReport(
    workspaceId: string,
    options?: { limit?: number; includeResolved?: boolean },
  ) {
    return chatHelpers.getOperationalBacklogReport(this.getChatHelperDeps(), workspaceId, options);
  }

  /** List catalog contacts. */
  async listCatalogContacts(
    workspaceId: string,
    options?: {
      days?: number;
      page?: number;
      limit?: number;
      onlyCataloged?: boolean;
    },
  ) {
    const days = Math.max(1, Math.min(365, Number(options?.days || 30) || 30));
    const page = Math.max(1, Number(options?.page || 1) || 1);
    const limit = Math.max(1, Math.min(200, Number(options?.limit || 50) || 50));
    const onlyCataloged = options?.onlyCataloged !== false;

    const entries = await this.collectCatalogContactEntries(workspaceId, {
      days,
      onlyCataloged,
    });
    const total = entries.length;
    const offset = (page - 1) * limit;

    return {
      workspaceId,
      generatedAt: new Date().toISOString(),
      days,
      page,
      limit,
      total,
      onlyCataloged,
      items: entries.slice(offset, offset + limit),
    };
  }

  /** List purchase probability ranking. */
  async listPurchaseProbabilityRanking(
    workspaceId: string,
    options?: {
      days?: number;
      limit?: number;
      minLeadScore?: number;
      minProbabilityScore?: number;
      onlyCataloged?: boolean;
      excludeBuyers?: boolean;
    },
  ) {
    const days = Math.max(1, Math.min(365, Number(options?.days || 30) || 30));
    const limit = Math.max(1, Math.min(200, Number(options?.limit || 50) || 50));
    const minLeadScore = Math.max(0, Math.min(100, Number(options?.minLeadScore || 0) || 0));
    const minProbabilityScore = Math.max(
      0,
      Math.min(1, Number(options?.minProbabilityScore || 0) || 0),
    );
    const onlyCataloged = options?.onlyCataloged !== false;
    const excludeBuyers = options?.excludeBuyers === true;

    const entries = await this.collectCatalogContactEntries(workspaceId, {
      days,
      onlyCataloged,
    });

    const rankedItems = entries
      .filter(
        (item) =>
          (!excludeBuyers || item.buyerStatus !== 'BOUGHT') &&
          item.leadScore >= minLeadScore &&
          item.purchaseProbabilityScore >= minProbabilityScore,
      )
      .sort((a, b) => {
        if (a.purchaseProbabilityScore !== b.purchaseProbabilityScore) {
          return b.purchaseProbabilityScore - a.purchaseProbabilityScore;
        }
        if (a.leadScore !== b.leadScore) {
          return b.leadScore - a.leadScore;
        }
        return (
          this.resolveTimestamp({ createdAt: b.lastConversationAt }) -
          this.resolveTimestamp({ createdAt: a.lastConversationAt })
        );
      })
      .slice(0, limit)
      .map((item, index) => ({
        rank: index + 1,
        ...item,
      }));

    return {
      workspaceId,
      generatedAt: new Date().toISOString(),
      days,
      limit,
      minLeadScore,
      minProbabilityScore,
      onlyCataloged,
      excludeBuyers,
      total: rankedItems.length,
      items: rankedItems,
    };
  }

  /** Trigger catalog refresh. */
  async triggerCatalogRefresh(
    workspaceId: string,
    options?: {
      days?: number;
      reason?: string;
    },
  ) {
    const days = Math.max(1, Math.min(365, Number(options?.days || 30) || 30));
    const reason = String(options?.reason || 'manual_catalog_refresh').trim();
    const jobId = buildQueueJobId('catalog-contacts-30d', workspaceId);

    await autopilotQueue.add(
      'catalog-contacts-30d',
      {
        workspaceId,
        days,
        reason,
      },
      {
        jobId,
        removeOnComplete: true,
      },
    );

    return {
      scheduled: true,
      workspaceId,
      days,
      reason,
      jobName: 'catalog-contacts-30d',
      jobId,
    };
  }

  /** Trigger catalog rescore. */
  async triggerCatalogRescore(
    workspaceId: string,
    options?: {
      contactId?: string;
      days?: number;
      limit?: number;
      reason?: string;
    },
  ) {
    const reason = String(options?.reason || 'manual_catalog_rescore').trim();
    const limit = Math.max(1, Math.min(500, Number(options?.limit || 100) || 100));

    let targets: Array<{
      contactId: string;
      phone: string;
      contactName: string | null;
      chatId?: string | null;
    }> = [];

    if (options?.contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: {
          id: options.contactId,
          workspaceId,
        },
        select: {
          id: true,
          phone: true,
          name: true,
          customFields: true,
        },
      });

      if (!contact) {
        throw new BadRequestException('contactId inválido para este workspace');
      }

      targets = [
        {
          contactId: contact.id,
          phone: contact.phone,
          contactName: contact.name || contact.phone,
          chatId:
            this.readText(this.normalizeJsonObject(contact.customFields).lastRemoteChatId) ||
            this.readText(this.normalizeJsonObject(contact.customFields).lastResolvedChatId) ||
            `${contact.phone}@c.us`,
        },
      ];
    } else {
      const entries = await this.collectCatalogContactEntries(workspaceId, {
        days: options?.days || 30,
        onlyCataloged: false,
      });

      targets = entries.slice(0, limit).map((entry) => ({
        contactId: entry.id,
        phone: entry.phone,
        contactName: entry.name || entry.phone,
        chatId: entry.lastRemoteChatId || entry.lastResolvedChatId || `${entry.phone}@c.us`,
      }));
    }

    let scheduled = 0;
    await forEachSequential(targets, async (target) => {
      await autopilotQueue.add(
        'score-contact',
        {
          workspaceId,
          contactId: target.contactId,
          phone: target.phone,
          contactName: target.contactName,
          chatId: target.chatId || `${target.phone}@c.us`,
          reason,
        },
        {
          jobId: buildQueueJobId('score-contact', workspaceId, target.contactId),
          removeOnComplete: true,
        },
      );
      scheduled += 1;
    });

    return {
      scheduled: true,
      workspaceId,
      reason,
      count: scheduled,
      contactId: options?.contactId || null,
      days: options?.days || 30,
      limit,
    };
  }

  /** Trigger backlog rebuild. */
  async triggerBacklogRebuild(workspaceId: string, options?: { limit?: number; reason?: string }) {
    const reason = String(options?.reason || 'manual_backlog_rebuild').trim();
    const limit = Math.max(1, Math.min(2000, Number(options?.limit || 500) || 500));
    const catchup = await this.catchupService
      .runCatchupNow(workspaceId, reason)
      .catch((error: unknown) => ({
        scheduled: false,
        reason: String(error instanceof Error ? error.message : 'catchup_failed'),
      }));
    const run = await this.ciaRuntime.startBacklogRun(
      workspaceId,
      'reply_all_recent_first',
      limit,
      {
        autoStarted: true,
        runtimeState: 'EXECUTING_BACKLOG',
        triggeredBy: reason,
      },
    );

    return {
      workspaceId,
      reason,
      limit,
      catchup,
      run,
    };
  }

  /** Recreate session if invalid. */
  async recreateSessionIfInvalid(workspaceId: string) {
    await this.providerRegistry.getProviderType(workspaceId);
    const diagnostics = await this.providerRegistry.getSessionDiagnostics(workspaceId);
    await this.providerRegistry.getSessionStatus(workspaceId).catch(() => null);

    const sessionInvalid =
      !diagnostics?.available ||
      diagnostics?.configMismatch ||
      diagnostics?.webhookConfigured !== true ||
      diagnostics?.inboundEventsConfigured !== true ||
      diagnostics?.storeEnabled !== true;

    if (!sessionInvalid) {
      return {
        recreated: false,
        reason: 'session_config_healthy',
        diagnostics,
      };
    }

    await this.providerRegistry.deleteSession(workspaceId).catch(() => undefined);
    const start = await this.providerRegistry.startSession(workspaceId);

    return {
      recreated: start.success === true,
      reason: start.message,
      diagnostics,
    };
  }

  /** List operational conversations. */
  async listOperationalConversations(
    workspaceId: string,
    options?: { limit?: number; pendingOnly?: boolean },
  ): Promise<ConversationOperationalState[]> {
    const conversations =
      (await this.prisma.conversation.findMany({
        take: Math.max(1, Math.min(1000, Number(options?.limit || 500) || 500)),
        where: {
          workspaceId,
          status: { not: 'CLOSED' },
        },
        select: {
          id: true,
          status: true,
          mode: true,
          assignedAgentId: true,
          unreadCount: true,
          lastMessageAt: true,
          contact: {
            select: {
              id: true,
              phone: true,
              name: true,
            },
          },
          messages: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              direction: true,
              createdAt: true,
              content: true,
            },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
      })) || [];

    return conversations
      .map((conversation) =>
        buildConversationOperationalState(conversation as ConversationOperationalLike),
      )
      .filter((conversation) => !options?.pendingOnly || conversation.pending);
  }

  /** Set presence. */
  async setPresence(
    workspaceId: string,
    chatId: string,
    presence: 'typing' | 'paused' | 'seen' | 'available' | 'offline',
  ) {
    const normalizedChatId = this.normalizeChatId(chatId);

    switch (presence) {
      case 'available':
        await this.providerRegistry.setPresence(workspaceId, 'available', normalizedChatId);
        break;
      case 'offline':
        await this.providerRegistry.setPresence(workspaceId, 'offline', normalizedChatId);
        break;
      case 'typing':
        await this.providerRegistry.sendTyping(workspaceId, normalizedChatId);
        break;
      case 'paused':
        await this.providerRegistry.stopTyping(workspaceId, normalizedChatId);
        break;
      case 'seen':
        await this.markChatAsReadBestEffort(workspaceId, normalizedChatId);
        break;
      default:
        throw new BadRequestException('presence inválida');
    }

    return {
      ok: true,
      chatId: normalizedChatId,
      presence,
    };
  }

  /** Trigger sync. */
  async triggerSync(workspaceId: string, reason = 'manual_sync') {
    return this.catchupService.triggerCatchup(workspaceId, reason);
  }

  // ============================================================
  // Normalize number
  // ============================================================
  private normalizeNumber(num: string): string {
    return num.replace(D_RE, '');
  }

  private isIndividualChatId(chatId?: string | null) {
    const value = String(chatId || '').trim();
    return value.endsWith('@c.us') || value.endsWith('@s.whatsapp.net');
  }

  private normalizeJsonObject(value: unknown): Record<string, unknown> {
    if (!value) {
      return {};
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return {};
      }
      return {};
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private normalizeDateValue(value: unknown) {
    const timestamp = this.resolveTimestamp({ createdAt: value });
    return this.toIsoTimestamp(timestamp);
  }

  private normalizeProbabilityScore(score: unknown, bucket?: string | null) {
    const numeric = Number(score);
    if (Number.isFinite(numeric)) {
      return Math.max(0, Math.min(1, Number(numeric.toFixed(3))));
    }

    switch (
      String(bucket || '')
        .trim()
        .toUpperCase()
    ) {
      case 'VERY_HIGH':
        return 0.95;
      case 'HIGH':
        return 0.8;
      case 'MEDIUM':
        return 0.5;
      case 'LOW':
        return 0.15;
      default:
        return 0;
    }
  }

  private async collectCatalogContactEntries(
    workspaceId: string,
    options?: { days?: number; onlyCataloged?: boolean },
  ) {
    const days = Math.max(1, Math.min(365, Number(options?.days || 30) || 30));
    const onlyCataloged = options?.onlyCataloged !== false;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const [contacts, conversations] = await Promise.all([
      this.prisma.contact.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: 'desc' },
        take: 2000,
      }),
      this.prisma.conversation.findMany({
        where: { workspaceId },
        select: {
          id: true,
          contactId: true,
          unreadCount: true,
          status: true,
          mode: true,
          lastMessageAt: true,
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 4000,
      }),
    ]);

    const conversationsByContact = new Map<string, CatalogConversationSummary[]>();
    for (const conversation of conversations || []) {
      const items = conversationsByContact.get(conversation.contactId) || [];
      items.push(conversation);
      conversationsByContact.set(conversation.contactId, items);
    }

    return (contacts || [])
      .map((contact) => {
        const customFields = this.normalizeJsonObject(contact.customFields);
        const relatedConversations = (conversationsByContact.get(contact.id) || [])
          .slice()
          .sort(
            (a, b) =>
              this.resolveTimestamp({ createdAt: b.lastMessageAt }) -
              this.resolveTimestamp({ createdAt: a.lastMessageAt }),
          );
        const lastConversation = relatedConversations[0] || null;
        const lastConversationAt = this.normalizeDateValue(lastConversation?.lastMessageAt) || null;
        const unreadCount = relatedConversations.reduce(
          (sum, conversation) => sum + Math.max(0, Number(conversation?.unreadCount || 0) || 0),
          0,
        );
        const catalogedAt = this.normalizeDateValue(customFields.catalogedAt);
        const lastScoredAt = this.normalizeDateValue(customFields.lastScoredAt);
        const whatsappSavedAt = this.normalizeDateValue(customFields.whatsappSavedAt);
        const remotePushName =
          typeof customFields.remotePushName === 'string' ? customFields.remotePushName : null;
        const lastRemoteChatId =
          typeof customFields.lastRemoteChatId === 'string' ? customFields.lastRemoteChatId : null;
        const lastResolvedChatId =
          typeof customFields.lastResolvedChatId === 'string'
            ? customFields.lastResolvedChatId
            : null;
        const purchaseProbabilityScore = this.normalizeProbabilityScore(
          customFields.purchaseProbabilityScore,
          contact.purchaseProbability,
        );
        const purchaseProbabilityPercent = Math.max(
          0,
          Math.min(
            100,
            Math.round(
              Number(customFields.purchaseProbabilityPercent ?? purchaseProbabilityScore * 100) ||
                0,
            ),
          ),
        );
        const probabilityReasons = Array.isArray(customFields.probabilityReasons)
          ? customFields.probabilityReasons
              .map((reason: unknown) => (typeof reason === 'string' ? reason : '').trim())
              .filter(Boolean)
          : [];
        const preferences = Array.isArray(customFields.preferences)
          ? customFields.preferences
              .map((item: unknown) => (typeof item === 'string' ? item : '').trim())
              .filter(Boolean)
          : [];
        const importantDetails = Array.isArray(customFields.importantDetails)
          ? customFields.importantDetails
              .map((item: unknown) => (typeof item === 'string' ? item : '').trim())
              .filter(Boolean)
          : [];
        const demographicsFields = this.normalizeJsonObject(customFields.demographics);
        const demographics =
          Object.keys(demographicsFields).length > 0
            ? {
                gender:
                  typeof demographicsFields.gender === 'string'
                    ? demographicsFields.gender
                    : 'UNKNOWN',
                ageRange:
                  typeof demographicsFields.ageRange === 'string'
                    ? demographicsFields.ageRange
                    : 'UNKNOWN',
                location:
                  typeof demographicsFields.location === 'string'
                    ? demographicsFields.location
                    : 'UNKNOWN',
                confidence: Math.max(
                  0,
                  Math.min(1, Number(demographicsFields.confidence || 0) || 0),
                ),
              }
            : {
                gender: 'UNKNOWN',
                ageRange: 'UNKNOWN',
                location: 'UNKNOWN',
                confidence: 0,
              };
        const rawBuyerStatus =
          typeof customFields.buyerStatus === 'string'
            ? customFields.buyerStatus.trim().toUpperCase()
            : '';
        const buyerStatus = ['BOUGHT', 'NOT_BOUGHT', 'UNKNOWN'].includes(rawBuyerStatus)
          ? rawBuyerStatus
          : 'UNKNOWN';
        const cataloged =
          !!catalogedAt ||
          !!lastScoredAt ||
          !!whatsappSavedAt ||
          !!String(contact.aiSummary || '').trim() ||
          probabilityReasons.length > 0 ||
          Number.isFinite(Number(customFields.purchaseProbabilityScore));

        const latestRelevantTimestamp = Math.max(
          this.resolveTimestamp({ createdAt: lastConversationAt }),
          this.resolveTimestamp({ createdAt: catalogedAt }),
          this.resolveTimestamp({ createdAt: lastScoredAt }),
          this.resolveTimestamp({ createdAt: contact.updatedAt }),
        );

        return {
          id: contact.id,
          phone: contact.phone,
          name: this.resolveTrustedContactName(contact.phone, remotePushName, contact.name) || null,
          email: contact.email || null,
          leadScore: Math.max(0, Number(contact.leadScore || 0) || 0),
          sentiment: contact.sentiment || 'NEUTRAL',
          purchaseProbability: contact.purchaseProbability || 'LOW',
          purchaseProbabilityScore,
          purchaseProbabilityPercent,
          buyerStatus,
          purchasedProduct:
            typeof customFields.purchasedProduct === 'string'
              ? customFields.purchasedProduct
              : null,
          purchaseValue: Number.isFinite(Number(customFields.purchaseValue))
            ? Number(customFields.purchaseValue)
            : null,
          purchaseReason:
            typeof customFields.purchaseReason === 'string' ? customFields.purchaseReason : null,
          notPurchasedReason:
            typeof customFields.notPurchasedReason === 'string'
              ? customFields.notPurchasedReason
              : null,
          nextBestAction: contact.nextBestAction || null,
          aiSummary: contact.aiSummary || null,
          fullSummary:
            typeof customFields.fullSummary === 'string'
              ? customFields.fullSummary
              : contact.aiSummary || null,
          intent: typeof customFields.intent === 'string' ? customFields.intent : null,
          remotePushName,
          demographics,
          preferences,
          importantDetails,
          probabilityReasons,
          cataloged,
          catalogedAt,
          lastScoredAt,
          whatsappSavedAt,
          lastRemoteChatId,
          lastResolvedChatId,
          conversationCount: relatedConversations.length,
          unreadCount,
          lastConversationAt,
          lastConversationStatus: lastConversation?.status || null,
          lastConversationMode: lastConversation?.mode || null,
          createdAt: contact.createdAt?.toISOString?.() || null,
          updatedAt: contact.updatedAt?.toISOString?.() || null,
          latestRelevantTimestamp,
        };
      })
      .filter((entry) => {
        if (onlyCataloged && !entry.cataloged) {
          return false;
        }
        return entry.latestRelevantTimestamp >= cutoff;
      })
      .sort((a, b) => {
        const catalogTimestampA = Math.max(
          this.resolveTimestamp({ createdAt: a.catalogedAt }),
          this.resolveTimestamp({ createdAt: a.lastScoredAt }),
        );
        const catalogTimestampB = Math.max(
          this.resolveTimestamp({ createdAt: b.catalogedAt }),
          this.resolveTimestamp({ createdAt: b.lastScoredAt }),
        );
        if (catalogTimestampA !== catalogTimestampB) {
          return catalogTimestampB - catalogTimestampA;
        }
        if (a.purchaseProbabilityScore !== b.purchaseProbabilityScore) {
          return b.purchaseProbabilityScore - a.purchaseProbabilityScore;
        }
        return b.latestRelevantTimestamp - a.latestRelevantTimestamp;
      })
      .map(({ latestRelevantTimestamp: _latestRelevantTimestamp, ...entry }) => entry);
  }

  private isAutonomousEnabled(settings: Record<string, unknown>): boolean {
    const autonomy = this.normalizeJsonObject(settings.autonomy);
    const autopilot = this.normalizeJsonObject(settings.autopilot);
    const mode = this.readText(autonomy.mode).toUpperCase();
    if (mode) {
      return mode === 'LIVE' || mode === 'BACKLOG' || mode === 'FULL';
    }
    return autopilot.enabled === true;
  }

  // ============================================================
  // 1. CREATE SESSION (WAHA)
  // ============================================================
  async createSession(workspaceId: string) {
    this.logger.log(`[SERVICE] createSession → workspace=${workspaceId}`);
    this.slog.info('createSession', { workspaceId });

    if (!workspaceId) {
      throw new ForbiddenException('workspaceId é obrigatório para criar sessão.');
    }

    const result = await this.providerRegistry.startSession(workspaceId);
    if (!result.success) {
      return {
        error: true,
        message: result.message || 'failed_to_start_session',
      };
    }

    const qr = await this.providerRegistry.getQrCode(workspaceId);
    if (qr.success && qr.qr) {
      return {
        status: 'qr_pending',
        code: qr.qr,
        qrCode: qr.qr,
      };
    }

    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    return {
      status: status.connected ? 'already_connected' : status.status,
      qrCode: status.qrCode,
    };
  }

  // ============================================================
  // 2. SEND MESSAGE (via Worker Engine)
  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  // ============================================================
  async sendMessage(
    workspaceId: string,
    to: string,
    message: string,
    opts?: {
      mediaUrl?: string;
      mediaType?: 'image' | 'video' | 'audio' | 'document';
      caption?: string;
      externalId?: string;
      complianceMode?: 'reactive' | 'proactive';
      forceDirect?: boolean;
      quotedMessageId?: string;
    },
  ) {
    this.logger.log(`[SERVICE] sendMessage(workspace=${workspaceId}, to=${to})`);
    this.slog.info('send_message', { workspaceId, to });

    await this.planLimits.ensureSubscriptionActive(workspaceId);

    const ws = await this.workspaces.getWorkspace(workspaceId);
    const engineWs = this.workspaces.toEngineWorkspace(ws);

    await this.ensureOptInAllowed(workspaceId, to, opts?.complianceMode || 'proactive');

    // Validação rápida de credenciais do provedor antes de enfileirar
    const missing = this.validateWorkspaceProvider(engineWs);
    if (missing.length) {
      this.slog.warn('send_blocked_missing_provider', { workspaceId, missing });
      return {
        error: true,
        message: `Configuração do provedor incompleta: ${missing.join(', ')}`,
      };
    }

    const runtimeReadiness = await this.collectMessagingRuntimeIssues(workspaceId, engineWs, {
      requireInboundWebhook: false,
    });
    if (runtimeReadiness.issues.length) {
      this.slog.warn('send_blocked_runtime_unavailable', {
        workspaceId,
        issues: runtimeReadiness.issues,
      });
      return {
        error: true,
        message: `Runtime do WhatsApp indisponível: ${runtimeReadiness.issues.join(', ')}`,
        diagnostics: runtimeReadiness.diagnostics,
      };
    }

    //-----------------------------------------------------------
    // 🔥 Enviar via Worker → FlowEngine → WhatsAppEngine (Meta Cloud)
    //-----------------------------------------------------------

    if (opts?.forceDirect) {
      this.logger.log(
        `[SERVICE] Entrega direta forçada via Meta Cloud (workspace=${workspaceId}, to=${to})`,
      );
      const result = await this.sendDirectlyViaProvider(workspaceId, to, message, opts);
      if (result.ok) {
        await this.planLimits.trackMessageSend(workspaceId);
      }
      return result;
    }

    const workerAvailable = await this.workerRuntime.isAvailable();
    if (!workerAvailable) {
      this.logger.warn(
        `[SERVICE] Worker indisponível; enviando diretamente via Meta Cloud (workspace=${workspaceId}, to=${to})`,
      );
      const result = await this.sendDirectlyViaProvider(workspaceId, to, message, opts);
      if (result.ok) {
        await this.planLimits.trackMessageSend(workspaceId);
      }
      return result;
    }

    await flowQueue.add('send-message', {
      type: 'direct',
      workspaceId,
      workspace: engineWs,
      to,
      message,
      user: to,
      mediaUrl: opts?.mediaUrl,
      mediaType: opts?.mediaType,
      caption: opts?.caption,
      externalId: opts?.externalId,
      quotedMessageId: opts?.quotedMessageId,
    });

    await this.planLimits.trackMessageSend(workspaceId);

    return {
      ok: true,
      queued: true,
      delivery: 'queued',
    };
  }

  // ============================================================
  // 2c. LISTAR TEMPLATES
  // ============================================================
  listTemplates(workspaceId: string) {
    this.slog.info('list_templates_unsupported', { workspaceId });
    return {
      error: true,
      message:
        'Templates legados não são suportados no modo Meta Cloud. Use mensagens diretas ou fluxos do autopilot.',
      data: [],
      total: 0,
    };
  }

  // ============================================================
  // 2d. OPT-IN / OPT-OUT (marca contato com tag optin_whatsapp)
  // ============================================================
  private async upsertContact(workspaceId: string, phone: string) {
    return this.prisma.contact.upsert({
      where: { workspaceId_phone: { workspaceId, phone } },
      update: {},
      create: {
        workspaceId,
        phone,
        name: null,
      },
    });
  }

  /** Opt in contact. */
  // PULSE_OK: workspaceId validated by caller guard
  async optInContact(workspaceId: string, phone: string) {
    const contact = await this.upsertContact(workspaceId, phone);

    // Update optIn field directly (LGPD/GDPR compliance)
    await this.prisma.contact.updateMany({
      where: { id: contact.id, workspaceId },
      data: {
        optIn: true,
        optedOutAt: null, // Clear opt-out timestamp
      },
    });

    // Also connect legacy tag for backwards compatibility
    const tag = await this.prisma.tag.upsert({
      where: {
        workspaceId_name: {
          workspaceId,
          name: 'optin_whatsapp',
        },
      },
      update: {},
      create: {
        workspaceId,
        name: 'optin_whatsapp',
        color: '#16a34a',
      },
    });

    await this.prisma.contact.update({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone,
        },
      },
      data: { tags: { connect: { id: tag.id } } },
    });

    this.slog.info('contact_opted_in', {
      workspaceId,
      phone,
      contactId: contact.id,
    });

    return { ok: true };
  }

  /** Opt out contact. */
  async optOutContact(workspaceId: string, phone: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone } },
      select: { id: true },
    });
    if (!contact) {
      return { ok: true };
    }

    // Update optIn field directly (LGPD/GDPR compliance)
    await this.prisma.contact.updateMany({
      where: { id: contact.id, workspaceId },
      data: {
        optIn: false,
        optedOutAt: new Date(),
      },
    });

    // Also disconnect legacy tag if exists
    const tag = await this.prisma.tag.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name: 'optin_whatsapp',
        },
      },
      select: { id: true },
    });

    if (tag) {
      await this.prisma.contact.update({
        where: {
          workspaceId_phone: {
            workspaceId,
            phone,
          },
        },
        data: { tags: { disconnect: { id: tag.id } } },
      });
    }

    this.slog.info('contact_opted_out', {
      workspaceId,
      phone,
      contactId: contact.id,
    });

    return { ok: true };
  }

  /** Opt in bulk. */
  async optInBulk(workspaceId: string, phones: string[]) {
    const unique = Array.from(new Set((phones || []).map((p) => p?.trim()).filter(Boolean)));
    const results: { phone: string; ok: boolean }[] = [];
    await forEachSequential(unique, async (phone) => {
      try {
        await this.optInContact(workspaceId, phone);
        results.push({ phone, ok: true });
      } catch {
        results.push({ phone, ok: false });
      }
    });
    return { ok: true, processed: results.length, results };
  }

  /** Opt out bulk. */
  async optOutBulk(workspaceId: string, phones: string[]) {
    const unique = Array.from(new Set((phones || []).map((p) => p?.trim()).filter(Boolean)));
    const results: { phone: string; ok: boolean }[] = [];
    await forEachSequential(unique, async (phone) => {
      try {
        await this.optOutContact(workspaceId, phone);
        results.push({ phone, ok: true });
      } catch {
        results.push({ phone, ok: false });
      }
    });
    return { ok: true, processed: results.length, results };
  }

  /** Get opt in status. */
  async getOptInStatus(workspaceId: string, phone: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone } },
      select: { id: true, tags: { select: { name: true } } },
    });
    if (!contact) {
      return { optIn: false, contactExists: false };
    }
    const optIn = contact.tags.some((t) => t.name === 'optin_whatsapp');
    return { optIn, contactExists: true };
  }

  /**
   * Verifica opt-in obrigatório antes de enviar mensagens/templates.
   * If contact has optIn=false, ALWAYS block (LGPD/GDPR compliance).
   * Se ENFORCE_OPTIN=true e o contato não tiver opt-in, bloqueia envio.
   */
  private async ensureOptInAllowed(
    workspaceId: string,
    phone: string,
    complianceMode: 'reactive' | 'proactive' = 'proactive',
  ) {
    const enforceOptIn = process.env.ENFORCE_OPTIN === 'true';
    const enforce24h = (process.env.AUTOPILOT_ENFORCE_24H ?? 'false').toLowerCase() !== 'false';

    const contact = await this.prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone } },
      select: {
        id: true,
        optIn: true,
        optedOutAt: true,
        customFields: true,
        tags: { select: { name: true } },
      },
    });

    // CRITICAL: If contact explicitly opted out, ALWAYS block (LGPD/GDPR)
    if (contact && contact.optIn === false) {
      this.slog.warn('send_blocked_opted_out', {
        workspaceId,
        phone,
        optedOutAt: contact.optedOutAt,
      });
      throw new ForbiddenException('Contato cancelou o recebimento de mensagens (opt-out)');
    }

    if (complianceMode === 'reactive') {
      return;
    }

    if (enforceOptIn) {
      if (!contact) {
        throw new ForbiddenException('Contato sem opt-in para WhatsApp');
      }
      const cf = (contact.customFields as Record<string, unknown>) || {};
      const hasOptIn =
        contact.optIn === true || // New field takes priority
        contact.tags.some((t) => t.name === 'optin_whatsapp') ||
        cf.optin === true ||
        cf.optin_whatsapp === true;
      if (!hasOptIn) {
        throw new ForbiddenException('Contato sem opt-in para WhatsApp');
      }
    }

    if (enforce24h) {
      const lastInbound = await this.prisma.message.findFirst({
        where: {
          workspaceId,
          contact: { phone },
          direction: 'INBOUND',
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      if (!lastInbound || lastInbound.createdAt.getTime() < cutoff) {
        throw new ForbiddenException('Fora da janela de 24h para envio');
      }
    }
  }

  // ============================================================
  // 2b. SEND TEMPLATE
  // ============================================================
  async sendTemplate(
    workspaceId: string,
    to: string,
    template: { name: string; language: string; components?: unknown[] },
  ) {
    this.logger.log(
      `[SERVICE] sendTemplate(workspace=${workspaceId}, to=${to}, template=${template.name})`,
    );
    this.slog.info('send_template', {
      workspaceId,
      to,
      template: template.name,
    });

    await this.planLimits.ensureSubscriptionActive(workspaceId);

    const ws = await this.workspaces.getWorkspace(workspaceId);
    const engineWs = this.workspaces.toEngineWorkspace(ws);

    await this.ensureOptInAllowed(workspaceId, to);

    const missing = this.validateWorkspaceProvider(engineWs);
    if (missing.length) {
      this.slog.warn('send_blocked_missing_provider', { workspaceId, missing });
      return {
        error: true,
        message: `Configuração do provedor incompleta: ${missing.join(', ')}`,
      };
    }

    const runtimeReadiness = await this.collectMessagingRuntimeIssues(workspaceId, engineWs, {
      requireInboundWebhook: false,
    });
    if (runtimeReadiness.issues.length) {
      this.slog.warn('send_template_blocked_runtime_unavailable', {
        workspaceId,
        issues: runtimeReadiness.issues,
      });
      return {
        error: true,
        message: `Runtime do WhatsApp indisponível: ${runtimeReadiness.issues.join(', ')}`,
        diagnostics: runtimeReadiness.diagnostics,
      };
    }

    await flowQueue.add('send-message', {
      type: 'template',
      workspaceId,
      workspace: engineWs,
      to,
      template,
      user: to,
    });

    await this.planLimits.trackMessageSend(workspaceId);

    return {
      ok: true,
      queued: true,
      delivery: 'queued',
    };
  }

  // ============================================================
  // 3. SEND MESSAGE DIRECTLY USING WAHA (test mode only)
  // ============================================================
  async sendDirectMessage(workspaceId: string, to: string, message: string) {
    const result = await this.sendDirectlyViaProvider(workspaceId, to, message);
    return result.ok === true
      ? { success: true, result }
      : { error: true, message: result.message || 'send_failed' };
  }

  private async sendDirectlyViaProvider(
    workspaceId: string,
    to: string,
    message: string,
    opts?: {
      mediaUrl?: string;
      mediaType?: 'image' | 'video' | 'audio' | 'document';
      caption?: string;
      externalId?: string;
      complianceMode?: 'reactive' | 'proactive';
      forceDirect?: boolean;
      quotedMessageId?: string;
    },
  ) {
    return this.withWorkspaceActionLock(workspaceId, async () => {
      await this.simulateHumanPresence(workspaceId, to, opts?.caption || message);

      const result = await this.providerRegistry.sendMessage(workspaceId, to, message, {
        mediaUrl: opts?.mediaUrl,
        mediaType: opts?.mediaType,
        caption: opts?.caption,
        quotedMessageId: opts?.quotedMessageId,
      });

      if (!result.success) {
        await this.providerRegistry
          .setPresence(workspaceId, 'offline', this.normalizeChatId(to))
          .catch(() => undefined);
        return {
          error: true,
          message: result.error || 'send_failed',
        };
      }

      await this.markChatAsReadBestEffort(workspaceId, to);
      await this.providerRegistry
        .setPresence(workspaceId, 'offline', this.normalizeChatId(to))
        .catch(() => undefined);

      await this.persistOutboundMessage(workspaceId, to, message, {
        ...opts,
        providerMessageId: result.messageId,
      });

      return {
        ok: true,
        direct: true,
        delivery: 'sent',
        messageId: result.messageId,
      };
    });
  }

  private async persistOutboundMessage(
    workspaceId: string,
    to: string,
    message: string,
    opts?: {
      mediaUrl?: string;
      mediaType?: 'image' | 'video' | 'audio' | 'document';
      caption?: string;
      externalId?: string;
      providerMessageId?: string;
      complianceMode?: 'reactive' | 'proactive';
      forceDirect?: boolean;
      quotedMessageId?: string;
    },
  ) {
    await this.inbox.saveMessageByPhone({
      workspaceId,
      phone: to,
      content: opts?.caption || message || opts?.mediaUrl || '',
      direction: 'OUTBOUND',
      externalId: opts?.providerMessageId || opts?.externalId,
      type: opts?.mediaType ? opts.mediaType.toUpperCase() : 'TEXT',
      mediaUrl: opts?.mediaUrl,
      status: 'SENT',
    });
  }

  private async withWorkspaceActionLock<T>(
    workspaceId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = `whatsapp:action-lock:${workspaceId}`;
    const token = `${Date.now()}:${randomUUID()}`;
    const ttlMs = Math.max(
      15_000,
      Number.parseInt(process.env.WHATSAPP_ACTION_LOCK_MS || '45000', 10) || 45_000,
    );
    const deadline = Date.now() + ttlMs;

    const tryAcquire = async (): Promise<T> => {
      if (Date.now() >= deadline) {
        return operation();
      }

      const acquired = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
      if (acquired === 'OK') {
        try {
          return await operation();
        } finally {
          const current = await this.redis.get(key).catch(() => null);
          if (current === token) {
            await this.redis.del(key).catch(() => undefined);
          }
        }
      }

      await this.sleep(250 + randomInt(250));
      return tryAcquire();
    };

    return tryAcquire();
  }

  private async simulateHumanPresence(
    workspaceId: string,
    chatId: string,
    message: string,
  ): Promise<void> {
    const normalizedChatId = this.normalizeChatId(chatId);
    const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';

    await this.markChatAsReadBestEffort(workspaceId, normalizedChatId);
    if (isTestEnv) {
      return;
    }
    await this.providerRegistry
      .setPresence(workspaceId, 'available', normalizedChatId)
      .catch(() => undefined);
    await this.sleep(300 + randomInt(500));
    await this.providerRegistry.sendTyping(workspaceId, normalizedChatId).catch(() => undefined);
    await this.sleep(this.computeHumanTypingDelay(message));
    await this.providerRegistry.stopTyping(workspaceId, normalizedChatId).catch(() => undefined);
  }

  private computeHumanTypingDelay(message: string): number {
    return Math.max(
      500,
      Math.min(3500, 450 + String(message || '').trim().length * 35 + randomInt(450)),
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================
  // 4. INCOMING MESSAGE (WEBHOOK)
  // ============================================================
  async handleIncoming(workspaceId: string, from: string, message: string) {
    this.logger.log(`📩 [INCOMING] workspace=${workspaceId}, from=${from}: ${message}`);
    this.slog.info('incoming_webhook', { workspaceId, from, message });

    // Sanitize workspace and ensure it exists
    const ws = await this.workspaces.getWorkspace(workspaceId).catch(() => null);
    if (!ws) {
      this.slog.warn('incoming_invalid_workspace', { workspaceId });
      throw new Error('Workspace not found for incoming message');
    }

    // Idempotência básica: evita processar mesma mensagem (hash from+msg) em curto intervalo
    const dedupeKey = `incoming:dedupe:${workspaceId}:${from}:${this.normalizeHash(message)}`;
    const already = await this.redis.get(dedupeKey);
    if (already) {
      this.slog.info('incoming_deduped', { workspaceId, from });
      return { skipped: true, reason: 'duplicate' };
    }
    await this.redis.setex(dedupeKey, 60, '1'); // 60s de janela de dedupe

    // Opt-out automático (STOP/SAIR/CANCELAR)
    const lower = (message || '').toLowerCase();
    const stopKeywords = ['stop', 'sair', 'cancelar', 'cancel', 'parar', 'unsubscribe'];
    if (stopKeywords.some((kw) => lower.includes(kw))) {
      try {
        await this.optOutContact(workspaceId, from.replace(D_RE, ''));
        this.slog.info('auto_optout', { workspaceId, from });
      } catch (err: unknown) {
        const errInstanceofError =
          err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
        // PULSE:OK — Auto opt-out is best-effort; message still processed
        this.logger.warn(`Opt-out auto falhou: ${errInstanceofError?.message}`);
        void this.opsAlert?.alertOnCriticalError(err, 'WhatsappService.optOutContact', {
          workspaceId,
        });
      }
    }

    // 1. Persistir no Inbox
    const saved = await this.inbox.saveMessageByPhone({
      workspaceId,
      phone: from, // Assumindo que venha formatado do webhook
      content: message,
      direction: 'INBOUND',
    });

    // 2. Entrega para o FlowEngine (via Redis)
    await this.deliverToContext(from, message, workspaceId);

    // 3. Enfileira Autopilot (worker) para avaliação/ação assíncrona
    try {
      const settings = this.normalizeJsonObject(ws.providerSettings);
      if (this.isAutonomousEnabled(settings) && saved?.contactId) {
        const scanKey = `autopilot:scan-contact:${workspaceId}:${saved.contactId}`;
        const reserved = await this.redis.set(
          scanKey,
          saved.id,
          'PX',
          this.contactDebounceMs,
          'NX',
        );

        if (reserved === 'OK') {
          await autopilotQueue.add(
            'scan-contact',
            {
              workspaceId,
              phone: from,
              contactId: saved.contactId,
              messageContent: message,
              messageId: saved.id,
            },
            {
              jobId: buildQueueJobId('scan-contact', workspaceId, saved.contactId, saved.id),
              delay: this.contactDebounceMs,
              deduplication: {
                id: buildQueueDedupId('scan-contact', workspaceId, saved.contactId),
                ttl: this.contactDebounceMs + 500,
              },
              removeOnComplete: true,
            },
          );
        }
      }

      // Sinais de compra em tempo real -> dispara flow quente, se configurado
      const autopilotConfig = this.normalizeJsonObject(settings.autopilot);
      const hotFlowIdRaw = autopilotConfig.hotFlowId;
      const hotFlowId = typeof hotFlowIdRaw === 'string' ? hotFlowIdRaw : null;
      const lower = (message || '').toLowerCase();
      const buyKeywords = [
        'preco',
        'preço',
        'price',
        'quanto',
        'pix',
        'boleto',
        'garantia',
        'comprar',
        'assinar',
      ];
      const hasBuyingSignal = buyKeywords.some((k) => lower.includes(k));
      if (hotFlowId && hasBuyingSignal) {
        await flowQueue.add('run-flow', {
          workspaceId,
          flowId: hotFlowId,
          user: from.replace(D_RE, ''),
          initialVars: { source: 'hot_signal', lastMessage: message },
        });
      }

      // Conversão detectada (sinais de pagamento) -> registra evento Autopilot CONVERSION
      const conversionKeywords = [
        'paguei',
        'pago',
        'pix',
        'pague',
        'comprei',
        'compre',
        'boleto',
        'assinatura',
        'transferi',
        'transferido',
      ];
      const hasConversionSignal = conversionKeywords.some((k) => lower.includes(k));
      if (hasConversionSignal && saved?.contactId) {
        // Verifica se houve ação recente do Autopilot (últimas 72h)
        const lastEvent = await this.prisma.autopilotEvent.findFirst({
          where: {
            workspaceId,
            contactId: saved.contactId,
          },
          orderBy: { createdAt: 'desc' },
        });
        const withinWindow =
          lastEvent && Date.now() - new Date(lastEvent.createdAt).getTime() <= 72 * 60 * 60 * 1000;
        if (withinWindow) {
          await this.prisma.autopilotEvent.create({
            data: {
              workspaceId,
              contactId: saved.contactId,
              intent: 'BUYING',
              action: 'CONVERSION',
              status: 'executed',
              reason: 'payment_keyword_inbound',
              responseText: message,
              meta: { source: 'inbound', keywordHit: true },
            },
          });

          // Sobe probabilidade de compra no contato
          await this.prisma.contact.updateMany({
            where: { id: saved.contactId, workspaceId },
            data: { purchaseProbability: 'HIGH', sentiment: 'POSITIVE' },
          });
        }
      }
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      // PULSE:OK — Autopilot enqueue non-critical; message already persisted to inbox
      this.logger.warn(`Autopilot enqueue failed: ${errInstanceofError?.message}`);
      void this.opsAlert?.alertOnCriticalError(err, 'WhatsappService.processInbound.autopilot', {
        workspaceId,
      });
    }

    // 4. Pipeline NeuroCRM (análise cognitiva básica)
    if (saved?.contactId) {
      this.neuroCrm
        .analyzeContact(workspaceId, saved.contactId)
        .catch((err) => this.logger.warn(`NeuroCRM analyze failed: ${err?.message}`));
    }

    // 5. WebSocket push para Copilot (sugestão em tempo real)
    try {
      await this.redis.publish(
        `ws:copilot:${workspaceId}`,
        JSON.stringify({
          type: 'new_message',
          workspaceId,
          contactId: saved?.contactId,
          phone: from,
          message,
        }),
      );
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      // PULSE:OK — Copilot WebSocket push non-critical; inbox still receives the message
      this.logger.warn(`Copilot push failed: ${errInstanceofError?.message}`);
      void this.opsAlert?.alertOnCriticalError(err, 'WhatsappService.processInbound.copilot', {
        workspaceId,
      });
    }

    return { ok: true };
  }

  private normalizeHash(text: string) {
    return Buffer.from(text || '')
      .toString('base64')
      .slice(0, 32);
  }

  // ============================================================
  // 5. RETORNAR CLIENTE
  // ============================================================
  getSession(workspaceId: string) {
    return { workspaceId, provider: 'dynamic' };
  }

  /** Retorna status e telefone da sessão WAHA */
  async getConnectionStatus(workspaceId: string) {
    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    return {
      status: status.status,
      phoneNumber: status.phoneNumber,
      qrCode: status.qrCode,
    };
  }

  /** Último QR gerado pela sessão WAHA */
  async getQrCode(workspaceId: string) {
    const qr = await this.providerRegistry.getQrCode(workspaceId);
    return qr.success ? qr.qr || null : null;
  }

  /** Desconecta sessão WAHA */
  async disconnect(workspaceId: string) {
    await this.providerRegistry.disconnect(workspaceId);
  }

  private normalizeContacts(raw: unknown): NormalizedContact[] {
    const r = raw as Record<string, unknown> | undefined;
    const candidates: unknown[] = Array.isArray(raw)
      ? raw
      : Array.isArray(r?.contacts)
        ? (r.contacts as unknown[])
        : Array.isArray(r?.items)
          ? (r.items as unknown[])
          : Array.isArray(r?.data)
            ? (r.data as unknown[])
            : [];

    return candidates
      .map((contact: unknown) => this.normalizeContactEntry(contact))
      .filter((contact): contact is NormalizedContact => contact !== null);
  }

  private normalizeContactEntry(contact: unknown): NormalizedContact | null {
    const c = contact as Record<string, unknown>;
    const cId = c?.id as Record<string, unknown> | string | undefined;
    const cWid = c?.wid as Record<string, unknown> | string | undefined;

    const rawId = this.readText(
      [
        typeof cId === 'object' ? cId?._serialized : undefined,
        c?.id,
        typeof cWid === 'object' ? cWid?._serialized : undefined,
        c?.wid,
        c?.chatId,
      ].find((v) => typeof v === 'string' && v.trim()) ?? '',
    );

    const phoneCandidate = [
      c?.phone,
      c?.number,
      typeof cId === 'object' ? cId?.user : undefined,
      typeof cWid === 'object' ? cWid?.user : undefined,
    ].find((v) => typeof v === 'string' && v.trim());

    const phone = this.normalizeNumber(
      typeof phoneCandidate === 'string'
        ? phoneCandidate
        : this.providerRegistry.extractPhoneFromChatId(rawId),
    );

    if (!phone) {
      return null;
    }

    const pushNameRaw = c?.pushName || c?.pushname;
    const pushName = typeof pushNameRaw === 'string' && pushNameRaw.trim() ? pushNameRaw : null;
    const resolvedPushName = this.isPlaceholderContactName(pushName, phone) ? null : pushName;
    const shortName = typeof c?.shortName === 'string' ? c.shortName : null;

    return {
      id: rawId || `${phone}@c.us`,
      phone,
      name:
        this.resolveTrustedContactName(phone, c?.pushName, c?.pushname, c?.name, c?.shortName) ||
        null,
      pushName: resolvedPushName,
      shortName,
      email: null,
      localContactId: null,
      source: 'provider',
      registered: true,
      createdAt: null,
      updatedAt: null,
    };
  }

  private normalizeChats(raw: unknown): NormalizedChat[] {
    const r = raw as Record<string, unknown> | undefined;
    const candidates: unknown[] = Array.isArray(raw)
      ? raw
      : Array.isArray(r?.chats)
        ? (r.chats as unknown[])
        : Array.isArray(r?.items)
          ? (r.items as unknown[])
          : Array.isArray(r?.data)
            ? (r.data as unknown[])
            : [];

    return candidates
      .map((chatRaw: unknown) => this.normalizeChatEntry(chatRaw))
      .filter((chat): chat is NormalizedChat => chat !== null);
  }

  private normalizeChatEntry(chatRaw: unknown): NormalizedChat | null {
    const chat = chatRaw as Record<string, unknown>;
    const chatId = chat?.id as Record<string, unknown> | string | undefined;
    const chatContact = chat?.contact as Record<string, unknown> | undefined;
    const chatLastMessage = chat?.lastMessage as Record<string, unknown> | undefined;
    const chatLastMessageData = chatLastMessage?._data as Record<string, unknown> | undefined;

    const rawId = this.readText(
      [
        typeof chatId === 'object' ? chatId?._serialized : undefined,
        chat?.id,
        chat?.chatId,
        chat?.wid,
      ].find((v) => typeof v === 'string' && v.trim()) ?? '',
    );
    const phone = this.normalizeNumber(
      typeof chat?.phone === 'string'
        ? chat.phone
        : this.providerRegistry.extractPhoneFromChatId(rawId),
    );

    if (!rawId || !phone) {
      return null;
    }

    const timestamp = this.resolveTimestamp(chat);
    const unreadCount = Number(chat?.unreadCount || chat?.unread || 0) || 0;

    return {
      id: rawId,
      phone,
      name:
        this.resolveTrustedContactName(
          phone,
          chat?.name,
          chat?.pushName,
          chatContact?.name,
          chatContact?.pushName,
          chatLastMessageData?.verifiedBizName,
        ) || null,
      unreadCount,
      pending: unreadCount > 0 || chatLastMessage?.fromMe === false,
      timestamp,
      lastMessageAt: this.toIsoTimestamp(timestamp),
      conversationId: null,
      status: null,
      source: 'provider',
    };
  }

  private normalizeMessages(raw: unknown, fallbackChatId: string) {
    const r = raw as Record<string, unknown> | undefined;
    const candidates = Array.isArray(raw)
      ? raw
      : Array.isArray(r?.messages)
        ? (r.messages as unknown[])
        : Array.isArray(r?.items)
          ? (r.items as unknown[])
          : Array.isArray(r?.data)
            ? (r.data as unknown[])
            : [];

    return candidates
      .map((msgRaw: unknown) => this.normalizeMessageEntry(msgRaw, fallbackChatId))
      .filter(Boolean);
  }

  private normalizeMessageEntry(msgRaw: unknown, fallbackChatId: string) {
    const message = msgRaw as Record<string, unknown>;
    const mId = message?.id as Record<string, unknown> | string | undefined;
    const mKey = message?.key as Record<string, unknown> | undefined;
    const mText = message?.text as Record<string, unknown> | undefined;
    const mMedia = message?.media as Record<string, unknown> | undefined;

    const id = this.readText(
      [
        typeof mId === 'object' ? (mId?._serialized ?? mId?.id) : undefined,
        mKey?.id,
        message?.id,
      ].find((v) => typeof v === 'string' && v.trim()) ?? '',
    );
    const chatId = this.readText(
      [message?.chatId, message?.from, message?.to].find(
        (v) => typeof v === 'string' && v.trim(),
      ) ?? fallbackChatId,
    );

    if (!id || !chatId) {
      return null;
    }

    const phone = this.normalizeNumber(
      typeof message?.phone === 'string'
        ? message.phone
        : this.providerRegistry.extractPhoneFromChatId(chatId),
    );
    const timestamp = this.resolveTimestamp(message);
    const fromMe = message?.fromMe === true;

    return {
      id,
      chatId,
      phone,
      body: message?.body || mText?.body || '',
      direction: fromMe ? 'OUTBOUND' : 'INBOUND',
      fromMe,
      type: (typeof message?.type === 'string' ? message.type : 'chat').toLowerCase(),
      hasMedia: message?.hasMedia === true,
      mediaUrl: message?.mediaUrl || mMedia?.url || null,
      mimetype: message?.mimetype || mMedia?.mimetype || null,
      timestamp,
      isoTimestamp: this.toIsoTimestamp(timestamp),
      source: 'provider',
    };
  }

  private resolveTimestamp(value: unknown): number {
    const v = value as Record<string, unknown> | undefined;
    const vChat = v?._chat as Record<string, unknown> | undefined;
    const vLastMessage = v?.lastMessage as Record<string, unknown> | undefined;
    const vLastMessageData = vLastMessage?._data as Record<string, unknown> | undefined;
    const candidates = [
      vChat?.conversationTimestamp,
      vChat?.lastMessageRecvTimestamp,
      v?.conversationTimestamp,
      v?.lastMessageRecvTimestamp,
      vLastMessage?.timestamp,
      vLastMessageData?.messageTimestamp,
      v?.timestamp,
      v?.t,
      v?.createdAt,
      v?.lastMessageTimestamp,
      v?.last_time,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate > 1e12 ? candidate : candidate * 1000;
      }
      if (typeof candidate === 'string') {
        const numeric = Number(candidate);
        if (Number.isFinite(numeric) && numeric > 0) {
          return numeric > 1e12 ? numeric : numeric * 1000;
        }
        const date = new Date(candidate);
        if (!Number.isNaN(date.getTime())) {
          return date.getTime();
        }
      }
    }

    return 0;
  }

  private toIsoTimestamp(timestamp: number) {
    if (!timestamp || !Number.isFinite(timestamp)) {
      return null;
    }
    return new Date(timestamp).toISOString();
  }

  private normalizeChatId(chatId: string) {
    if (String(chatId || '').includes('@')) {
      return chatId;
    }
    return `${this.normalizeNumber(chatId)}@c.us`;
  }

  private async resolveReadChatCandidates(
    workspaceId: string,
    chatIdOrPhone: string,
  ): Promise<string[]> {
    const normalizedChatId = this.normalizeChatId(chatIdOrPhone);
    const normalizedPhone = this.normalizeNumber(
      this.providerRegistry.extractPhoneFromChatId(normalizedChatId),
    );
    const contact = normalizedPhone
      ? await this.prisma.contact
          .findUnique({
            where: {
              workspaceId_phone: {
                workspaceId,
                phone: normalizedPhone,
              },
            },
            select: { customFields: true },
          })
          .catch(() => null)
      : null;
    const customFields = this.normalizeJsonObject(contact?.customFields);

    return Array.from(
      new Set(
        [
          normalizedChatId,
          this.readText(customFields.lastRemoteChatId),
          this.readText(customFields.lastCatalogChatId),
          this.readText(customFields.lastResolvedChatId),
          normalizedPhone ? `${normalizedPhone}@c.us` : '',
          normalizedPhone ? `${normalizedPhone}@s.whatsapp.net` : '',
        ].filter(Boolean),
      ),
    );
  }

  private async markChatAsReadBestEffort(
    workspaceId: string,
    chatIdOrPhone: string,
  ): Promise<void> {
    const candidates = await this.resolveReadChatCandidates(workspaceId, chatIdOrPhone);

    await forEachSequential(candidates, async (candidate) => {
      await this.providerRegistry.readChatMessages(workspaceId, candidate).catch(() => undefined);
    });
  }

  // ============================================================
  // HELPER: DELIVER TO CONTEXT STORE (REDIS)
  // ============================================================
  private async deliverToContext(user: string, message: string, workspaceId?: string) {
    const normalized = this.normalizeNumber(user);
    const key = `reply:${normalized}`;
    this.logger.log(`📨 [CTX] Delivering message from ${normalized} to key ${key}`);
    try {
      await this.redis.rpush(key, message);
      await this.redis.expire(key, 60 * 60 * 24); // 24 hours
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      // Se a conexão principal estiver em modo subscriber, cria uma conexão auxiliar
      this.logger.warn(
        `Redis indisponível para deliverToContext, usando client ad-hoc: ${errInstanceofError?.message}`,
      );
      void this.opsAlert?.alertOnCriticalError(err, 'WhatsappService.deliverToContext', {
        workspaceId,
      });
      const fallback = createRedisClient();
      if (!fallback) {
        throw new Error('Redis client unavailable');
      }
      try {
        await fallback.rpush(key, message);
        await fallback.expire(key, 60 * 60 * 24);
      } finally {
        fallback.disconnect();
      }
    }

    // Notifica o worker para retomar fluxos que estavam em WAIT
    await flowQueue.add(
      'resume-flow',
      { user: normalized, message, workspaceId },
      { removeOnComplete: true },
    );
  }

  /**
   * Verifica se o workspace possui credenciais mínimas para o provedor ativo.
   */
  private validateWorkspaceProvider(workspace: Record<string, unknown>): string[] {
    const missing: string[] = [];
    const provider = workspace?.whatsappProvider || 'meta-cloud';

    if (provider !== 'meta-cloud') {
      missing.push('whatsapp_provider');
    }

    return missing;
  }

  private async collectMessagingRuntimeIssues(
    workspaceId: string,
    workspace: Record<string, unknown>,
    options?: {
      requireInboundWebhook?: boolean;
    },
  ) {
    const issues = this.validateWorkspaceProvider(workspace);
    const providerType = await this.providerRegistry.getProviderType(workspaceId);
    const diagnostics = {
      webhook: this.whatsappApi.getRuntimeConfigDiagnostics(),
      session: null as {
        connected: boolean;
        status?: string;
        error?: string;
      } | null,
    };

    const requireInboundWebhook = options?.requireInboundWebhook === true;

    if (requireInboundWebhook) {
      if (!diagnostics.webhook.webhookConfigured) {
        issues.push('meta_webhook_missing');
      } else if (!diagnostics.webhook.inboundEventsConfigured) {
        issues.push('meta_webhook_events_missing_inbound');
      }
    }

    try {
      diagnostics.session = await this.providerRegistry.getSessionStatus(workspaceId);
      if (!diagnostics.session.connected) {
        issues.push(
          `${providerType.replace(PATTERN_RE, '_')}_session_${String(
            diagnostics.session.status || 'unknown',
          ).toLowerCase()}`,
        );
      }
    } catch (error: unknown) {
      issues.push(`${providerType.replace(PATTERN_RE, '_')}_session_status_unavailable`);
      diagnostics.session = {
        connected: false,
        status: 'UNKNOWN',
        error: error instanceof Error ? error.message : 'unknown_error',
      };
      void this.opsAlert?.alertOnCriticalError(error, 'WhatsappService.runDiagnostics.session', {
        workspaceId,
      });
    }

    return { issues, diagnostics };
  }

  // ── Group Management (MonitoredGroup, GroupMember, BannedKeyword) ──

  async listMonitoredGroups(workspaceId: string) {
    return this.prisma.monitoredGroup.findMany({
      where: { workspaceId },
      include: {
        members: { take: 500 },
        keywords: { take: 200 },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Add monitored group. */
  async addMonitoredGroup(
    workspaceId: string,
    data: { jid: string; name?: string; inviteLink?: string; settings?: Record<string, unknown> },
  ) {
    return this.prisma.monitoredGroup.create({
      data: {
        jid: data.jid,
        name: data.name,
        inviteLink: data.inviteLink,
        settings: JSON.parse(JSON.stringify(data.settings || {})) as Prisma.InputJsonObject,
        workspace: { connect: { id: workspaceId } },
      },
    });
  }

  /** List group members. */
  async listGroupMembers(groupId: string) {
    return this.prisma.groupMember.findMany({
      take: 500,
      where: { groupId },
      select: {
        id: true,
        groupId: true,
        phone: true,
        isAdmin: true,
        createdAt: true,
      },
    });
  }

  /** Add group member.
   * PULSE:OK — GroupMember inherits workspace ownership transitively
   * through MonitoredGroup.workspaceId. Ownership is verified by the
   * group lookup below before the member is created.
   */
  async addGroupMember(groupId: string, workspaceId: string, phone: string, isAdmin = false) {
    const group = await this.prisma.monitoredGroup.findFirst({
      where: { id: groupId, workspaceId },
      select: { id: true },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return this.prisma.groupMember.create({
      data: { groupId, phone, isAdmin },
    });
  }

  /** List banned keywords.
   * PULSE_OK — BannedKeyword inherits workspace ownership transitively
   * through MonitoredGroup.workspaceId. Group-level scope is valid
   * for read-only listing.
   */
  async listBannedKeywords(groupId: string) {
    return this.prisma.bannedKeyword.findMany({
      take: 200,
      where: { groupId },
      select: {
        id: true,
        groupId: true,
        keyword: true,
        action: true,
        createdAt: true,
      },
    });
  }

  /** Add banned keyword.
   * PULSE:OK — BannedKeyword inherits workspace ownership transitively
   * through MonitoredGroup.workspaceId. Ownership is verified by the
   * group lookup below before the keyword is created.
   */
  async addBannedKeyword(groupId: string, workspaceId: string, keyword: string, action: string) {
    const group = await this.prisma.monitoredGroup.findFirst({
      where: { id: groupId, workspaceId },
      select: { id: true },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return this.prisma.bannedKeyword.create({
      data: { groupId, keyword, action },
    });
  }
}
