import { Injectable } from '@nestjs/common';
import type {
  ActionDescriptor,
  RiskClassification,
  RiskClass,
  AutonomyMode,
  EvidenceLevel,
} from './risk-class.types';

const R1_ROLLBACK: readonly string[] = ['revert_locally', 'notify_operator'];
const R2_ROLLBACK: readonly string[] = ['request_approval_reversal', 'audit_log_entry', 'notify_owner'];
const R3_ROLLBACK: readonly string[] = ['escalate_to_human', 'freeze_action', 'audit_trail_full', 'notify_owner_manager'];
const R4_ROLLBACK: readonly string[] = ['block_immediately', 'escalate_to_human_ceo', 'full_audit_required', 'legal_review_recommended', 'notify_governance_board'];

@Injectable()
export class RiskClassService {
  classify(action: ActionDescriptor): RiskClassification {
    const riskClass = this.determineClass(action);
    return {
      class: riskClass,
      autonomyMode: this.autonomyFor(riskClass),
      requiredEvidenceLevel: this.evidenceFor(riskClass),
      rollback: this.rollbackFor(riskClass),
    };
  }

  private determineClass(action: ActionDescriptor): RiskClass {
    switch (action.kind) {
      case 'message_send':
        return this.classifyMessageSend(action);
      case 'discount_offer':
        return this.classifyDiscountOffer(action);
      case 'lead_block':
        return this.classifyLeadBlock(action);
      case 'payment_action':
        return this.classifyPaymentAction(action);
      case 'public_response':
        return this.classifyPublicResponse(action);
      case 'context_org':
        return this.classifyContextOrg(action);
    }
  }

  private classifyMessageSend(action: ActionDescriptor): RiskClass {
    if (action.target === 'public') {
      return 'R3';
    }
    if (action.target === 'team') {
      return 'R2';
    }
    return 'R1';
  }

  private classifyDiscountOffer(action: ActionDescriptor): RiskClass {
    const cents = action.financialImpactCents ?? 0;
    if (!action.reversible) {
      return cents >= 5000 ? 'R4' : 'R3';
    }
    if (cents >= 10000) {
      return 'R3';
    }
    if (cents >= 5000) {
      return 'R2';
    }
    return 'R1';
  }

  private classifyLeadBlock(action: ActionDescriptor): RiskClass {
    if (!action.reversible) {
      return 'R4';
    }
    if (action.target === 'public') {
      return 'R3';
    }
    if (action.target === 'team') {
      return 'R2';
    }
    return 'R2';
  }

  private classifyPaymentAction(action: ActionDescriptor): RiskClass {
    const cents = action.financialImpactCents ?? 0;
    if (!action.reversible) {
      return 'R4';
    }
    if (cents >= 100000) {
      return 'R4';
    }
    if (cents >= 10000) {
      return 'R3';
    }
    if (action.target === 'public') {
      return 'R3';
    }
    return 'R2';
  }

  private classifyPublicResponse(action: ActionDescriptor): RiskClass {
    if (!action.reversible) {
      return 'R4';
    }
    return 'R3';
  }

  private classifyContextOrg(action: ActionDescriptor): RiskClass {
    if (action.target === 'public') {
      return 'R3';
    }
    if (action.target === 'team') {
      return 'R2';
    }
    return 'R1';
  }

  private autonomyFor(riskClass: RiskClass): AutonomyMode {
    switch (riskClass) {
      case 'R1':
        return 'allowed_alone';
      case 'R2':
        return 'requires_approval';
      case 'R3':
        return 'must_escalate';
      case 'R4':
        return 'forbidden';
    }
  }

  private evidenceFor(riskClass: RiskClass): EvidenceLevel {
    switch (riskClass) {
      case 'R1':
        return 'N1';
      case 'R2':
        return 'N2';
      case 'R3':
        return 'N4';
      case 'R4':
        return 'N6';
    }
  }

  private rollbackFor(riskClass: RiskClass): readonly string[] {
    switch (riskClass) {
      case 'R1':
        return R1_ROLLBACK;
      case 'R2':
        return R2_ROLLBACK;
      case 'R3':
        return R3_ROLLBACK;
      case 'R4':
        return R4_ROLLBACK;
    }
  }
}
