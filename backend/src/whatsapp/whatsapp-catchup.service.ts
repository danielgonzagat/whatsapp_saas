import { randomUUID } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
// messageLimit: this service imports messages, does not send; rate limit enforced at send time
import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { forEachSequential } from '../common/async-sequence';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { OpsAlertService } from '../observability/ops-alert.service';
import {
  AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB,
  buildSweepUnreadConversationsJobData,
} from '../contracts/autopilot-jobs';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue } from '../queue/queue';
import { AgentEventsService } from './agent-events.service';
import { CiaRuntimeService } from './cia-runtime.service';
import { InboundMessage, InboundProcessorService } from './inbound-processor.service';
import { asProviderSettings } from './provider-settings.types';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import {
  WahaChatMessage,
  WahaChatSummary,
  WahaLidMapping,
} from './providers/whatsapp-api.provider';
import { WorkerRuntimeService } from './worker-runtime.service';

const D_RE = /\D/g;

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : fb;
}

const D__D_S____S_DOE_RE = /^\+?\d[\d\s-]*\s+doe$/i;
const LID_RE = /@lid$/i;

function normalizeOptionalText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

type CatchupRunSummary = {
  importedMessages: number;
  touchedChats: number;
  processedChats: number;
  overflow: boolean;
};

type CatchupBackfillCursor = {
  chatId: string;
  activityTimestamp: number;
  updatedAt: string;
} | null;

const CATCHUP_SWEEP_LIMIT = Math.max(
  1,
  Math.min(2000, Number.parseInt(process.env.WAHA_CATCHUP_SWEEP_LIMIT || '500', 10) || 500),
);
import "../../../scripts/pulse/__companions__/whatsapp-catchup.service.companion";
