/**
 * UTP-AGENCY-008 — Handoff Service.
 *
 * Creates structured handoff packages for transitioning client
 * work between team members. Bundles all relevant context,
 * priority, margin, and churn risk into a single package that
 * gives the receiving member everything they need to continue
 * without context loss.
 *
 * Pure function — creates handoff packages from input data.
 */

import type { HandoffInput, HandoffPackage } from './types';
import { nextHandoffId } from './types';

export interface HandoffResult {
  readonly handoff: HandoffPackage;
  readonly readyToDeliver: boolean;
}

function validateHandoff(input: HandoffInput): readonly string[] {
  const issues: string[] = [];

  if (!input.fromMemberId || input.fromMemberId.length === 0) {
    issues.push('missing_from_member');
  }
  if (!input.clientId || input.clientId.length === 0) {
    issues.push('missing_client_id');
  }
  if (!input.workspaceId || input.workspaceId.length === 0) {
    issues.push('missing_workspace_id');
  }
  if (input.fromMemberId === input.toMemberId) {
    issues.push('self_handoff');
  }
  if (input.urgency === 'now' && !input.toMemberId) {
    issues.push('urgent_handoff_without_recipient');
  }

  return issues;
}

function buildHandoffNote(input: HandoffInput, issues: readonly string[]): string {
  if (issues.length > 0) {
    return `Handoff criado com alertas: ${issues.join(', ')}. Nota: ${input.note}`;
  }
  return input.note;
}

export function createHandoff(input: HandoffInput): HandoffResult {
  const nowMs = input.nowMs ?? Date.now();
  const issues = validateHandoff(input);

  const handoff: HandoffPackage = {
    handoffId: nextHandoffId(),
    fromMemberId: input.fromMemberId,
    toMemberId: input.toMemberId,
    clientId: input.clientId,
    workspaceId: input.workspaceId,
    urgency: input.urgency,
    contextBundle: input.bundle,
    priority: input.priority,
    margin: input.margin,
    churnRisk: input.churnRisk,
    handoffNote: buildHandoffNote(input, issues),
    createdBy: input.createdBy,
    createdAt: new Date(nowMs).toISOString(),
  };

  const readyToDeliver = issues.length === 0;

  return { handoff, readyToDeliver };
}
