import { describe, it, expect } from 'vitest';
import type { CustomerCognitiveState } from '../processors/cia/cognitive-state';
import {
  buildActionDirective,
  buildDeepeningQuestion,
  buildOpenLoopOpportunity,
  buildPersuasionDirective,
  buildStageDirective,
  countWords,
  detectComplaint,
  detectPersonalDetailShared,
  includesAny,
  inferEmotionalTone,
  inferNeed,
  isValidationTone,
  needsValidation,
  normalizeText,
} from '../processors/cia/conversation-policy.helpers';

const buildCognitiveState = (
  overrides: Partial<CustomerCognitiveState> = {},
): CustomerCognitiveState =>
  ({
    stage: 'COLD',
    trustScore: 0.5,
    urgencyScore: 0.3,
    objections: [],
    ...overrides,
  }) as CustomerCognitiveState;

describe('normalizeText', () => {
  it('lowercases the input and removes diacritics', () => {
    expect(normalizeText('Olá MÁRIO')).toBe('ola mario');
  });

  it('treats null and undefined as the empty string', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });

  it('coerces numeric inputs to string before normalizing', () => {
    expect(normalizeText(42 as unknown as string)).toBe('42');
  });

  it('decomposes Portuguese characters consistently', () => {
    expect(normalizeText('coração ação')).toBe('coracao acao');
  });
});

describe('inferEmotionalTone', () => {
  it('returns "anxious" when anxiety markers are present', () => {
    expect(inferEmotionalTone('estou ansiosa com isso')).toBe('anxious');
  });

  it('returns "frustrated" for frustration markers', () => {
    expect(inferEmotionalTone('estou frustrado com o erro')).toBe('frustrated');
  });

  it('returns "excited" when excitement words appear', () => {
    expect(inferEmotionalTone('amei a proposta')).toBe('excited');
  });

  it('returns "positive" for gratitude markers', () => {
    expect(inferEmotionalTone('valeu pela ajuda')).toBe('positive');
  });

  it('returns "negative" when the negation marker matches', () => {
    expect(inferEmotionalTone('caro demais')).toBe('negative');
  });

  it('returns "neutral" when no rule matches', () => {
    expect(inferEmotionalTone('o gato dorme na cama')).toBe('neutral');
  });

  it('honours rule priority — anxious before frustrated when both match', () => {
    expect(inferEmotionalTone('estou ansiosa e frustrada com o erro')).toBe('anxious');
  });
});

describe('buildStageDirective', () => {
  it('emits the COLD directive', () => {
    const out = buildStageDirective('COLD', 0.5, 0.5);
    expect(out).toContain('ESTAGIO: FRIO');
  });

  it('emits the HOT directive with rounded trust and urgency percentages', () => {
    const out = buildStageDirective('HOT', 0.876, 0.123);
    expect(out).toContain('ESTAGIO: QUENTE');
    expect(out).toContain('Confianca: 88%');
    expect(out).toContain('Urgencia: 12%');
  });

  it('emits the CHECKOUT directive', () => {
    expect(buildStageDirective('CHECKOUT', 0, 0)).toContain('ESTAGIO: CHECKOUT');
  });

  it('emits the POST_SALE directive', () => {
    expect(buildStageDirective('POST_SALE', 0, 0)).toContain('ESTAGIO: POS-VENDA');
  });

  it('emits the SUPPORT directive', () => {
    expect(buildStageDirective('SUPPORT', 0, 0)).toContain('ESTAGIO: SUPORTE');
  });

  it('emits the WARM directive', () => {
    expect(buildStageDirective('WARM', 0, 0)).toContain('ESTAGIO: AQUECIDO');
  });

  it('falls back to "INDEFINIDO" for unknown stages', () => {
    expect(buildStageDirective('UNKNOWN' as never, 0, 0)).toContain('ESTAGIO: INDEFINIDO');
  });
});

