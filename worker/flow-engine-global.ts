import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { ContextStore } from './context-store';
import { prisma } from './db';
import { extractExternalId } from './flow-engine-external-id';
import {
  appendLog as appendLogExternal,
  failExecution as failExecutionExternal,
  getConversationHistory as getConversationHistoryExternal,
  markStatus as markStatusExternal,
} from './flow-engine-lifecycle';
import {
  parseFlowDefinition as parseFlowDefinitionExternal,
  parseTimeoutMember as parseTimeoutMemberExternal,
} from './flow-engine-parse';
import {
  nestedString,
  readBoolean,
  readNumber,
  readObject,
  readOptionalString,
  readString,
  varAsString,
} from './flow-engine.helpers';
import type {
  ExecutionState,
  FlowDefinition,
  FlowNode,
  FlowVariables,
  PersistedFlowLogEntry,
  RawFlowEdge,
  RawFlowNode,
} from './flow-engine.types';
import { buildQueueJobId } from './job-id';
import { WorkerLogger } from './logger';
import { CRM } from './providers/crm';
import { ProviderRegistry } from './providers/registry';
import { Queue } from './queue';
import { redis, redisPub } from './redis-client';

// Segurança
import { forEachSequential, pollUntil } from './utils/async-sequence';
import { sanitizeUserInput } from './utils/prompt-sanitizer';
import { safeEvaluateBoolean } from './utils/safe-eval';
import { isUrlAllowed, safeRequest, validateUrl } from './utils/ssrf-protection';

const PATTERN_RE = /\{\{(.*?)\}\}/g;
const D_RE = /\D/g;
