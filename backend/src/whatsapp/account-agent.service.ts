import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { forEachSequential } from '../common/async-sequence';
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
import { asProviderSettings } from './provider-settings.types';
import {
  buildProductDescription,
  buildProductFaq,
  detectCatalogGap,
  extractMaxInstallments,
  extractMoneyValues,
  extractPercentages,
  extractUrls,
  parseOfferLines,
  slugifyCatalogKey,
} from './account-agent.util';
import {
  asRecord,
  getPromptForStage,
  normalizeApprovalStatus,
  normalizeInputSessionStatus,
  parseApprovalPayload,
  parseInputSessionPayload,
  readString,
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
