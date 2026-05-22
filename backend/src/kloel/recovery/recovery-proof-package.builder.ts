/**
 * UTP-RECOVERY-008 — Recovery Proof Package Builder.
 *
 * Composes acknowledgment, explanation, recovery tactic, and non-repeat
 * commitment into a single owner-reviewable proof object. This is the
 * "Kloel errou, percebeu, explicou sem se defender, reparou, aprendeu
 * e nao repetiu" scene proof package.
 *
 * Pure function — produces a RecoveryProofPackage from a DetectedError
 * and optional guard status. Never sends messages, offers concessions
 * autonomously, or raises autonomy.
 */

import { randomUUID } from 'node:crypto';
import { buildAcknowledgment } from './error-acknowledgment.builder';
import { buildExplanation } from './error-explanation.builder';
import { proposeRecoveryTactic } from './error-damage-recovery.tactics';
import type {
  Acknowledgment,
  DetectedError,
  NonRepeatCommitment,
  RecoveryProofPackage,
} from './recovery.types';

export interface GuardStatus {
  readonly isBlocked: boolean;
  readonly blockedUntil: string | null;
}

interface NonRepeatTemplate {
  readonly learnedFrom: string;
  readonly preventiveChange: string;
  readonly commitmentStatement: string;
}

const NON_REPEAT_TEMPLATES: Readonly<Record<string, NonRepeatTemplate>> = {
  handoff: {
    learnedFrom:
      'o limiar de confianca para resposta automatica estava abaixo do ' +
      'necessario para este tipo de conversa',
    preventiveChange:
      'exigir evidencia mais forte antes de responder e usar fallback ' +
      'humano como rota padrao quando a confianca ficar abaixo do limiar',
    commitmentStatement:
      'Kloel nao respondera automaticamente a conversas com confianca ' +
      'abaixo do novo limiar. Transferira para humano em vez de arriscar ' +
      'resposta inadequada.',
  },
  decline: {
    learnedFrom:
      'pagamentos foram recusados por condicoes que o checkout nao ' +
      'antecipava',
    preventiveChange:
      'revisar o fluxo de pagamento com alternativas de metodo, orientacao ' +
      'pos-recusa e notificacao ao operador quando a taxa de recusa exceder limite',
    commitmentStatement:
      'Kloel nao insistira no mesmo metodo de pagamento apos recusa. ' +
      'Oferecera alternativas e notificara o operador.',
  },
  misclassification: {
    learnedFrom:
      'o classificador de leads produziu categorizacoes que eventos ' +
      'posteriores contradisseram',
    preventiveChange:
      'recalibrar classificacao com os contra-exemplos identificados e ' +
      'registrar regra de correcao para padroes conhecidos de ma classificacao',
    commitmentStatement:
      'Kloel nao tratara leads com a classificacao anterior quando ' +
      'houver evidencia de correcao. Reclassificara e notificara o ' +
      'operador.',
  },
  missed_opportunity: {
    learnedFrom:
      'a cadencia de follow-up nao foi suficiente para manter ' +
      'engajamento apos contato inicial',
    preventiveChange:
      'ajustar janela de follow-up por perfil de lead e alertar operador ' +
      'sobre silencio prolongado antes da perda',
    commitmentStatement:
      'Kloel nao abandonara leads apos primeiro contato sem follow-up. ' +
      'Mantera cadencia minima de acompanhamento e alertara operador ' +
      'sobre silencio prolongado.',
  },
  wrong_action: {
    learnedFrom:
      'uma acao automatica foi executada baseada em estado que mudou ' +
      'entre decisao e execucao',
    preventiveChange:
      'confirmar antes da execucao que o estado do lead ainda e compativel ' +
      'com a acao',
    commitmentStatement:
      'Kloel nao executara acoes automaticas sem verificar que o ' +
      'contexto ainda e valido. Se o estado mudou, abortara e notificara.',
  },
  double_send: {
    learnedFrom:
      'condicao de corrida ou retry sem idempotencia causou envio ' +
      'duplicado de mensagem',
    preventiveChange:
      'verificar idempotencia antes de cada envio e deduplicar por hash de ' +
      'conteudo e destinatario',
    commitmentStatement:
      'Kloel nao enviara a mesma mensagem mais de uma vez para o ' +
      'mesmo destinatario. Verificara idempotencia antes de cada envio.',
  },
  delay: {
    learnedFrom:
      'latencia acima do esperado afetou tempo de resposta ao lead',
    preventiveChange:
      'monitorar latencia com alerta de timeout e abortar para revisao humana ' +
      'quando a resposta exceder o limite',
    commitmentStatement:
      'Kloel nao deixara leads esperando alem do timeout configurado. ' +
      'Abortara e notificara operador se resposta exceder limite.',
  },
  inappropriate_timing: {
    learnedFrom:
      'acao foi executada em horario inadequado por falta de ' +
      'configuracao de janela de silencio',
    preventiveChange:
      'aplicar janela de silencio por fuso horario do lead antes de qualquer ' +
      'acao de contato',
    commitmentStatement:
      'Kloel nao contatara leads fora do horario comercial do fuso ' +
      'horario do lead. Respeitara janela de silencio configurada.',
  },
  unknown: {
    learnedFrom:
      'um padrao anomalo foi detectado que nao corresponde a categorias ' +
      'conhecidas',
    preventiveChange:
      'catalogar o padrao anomalo e expandir monitoramento para reconhecimento futuro',
    commitmentStatement:
      'Kloel nao ignorara padroes anomalos. Catalogara e expandira ' +
      'monitoramento para reconhece-los no futuro.',
  },
};

