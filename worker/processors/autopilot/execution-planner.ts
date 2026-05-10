import { AIProvider } from '../../providers/ai-provider';
import { detectAndFixAntiPatterns } from '../cia/conversation-policy';
import {
  log,
  type UnknownRecord,
} from './shared';
import { generatePitchSafe } from './cognition';

export async function buildMessage(action: string, content: string, settings: UnknownRecord) {
  const defaults: Record<string, string[]> = {
    SEND_PRICE: [
      'Posso te passar os valores de forma direta e te dizer qual faz mais sentido.',
      'Eu te explico o valor sem enrolacao e ja te digo a opcao mais coerente.',
    ],
    FOLLOW_UP: [
      'Fiquei com a sua conversa em aberto por aqui. Se ainda fizer sentido, eu continuo daqui.',
      'Voltei na sua conversa porque tem um proximo passo que pode te poupar tempo.',
    ],
    FOLLOW_UP_STRONG: [
      'Se ainda fizer sentido seguir, eu consigo te mostrar o caminho mais simples agora.',
      'Se a decisao ainda estiver em aberto, eu consigo resumir o que realmente importa agora.',
    ],
    GHOST_CLOSER: [
      'Sua conversa ficou perto de avancar. Se ainda fizer sentido, eu pego exatamente de onde parou.',
      'Ficou um ponto em aberto aqui que pode mudar sua decisao. Se quiser, eu te mostro.',
    ],
    LEAD_UNLOCKER: [
      'Tem um detalhe nisso que costuma destravar a decisao. Se quiser, eu te conto.',
      'Fiquei pensando na sua situacao porque existe um ponto que quase sempre muda a perspectiva.',
    ],
    SEND_CALENDAR: ['Te mando meu link de agenda e a gente resolve isso sem enrolacao.'],
    QUALIFY: [
      'Pra eu te orientar direito, o que voce quer resolver primeiro?',
      'Antes de te indicar algo, me diz qual parte e mais importante agora.',
    ],
    TRANSFER_AGENT: [
      'Vou trazer um especialista humano para assumir daqui com contexto do que voce ja contou.',
    ],
    ANTI_CHURN: [
      'Antes de qualquer ajuste, quero entender o que nao encaixou como deveria.',
      'Quero te ajudar a fazer isso funcionar de verdade. O que mais te incomodou?',
    ],
    HANDLE_OBJECTION: [
      'Faz sentido ter essa preocupacao. Se quiser, eu te mostro por outro angulo sem forcar nada.',
      'Sua ressalva e valida. Posso te explicar o ponto principal de forma direta?',
    ],
  };
  const customTpl = (settings?.autopilot?.templates || {}) as Record<string, string>;
  const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;

  const actionDirective: Record<string, string> = {
    SEND_PRICE:
      'O contato quer clareza de preco ou formato. Seja direta, contextualize valor e use no maximo uma pergunta.',
    FOLLOW_UP: 'Retome com leveza e valor. Nao cobre ausencia.',
    FOLLOW_UP_STRONG: 'Retome com mais iniciativa, mas sem pressao barata.',
    GHOST_CLOSER: 'Reabra a conversa usando contexto e curiosidade, sem parecer script.',
    LEAD_UNLOCKER: 'Destrave a conversa com um insight curto ou open loop.',
    SEND_CALENDAR: 'Convide para agenda de forma simples e humana.',
    QUALIFY: 'Descubra a necessidade com pergunta aberta curta.',
    TRANSFER_AGENT: 'Transfira para humano com acolhimento.',
    ANTI_CHURN: 'Priorize escuta, validacao e reducao de friccao. Nao venda.',
    HANDLE_OBJECTION: 'Valide a preocupacao antes de reframe.',
  };

  if (apiKey && action !== 'SEND_OFFER' && action !== 'SEND_AUDIO') {
    try {
      const ai = new AIProvider(apiKey);
      const systemPrompt = [
        'Voce escreve mensagens comerciais para WhatsApp.',
        'Soe humana, breve, viva e consultiva.',
        'Nao finja ser humana. Se perguntarem, diga que e a assistente virtual da empresa.',
        'Nao use listas.',
        'Nao use emoji por padrao.',
        'Nao use mais de uma pergunta.',
        'Nao use frases de vendedor-script.',
      ].join('\n');
      const response = await ai.generateResponse(
        systemPrompt,
        [
          `ACAO: ${actionDirective[action] || 'Responda com utilidade e contexto.'}`,
          `ULTIMO CONTEXTO: ${String(content || '').trim() || 'sem contexto adicional'}`,
          'Escreva uma unica mensagem pronta para WhatsApp.',
        ].join('\n\n'),
        'writer',
      );
      const cleaned = detectAndFixAntiPatterns(String(response || '').trim());
      if (cleaned) {
        return cleaned;
      }
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      log.warn('build_message_ai_failed', {
        action,
        error: errorInstanceofError?.message || 'unknown_error',
      });
    }
  }

  switch (action) {
    case 'SEND_OFFER':
      return await generatePitchSafe(content, settings);
    case 'SEND_PRICE':
      return customTpl.SEND_PRICE || defaults.SEND_PRICE[0];
    case 'SEND_CALENDAR':
      return customTpl.SEND_CALENDAR || defaults.SEND_CALENDAR[0];
    case 'QUALIFY':
      return customTpl.QUALIFY || defaults.QUALIFY[0];
    case 'FOLLOW_UP':
      return customTpl.FOLLOW_UP || defaults.FOLLOW_UP[0];
    case 'FOLLOW_UP_STRONG':
      return customTpl.FOLLOW_UP_STRONG || defaults.FOLLOW_UP_STRONG[0];
    case 'GHOST_CLOSER':
      return customTpl.GHOST_CLOSER || defaults.GHOST_CLOSER[0];
    case 'LEAD_UNLOCKER':
      return customTpl.LEAD_UNLOCKER || defaults.LEAD_UNLOCKER[0];
    case 'TRANSFER_AGENT':
      return customTpl.TRANSFER_AGENT || defaults.TRANSFER_AGENT[0];
    case 'ANTI_CHURN':
      return customTpl.ANTI_CHURN || defaults.ANTI_CHURN[0];
    case 'HANDLE_OBJECTION':
      return customTpl.HANDLE_OBJECTION || defaults.HANDLE_OBJECTION[0];
    case 'SEND_AUDIO':
      return content || customTpl.FOLLOW_UP || defaults.FOLLOW_UP[0];
    default:
      return null;
  }
}
