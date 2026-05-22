import { block, pass } from '../kloel-rule-builders';
import type { RuleDefinition, RuleVerdict } from '../kloel-rules.types';

/**
 * Nome: unsupported_audio
 * Motivacao: canal que nao suporta audio nao recebe audio nativo.
 * Autor: Kloel
 * Data: 2026-05-09
 * Versao: 1
 * Propriedades: formato suportado pelo canal; trace completo de decisao.
 */
export const UNSUPPORTED_AUDIO_RULE: RuleDefinition = {
  id: 'unsupported_audio',
  category: 'limits',
  description: 'Bloqueia envio de áudio quando o canal não suporta.',
  evaluate(ctx): RuleVerdict {
    if (ctx.action.includes('audio') && ctx.supportsAudio === false) {
      return block('unsupported_audio', 'limits', 'Canal não suporta áudio nativo.');
    }
    return pass('unsupported_audio', 'limits');
  },
};
