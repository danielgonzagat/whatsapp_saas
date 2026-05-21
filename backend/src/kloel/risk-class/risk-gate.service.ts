import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { RiskClassService } from './risk-class.service';
import type { ActionDescriptor } from './risk-class.types';
import type {
  RiskGateDecision,
  GatePaymentInput,
  GateDiscountInput,
  GateMessageInput,
} from './risk-gate.types';

/**
 * OC-ORPHAN-14: Risk Gate Behavioral Contract.
 *
 * Wraps RiskClassService to produce execution-gate decisions before
 * R2/R3/R4 actions execute in the unified agent pipeline.
 *
 * - R1 (allowed_alone)  → allow
 * - R2 (requires_approval) → warn (logged, allowed — approval mechanism is Camada XIII future work)
 * - R3 (must_escalate) → warn (logged, allowed — escalation mechanism is Camada XIII future work)
 * - R4 (forbidden) → block
 *
 * This closes the gap where RiskClassService was never consulted before
 * payment, discount, or message-send actions in production code paths.
 */
@Injectable()
export class RiskGateService {
  private readonly logger = StructuredLogger.from(RiskGateService.name);

  constructor(private readonly riskClass: RiskClassService) {}

  gatePaymentAction(input: GatePaymentInput): RiskGateDecision {
    const action: ActionDescriptor = {
      kind: 'payment_action',
      target: input.target,
      reversible: input.reversible,
      financialImpactCents: input.amountCents,
    };
    return this.evaluate(action);
  }

  gateDiscountOffer(input: GateDiscountInput): RiskGateDecision {
    const action: ActionDescriptor = {
      kind: 'discount_offer',
      target: input.target,
      reversible: input.reversible,
      financialImpactCents: input.amountCents,
    };
    return this.evaluate(action);
  }

  gateMessageSend(input: GateMessageInput): RiskGateDecision {
    const action: ActionDescriptor = {
      kind: 'message_send',
      target: input.target,
      reversible: true,
    };
    return this.evaluate(action);
  }

  private evaluate(action: ActionDescriptor): RiskGateDecision {
    const classification = this.riskClass.classify(action);

    switch (classification.class) {
      case 'R1':
        return {
          classification,
          verdict: 'allow',
          reason: `R1 (${classification.autonomyMode}): ação de baixo risco, permitida autonomamente.`,
        };

      case 'R2':
        this.logger.warn(
          `R2 gate: ${action.kind} → requires_approval (still allowed, approval not yet wired). ` +
            `Rollback: ${classification.rollback.join(', ')}`,
        );
        return {
          classification,
          verdict: 'warn',
          reason:
            `R2 (${classification.autonomyMode}): ação requer aprovação. ` +
            `Executada com log de auditoria. Rollback disponível: ${classification.rollback.join(', ')}.`,
        };

      case 'R3':
        this.logger.warn(
          `R3 gate: ${action.kind} → must_escalate (still allowed, escalation not yet wired). ` +
            `Rollback: ${classification.rollback.join(', ')}`,
        );
        return {
          classification,
          verdict: 'warn',
          reason:
            `R3 (${classification.autonomyMode}): ação de alto risco requer escalação. ` +
            `Executada com log de auditoria. Rollback disponível: ${classification.rollback.join(', ')}.`,
        };

      case 'R4':
        this.logger.error(
          `R4 gate BLOCKED: ${action.kind} → forbidden. ` +
            `Rollback: ${classification.rollback.join(', ')}`,
        );
        return {
          classification,
          verdict: 'block',
          reason:
            `R4 (${classification.autonomyMode}): ação proibida para execução autônoma. ` +
            `Requer intervenção humana. Rollback requerido: ${classification.rollback.join(', ')}.`,
        };
    }
  }
}
