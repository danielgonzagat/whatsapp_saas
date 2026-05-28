/**
 * Pure helpers extracted from `marketing.controller.ts`.
 *
 * These helpers contain branchy data-shaping, aggregation, and validation
 * logic that previously lived inline in MarketingController endpoints. Lifting
 * them out makes the controller methods small orchestrators and lets us cover
 * the math (rates, response time, payload merging, validation) with focused
 * unit tests that don't need NestJS, Prisma, or Logger plumbing.
 *
 * IMPORTANT: every function in this module must remain pure — no Prisma calls,
 * no Logger, no async I/O. Inputs are plain shapes; outputs are plain shapes.
 */

/**
 * Marketing channels recognised by the aggregate stats endpoints. Mirrors the
 * single source of truth that previously lived as a const inside the
 * controller module.
 */
export const MARKETING_CHANNELS = [
  'WHATSAPP',
  'INSTAGRAM',
  'MESSENGER',
  'EMAIL',
  'TIKTOK',
] as const;

export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

export interface DirectEmailRecipient {
  email: string;
  name?: string;
}

export interface DirectEmailSendBody {
  subject?: string;
  html?: string;
  recipients?: DirectEmailRecipient[];
  campaignName?: string;
  approvalRequestId?: string;
}

export interface ChannelMetricsRow {
  status: 'live' | 'setup';
  messages: number;
  leads: number;
  sales: number;
}

export interface ConversationCountGroup {
  channel: string;
  _count: { id: number };
}

export interface MessageCountGroup {
  conversationId: string | null;
  _count: { id: number };
}

export interface ConversationChannelRow {
  id: string;
  channel: string;
}

/**
 * Build a per-channel `{status, messages, leads, sales}` map from the raw
 * Prisma groupBy results. `sales` is always 0 — it is wired up elsewhere when
 * the sales pipeline is connected. Channels with zero messages report
 * `status: 'setup'`, otherwise `'live'`.
 */
export function buildChannelMetrics(input: {
  conversationGroups: ConversationCountGroup[];
  messageGroups: MessageCountGroup[];
  conversationRows: ConversationChannelRow[];
}): Record<string, ChannelMetricsRow> {
  const leadsByChannel = new Map(
    input.conversationGroups.map((g) => [g.channel, g._count.id] as const),
  );

  const channelByConvId = new Map(
    input.conversationRows.map((c) => [c.id, c.channel] as const),
  );

  const messagesByChannel = new Map<string, number>();
  for (const group of input.messageGroups) {
    const convId = group.conversationId;
    if (!convId) {
      continue;
    }
    const channel = channelByConvId.get(convId);
    if (!channel) {
      continue;
    }
    messagesByChannel.set(channel, (messagesByChannel.get(channel) ?? 0) + group._count.id);
  }

  const result: Record<string, ChannelMetricsRow> = {};
  for (const channel of MARKETING_CHANNELS) {
    const messages = messagesByChannel.get(channel) ?? 0;
    result[channel] = {
      status: messages > 0 ? 'live' : 'setup',
      messages,
      leads: leadsByChannel.get(channel) ?? 0,
      sales: 0,
    };
  }
  return result;
}

/**
 * Compute the response-rate (percentage of outbound messages that received an
 * inbound reply) and conversion-rate (percentage of conversations that
 * reached CONVERTED state) as integers, matching the wire shape used by the
 * channel-stats endpoint.
 */
export function computeResponseStats(input: {
  outboundMessages: number;
  inboundMessages: number;
  totalConversations: number;
  convertedConversations: number;
}): { responseRate: number; conversionRate: number } {
  const responseRate =
    input.outboundMessages > 0
      ? Math.round((input.inboundMessages / input.outboundMessages) * 100)
      : 0;
  const conversionRate =
    input.totalConversations > 0
      ? Math.round((input.convertedConversations / input.totalConversations) * 100)
      : 0;
  return { responseRate, conversionRate };
}

export interface InboundSampleMessage {
  conversationId: string | null;
  createdAt: Date;
}

export interface OutboundSampleMessage {
  conversationId: string | null;
  createdAt: Date;
}

/**
 * Compute the average first-reply latency (in ms) between an inbound message
 * and the next outbound message in the same conversation. Returns `null`
 * when there is no measurable pair.
 *
 * Algorithm preserved from the original controller: pair each inbound with
 * the FIRST outbound reply that happens after it in the same conversation.
 * Inbound messages without a matched outbound reply are skipped.
 */
export function computeAverageFirstReplyMs(input: {
  inbound: InboundSampleMessage[];
  outbound: OutboundSampleMessage[];
}): number | null {
  if (input.inbound.length === 0) {
    return null;
  }

  const firstReplyByConv = new Map<string, Date>();
  for (const reply of input.outbound) {
    const cid = reply.conversationId;
    if (!cid) {
      continue;
    }
    if (!firstReplyByConv.has(cid)) {
      firstReplyByConv.set(cid, reply.createdAt);
    }
  }

  let totalMs = 0;
  let count = 0;
  for (const message of input.inbound) {
    const cid = message.conversationId;
    if (!cid) {
      continue;
    }
    const reply = firstReplyByConv.get(cid);
    if (reply && reply > message.createdAt) {
      totalMs += reply.getTime() - message.createdAt.getTime();
      count += 1;
    }
  }

  return count > 0 ? totalMs / count : null;
}

