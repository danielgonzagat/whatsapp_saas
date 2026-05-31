import type { Prisma, PrismaClient } from '@prisma/client';

import type { UnknownRecord } from '../common/types';
import { readStringOr as readString } from '../common/parse';
import { WHITESPACE_G_RE } from '../common/regex';
import type { ToolArgs } from './unified-agent.types';

type ChannelChoice = {
  channel: string;
  confidence: number;
  fallback: boolean;
};

type BroadcastWindow = {
  window: string;
  confidence: number;
  fallback: boolean;
};

export function coerceString(value: unknown, fallback = ''): string {
  return typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : fallback;
}

/**
 * Returns the broadcast channel list from operator hint or default fallbacks.
 */
export function resolveBroadcastChannels(args: ToolArgs): string[] {
  const requested = coerceString(args.source).toLowerCase();
  if (requested) {
    return [requested];
  }
  return ['whatsapp', 'instagram', 'messenger', 'email'];
}

/**
 * Resolves a concrete ISO timestamp for the broadcast window classifier.
 * `now` returns the call moment; `pause` returns null; named windows roll
 * forward to the next valid slot.
 */
export function resolveBroadcastScheduleAt(window: string, now: Date = new Date()): string | null {
  if (window === 'pause') {
    return null;
  }
  if (window === 'now') {
    return now.toISOString();
  }
  const scheduled = new Date(now);
  if (window === 'tonight_20h') {
    scheduled.setHours(20, 0, 0, 0);
    if (scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 1);
    }
    return scheduled.toISOString();
  }
  if (window === 'friday_21h') {
    const friday = 5;
    const daysUntilFriday = (friday - scheduled.getDay() + 7) % 7 || 7;
    scheduled.setDate(scheduled.getDate() + daysUntilFriday);
    scheduled.setHours(21, 0, 0, 0);
    return scheduled.toISOString();
  }
  scheduled.setDate(scheduled.getDate() + 1);
  scheduled.setHours(9, 0, 0, 0);
  return scheduled.toISOString();
}

/**
 * Builds the channel choice from a predecided orchestrator payload, defaulting
 * to the first available channel (or `whatsapp` if empty).
 */
export function resolvePredecidedChannelChoice(
  predecided: UnknownRecord | null,
  availableChannels: string[],
): ChannelChoice {
  return {
    channel: readString(predecided?.channel, availableChannels[0] ?? 'whatsapp'),
    confidence: typeof predecided?.confidence === 'number' ? predecided.confidence : 0,
    fallback: predecided?.fallback === true,
  };
}

/**
 * Builds the broadcast window decision from a predecided orchestrator payload.
 * When `scheduleAt` is provided, the default window is `operator_fixed`;
 * otherwise it falls back to `now`.
 */
export function resolvePredecidedBroadcastWindow(
  predecided: UnknownRecord | null,
  scheduleAt: string | undefined,
): BroadcastWindow {
  return {
    window: readString(predecided?.window, scheduleAt ? 'operator_fixed' : 'now'),
    confidence: typeof predecided?.confidence === 'number' ? predecided.confidence : 0,
    fallback: predecided?.fallback === true,
  };
}

/**
 * Default mind decision used when the Mind service is unavailable.
 */
export function defaultChannelChoiceWhenMindUnavailable(
  availableChannels: string[],
): ChannelChoice {
  return { channel: availableChannels[0] ?? 'whatsapp', confidence: 0, fallback: true };
}

export function defaultBroadcastWindowWhenMindUnavailable(
  scheduleAt: string | undefined,
): BroadcastWindow {
  return { window: scheduleAt ? 'operator_fixed' : 'now', confidence: 0, fallback: true };
}

/**
 * Builds the AI persona record applied to settings memory.
 */
export function buildAIPersonaData(args: ToolArgs, now: Date = new Date()) {
  return {
    name: args.name || 'KLOEL',
    personality: args.personality || 'Profissional, amigável e focada em resultados',
    tone: args.tone || 'friendly',
    language: args.language || 'pt-BR',
    useEmojis: args.useEmojis !== undefined ? args.useEmojis : true,
    updatedAt: now.toISOString(),
  };
}

/**
 * Builds the autopilot config block stamped into providerSettings.
 */
export function buildAutopilotConfig(args: ToolArgs, now: Date = new Date()) {
  const { enabled, mode = 'full', workingHoursOnly = false } = args;
  return {
    enabled,
    mode,
    workingHoursOnly,
    updatedAt: now.toISOString(),
    updatedBy: 'kloel-ai',
  };
}

/**
 * Generates the deterministic memory key for a product persisted via Unified Agent.
 */
export function buildProductMemoryKey(args: ToolArgs, now: Date = new Date()): string {
  const slug = String(args.name || '')
    .toLowerCase()
    .replace(WHITESPACE_G_RE, '_');
  return `product_${now.getTime()}_${slug}`;
}

/**
 * Builds the product memory value persisted into kloelMemory.
 */
export function buildProductMemoryValue(args: ToolArgs, now: Date = new Date()) {
  return {
    name: args.name,
    price: args.price,
    description: args.description || '',
    category: args.category || 'default',
    imageUrl: args.imageUrl || null,
    paymentLink: args.paymentLink || null,
    active: true,
    createdAt: now.toISOString(),
  };
}

/**
 * Computes the partial update payload for a product memory based on incoming args.
 */
