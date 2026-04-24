import type { Prisma } from '@prisma/client';

/** Generic unknown record. */
export type UnknownRecord = Record<string, unknown>;

/** Arguments passed to tool actions. */
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
  code?: string;
  csvData?: string;
  daysSilent?: number;
  delayHours?: number;
  description?: string;
  discountPercent?: number;
  documentName?: string;
  enabled?: boolean;
  event?: string;
  expiresIn?: string;
  flowId?: string;
  flowName?: string;
  funnelName?: string;
  imageUrl?: string;
  includeConnections?: boolean;
  includeHealth?: boolean;
  includeFollowUps?: boolean;
  includeLink?: boolean;
  includeMetrics?: boolean;
  includePrice?: boolean;
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
  price?: number;
  priority?: string;
  productId?: string;
  productName?: string;
  properties?: Prisma.InputJsonValue;
  query?: string;
  questions?: string[];
  reason?: string;
  returnUrl?: string;
  scheduleAt?: string;
  source?: string;
  stage?: string;
  status?: string;
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

/** Action entry shape returned by processMessage. */
export interface ActionEntry {
  /** Tool property. */
  tool: string;
  /** Args property. */
  args: ToolArgs;
  /** Result property. */
  result?: unknown;
}
