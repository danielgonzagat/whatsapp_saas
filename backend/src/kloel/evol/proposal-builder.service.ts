import { Injectable } from '@nestjs/common';
import type { Gap, ImprovementProposal, RTier } from './evol.types';
import { tierToNumber, isRTier3Or4 } from './evol.types';

/**
 * ProposalBuilderService — gera propostas de melhoria a partir de gaps
 * detectados, com todos os campos de governanca exigidos:
 *   - hypothesisToTest
 *   - requiresHumanApproval (R3/R4 = true sempre)
 *   - riskClass
 *   - expectedRTierDelta
 *   - rollbackPlan
 */

interface DomainFix {
  readonly description: string;
  readonly targetPattern: readonly string[];
  readonly riskClass: 'safe' | 'normal' | 'high' | 'critical';
}

const PROPOSED_FIXES: Readonly<Record<string, DomainFix>> = {
  payments: {
    description: 'Add idempotency guard to payment webhook handler',
    targetPattern: ['backend/src/payments/**'],
    riskClass: 'critical',
  },
  wallet: {
    description: 'Audit wallet transaction isolation in withdrawal flow',
    targetPattern: ['backend/src/wallet/**'],
    riskClass: 'high',
  },
  checkout: {
    description: 'Validate checkout cart totals before payment intent creation',
    targetPattern: ['backend/src/checkout/**', 'backend/src/payments/**'],
    riskClass: 'critical',
  },
  whatsapp: {
    description: 'Add rate-limit backoff to WhatsApp message sender',
    targetPattern: ['backend/src/whatsapp/**', 'worker/**'],
    riskClass: 'high',
  },
  auth: {
    description: 'Strengthen JWT refresh token rotation logic',
    targetPattern: ['backend/src/auth/**'],
    riskClass: 'high',
  },
  kyc: {
    description: 'Add document validation retry with exponential backoff',
    targetPattern: ['backend/src/kyc/**'],
    riskClass: 'normal',
  },
  billing: {
    description: 'Add subscription lifecycle webhook idempotency',
    targetPattern: ['backend/src/billing/**', 'backend/src/webhooks/**'],
    riskClass: 'high',
  },
  autopilot: {
    description: 'Add confidence threshold guard before autonomous message send',
    targetPattern: ['backend/src/autopilot/**', 'backend/src/kloel/**'],
    riskClass: 'high',
  },
  crm: {
    description: 'Ensure CRM pipeline stages have workspace isolation',
    targetPattern: ['backend/src/crm/**'],
    riskClass: 'normal',
  },
  flows: {
    description: 'Validate flow node transitions for infinite loop prevention',
    targetPattern: ['backend/src/flows/**'],
    riskClass: 'normal',
  },
  dashboard: {
    description: 'Replace mock dashboard data with real aggregation queries',
    targetPattern: ['backend/src/dashboard/**'],
    riskClass: 'safe',
  },
};

const DEFAULT_FIX: DomainFix = {
  description: 'Investigate and resolve capability gap',
  targetPattern: [],
  riskClass: 'normal',
};

function formatExpectedDelta(domain: string, currentTier?: RTier): string {
  const currentNum = currentTier ? tierToNumber(currentTier) : 4;
  const targetNum = Math.max(1, currentNum - 1);
  return `Upgrade ${domain} module from tier ${currentNum} to tier ${targetNum}`;
}

function buildRollbackPlan(domain: string, riskClass: string): string {
  if (riskClass === 'critical') {
    return `Re-aplicar versao anterior do codigo em ${domain} via deploy revert sem git-restore; validar com spec do modulo; restaurar feature flags se aplicavel`;
  }
  if (riskClass === 'high') {
    return `Re-aplicar ultimo commit estavel em ${domain} com validacao de smoke test; rollback assistido por orquestrador humano`;
  }
  return `Desfazer alteracao em ${domain} via feature flag toggle; restaurar configuracao anterior; sem destruicao de historico git`;
}

@Injectable()
export class ProposalBuilderService {
  private proposalCounter = 0;

  build(gap: Gap, additionalEvidence: readonly string[] = []): ImprovementProposal {
    const fix = PROPOSED_FIXES[gap.domain] ?? DEFAULT_FIX;
    this.proposalCounter += 1;

    const requiresHumanApproval =
      isRTier3Or4(fix.riskClass === 'critical' ? 'tier_3_facade' : 'tier_1_functional') ||
      fix.riskClass === 'critical' ||
      fix.riskClass === 'high';

    return {
      id: `prop-${gap.workspaceId}-${this.proposalCounter}`,
      gapId: gap.id,
      workspaceId: gap.workspaceId,
      domain: gap.domain,
      description: fix.description,
      hypothesisToTest: `Applying "${fix.description}" will reduce ${gap.commercialImpact} risk in ${gap.domain} domain by at least one R-tier level`,
      requiresHumanApproval,
      riskClass: fix.riskClass,
      expectedRTierDelta: formatExpectedDelta(gap.domain),
      rollbackPlan: buildRollbackPlan(gap.domain, fix.riskClass),
      targetFiles: [...fix.targetPattern],
      evidence: [...gap.sourceEvidence, ...additionalEvidence],
      generatedAt: new Date().toISOString(),
      status: 'draft',
    };
  }

  buildAll(gaps: readonly Gap[], evidence: readonly string[] = []): readonly ImprovementProposal[] {
    return gaps.map((g) => this.build(g, evidence));
  }

  submit(proposal: ImprovementProposal): ImprovementProposal {
    if (proposal.status !== 'draft') {
      return proposal;
    }
    return { ...proposal, status: 'submitted' };
  }

  requiresHumanApproval(riskClass: 'safe' | 'normal' | 'high' | 'critical'): boolean {
    return riskClass === 'critical' || riskClass === 'high';
  }

  resetCounter(): void {
    this.proposalCounter = 0;
  }
}