export function buildProductMemoryUpdate(
  currentValue: UnknownRecord,
  args: ToolArgs,
  now: Date = new Date(),
): Prisma.InputJsonValue {
  return {
    ...(currentValue as Prisma.JsonObject),
    ...(args.name && { name: args.name }),
    ...(args.price !== undefined && { price: args.price }),
    ...(args.description && { description: args.description }),
    ...(args.active !== undefined && { active: args.active }),
    updatedAt: now.toISOString(),
  };
}

/**
 * Generates the deterministic memory key for a Flow persisted via Unified Agent.
 */
export function buildFlowMemoryKey(args: ToolArgs, now: Date = new Date()): string {
  const slug = String(args.name || '')
    .toLowerCase()
    .replace(WHITESPACE_G_RE, '_');
  return `flow_${now.getTime()}_${slug}`;
}

/**
 * Builds the flow memory value persisted into kloelMemory.
 */
export function buildFlowMemoryValue(args: ToolArgs, now: Date = new Date()) {
  return {
    name: args.name,
    trigger: args.trigger,
    triggerValue: args.triggerValue || null,
    steps: args.steps || [],
    active: true,
    createdAt: now.toISOString(),
  };
}

/**
 * Source tag persisted on broadcast decisions so observability can distinguish
 * orchestrator-driven plans from legacy Unified Agent decisions.
 */
export function broadcastDecisionSource(predecided: boolean): string {
  return predecided ? 'orchestrator_predecided' : 'legacy_action_decision';
}

/**
 * Type-narrowing guard: true when the orchestration context signals a
 * deterministic / predecided pipeline run.
 */
export function isDeterministicPipeline(context?: UnknownRecord): boolean {
  return context?.deterministicPipeline === true;
}

/**
 * Coerce an unknown value into a plain record (or null).
 * Arrays pass through (typeof array === 'object').
 */
export function readRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : null;
}

interface WorkspaceActionArgs {
  includeMetrics?: boolean;
  includeConnections?: boolean;
  includeHealth?: boolean;
}

interface WorkspacePrismaDelegate {
  workspace: PrismaClient['workspace'];
  contact: PrismaClient['contact'];
  message: PrismaClient['message'];
  flow: PrismaClient['flow'];
  product: PrismaClient['product'];
}

interface WorkspaceStatusConnections {
  whatsapp: {
    provider: unknown;
    status: unknown;
    sessionId: unknown;
  };
  autopilot: {
    enabled: boolean;
    mode: unknown;
  };
}

interface WorkspaceStatusMetrics {
  totalContacts: number;
  totalMessages: number;
  activeFlows: number;
  products: number;
}

async function readWorkspaceProviderSettings(
  workspaceId: string,
  prisma: WorkspacePrismaDelegate,
): Promise<UnknownRecord> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  return (workspace?.providerSettings as UnknownRecord) || {};
}

function buildConnections(settings: UnknownRecord): WorkspaceStatusConnections {
  const wapiSession = (settings.whatsappApiSession ?? {}) as UnknownRecord;
  const autopilotSettings = (settings.autopilot ?? {}) as UnknownRecord;
  return {
    whatsapp: {
      provider: settings.whatsappProvider || 'none',
      status: wapiSession.status || settings.connectionStatus || 'disconnected',
      sessionId: wapiSession.sessionName || settings.sessionId,
    },
    autopilot: {
      enabled: autopilotSettings.enabled === true,
      mode: autopilotSettings.mode || 'off',
    },
  };
}

async function readWorkspaceMetrics(
  workspaceId: string,
  prisma: WorkspacePrismaDelegate,
): Promise<WorkspaceStatusMetrics> {
  const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return {
    totalContacts: await prisma.contact.count({ where: { workspaceId } }),
    totalMessages: await prisma.message.count({
      where: { workspaceId, createdAt: { gte: last30Days } },
    }),
    activeFlows: await prisma.flow.count({ where: { workspaceId, isActive: true } }),
    products: await prisma.product.count({ where: { workspaceId } }),
  };
}

export async function actionGetWorkspaceStatus(deps: {
  workspaceId: string;
  args: WorkspaceActionArgs;
  prisma: WorkspacePrismaDelegate;
}) {
  const { workspaceId, args } = deps;
  const includeMetrics = args?.includeMetrics !== false;
  const includeConnections = args?.includeConnections !== false;
  const includeHealth = args?.includeHealth !== false;
  const result: {
    workspaceId: string;
    connections?: unknown;
    metrics?: unknown;
    health?: { status: 'healthy' | 'warning'; lastActivity: string; warnings: string[] };
  } = { workspaceId };
  let connections: WorkspaceStatusConnections | undefined;
  let metrics: WorkspaceStatusMetrics | undefined;

  if (includeConnections) {
    const settings = await readWorkspaceProviderSettings(workspaceId, deps.prisma);
    connections = buildConnections(settings);
    result.connections = connections;
  }

  if (includeMetrics) {
    metrics = await readWorkspaceMetrics(workspaceId, deps.prisma);
    result.metrics = metrics;
  }

  if (includeHealth) {
    result.health = { status: 'healthy', lastActivity: new Date().toISOString(), warnings: [] };
    if (!connections) {
      const settings = await readWorkspaceProviderSettings(workspaceId, deps.prisma);
      connections = buildConnections(settings);
    }
    if (!metrics) {
      metrics = await readWorkspaceMetrics(workspaceId, deps.prisma);
    }
    const wa = connections.whatsapp;
    if (!wa?.sessionId) {
      result.health.warnings.push('WhatsApp não conectado');
      result.health.status = 'warning';
    }
    if (metrics.activeFlows === 0) {
      result.health.warnings.push('Nenhum fluxo ativo');
      result.health.status = 'warning';
    }
  }
  return { success: true, ...result };
}
