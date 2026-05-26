import { Injectable } from '@nestjs/common';
import type { ImprovementProposal, HumanAuthorization, Role } from './types';

/**
 * EVOL-003 — HumanAuthorizationGateway.
 *
 * ABSOLUTE GATE. No agent can execute any improvement without human
 * approval. This gateway classifies each proposal by risk and enforces
 * that human_required proposals get explicit approval. Advisory and
 * tool_limited proposals may proceed with lower friction but still
 * require a recorded authorization record.
 */

const RISK_TO_AUTHORITY: Readonly<Record<string, Role>> = {
  critical: 'human_required',
  high: 'human_required',
  normal: 'tool_limited',
  safe: 'advisory',
};

const AUTHORIZATION_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class HumanAuthorizationGateway {
  private authorizations = new Map<string, HumanAuthorization>();
  private counter = 0;

  requestAuthorization(
    proposal: ImprovementProposal,
    humanPrincipal: string,
  ): HumanAuthorization {
    const authorityLevel = RISK_TO_AUTHORITY[proposal.riskAssessment] ?? 'human_required';
    const now = new Date();
    this.counter += 1;

    const auth: HumanAuthorization = {
      id: `auth-${proposal.workspaceId}-${this.counter}`,
      proposalId: proposal.id,
      workspaceId: proposal.workspaceId,
      status: 'pending',
      authorityLevel,
      humanPrincipal,
      reason: `Proposal ${proposal.id} requires ${authorityLevel} authorization`,
      authorizedAt: null,
      expiresAt: new Date(now.getTime() + AUTHORIZATION_WINDOW_MS).toISOString(),
      scope: [...proposal.targetFiles],
    };

    this.authorizations.set(auth.id, auth);
    return auth;
  }

  approve(authId: string, humanPrincipal: string, reason: string): HumanAuthorization | null {
    const auth = this.authorizations.get(authId);
    if (!auth) {return null;}
    if (auth.status !== 'pending') {return auth;}
    if (this.isExpired(auth)) {
      return { ...auth, status: 'expired' };
    }

    const approved: HumanAuthorization = {
      ...auth,
      status: 'approved',
      humanPrincipal,
      reason,
      authorizedAt: new Date().toISOString(),
    };

    this.authorizations.set(authId, approved);
    return approved;
  }

  reject(authId: string, humanPrincipal: string, reason: string): HumanAuthorization | null {
    const auth = this.authorizations.get(authId);
    if (!auth) {return null;}
    if (auth.status === 'approved') {return auth;}

    const rejected: HumanAuthorization = {
      ...auth,
      status: 'rejected',
      humanPrincipal,
      reason,
    };

    this.authorizations.set(authId, rejected);
    return rejected;
  }

  isAuthorized(authId: string): boolean {
    const auth = this.authorizations.get(authId);
    if (!auth) {return false;}
    if (this.isExpired(auth)) {return false;}
    return auth.status === 'approved' && auth.authorizedAt !== null;
  }

  requiresHumanApproval(proposal: ImprovementProposal): boolean {
    const level = RISK_TO_AUTHORITY[proposal.riskAssessment] ?? 'human_required';
    return level === 'human_required';
  }

  getAuthorization(authId: string): HumanAuthorization | undefined {
    return this.authorizations.get(authId);
  }

  private isExpired(auth: HumanAuthorization): boolean {
    return new Date(auth.expiresAt).getTime() < Date.now();
  }
}