function nonRepeatTemplateFor(category: string): NonRepeatTemplate {
  return NON_REPEAT_TEMPLATES[category] ?? NON_REPEAT_TEMPLATES['unknown']!;
}

function buildNonRepeatCommitment(
  error: DetectedError,
  guardStatus?: GuardStatus,
): NonRepeatCommitment {
  const template = nonRepeatTemplateFor(error.category);
  return {
    learnedFrom: template.learnedFrom,
    preventiveChange: template.preventiveChange,
    commitmentStatement: template.commitmentStatement,
    guardActive: guardStatus?.isBlocked ?? false,
    repeatBlockedUntil: guardStatus?.blockedUntil ?? null,
  };
}

function resolveSafeNextStep(
  ack: Acknowledgment,
  tactic: RecoveryProofPackage['tactic'],
): string {
  if (tactic.safetyContract.riskClass === 'R3') {
    return tactic.safetyContract.safeNextStep;
  }
  return ack.safeNextStep;
}

/**
 * Build a recovery proof package that demonstrates Kloel:
 * - acknowledged the error without being defensive
 * - explained what happened in commercial language
 * - proposed a recovery tactic with safety contract
 * - committed to not repeating the error
 *
 * The proof is owner-reviewable and contains all information needed
 * to decide whether to approve the recovery action.
 *
 * This function NEVER sends messages, offers concessions autonomously,
 * or raises autonomy. Those fields are hardcoded to `false`.
 *
 * Input:  DetectedError, optional GuardStatus
 * Output: RecoveryProofPackage (composed proof object)
 */
export function buildRecoveryProofPackage(
  error: DetectedError,
  guardStatus?: GuardStatus,
): RecoveryProofPackage {
  const acknowledgment = buildAcknowledgment(error);
  const explanation = buildExplanation(error);
  const tactic = proposeRecoveryTactic(error);
  const nonRepeatCommitment = buildNonRepeatCommitment(error, guardStatus);

  return {
    proofId: `prf_${randomUUID()}`,
    errorId: error.errorId,
    workspaceId: error.workspaceId,
    generatedAt: new Date().toISOString(),
    acknowledgment,
    explanation,
    tactic,
    nonRepeatCommitment,
    whatKloelKnows: acknowledgment.whatKloelKnows,
    whatKloelDoesNotKnow: acknowledgment.whatKloelDoesNotKnow,
    safeNextStep: resolveSafeNextStep(acknowledgment, tactic),
    repairStance: acknowledgment.repairStance,
    riskClass: tactic.safetyContract.riskClass,
    delegationMode: tactic.safetyContract.delegationMode,
    rollback: tactic.safetyContract.rollback,
    autonomyRaised: false,
    messageSent: false,
    concessionOffered: false,
  };
}
