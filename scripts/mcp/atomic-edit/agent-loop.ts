/**
 * agent-loop.ts — The governed agent loop engine.
 *
 * Destills the agent orchestration patterns from OpenHands and SWE-agent
 * (workspace abstraction, plan-investigate-propose-validate-commit-verify
 * cycle, trajectory model, multi-step reasoning) and rebuilds them under
 * Atomic law: every action is admitted through the mutation firewall, every
 * deletion requires a disproof, every success produces a receipt.
 *
 * The loop is a state machine with 7 phases:
 *   PLAN       → parse issue/task, produce ordered steps
 *   INVESTIGATE → structured reads (code_readcode / code_outline)
 *   PROPOSE    → candidate atomic edits (preview mode, not yet written)
 *   VALIDATE   → gates check (syntax, connection, security, formal)
 *   COMMIT     → atomic write with trace receipt
 *   VERIFY     → typecheck, lint, test execution
 *   DECIDE     → accept the patch or rollback
 *
 * Key architectural difference from OpenHands/SWE-agent:
 *   They: agent acts → validate after → accept or rollback
 *   Atomic: agent proposes → atomic validates BEFORE write → only good bytes land
 *
 * Every phase transition is traced to .atomic/agent-sessions/<id>/trajectory.jsonl
 * and receipts are bound to the AtomicEditTrace for auditability.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// ──────────────────────── phase enum ──────────────────────────

export const AgentPhase = {
  PLAN: 'plan',
  INVESTIGATE: 'investigate',
  PROPOSE: 'propose',
  VALIDATE: 'validate',
  COMMIT: 'commit',
  VERIFY: 'verify',
  DECIDE: 'decide',
} as const;

export type AgentPhase = (typeof AgentPhase)[keyof typeof AgentPhase];

export const PHASE_ORDER: readonly AgentPhase[] = [
  'plan', 'investigate', 'propose', 'validate', 'commit', 'verify', 'decide',
] as const;

// ──────────────────────── types ───────────────────────────

export interface AgentStep {
  /** Ordered step number (1-based). */
  step: number;
  /** Human-readable description of what to do. */
  description: string;
  /** Expected outcome after this step. */
  expectedOutcome: string;
  /** Files likely affected by this step. */
  affectedFiles?: string[];
  /** Precondition: previous step that must complete first (0 = none). */
  dependsOn?: number;
}

export interface AgentPlan {
  /** Session-scoped plan ID (sha256 of issue+timestamp). */
  planId: string;
  /** The original issue/task description. */
  issue: string;
  /** Ordered steps to resolve the issue. */
  steps: AgentStep[];
  /** Estimated complexity: low | medium | high | critical. */
  complexity: 'low' | 'medium' | 'high' | 'critical';
  /** Unix ms when the plan was created. */
  createdAt: number;
}

export interface AgentObservation {
  /** Which step this observation belongs to. */
  step: number;
  /** The tool used for the observation. */
  tool: string;
  /** Key findings (files, symbols, patterns discovered). */
  findings: string[];
  /** Timestamp. */
  at: number;
}

export interface AgentProposal {
  /** Which step this proposal addresses. */
  step: number;
  /** The atomic tool that would execute the change. */
  tool: string;
  /** The tool arguments (preview-mode ready). */
  arguments: Record<string, unknown>;
  /** Human-readable diff summary. */
  summary: string;
  /** Files this proposal would modify. */
  modifiedFiles: string[];
  /** Preview response from the atomic tool. */
  preview?: Record<string, unknown>;
}

export interface AgentDecision {
  /** Accepted or rejected. */
  verdict: 'accepted' | 'rejected' | 'needs_revision';
  /** Human-readable reason. */
  reason: string;
  /** If accepted: the commit trace ref. If rejected: what to revise. */
  detail: string;
  /** Evidence that supports the decision. */
  evidence: {
    validation?: { language: string; before: number; after: number };
    testResults?: string;
    typecheckResult?: string;
    lintResult?: string;
    gateVerdict?: Record<string, unknown>;
  };
}