describe('buildPersuasionDirective', () => {
  it('returns the default block when state is missing', () => {
    const out = buildPersuasionDirective(null);
    expect(out).toContain('Entregue valor antes de pedir algo');
    expect(out).not.toContain('PROVA SOCIAL');
  });

  it('appends PROVA SOCIAL when trust is below 0.6', () => {
    const out = buildPersuasionDirective(buildCognitiveState({ trustScore: 0.3 }));
    expect(out).toContain('PROVA SOCIAL');
  });

  it('appends PROVA SOCIAL when the "trust" objection is present', () => {
    const out = buildPersuasionDirective(
      buildCognitiveState({ trustScore: 0.9, objections: ['trust'] }),
    );
    expect(out).toContain('PROVA SOCIAL');
  });

  it('appends VALOR when the "price" objection is present', () => {
    const out = buildPersuasionDirective(
      buildCognitiveState({ trustScore: 0.9, objections: ['price'] }),
    );
    expect(out).toContain('VALOR: responda preco');
  });

  it('appends COMPROMISSO when the stage is HOT or CHECKOUT', () => {
    expect(
      buildPersuasionDirective(buildCognitiveState({ stage: 'HOT', trustScore: 0.9 })),
    ).toContain('COMPROMISSO');
    expect(
      buildPersuasionDirective(buildCognitiveState({ stage: 'CHECKOUT', trustScore: 0.9 })),
    ).toContain('COMPROMISSO');
  });

  it('omits COMPROMISSO for cold/warm stages', () => {
    expect(
      buildPersuasionDirective(buildCognitiveState({ stage: 'COLD', trustScore: 0.9 })),
    ).not.toContain('COMPROMISSO');
  });
});

describe('buildActionDirective', () => {
  it('returns the matching base directive when only an action is provided', () => {
    expect(buildActionDirective('RESPOND')).toContain('Responda primeiro o que o cliente');
  });

  it('falls back to the generic line for unknown actions', () => {
    expect(buildActionDirective('NOPE')).toBe('Responda de forma humana, util e progressiva.');
  });

  it('falls back to the generic line for missing action', () => {
    expect(buildActionDirective(null)).toBe('Responda de forma humana, util e progressiva.');
  });

  it('appends a known tactic hint when both action and tactic are provided', () => {
    const out = buildActionDirective('RESPOND', 'EMPATHETIC_ECHO');
    expect(out).toContain('TATICA: Valide explicitamente a emocao');
  });

  it('echoes unknown tactic labels verbatim', () => {
    const out = buildActionDirective('RESPOND', 'CUSTOM_TACTIC');
    expect(out).toContain('TATICA: CUSTOM_TACTIC');
  });
});

describe('isValidationTone / needsValidation', () => {
  it('marks frustrated/anxious/confused as validation tones', () => {
    expect(isValidationTone('frustrated')).toBe(true);
    expect(isValidationTone('anxious')).toBe(true);
    expect(isValidationTone('confused')).toBe(true);
  });

  it('marks neutral/positive/excited/negative as non-validation tones', () => {
    expect(isValidationTone('neutral')).toBe(false);
    expect(isValidationTone('positive')).toBe(false);
    expect(isValidationTone('excited')).toBe(false);
    expect(isValidationTone('negative')).toBe(false);
  });

  it('flags validation when a complaint is detected', () => {
    expect(needsValidation(true, 4, 'neutral')).toBe(true);
  });

  it('flags validation when the word count exceeds 18', () => {
    expect(needsValidation(false, 19, 'neutral')).toBe(true);
    expect(needsValidation(false, 18, 'neutral')).toBe(false);
  });

  it('flags validation when the tone is a validation tone', () => {
    expect(needsValidation(false, 4, 'anxious')).toBe(true);
  });

  it('returns false when none of the triggers fire', () => {
    expect(needsValidation(false, 4, 'neutral')).toBe(false);
  });
});

describe('includesAny', () => {
  it('returns true when every term is a substring', () => {
    expect(includesAny('preco do produto', ['preco', 'valor'])).toBe(true);
  });

  it('returns false when no term matches', () => {
    expect(includesAny('texto neutro', ['preco', 'valor'])).toBe(false);
  });

  it('returns false for empty term list', () => {
    expect(includesAny('texto', [])).toBe(false);
  });
});

