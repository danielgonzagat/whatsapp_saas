import type Redis from 'ioredis';
import type { PrismaService } from '../prisma/prisma.service';
import type { WhatsAppProviderRegistry } from './providers/provider-registry';
import type { PlanLimitsService } from '../billing/plan-limits.service';
import type { WorkspaceService } from '../workspaces/workspace.service';
import type { InboxService } from '../inbox/inbox.service';
import type { NeuroCrmService } from '../crm/neuro-crm.service';
import type { OpsAlertService } from '../observability/ops-alert.service';
import type { WhatsAppCatchupService } from './whatsapp-catchup.service';
import type { CiaRuntimeService } from './cia-runtime.service';
import type { WorkerRuntimeService } from './worker-runtime.service';
import type { WhatsAppApiProvider } from './providers/whatsapp-api.provider';

interface ChatOwnerSummary {
  id?: string;
  name?: string | null;
  phone?: string | null;
}

export interface ProviderMessageEnvelope {
  id: string;
  chatId: string;
  phone: string;
  body: string;
  direction: 'INBOUND' | 'OUTBOUND';
  fromMe: boolean;
  type: string;
  hasMedia: boolean;
  mediaUrl: string | null;
  mimetype: string | null;
  timestamp: number;
  isoTimestamp: string | null;
  source: string;
}

export type NormalizedContact = {
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

export type NormalizedChat = {
  id: string;
  phone: string;
  name: string | null;
  unreadCount: number;
  pending: boolean;
  needsReply?: boolean;
  pendingMessages?: number;
  owner?: ChatOwnerSummary | null;
  blockedReason?: string | null;
  lastMessageDirection?: 'INBOUND' | 'OUTBOUND' | null;
  timestamp: number;
  lastMessageAt: string | null;
  conversationId: string | null;
  status: string | null;
  mode?: string | null;
  assignedAgentId?: string | null;
  source: 'provider' | 'crm' | 'waha+crm';
};

export type CatalogConversationSummary = {
  id: string;
  contactId: string;
  unreadCount: number | null;
  status: string | null;
  mode: string | null;
  lastMessageAt: Date | null;
};

export type WsDeps = {
  prisma: PrismaService;
  redis: Redis;
  providerRegistry: WhatsAppProviderRegistry;
  planLimits: PlanLimitsService;
  workspaces: WorkspaceService;
  inbox: InboxService;
  neuroCrm: NeuroCrmService;
  opsAlert?: OpsAlertService;
  catchupService: WhatsAppCatchupService;
  ciaRuntime: CiaRuntimeService;
  workerRuntime: WorkerRuntimeService;
  whatsappApi: WhatsAppApiProvider;
  contactDebounceMs: number;
};
