import type { Prisma } from '@prisma/client';

/** ToolArgs shape used by all action methods. */
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
  includeFollowUps?: boolean;
  includeHealth?: boolean;
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

/** Action entry shape. */
export interface ActionEntry {
  tool: string;
  args: ToolArgs;
  result?: unknown;
}

export interface PredecidedAction {
  args: ToolArgs;
  tool: string;
}
