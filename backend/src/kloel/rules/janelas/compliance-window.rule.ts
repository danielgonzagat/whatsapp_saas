import { block, pass } from '../kloel-rule-builders';
import type { RuleDefinition, RuleVerdict } from '../kloel-rules.types';

/**
 * Nome: compliance_window
 * Motivacao: canais com janela de atendimento exigem template aprovado fora do prazo.
 * Autor: Kloel
 * Data: 2026-05-09
 * Versao: 1
 * Propriedades: janela de compliance; trace completo de decisao.
 */
export const COMPLIANCE_WINDOW_RULE: RuleDefinition = {
  id: 'compliance_window',
  category: 'compliance_window',
  description: 'Bloqueia envio fora da janela de compliance quando não há template aprovado.',
  evaluate(ctx): RuleVerdict {
    if (ctx.withinComplianceWindow === false && !ctx.templateApproved) {
      return block(
        'compliance_window',
        'compliance_window',
        'Mensagem fora da janela do canal exige template aprovado.',
      );
    }
    return pass('compliance_window', 'compliance_window');
  },
};