describe('inferNeed', () => {
  it('returns "seguranca sobre investimento" for price markers', () => {
    expect(inferNeed('qual e o preco final?', false)).toBe('seguranca sobre investimento');
  });

  it('returns "agilidade" for urgency markers', () => {
    expect(inferNeed('preciso urgente hoje', false)).toBe('agilidade');
  });

  it('returns "confianca" for result/guarantee markers', () => {
    expect(inferNeed('isso funciona mesmo?', false)).toBe('confianca');
  });

  it('returns "ser compreendido" when personal detail is shared', () => {
    expect(inferNeed('texto neutro', true)).toBe('ser compreendido');
  });

  it('returns null when no inference is possible', () => {
    expect(inferNeed('texto neutro', false)).toBeNull();
  });

  it('prefers the price bucket over personal-detail fallback', () => {
    expect(inferNeed('o preco esta alto', true)).toBe('seguranca sobre investimento');
  });
});

describe('buildDeepeningQuestion', () => {
  it('returns the tone-mapped question for frustrated tone', () => {
    expect(buildDeepeningQuestion('frustrated', null, false)).toBe(
      'O que mais te trava nisso hoje?',
    );
  });

  it('returns the tone-mapped question for anxious tone', () => {
    expect(buildDeepeningQuestion('anxious', null, false)).toBe(
      'Qual parte te deixa mais inseguro agora?',
    );
  });

  it('returns the agilidade-mapped fallback when the need is "agilidade"', () => {
    expect(buildDeepeningQuestion('neutral', 'agilidade', false)).toBe(
      'O que voce precisa resolver primeiro?',
    );
  });

  it('returns the personal-detail fallback when only personal detail is shared', () => {
    expect(buildDeepeningQuestion('neutral', null, true)).toBe(
      'Quando isso acontece, o que pesa mais no seu dia a dia?',
    );
  });

  it('returns null when nothing matches', () => {
    expect(buildDeepeningQuestion('neutral', null, false)).toBeNull();
  });

  it('prefers the tone match over the agilidade fallback', () => {
    expect(buildDeepeningQuestion('anxious', 'agilidade', true)).toBe(
      'Qual parte te deixa mais inseguro agora?',
    );
  });
});

describe('buildOpenLoopOpportunity', () => {
  it('uses the topic nudge when topic markers are present', () => {
    expect(buildOpenLoopOpportunity('preco do produto', 'Ana')).toBe(
      'Tem um detalhe nisso que costuma mudar a decisao.',
    );
  });

  it('uses the first-name personalized nudge when no topic match', () => {
    expect(buildOpenLoopOpportunity('texto neutro', 'Ana Paula')).toBe(
      'Ana, tem um ponto aqui que quase sempre passa despercebido.',
    );
  });

  it('falls back to the anonymous nudge when no name is provided', () => {
    expect(buildOpenLoopOpportunity('texto neutro', null)).toBe(
      'Tem um ponto aqui que quase sempre passa despercebido.',
    );
  });

  it('handles undefined contactName the same as null', () => {
    expect(buildOpenLoopOpportunity('texto neutro', undefined)).toBe(
      'Tem um ponto aqui que quase sempre passa despercebido.',
    );
  });
});

describe('countWords', () => {
  it('counts whitespace-separated tokens', () => {
    expect(countWords('um dois tres quatro')).toBe(4);
  });

  it('ignores leading/trailing whitespace', () => {
    expect(countWords('   um dois   ')).toBe(2);
  });

  it('returns zero for the empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('returns zero for whitespace-only input', () => {
    expect(countWords('   ')).toBe(0);
  });
});

describe('detectPersonalDetailShared', () => {
  it('returns true when personal marker is present and message is long enough', () => {
    const normalized = 'minha rotina aqui na empresa esta puxada toda semana';
    expect(detectPersonalDetailShared(normalized, 9)).toBe(true);
  });

  it('returns false when the marker is present but message is shorter than 8 words', () => {
    expect(detectPersonalDetailShared('minha rotina', 2)).toBe(false);
  });

  it('returns false when no personal marker matches', () => {
    expect(detectPersonalDetailShared('um texto qualquer sem marcadores', 5)).toBe(false);
  });
});

describe('detectComplaint', () => {
  it('returns true for complaint markers', () => {
    expect(detectComplaint('o sistema deu erro aqui')).toBe(true);
    expect(detectComplaint('isso nao funciona')).toBe(true);
    expect(detectComplaint('estou frustrado')).toBe(true);
  });

  it('returns false for neutral text', () => {
    expect(detectComplaint('tudo certo por aqui')).toBe(false);
  });
});