/**
 * Format a millisecond duration the way the AI brain widget expects:
 *  - `null` → `'--'`
 *  - < 60s → `'X.Ys'` with one decimal
 *  - >= 60s → `'Nm'` rounded
 */
export function formatAvgResponseTime(avgMs: number | null): string {
  if (avgMs === null) {
    return '--';
  }
  if (avgMs < 60_000) {
    return `${(avgMs / 1000).toFixed(1)}s`;
  }
  return `${Math.round(avgMs / 60_000)}m`;
}

/**
 * Return the minimum `createdAt` Date in a non-empty inbound sample. Used by
 * the AI brain endpoint to bound the outbound-reply lookup window.
 */
export function minInboundCreatedAt(inbound: InboundSampleMessage[]): Date | null {
  if (inbound.length === 0) {
    return null;
  }
  let min: Date = inbound[0]!.createdAt;
  for (const message of inbound) {
    if (message.createdAt < min) {
      min = message.createdAt;
    }
  }
  return min;
}

/**
 * Collect distinct (truthy) conversation IDs from an inbound sample. The
 * original controller used a `Set` plus a `filter`; this helper preserves the
 * same semantics and ordering for deterministic Prisma `in` clauses.
 */
export function distinctConversationIds(inbound: InboundSampleMessage[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const message of inbound) {
    const cid = message.conversationId;
    if (!cid || seen.has(cid)) {
      continue;
    }
    seen.add(cid);
    result.push(cid);
  }
  return result;
}

export interface LiveFeedRawMessage {
  id: string;
  content: string | null;
  direction: string;
  type: string;
  status: string | null;
  createdAt: Date;
  contact?: { name?: string | null; phone?: string | null } | null;
  conversation?: { channel?: string | null } | null;
}

export interface LiveFeedMessage {
  id: string;
  content: string | null;
  direction: string;
  type: string;
  channel: string;
  contactName: string;
  createdAt: Date;
  status: string | null;
}

/**
 * Reduce a Prisma `message.findMany` row into the wire shape returned by the
 * live-feed endpoint. Defaults `channel` to `'WHATSAPP'` and `contactName`
 * to `'Unknown'` when the joined records are missing.
 */
export function mapLiveFeedMessage(message: LiveFeedRawMessage): LiveFeedMessage {
  return {
    id: message.id,
    content: message.content,
    direction: message.direction,
    type: message.type,
    channel: message.conversation?.channel ?? 'WHATSAPP',
    contactName: message.contact?.name ?? message.contact?.phone ?? 'Unknown',
    createdAt: message.createdAt,
    status: message.status,
  };
}

/**
 * Validate that a direct-email send body has the three mandatory fields and
 * at least one recipient. Returns a list of field names that failed.
 */
export function validateDirectEmailSendBody(body: DirectEmailSendBody): string[] {
  const missing: string[] = [];
  if (!body.subject) {
    missing.push('subject');
  }
  if (!body.html) {
    missing.push('html');
  }
  if (!body.recipients || body.recipients.length === 0) {
    missing.push('recipients');
  }
  return missing;
}

/**
 * Parse the `recipients` field out of an approval payload (a free-form
 * `Record<string, unknown>` returned by Prisma JSON columns) into a strictly
 * typed array. Rejects entries that don't have a string `email`.
 */
export function parseApprovalRecipients(
  payload: Record<string, unknown>,
): DirectEmailRecipient[] {
  if (!Array.isArray(payload.recipients)) {
    return [];
  }
  const result: DirectEmailRecipient[] = [];
  for (const entry of payload.recipients) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const email = typeof record.email === 'string' ? record.email : '';
    if (!email) {
      continue;
    }
    const parsed: DirectEmailRecipient = { email };
    if (typeof record.name === 'string') {
      parsed.name = record.name;
    }
    result.push(parsed);
  }
  return result;
}

/**
 * Hydrate a direct-email send body from an approved approval-request payload.
 * Pulls `recipients`, and conditionally overrides `subject`, `html`, and
 * `campaignName` when the payload carries strings for those fields. Used
 * after a human marketing approval is granted so the controller can re-issue
 * the send without trusting the caller's body.
 */
export function buildSendBodyFromApproval(
  payload: Record<string, unknown>,
): DirectEmailSendBody {
  const sendBody: DirectEmailSendBody = {
    recipients: parseApprovalRecipients(payload),
  };
  if (typeof payload.subject === 'string') {
    sendBody.subject = payload.subject;
  }
  if (typeof payload.html === 'string') {
    sendBody.html = payload.html;
  }
  if (typeof payload.campaignName === 'string') {
    sendBody.campaignName = payload.campaignName;
  }
  return sendBody;
}

/**
 * Normalise a free-form `approvalRequestId` into the trimmed string used by
 * the controller. Anything that isn't a non-empty string after trimming
 * collapses to an empty string.
 */
export function normalizeApprovalRequestId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
