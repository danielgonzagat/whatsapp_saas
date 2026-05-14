/**
 * UTP-RECOVERY-003 — Error Explanation Builder.
 *
 * Generates a commercial-language explanation of what went wrong,
 * suitable for delivery to the business owner or operator.
 * Avoids technical jargon and anthropomorphism (B15).
 *
 * Pure function — takes a DetectedError and produces an ErrorExplanation.
 */

import type { DetectedError, ErrorExplanation } from './recovery.types';

const EXPLANATIONS: Readonly<
  Record<string, { readonly whatHappened: string; readonly why: string }>
> = {
  handoff: {
    whatHappened:
      'O sistema transferiu uma ou mais conversas para atendimento ' +
      'humano por não atingir o nível de confiança necessário para ' +
      'responder automaticamente.',
    why: 'O limite de confiança configurado para resposta automática não ' +
      'foi atingido. Isso pode ocorrer quando a mensagem contém ' +
      'perguntas complexas, objeções não catalogadas ou contexto ' +
      'insuficiente para decisão.',
  },
  decline: {
    whatHappened:
      'Um ou mais pagamentos foram recusados durante o processamento.',
    why: 'Pagamentos podem ser recusados por restrições do emissor do ' +
      'cartão, saldo insuficiente, ou configuração de pagamento ' +
      'incompleta. O sistema detectou e registrou cada ocorrência.',
  },
  misclassification: {
    whatHappened:
      'Leads foram classificados de forma que posteriormente exigiu ' +
      'correção.',
    why: 'Modelos de classificação operam com probabilidades. Quando ' +
      'eventos subsequentes contradizem a classificação original, ' +
      'o sistema registra a divergência para recalibração do modelo.',
  },
  missed_opportunity: {
    whatHappened:
      'Leads que haviam sido contatados ficaram sem resposta ou foram ' +
      'perdidos.',
    why: 'A janela de follow-up pode ter sido insuficiente, o timing da ' +
      'mensagem inadequado, ou o lead perdeu interesse. O sistema ' +
      'detectou o padrão para ajuste de cadência.',
  },
  wrong_action: {
    whatHappened:
      'Uma ação automática produziu resultado divergente do esperado.',
    why: 'A decisão automática foi baseada em estado que mudou entre a ' +
      'decisão e a execução, ou o modelo interpretou incorretamente ' +
      'o contexto.',
  },
  double_send: {
    whatHappened:
      'Uma mesma mensagem foi enviada mais de uma vez ao mesmo ' +
      'destinatário.',
    why: 'Condição de corrida entre processos paralelos ou retry sem ' +
      'verificação de idempotência. O sistema detectou a duplicação.',
  },
  delayed: {
    whatHappened:
      'Uma resposta automática levou mais tempo que o esperado.',
    why: 'Alta carga no provedor de IA, timeout de rede, ou fila de ' +
      'processamento acima da capacidade.',
  },
  inappropriate_timing: {
    whatHappened:
      'Uma ação automática foi executada em horário inadequado.',
    why: 'O detector de timing não bloqueou a ação por ausência de ' +
      'configuração de janela de silêncio ou por falha no cálculo ' +
      'de fuso horário.',
  },
  unknown: {
    whatHappened: 'Um desvio operacional foi detectado.',
    why: 'O sistema identificou um padrão anômalo que não corresponde a ' +
      'nenhuma categoria conhecida. Investigação adicional é ' +
      'necessária.',
  },
};

function explanationFor(
  category: string,
): { readonly whatHappened: string; readonly why: string } {
  return EXPLANATIONS[category] ?? EXPLANATIONS['unknown']!;
}

function summaryFor(error: DetectedError): string {
  const severityLabel =
    error.severity === 'high'
      ? 'Alto impacto'
      : error.severity === 'medium'
        ? 'Moderado'
        : 'Baixo impacto';
  return `${severityLabel}: ${error.description}`;
}

/**
 * Build a commercial-language explanation of an error.
 *
 * Input: DetectedError
 * Output: ErrorExplanation (summary, whatHappened, why, timestamp)
 */
export function buildExplanation(error: DetectedError): ErrorExplanation {
  const { whatHappened, why } = explanationFor(error.category);
  return {
    errorId: error.errorId,
    summary: summaryFor(error),
    whatHappened,
    why,
    generatedAt: new Date().toISOString(),
  };
}
