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
import "../../../scripts/pulse/__companions__/whatsapp.service.companion";
