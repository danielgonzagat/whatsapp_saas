export interface AutopilotStatus {
  workspaceId: string;
  enabled: boolean;
  billingSuspended?: boolean;
}

export interface AutopilotStats {
  workspaceId: string;
  enabled: boolean;
  billingSuspended?: boolean;
  contactsTracked: number;
  actionsLast7d: number;
  actionsByType: Record<string, number>;
  lastActionAt: string | null;
  errorsLast7d: number;
  lastErrorAt: string | null;
  errorReasons: Record<string, number>;
  scheduledCount: number;
  nextRetryAt: string | null;
  conversionsLast7d: number;
  lastConversionAt: string | null;
  conversionsAmountLast7d: number;
  skippedTotal: number;
  skippedOptin: number;
  skipped24h: number;
  timeline: Record<string, number>;
}

export interface AutopilotImpact {
  workspaceId: string;
  actionsAnalyzed: number;
  repliedContacts: number;
  totalReplies: number;
  replyRate: number;
  conversions: number;
  conversionRate: number;
  avgReplyMinutes: number | null;
  samples: Array<{
    contactId: string;
    contact: string;
    replyAt: string;
    delayMinutes: number;
  }>;
}

export interface AutopilotAction {
  id?: string;
  createdAt: string;
  contactId?: string;
  contact?: string;
  intent?: string;
  action?: string;
  status?: string;
  reason?: string;
}

export interface MoneyReport {
  totalRevenue?: number;
  totalCosts?: number;
  roi?: number;
  period?: string;
  conversions?: number;
  avgTicket?: number;
  revenueByDay?: Record<string, number>;
  [key: string]: unknown;
}

export interface RevenueEvent {
  id?: string;
  type?: string;
  amount?: number;
  contactId?: string;
  contact?: string;
  phone?: string;
  reason?: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface AutopilotInsight {
  id?: string;
  type?: string;
  title?: string;
  description?: string;
  severity?: 'info' | 'warning' | 'critical' | 'success';
  recommendation?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface QueueStats {
  waiting?: number;
  active?: number;
  delayed?: number;
  completed?: number;
  failed?: number;
  paused?: number;
  [key: string]: unknown;
}

export interface AutopilotConfigData {
  conversionFlowId?: string | null;
  currencyDefault?: string;
  recoveryTemplateName?: string | null;
  [key: string]: unknown;
}

export interface AutopilotPipeline {
  workspaceId: string;
  workspaceName?: string | null;
  windowHours?: number;
  autonomy?: {
    autopilotEnabled?: boolean;
    whatsappStatus?: string;
    connected?: boolean;
  };
  messages?: {
    received?: number;
    responded?: number;
    unansweredEstimate?: number;
    lastInbound?: {
      content?: string;
      createdAt?: string;
    } | null;
    lastOutbound?: {
      content?: string;
      createdAt?: string;
    } | null;
  };
  autopilot?: {
    executed?: number;
    skipped?: number;
    failed?: number;
    lastEvent?: {
      status?: string;
      reason?: string | null;
      createdAt?: string;
    } | null;
    recentFailures?: Array<{
      status?: string;
      reason?: string | null;
      createdAt?: string;
    }>;
  };
  queue?: {
    waiting?: number;
    active?: number;
    delayed?: number;
    failed?: number;
  };
}

export interface SystemHealth {
  status: string;
  details?: Record<string, { status?: string; error?: string; missing?: string[] }>;
}

export interface AutopilotSmokeTestResult {
  smokeTestId: string;
  mode: 'dry-run' | 'live';
  phone: string;
  message: string;
  result?: {
    status?: string;
    stage?: string;
    error?: string;
    previewText?: string;
    mode?: 'dry-run' | 'live';
    reason?: string;
  };
  queue?: {
    waiting?: number;
    active?: number;
    delayed?: number;
    failed?: number;
  };
}
