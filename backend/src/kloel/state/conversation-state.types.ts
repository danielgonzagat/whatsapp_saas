/**
 * ConversationState — the REAL, per-turn cognitive state of a Kloel
 * conversation, assembled from production data sources (no fakes, no
 * persona). The LLM is a verbalizer of this State, not its author.
 *
 * Each field is sourced from a concrete production service / Prisma model:
 *   - workspace      → prisma.workspace (+ KloelWorkspaceContextService text)
 *   - actor          → prisma.agent (the acting user/agent)
 *   - contact        → prisma.contact (when the turn involves a known lead)
 *   - recentEvents   → prisma.auditLog (tail, last 24h)
 *   - memory.shortTerm → prisma.kloelMessage (last N persisted turns)
 *   - capabilities   → CapabilityRegistryV2Service.filterFor
 *   - risk           → flagged unavailable (no per-workspace RiskService yet)
 *
 * See Y-4 / X §2.6/3.4: LLM-as-verbalizer-of-real-State.
 */

import type { CapabilityDefinition } from '../capability-registry-v2/capability-registry-v2.types';

/** Workspace identity + resolved textual context. */
export interface ConversationWorkspaceState {
  id: string;
  name: string;
  /** Rich textual context produced by KloelWorkspaceContextService. */
  context: string;
}

/** The acting agent/user resolved from auth. */
export interface ConversationActorState {
  id: string;
  name: string;
  role: string;
}

/** A known contact/lead, when the turn maps to one. */
export interface ConversationContactState {
  id: string;
  name: string | null;
  phone: string;
  leadScore: number;
  sentiment: string;
  purchaseProbability: string;
}

/** A single real audit-log event surfaced into recentEvents. */
export interface ConversationEventState {
  action: string;
  resource: string;
  resourceId: string | null;
  createdAt: Date;
}

/** A single persisted conversation turn (short-term memory). */
export interface ConversationMemoryTurn {
  role: string;
  content: string;
  createdAt: Date;
}

/** Risk posture. Currently flagged unavailable until a per-workspace
 *  RiskService exists (RiscEvent is a global Google-RISC feed, not
 *  per-conversation risk). */
export interface ConversationRiskState {
  available: false;
  reason: string;
}

/** The full assembled per-turn conversation state. */
export interface ConversationState {
  workspace: ConversationWorkspaceState | null;
  actor: ConversationActorState | null;
  contact: ConversationContactState | null;
  recentEvents: ConversationEventState[];
  memory: {
    shortTerm: ConversationMemoryTurn[];
  };
  capabilities: CapabilityDefinition[];
  risk: ConversationRiskState;
  /** Sources that could not be assembled from real data this turn. */
  missingSources: string[];
  assembledAt: Date;
}

/** Inputs needed to assemble a {@link ConversationState}. */
export interface BuildConversationStateInput {
  workspaceId?: string | undefined;
  userId?: string | undefined;
  conversationId?: string | undefined;
  /** Already-resolved workspace context text (avoids a redundant fetch). */
  workspaceContext?: string | undefined;
  /** Phone of the contact/lead, when known (e.g. WhatsApp turns). */
  contactPhone?: string | undefined;
  /** Surface for capability filtering (e.g. 'chat', 'whatsapp'). */
  surface?: string | undefined;
  /** Permissions granted for this turn (capability gating). */
  permissions?: string[] | undefined;
  /** Tail size for short-term memory. */
  memoryLimit?: number | undefined;
  /** Tail size for recent events. */
  eventLimit?: number | undefined;
}
