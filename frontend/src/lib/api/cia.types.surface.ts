// Cia surface response + cognitive highlight + human task type definitions.
// Extracted from cia.types.ts as part of the gate-fix-D split (keep each
// file <= 400 LOC). The barrel `cia.types.ts` re-exports every symbol below
// so existing consumers continue to compile without modification.

import type { CiaInsight, CiaMarketSignal } from './cia.types.signals';

/** Cia surface response shape. */
export interface CiaSurfaceResponse {
  /** Title property. */
  title: string;
  /** Subtitle property. */
  subtitle: string;
  /** Workspace name property. */
  workspaceName?: string | null;
  /** State property. */
  state: string;
  /** Today property. */
  today: {
    soldAmount: number;
    activeConversations: number;
    pendingPayments: number;
  };
  /** Now property. */
  now: {
    message: string;
    phase?: string | null;
    type: string;
    ts?: string;
  } | null;
  /** Recent property. */
  recent: Array<{
    type: string;
    message: string;
    phase?: string | null;
    ts?: string;
    meta?: Record<string, unknown>;
  }>;
  /** Business state property. */
  businessState?: Record<string, unknown> | null;
  /** Human tasks property. */
  humanTasks?: CiaHumanTask[];
  /** Cognition property. */
  cognition?: CiaCognitiveHighlight[];
  /** Market signals property. */
  marketSignals?: CiaMarketSignal[];
  /** Insights property. */
  insights?: CiaInsight[];
  /** Runtime property. */
  runtime?: Record<string, unknown> | null;
  /** Autonomy property. */
  autonomy?: Record<string, unknown> | null;
  /** Commercial pipeline mode. */
  commercial?: {
    pipelineMode: 'shadow' | 'active' | 'legacy';
  };
}

/** Cia cognitive highlight shape. */
export interface CiaCognitiveHighlight {
  /** Id property. */
  id: string;
  /** Category property. */
  category: string;
  /** Type property. */
  type?: string | null;
  /** Contact id property. */
  contactId?: string | null;
  /** Conversation id property. */
  conversationId?: string | null;
  /** Phone property. */
  phone?: string | null;
  /** Summary property. */
  summary: string;
  /** Next best action property. */
  nextBestAction?: string | null;
  /** Intent property. */
  intent?: string | null;
  /** Stage property. */
  stage?: string | null;
  /** Outcome property. */
  outcome?: string | null;
  /** Confidence property. */
  confidence?: number | null;
  /** Updated at property. */
  updatedAt?: string | null;
}

/** Cia human task shape. */
export interface CiaHumanTask {
  /** Id property. */
  id: string;
  /** Task type property. */
  taskType: string;
  /** Urgency property. */
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** Reason property. */
  reason: string;
  /** Suggested reply property. */
  suggestedReply?: string;
  /** Business impact property. */
  businessImpact?: string;
  /** Contact id property. */
  contactId?: string;
  /** Phone property. */
  phone?: string;
  /** Conversation id property. */
  conversationId?: string | null;
  /** Status property. */
  status?: 'OPEN' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
  /** Resolved at property. */
  resolvedAt?: string;
  /** Approved reply property. */
  approvedReply?: string | null;
  /** Created at property. */
  createdAt: string;
}
