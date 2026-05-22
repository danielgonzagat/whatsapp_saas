import { Injectable } from '@nestjs/common';
import type { SelfGap, ImprovementProposal } from './types';

/**
 * EVOL-002 — ProposalBuilder.
 *
 * Builds structured improvement proposals from detected gaps. Each
 * proposal includes target files, expected delta, risk assessment,
 * and evidence links. Proposals must be approved by a human before
 * any agent can act on them.
 */

const PROPOSED_FIXES: Readonly<
  Record<string, { readonly description: string; readonly targetPattern: readonly string[]; readonly risk: 'safe' | 'normal' | 'high' | 'critical' }>
> = {
  payments: {
    description: 'Add idempotency guard to payment webhook handler',
    targetPattern: ['backend/src/payments/**'],
    risk: 'critical',
  },
  wallet: {
    description: 'Audit wallet transaction isolation in withdrawal flow',
    targetPattern: ['backend/src/wallet/**'],
    risk: 'high',
  },
  auth: {
    description: 'Strengthen JWT refresh token rotation logic',
    targetPattern: ['backend/src/auth/**'],
    risk: 'high',
  },
  whatsapp: {
    description: 'Add rate-limit backoff to WhatsApp message sender',
    targetPattern: ['backend/src/whatsapp/**', 'worker/**'],
    risk: 'high',
  },
  checkout: {
    description: 'Validate checkout cart totals before payment intent creation',
    targetPattern: ['backend/src/checkout/**', 'backend/src/payments/**'],
    risk: 'critical',
  },
  kyc: {
    description: 'Add document validation retry with exponential backoff',
    targetPattern: ['backend/src/kyc/**'],
    risk: 'normal',
  },
  billing: {
    description: 'Add subscription lifecycle webhook idempotency',
    targetPattern: ['backend/src/billing/**', 'backend/src/webhooks/**'],
    risk: 'high',
  },
  crm: {
    description: 'Ensure CRM pipeline stages have workspace isolation',
    targetPattern: ['backend/src/crm/**'],
    risk: 'normal',
  },
  autopilot: {
    description: 'Add confidence threshold guard before autonomous message send',
    targetPattern: ['backend/src/autopilot/**', 'backend/src/kloel/**'],
    risk: 'high',
  },
  flows: {
    description: 'Validate flow node transitions for infinite loop prevention',
    targetPattern: ['backend/src/flows/**'],
    risk: 'normal',
  },
  dashboard: {
    description: 'Replace mock dashboard data with real aggregation queries',
    targetPattern: ['backend/src/dashboard/**'],
    risk: 'safe',
  },
};

const DEFAULT_FIX = {
  description: 'Investigate and resolve capability gap',
  targetPattern: [] as readonly string[],
  risk: 'normal' as const,
};

@Injectable()
export class ProposalBuilder {
  private proposalCounter = 0;

  build(gap: SelfGap, evidence: readonly string[]): ImprovementProposal {
    const fix = PROPOSED_FIXES[gap.domain] ?? DEFAULT_FIX;
    this.proposalCounter += 1;

    return {
      id: `prop-${gap.workspaceId}-${this.proposalCounter}`,
      gapId: gap.id,
      workspaceId: gap.workspaceId,
      description: `${fix.description} (gap: ${gap.description})`,
      targetFiles: [...fix.targetPattern],
      expectedDelta: `Reduce revenue risk by resolving ${gap.commercialImpact} in ${gap.domain}`,
      riskAssessment: fix.risk,
      evidence: [...gap.sourceEvidence, ...evidence],
      generatedAt: new Date().toISOString(),
      status: 'draft',
    };
  }

  buildAll(gaps: readonly SelfGap[], evidence: readonly string[]): readonly ImprovementProposal[] {
    return gaps.map((g) => this.build(g, evidence));
  }

  submit(proposal: ImprovementProposal): ImprovementProposal {
    if (proposal.status !== 'draft') {
      return proposal;
    }
    return { ...proposal, status: 'submitted' };
  }

  resetCounter(): void {
    this.proposalCounter = 0;
  }
}
