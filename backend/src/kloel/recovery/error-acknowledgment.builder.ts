/**
 * UTP-RECOVERY-002 — Error Acknowledgment Builder.
 *
 * Generates a non-defensive acknowledgment message for a detected error.
 * The message owns the error factually without excuses, following B0.2
 * (error converts trust) and B15 (no anthropomorphism).
 *
 * Pure function — takes a DetectedError and produces an Acknowledgment.
 */

import type { Acknowledgment, DetectedError } from './recovery.types';

const ACKNOWLEDGMENT_TEMPLATES: Readonly<Record<string, string>> = {
  handoff:
    'Uma conversa foi transferida para atendimento humano. O sistema ' +
    'não conseguiu resolver automaticamente. Isso foi registrado para ' +
    'análise e melhoria contínua.',
  decline:
    'Um pagamento foi recusado durante o processo de checkout. ' +
    'Possíveis causas incluem restrições do emissor ou configuração ' +
    'de pagamento. O incidente foi registrado.',
  misclassification:
    'Uma classificação automática de lead foi posteriormente ' +
    'corrigida. O modelo de classificação está sendo avaliado para ' +
    'reduzir divergências futuras.',
  missed_opportunity:
    'Leads ficaram sem resposta ou foram perdidos após contato ' +
    'inicial. O padrão foi identificado e registrado para ajuste ' +
    'de follow-up.',
  wrong_action:
    'Uma ação automática produziu resultado diferente do esperado. ' +
    'O desvio foi identificado e registrado para correção.',
  double_send:
    'Uma mensagem foi enviada mais de uma vez para o mesmo ' +
    'destinatário. O incidente foi registrado para prevenção futura.',
  delayed:
    'Uma resposta demorou mais que o esperado. O atraso foi ' +
    'registrado para diagnóstico de performance.',
  inappropriate_timing:
    'Uma ação automática foi executada em momento inadequado. O ' +
    'padrão de timing foi registrado para calibração.',
  unknown:
    'Um desvio operacional foi detectado e registrado para ' +
    'investigação. Nenhum impacto permanente é esperado.',
};

function templateFor(category: string): string {
  return ACKNOWLEDGMENT_TEMPLATES[category] ?? ACKNOWLEDGMENT_TEMPLATES['unknown']!;
}

function channelFor(category: string): Acknowledgment['channel'] {
  switch (category) {
    case 'handoff':
    case 'decline':
      return 'whatsapp';
    case 'misclassification':
    case 'missed_opportunity':
      return 'dashboard';
    case 'wrong_action':
      return 'email';
    default:
      return 'silent';
  }
}

/**
 * Build a non-defensive acknowledgment for a detected error.
 *
 * Input: DetectedError
 * Output: Acknowledgment (message, channel, timestamp)
 */
export function buildAcknowledgment(error: DetectedError): Acknowledgment {
  const template = templateFor(error.category);
  return {
    errorId: error.errorId,
    message: template,
    channel: channelFor(error.category),
    generatedAt: new Date().toISOString(),
  };
}