export interface AgentTrajectoryEntry {
  /** Monotonic sequence number. */
  seq: number;
  /** Session-scoped operation ID. */
  sessionId: string;
  /** The phase. */
  phase: AgentPhase;
  /** Phase-specific payload. */
  payload: AgentPlan | AgentObservation | AgentProposal | AgentDecision;
  /** Unix ms. */
  timestamp: number;
}

export interface AgentSession {
  /** Unique session ID (nanoid-style). */
  sessionId: string;
  /** The plan for this session. */
  plan: AgentPlan;
  /** Current phase. */
  phase: AgentPhase;
  /** Current step (1-based). */
  currentStep: number;
  /** All trajectory entries so far. */
  trajectory: AgentTrajectoryEntry[];
  /** Proposals made so far, indexed by step. */
  proposals: Map<number, AgentProposal>;
  /** Number of attempts at current step. */
  attemptCount: number;
  /** Max attempts per step before escalation. */
  maxAttempts: number;
  /** Session start time. */
  startedAt: number;
  /** Git worktree path if isolated. */
  worktree?: string;
}

// ──────────────────────── engine ──────────────────────────

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function genId(): string {
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Create a new agent session from an issue description.
 * Generates a plan by parsing the issue (deterministic — the LLM supplies
 * the plan content; this creates the scaffold).
 */
export function createSession(issue: string, steps: AgentStep[]): AgentSession {
  const sessionId = genId();
  const planId = sha256(`${issue}::${Date.now()}`);
  const plan: AgentPlan = {
    planId,
    issue,
    steps,
    complexity: steps.length <= 3 ? 'low' : steps.length <= 6 ? 'medium' : steps.length <= 10 ? 'high' : 'critical',
    createdAt: Date.now(),
  };
  return {
    sessionId,
    plan,
    phase: 'plan',
    currentStep: 0,
    trajectory: [],
    proposals: new Map(),
    attemptCount: 0,
    maxAttempts: 5,
    startedAt: Date.now(),
  };
}

/**
 * Record a trajectory entry and advance the session state.
 */
export function recordEntry(
  session: AgentSession,
  payload: AgentPlan | AgentObservation | AgentProposal | AgentDecision,
): AgentTrajectoryEntry {
  const entry: AgentTrajectoryEntry = {
    seq: session.trajectory.length + 1,
    sessionId: session.sessionId,
    phase: session.phase,
    payload,
    timestamp: Date.now(),
  };
  session.trajectory.push(entry);
  return entry;
}

/**
 * Transition to the next phase. Returns the new phase.
 * The phase order is fixed: plan → investigate → propose → validate → commit → verify → decide.
 */
export function advancePhase(session: AgentSession): AgentPhase {
  const currentIdx = PHASE_ORDER.indexOf(session.phase);
  if (currentIdx >= PHASE_ORDER.length - 1) {
    session.phase = 'decide';
    return 'decide';
  }
  session.phase = PHASE_ORDER[currentIdx + 1];
  if (session.phase === 'investigate') {
    session.currentStep = 1;
  }
  session.attemptCount = 0;
  return session.phase;
}

/**
 * Record a proposal for a step. Proposals are accumulated per step
 * so the decide phase can compare alternatives.
 */
export function recordProposal(session: AgentSession, proposal: AgentProposal): void {
  session.proposals.set(proposal.step, proposal);
}

/**
 * Get all proposals for the current step, sorted by recency.
 */
export function proposalsForStep(session: AgentSession, step: number): AgentProposal[] {
  const out: AgentProposal[] = [];
  for (const [s, p] of session.proposals) {
    if (s === step) out.push(p);
  }
  return out;
}

/**
 * Resolve the next step after completing the current one.
 * Returns null when all steps are complete.
 */
export function nextStep(session: AgentSession): number | null {
  const next = session.currentStep + 1;
  if (next > session.plan.steps.length) return null;
  session.currentStep = next;
  session.phase = 'investigate';
  session.attemptCount = 0;
  return next;
}

/**
 * Increment attempt count. Returns false when max attempts exceeded
 * (escalation needed — session should pause for human review).
 */
export function incrementAttempt(session: AgentSession): boolean {
  session.attemptCount += 1;
  return session.attemptCount <= session.maxAttempts;
}

/**
 * Decision: accept the patch. Returns the commit instructions.
 */
export function accept(session: AgentSession, evidence: AgentDecision['evidence'], detail: string): AgentDecision {
  session.phase = 'decide';
  return {
    verdict: 'accepted',
    reason: 'All gates green, verification passed.',
    detail,
    evidence,
  };
}

/**
 * Decision: reject and request revision with specific feedback.
 */
export function requestRevision(session: AgentSession, reason: string, detail: string): AgentDecision {
  return { verdict: 'needs_revision' as const, reason: reason || '', detail: detail || '', evidence: {} };
}

/**
 * Persist the trajectory to .atomic/agent-sessions/<id>/trajectory.jsonl.
 */
export function persistTrajectory(repoRoot: string, session: AgentSession): string {
  const dir = path.join(repoRoot, '.atomic', 'agent-sessions', session.sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'trajectory.jsonl');
  const lines = session.trajectory.map((e) => JSON.stringify(e) + '\n').join('');
  fs.appendFileSync(file, lines, 'utf8');

  // Also persist the session state snapshot
  const stateFile = path.join(dir, 'session.json');
  const state = {
    sessionId: session.sessionId,
    planId: session.plan.planId,
    phase: session.phase,
    currentStep: session.currentStep,
    attemptCount: session.attemptCount,
    trajectoryLength: session.trajectory.length,
    startedAt: session.startedAt,
  };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');

  return file;
}

/**
 * Load a session from .atomic/agent-sessions/<id>/.
 * Returns null if not found or corrupted.
 */
export function loadSession(repoRoot: string, sessionId: string): AgentSession | null {
  try {
    const stateFile = path.join(repoRoot, '.atomic', 'agent-sessions', sessionId, 'session.json');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const trajectoryFile = path.join(repoRoot, '.atomic', 'agent-sessions', sessionId, 'trajectory.jsonl');
    const trajectoryLines = fs.readFileSync(trajectoryFile, 'utf8').split('\n').filter(Boolean);
    const trajectory: AgentTrajectoryEntry[] = trajectoryLines.map((l) => JSON.parse(l));

    // Rebuild the plan from trajectory entry 0 (plan phase)
    const planEntry = trajectory.find((e) => e.phase === 'plan');
    if (!planEntry) return null;

    return {
      sessionId,
      plan: planEntry.payload as AgentPlan,
      phase: state.phase,
      currentStep: state.currentStep,
      trajectory,
      proposals: new Map(),
      attemptCount: state.attemptCount,
      maxAttempts: 5,
      startedAt: state.startedAt,
    };
  } catch {
    return null;
  }
}

/**
 * List all agent sessions in the repo.
 */
export function listSessions(repoRoot: string): Array<{ sessionId: string; phase: string; step: number; startedAt: number }> {
  const dir = path.join(repoRoot, '.atomic', 'agent-sessions');
  if (!fs.existsSync(dir)) return [];
  const sessions: Array<{ sessionId: string; phase: string; step: number; startedAt: number }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const stateFile = path.join(dir, entry.name, 'session.json');
    if (!fs.existsSync(stateFile)) continue;
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      sessions.push({
        sessionId: entry.name,
        phase: state.phase,
        step: state.currentStep,
        startedAt: state.startedAt,
      });
    } catch {
      // skip corrupted sessions
    }
  }
  return sessions.sort((a, b) => b.startedAt - a.startedAt);
}
