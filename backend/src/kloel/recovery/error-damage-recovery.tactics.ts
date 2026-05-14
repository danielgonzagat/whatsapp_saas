/**
 * UTP-RECOVERY-005 — Error Damage Recovery Tactics.
 *
 * Proposes a recovery action (small concession, expedited handling,
 * discount offer, etc.) based on error category, severity,
 * and available remediation options.
 *
 * Pure function — takes a DetectedError and returns a RecoveryTactic.
 */

import { randomUUID } from 'node:crypto';
import type { DetectedError, RecoveryAction, RecoveryTactic } from './recovery.types';

interface TacticTemplate {
  readonly action: RecoveryAction;
  readonly description: string;
  readonly estimatedCostCents: number;
}

const TACTICS: Readonly<Record<string, readonly TacticTemplate[]>> = {
  handoff: [
    {
      action: 'expedited_handling',
      description: 'Priorizar a conversa transferida para resposta humana em até 1h.',
      estimatedCostCents: 0,
    },
    {
      action: 'follow_up_personal',
      description: 'Enviar follow-up personalizado explicando a transferência e o próximo passo.',
      estimatedCostCents: 0,
    },
    {
      action: 'apologize',
      description: 'Incluir pedido de desculpas na próxima mensagem automática da conversa.',
      estimatedCostCents: 0,
    },
  ],
  decline: [
    {
      action: 'follow_up_personal',
      description: 'Enviar mensagem de acompanhamento com alternativas de pagamento.',
      estimatedCostCents: 0,
    },
    {
      action: 'small_concession',
      description: 'Oferecer condição especial para concluir a compra (ex: frete grátis).',
      estimatedCostCents: 15_00,
    },
    {
      action: 'manual_review',
      description: 'Encaminhar para revisão manual da transação recusada.',
      estimatedCostCents: 0,
    },
  ],
  misclassification: [
    {
      action: 'silence',
      description: 'Nenhuma ação visível — a correção já foi aplicada pelo sistema.',
      estimatedCostCents: 0,
    },
    {
      action: 'priority_review',
      description: 'Sinalizar lead reclassificado para atenção prioritária.',
      estimatedCostCents: 0,
    },
  ],
  missed_opportunity: [
    {
      action: 'follow_up_personal',
      description: 'Reativar contato com lead silencioso usando nova abordagem.',
      estimatedCostCents: 0,
    },
    {
      action: 'discount_offer',
      description: 'Oferecer desconto de reengajamento para leads perdidos recentes.',
      estimatedCostCents: 25_00,
    },
    {
      action: 'free_extension',
      description: 'Oferecer extensão gratuita de trial para leads que ficaram silenciosos.',
      estimatedCostCents: 0,
    },
  ],
  wrong_action: [
    {
      action: 'apologize',
      description: 'Enviar correção com pedido de desculpas contextual.',
      estimatedCostCents: 0,
    },
    {
      action: 'small_concession',
      description: 'Oferecer pequena compensação pelo erro (ex: crédito simbólico).',
      estimatedCostCents: 10_00,
    },
  ],
  double_send: [
    {
      action: 'apologize',
      description: 'Enviar mensagem reconhecendo a duplicação.',
      estimatedCostCents: 0,
    },
    {
      action: 'silence',
      description: 'Não chamar mais atenção para o erro se foi imperceptível.',
      estimatedCostCents: 0,
    },
  ],
  delayed: [
    {
      action: 'expedited_handling',
      description: 'Processar com prioridade máxima a resposta pendente.',
      estimatedCostCents: 0,
    },
  ],
  inappropriate_timing: [
    {
      action: 'silence',
      description: 'Não repetir o contato e ajustar configuração de janela de silêncio.',
      estimatedCostCents: 0,
    },
  ],
  unknown: [
    {
      action: 'manual_review',
      description: 'Encaminhar para investigação manual.',
      estimatedCostCents: 0,
    },
  ],
};

function selectTactic(
  error: DetectedError,
): TacticTemplate {
  const options = TACTICS[error.category] ?? TACTICS['unknown']!;
  if (error.severity === 'high') {
    return options[0] ?? { action: 'manual_review', description: 'Revisão manual necessária.', estimatedCostCents: 0 };
  }
  if (error.severity === 'medium' && options.length > 1) {
    return options[1] ?? options[0]!;
  }
  return options[options.length - 1] ?? options[0]!;
}

/**
 * Propose a recovery action based on error category and severity.
 *
 * Input: DetectedError
 * Output: RecoveryTactic (action, description, estimated cost)
 */
export function proposeRecoveryTactic(error: DetectedError): RecoveryTactic {
  const tactic = selectTactic(error);
  return {
    tacticId: `tac_${randomUUID()}`,
    errorId: error.errorId,
    action: tactic.action,
    description: tactic.description,
    estimatedCostCents: tactic.estimatedCostCents,
    generatedAt: new Date().toISOString(),
  };
}
