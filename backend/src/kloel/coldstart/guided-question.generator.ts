/**
 * UTP-COLDSTART-004 — Guided Question Generator.
 *
 * Converts a hypothesis template into a concrete question for the
 * workspace owner. The question is designed to extract a decision or
 * observation that narrows the hypothesis space.
 *
 * Pure function. Stateless.
 */
import { randomUUID } from 'node:crypto';
import type { HypothesisTemplate } from './coldstart.types';
import type { GuidedQuestion } from './coldstart.types';

export interface GenerateQuestionInput {
  readonly template: HypothesisTemplate;
  readonly workspaceId: string;
  readonly nowMs?: number | undefined;
}

export function generateGuidedQuestion(input: GenerateQuestionInput): GuidedQuestion {
  const now = new Date(input.nowMs ?? Date.now()).toISOString();
  const questionId = `q_${randomUUID()}`;
  const { template } = input;

  const question = buildQuestionText(template);
  const expectedAnswerKind = expectedKindForCategory(template.category);
  const context = `Com base na hipotese "${template.label}": ${template.description}`;

  return {
    questionId,
    workspaceId: input.workspaceId,
    templateId: template.templateId,
    question,
    context,
    expectedAnswerKind,
    options: expectedAnswerKind === 'single_choice' ? ['sim', 'nao', 'talvez'] : undefined,
    generatedAt: now,
  };
}

function buildQuestionText(template: HypothesisTemplate): string {
  const questions: Record<string, string> = {
    h_tmpl_audience_01:
      'Quem sao as 3 ultimas pessoas que compraram de voce? Descreva idade, profissao e o que elas falaram antes de comprar.',
    h_tmpl_audience_02:
      'De onde vieram seus ultimos 10 leads? Qual canal trouxe mais clientes que fecharam?',
    h_tmpl_offer_01:
      'Se um lead perguntasse "por que devo comprar agora?", o que voce responderia em 1 frase?',
    h_tmpl_offer_02:
      'Qual bonus ou garantia voce poderia adicionar hoje que nao te custa nada, mas aumenta o valor percebido?',
    h_tmpl_objection_01: 'Qual a objecao mais comum que voce ouve? O que o lead diz exatamente?',
    h_tmpl_objection_02:
      'Voce tem 2 clientes que podem dar depoimento? O que eles diriam sobre o resultado que tiveram?',
    h_tmpl_channel_01:
      'Quanto voce gastou para adquirir clientes no ultimo mes? Sabe o custo por lead em cada canal?',
    h_tmpl_channel_02:
      'Seus leads respondem mais rapido por WhatsApp ou por email? Voce ja testou?',
    h_tmpl_pricing_01:
      'Se voce aumentasse seu preco em 30%, quantos clientes ainda comprariam? Por que?',
    h_tmpl_pricing_02:
      'Qual formato de pagamento seus clientes preferem: a vista, parcelado ou recorrente?',
    h_tmpl_messaging_01:
      'Qual a primeira mensagem que voce envia para um lead novo? Copie e cole exatamente.',
    h_tmpl_messaging_02:
      'Em qual horario voce costuma responder leads? Sabe qual horario gera mais resposta?',
  };

  return (
    questions[template.templateId] ??
    `Considerando a hipotese "${template.label}", qual informacao voce tem hoje que pode confirmar ou refutar isso?`
  );
}

function expectedKindForCategory(category: string): GuidedQuestion['expectedAnswerKind'] {
  switch (category) {
    case 'audience':
    case 'channel':
      return 'single_choice';
    case 'pricing':
      return 'scale';
    case 'objection':
    case 'messaging':
      return 'free_text';
    case 'offer':
      return 'yes_no';
    default:
      return 'free_text';
  }
}
