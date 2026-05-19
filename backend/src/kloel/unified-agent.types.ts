import type { Prisma } from '@prisma/client';

export interface ToolArgs {
  active?: boolean;
  amount?: number;
  audioBase64?: string;
  audioUrl?: string;
  autoActivate?: boolean;
  autoReplyEnabled?: boolean;
  autoReplyMessage?: string;
  businessHours?: Prisma.InputJsonValue;
  businessName?: string;
  campaignId?: string;
  caption?: string;
  category?: string;
  broadcastWindow?: unknown;
  channelChoice?: unknown;
  code?: string;
  couponDecision?: unknown;
  csvData?: string;
  daysSilent?: number;
  delayHours?: number;
  description?: string;
  decisionTraceId?: string;
  discountPercent?: number;
  documentName?: string;
  enabled?: boolean;
  event?: string;
  expiresIn?: string;
  flowId?: string;
  flowName?: string;
  followupTimingDecision?: unknown;
  funnelName?: string;
  handoffDecision?: unknown;
  imageUrl?: string;
  includeConnections?: boolean;
  includeHealth?: boolean;
  includeFollowUps?: boolean;
  includeLink?: boolean;
  includeMetrics?: boolean;
  includePrice?: boolean;
  inboundCorrelationId?: string;
  /**
   * Structured plan emitted by the deterministic commercial orchestrator.
   * NEVER sent to the customer verbatim. Carried alongside `message` so a
   * future LLM writer/composer can rewrite the customer-facing string while
   * keeping the structured decision available for tracing and outcome
   * correlation. See commercial-decision-orchestrator.service.ts.
   */
  internalReplyPlan?: unknown;
  intent?: string;
  language?: string;
  message?: string;
  metric?: string;
  mode?: string;
  name?: string;
  objective?: string;
  objectionType?: string;
  offer?: string;
  paymentLink?: string;
  period?: string;
  personality?: string;
  plan?: string;
  priceBand?: string;
  price?: number;
  priority?: string;
  productId?: string;
  productName?: string;
  productOffer?: unknown;
  properties?: Prisma.InputJsonValue;
  query?: string;
  questions?: string[];
  reason?: string;
  returnUrl?: string;
  scheduleAt?: string;
  segment?: string;
  source?: string;
  stage?: string;
  status?: string;
  subject?: string;
  stages?: string[];
  steps?: Prisma.InputJsonValue[];
  strategy?: string;
  suggestedTimes?: string[];
  tag?: string;
  targetTags?: string[];
  technique?: string;
  text?: string;
  tone?: string;
  trigger?: string;
  triggerValue?: string;
  type?: string;
  url?: string;
  useEmojis?: boolean;
  variables?: Prisma.InputJsonValue;
  voice?: string;
  workingHoursOnly?: boolean;
}

export interface ActionEntry {
  tool: string;
  args: ToolArgs;
  result?: unknown;
}

export interface PredecidedAction {
  tool: string;
  args: ToolArgs;
}
