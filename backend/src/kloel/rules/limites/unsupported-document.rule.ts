import { block, pass } from '../kloel-rule-builders';
import type { RuleDefinition, RuleVerdict } from '../kloel-rules.types';

/**
 * Nome: unsupported_document
 * Motivacao: canal que nao suporta documento nao recebe arquivo nativo.
 * Autor: Kloel
 * Data: 2026-05-09
 * Versao: 1
 * Propriedades: formato suportado pelo canal; trace completo de decisao.
 */
export const UNSUPPORTED_DOCUMENT_RULE: RuleDefinition = {
  id: 'unsupported_document',
  category: 'limits',
  description: 'Bloqueia envio de documento quando o canal não suporta.',
  evaluate(ctx): RuleVerdict {
    if (ctx.action.includes('document') && ctx.supportsDocument === false) {
      return block('unsupported_document', 'limits', 'Canal não suporta documento.');
    }
    return pass('unsupported_document', 'limits');
  },
};
