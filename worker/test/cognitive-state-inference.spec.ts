import { describe, expect, it } from 'vitest';

import {
  inferConfidence,
  inferCorePain,
  inferDesires,
  inferDisclosureLevel,
  inferEmotionalTone,
  inferIntent,
  inferNextBestAction,
  inferNextBestQuestion,
  inferObjections,
  inferPaymentState,
  inferPreferredStyle,
  inferRiskFlags,
  inferStage,
  inferTrustSignals,
  summarizeState,
  type NextActionInput,
} from '../processors/cia/cognitive-state/cognitive-state-inference';

const buildNextActionInput = (overrides: Partial<NextActionInput> = {}): NextActionInput => ({
  intent: 'UNKNOWN',
  stage: 'COLD',
  unreadCount: 0,
  silenceMinutes: 0,
  trustScore: 0.5,
  urgencyScore: 0.3,
  priceSensitivity: 0.5,
  paymentState: 'NONE',
  riskFlags: [],
  objections: [],
  desires: [],
  confidence: 0.7,
  ...overrides,
});

describe('inferPaymentState', () => {
  it('returns PAID when the customer signals payment confirmation', () => {
    expect(inferPaymentState('paguei agora')).toBe('PAID');
    expect(inferPaymentState('foi compensado')).toBe('PAID');
  });

  it('returns PENDING when the customer asks for a payment instrument', () => {
    expect(inferPaymentState('manda o pix')).toBe('PENDING');
    expect(inferPaymentState('me passa o boleto por favor')).toBe('PENDING');
  });

  it('returns READY_TO_PAY when the customer signals intent to close', () => {
    expect(inferPaymentState('quero fechar agora')).toBe('READY_TO_PAY');
    expect(inferPaymentState('me cobra')).toBe('READY_TO_PAY');
  });

  it('returns NONE when no payment cue is detected', () => {
    expect(inferPaymentState('só uma duvida')).toBe('NONE');
    expect(inferPaymentState('')).toBe('NONE');
  });

  it('prefers PAID over READY_TO_PAY when both cues overlap', () => {
    expect(inferPaymentState('paguei, quero fechar')).toBe('PAID');
  });
});

describe('inferIntent', () => {
  it('returns PAYMENT whenever payment state is PENDING or READY_TO_PAY', () => {
    expect(inferIntent({ text: 'qualquer texto', unreadCount: 0, paymentState: 'PENDING' })).toBe(
      'PAYMENT',
    );
    expect(
      inferIntent({ text: 'qualquer texto', unreadCount: 0, paymentState: 'READY_TO_PAY' }),
    ).toBe('PAYMENT');
  });

  it('does NOT return PAYMENT when paymentState is PAID', () => {
    expect(inferIntent({ text: 'preco?', unreadCount: 0, paymentState: 'PAID' })).not.toBe(
      'PAYMENT',
    );
  });

  it('detects SUPPORT keywords ahead of BUYING keywords', () => {
    expect(
      inferIntent({
        text: 'preciso de suporte com pagamento',
        unreadCount: 0,
        paymentState: 'NONE',
      }),
    ).toBe('SUPPORT');
  });

  it('detects BUYING keywords', () => {
    expect(
      inferIntent({ text: 'quanto custa esse produto?', unreadCount: 0, paymentState: 'NONE' }),
    ).toBe('BUYING');
  });

  it('detects OBJECTION via trust hints', () => {
    expect(
      inferIntent({
        text: 'isso realmente funciona? tem garantia?',
        unreadCount: 0,
        paymentState: 'NONE',
      }),
    ).toBe('OBJECTION');
  });

  it('returns CURIOUS when leadScore is high', () => {
    expect(
      inferIntent({
        text: 'oi',
        unreadCount: 0,
        paymentState: 'NONE',
        leadScore: 80,
      }),
    ).toBe('CURIOUS');
  });

  it('returns CURIOUS when there is at least one unread message', () => {
    expect(inferIntent({ text: 'oi', unreadCount: 2, paymentState: 'NONE', leadScore: 10 })).toBe(
      'CURIOUS',
    );
  });

  it('returns UNKNOWN when nothing matches', () => {
    expect(
      inferIntent({ text: 'tudo bem', unreadCount: 0, paymentState: 'NONE', leadScore: 0 }),
    ).toBe('UNKNOWN');
  });

  it('treats null leadScore as zero', () => {
    expect(inferIntent({ text: 'oi', unreadCount: 0, paymentState: 'NONE', leadScore: null })).toBe(
      'UNKNOWN',
    );
  });
});

describe('inferStage', () => {
  it('returns SUPPORT regardless of trust/urgency when intent is SUPPORT', () => {
    expect(
      inferStage({
        intent: 'SUPPORT',
        paymentState: 'NONE',
        trustScore: 0.9,
        urgencyScore: 0.9,
      }),
    ).toBe('SUPPORT');
  });

  it('returns POST_SALE when paymentState is PAID', () => {
    expect(
      inferStage({
        intent: 'BUYING',
        paymentState: 'PAID',
        trustScore: 0.3,
        urgencyScore: 0.3,
      }),
    ).toBe('POST_SALE');
  });

  it('returns CHECKOUT when paymentState is PENDING or READY_TO_PAY', () => {
    expect(
      inferStage({
        intent: 'BUYING',
        paymentState: 'PENDING',
        trustScore: 0.3,
        urgencyScore: 0.3,
      }),
    ).toBe('CHECKOUT');
    expect(
      inferStage({
        intent: 'BUYING',
        paymentState: 'READY_TO_PAY',
        trustScore: 0.3,
        urgencyScore: 0.3,
      }),
    ).toBe('CHECKOUT');
  });

  it('returns HOT when BUYING intent has high trust score', () => {
    expect(
      inferStage({
        intent: 'BUYING',
        paymentState: 'NONE',
        trustScore: 0.6,
        urgencyScore: 0.1,
      }),
    ).toBe('HOT');
  });

  it('returns HOT when BUYING intent has high urgency score', () => {
    expect(
      inferStage({
        intent: 'BUYING',
        paymentState: 'NONE',
        trustScore: 0.3,
        urgencyScore: 0.75,
      }),
    ).toBe('HOT');
  });

  it('returns WARM when intent is BUYING but neither trust nor urgency is high', () => {
    expect(
      inferStage({
        intent: 'BUYING',
        paymentState: 'NONE',
        trustScore: 0.2,
        urgencyScore: 0.2,
      }),
    ).toBe('WARM');
  });

  it('returns WARM for CURIOUS and OBJECTION intents', () => {
    expect(
      inferStage({
        intent: 'CURIOUS',
        paymentState: 'NONE',
        trustScore: 0.5,
        urgencyScore: 0.5,
      }),
    ).toBe('WARM');
    expect(
      inferStage({
        intent: 'OBJECTION',
        paymentState: 'NONE',
        trustScore: 0.5,
        urgencyScore: 0.5,
      }),
    ).toBe('WARM');
  });

  it('returns COLD when intent is UNKNOWN', () => {
    expect(
      inferStage({
        intent: 'UNKNOWN',
        paymentState: 'NONE',
        trustScore: 0.5,
        urgencyScore: 0.5,
      }),
    ).toBe('COLD');
  });
});

describe('inferObjections', () => {
  it('detects price objection', () => {
    expect(inferObjections('o preco esta caro')).toContain('price');
  });

  it('detects trust objection', () => {
    expect(inferObjections('isso funciona mesmo? tem garantia?')).toContain('trust');
  });

  it('detects timing objection', () => {
    expect(inferObjections('qual o prazo de entrega?')).toContain('timing');
  });

  it('returns an empty array when no objection cue is present', () => {
    expect(inferObjections('oi tudo bem')).toEqual([]);
  });

  it('detects multiple objections in the same text', () => {
    const objections = inferObjections('o valor esta caro e a entrega demora muito');
    expect(objections).toEqual(expect.arrayContaining(['price', 'timing']));
  });
});

describe('inferDesires', () => {
  it('maps known keywords to canonical desire tags', () => {
    expect(inferDesires('quero resultado rapido')).toContain('resultado_rapido');
    expect(inferDesires('preciso de algo seguro')).toContain('seguranca');
    expect(inferDesires('forma natural por favor')).toContain('naturalidade');
    expect(inferDesires('pode parcelar?')).toContain('parcelamento');
    expect(inferDesires('aceita pix?')).toContain('facilidade_pagamento');
  });

  it('returns unique tags when keywords repeat', () => {
    const desires = inferDesires('resultado resultado resultado');
    expect(desires.filter((tag) => tag === 'resultado_rapido')).toHaveLength(1);
  });

  it('returns an empty array when no desire keyword matches', () => {
    expect(inferDesires('apenas conversando')).toEqual([]);
  });
});

describe('inferRiskFlags', () => {
  it('detects LEGAL_RISK', () => {
    expect(inferRiskFlags('vou no procon', 'UNKNOWN')).toContain('LEGAL_RISK');
  });

  it('detects REFUND_RISK', () => {
    expect(inferRiskFlags('quero reembolso', 'UNKNOWN')).toContain('REFUND_RISK');
  });

  it('detects HEALTH_RISK', () => {
    expect(inferRiskFlags('tive uma reacao', 'UNKNOWN')).toContain('HEALTH_RISK');
  });

  it('always pushes SUPPORT_REQUIRED when intent is SUPPORT', () => {
    expect(inferRiskFlags('preciso de ajuda', 'SUPPORT')).toContain('SUPPORT_REQUIRED');
  });

  it('deduplicates risk flags', () => {
    const flags = inferRiskFlags('reembolso cancel devolu', 'UNKNOWN');
    expect(flags.filter((flag) => flag === 'REFUND_RISK')).toHaveLength(1);
  });

  it('returns an empty array when no risk cue is found', () => {
    expect(inferRiskFlags('oi tudo bem', 'UNKNOWN')).toEqual([]);
  });
});

describe('inferTrustSignals', () => {
  it('detects positive acknowledgement', () => {
    expect(inferTrustSignals('obrigado, perfeito')).toContain('positive_ack');
  });

  it('detects buying signals', () => {
    expect(inferTrustSignals('quero, me manda o link')).toContain('buying_signal');
  });

  it('detects needs proof', () => {
    expect(inferTrustSignals('tem depoimento? funciona mesmo?')).toContain('needs_proof');
  });

  it('returns an empty array when no signal is found', () => {
    expect(inferTrustSignals('tudo bem')).toEqual([]);
  });
});

describe('inferEmotionalTone', () => {
  it('detects anxious tone', () => {
    expect(inferEmotionalTone('estou ansiosa, com medo')).toBe('anxious');
  });

  it('detects frustrated tone', () => {
    expect(inferEmotionalTone('estou frustrada e cansada')).toBe('frustrated');
  });

  it('detects confused tone', () => {
    expect(inferEmotionalTone('nao entendi como funciona, explica')).toBe('confused');
  });

  it('detects positive tone', () => {
    expect(inferEmotionalTone('amei isso, ficou perfeito')).toBe('positive');
  });

  it('detects excited tone', () => {
    expect(inferEmotionalTone('partiu fechar agora!')).toBe('excited');
  });

  it('detects negative tone', () => {
    expect(inferEmotionalTone('nao, ta muito caro')).toBe('negative');
  });

  it('falls back to neutral when no cue matches', () => {
    expect(inferEmotionalTone('beleza')).toBe('neutral');
  });
});

describe('inferDisclosureLevel', () => {
  it('returns 0 for empty text', () => {
    expect(inferDisclosureLevel('')).toBe(0);
  });

  it('grows monotonically with word count', () => {
    const short = inferDisclosureLevel('uma palavra');
    const long = inferDisclosureLevel(
      'aqui esta um texto muito mais longo com diversas palavras encadeadas em uma frase',
    );
    expect(long).toBeGreaterThan(short);
  });

  it('clamps the result between 0 and 1', () => {
    const value = inferDisclosureLevel(Array(500).fill('palavra').join(' '));
    expect(value).toBeLessThanOrEqual(1);
    expect(value).toBeGreaterThanOrEqual(0);
  });

  it('returns a number with at most 3 decimal places', () => {
    const value = inferDisclosureLevel('uma duas tres quatro cinco');
    expect(value.toString()).toMatch(/^[0-9]+(\.[0-9]{1,3})?$/);
  });
});

describe('inferCorePain', () => {
  it('returns price-related pain when price objection is present', () => {
    expect(inferCorePain('o preco', ['price'], [])).toBe('receio de investir sem retorno');
  });

  it('returns trust-related pain when trust objection is present', () => {
    expect(inferCorePain('funciona?', ['trust'], [])).toBe('medo de errar ou ser enganado');
  });

  it('returns timing-related pain when timing objection is present', () => {
    expect(inferCorePain('demora?', ['timing'], [])).toBe('urgencia com receio de demora');
  });

  it('returns resultado_rapido pain when the desire is present and no objections', () => {
    expect(inferCorePain('resultado', [], ['resultado_rapido'])).toBe(
      'quer resultado perceptivel rapido',
    );
  });

  it('returns seguranca pain when the desire is present and no objections', () => {
    expect(inferCorePain('seguro', [], ['seguranca'])).toBe('busca seguranca para decidir');
  });

  it('returns failed-resolution pain when the text signals prior failure', () => {
    expect(inferCorePain('nao resolveu nada', [], [])).toBe(
      'frustracao por tentativas anteriores sem resultado',
    );
  });

  it('returns null when no signal matches', () => {
    expect(inferCorePain('oi', [], [])).toBeNull();
  });

  it('prefers price objection over later signals', () => {
    expect(inferCorePain('nao resolveu', ['price'], ['resultado_rapido'])).toBe(
      'receio de investir sem retorno',
    );
  });
});

describe('inferPreferredStyle', () => {
  it('returns technical when the text mentions technical hints', () => {
    expect(inferPreferredStyle('como funciona tecnicamente?', 'neutral')).toBe('technical');
  });

  it('returns empathetic when the emotional tone is frustrated', () => {
    expect(inferPreferredStyle('oi', 'frustrated')).toBe('empathetic');
  });

  it('returns empathetic when the emotional tone is anxious', () => {
    expect(inferPreferredStyle('oi', 'anxious')).toBe('empathetic');
  });

  it('returns direct when the text contains direct hints', () => {
    expect(inferPreferredStyle('quanto custa?', 'neutral')).toBe('direct');
  });

  it('returns consultative as the default', () => {
    expect(inferPreferredStyle('tudo bem', 'neutral')).toBe('consultative');
  });

  it('prefers technical over emotional tone', () => {
    expect(inferPreferredStyle('como funciona', 'frustrated')).toBe('technical');
  });
});

describe('inferNextBestQuestion', () => {
  it('asks about budget vs security when price is the top objection', () => {
    const question = inferNextBestQuestion({
      stage: 'WARM',
      emotionalTone: 'neutral',
      objections: ['price'],
    });
    expect(question).toContain('investimento');
  });

  it('asks about reassurance when trust is the top objection', () => {
    const question = inferNextBestQuestion({
      stage: 'WARM',
      emotionalTone: 'neutral',
      objections: ['trust'],
    });
    expect(question).toContain('seguranca');
  });

  it('asks empathically when the tone is frustrated', () => {
    const question = inferNextBestQuestion({
      stage: 'WARM',
      emotionalTone: 'frustrated',
      objections: [],
    });
    expect(question).toContain('desgasta');
  });

  it('asks a cold-stage qualifier when there is no objection or strong tone', () => {
    expect(inferNextBestQuestion({ stage: 'COLD', emotionalTone: 'neutral', objections: [] })).toBe(
      'O que te trouxe aqui agora?',
    );
  });

  it('asks a warm-stage qualifier when stage is WARM with neutral tone', () => {
    expect(inferNextBestQuestion({ stage: 'WARM', emotionalTone: 'neutral', objections: [] })).toBe(
      'Qual resultado faria isso valer a pena pra voce?',
    );
  });

  it('asks about core pain when one is present and no earlier branch matches', () => {
    const question = inferNextBestQuestion({
      stage: 'HOT',
      emotionalTone: 'neutral',
      objections: [],
      corePain: 'algo dificil',
    });
    expect(question).toContain('dia a dia');
  });

  it('returns null when nothing matches', () => {
    expect(
      inferNextBestQuestion({ stage: 'HOT', emotionalTone: 'neutral', objections: [] }),
    ).toBeNull();
  });
});

describe('inferConfidence', () => {
  it('raises confidence for BUYING intent', () => {
    const value = inferConfidence({
      intent: 'BUYING',
      riskFlags: [],
      objections: [],
      unreadCount: 0,
    });
    expect(value).toBeGreaterThan(0.7);
  });

  it('raises confidence for PAYMENT intent', () => {
    const value = inferConfidence({
      intent: 'PAYMENT',
      riskFlags: [],
      objections: [],
      unreadCount: 0,
    });
    expect(value).toBeGreaterThan(0.7);
  });

  it('lowers confidence for SUPPORT intent', () => {
    const value = inferConfidence({
      intent: 'SUPPORT',
      riskFlags: [],
      objections: [],
      unreadCount: 0,
    });
    expect(value).toBeLessThan(0.58);
  });

  it('raises confidence slightly when objections are present', () => {
    const baseline = inferConfidence({
      intent: 'UNKNOWN',
      riskFlags: [],
      objections: [],
      unreadCount: 0,
    });
    const withObjections = inferConfidence({
      intent: 'UNKNOWN',
      riskFlags: [],
      objections: ['price'],
      unreadCount: 0,
    });
    expect(withObjections).toBeGreaterThan(baseline);
  });

  it('lowers confidence when risk flags are present', () => {
    const baseline = inferConfidence({
      intent: 'UNKNOWN',
      riskFlags: [],
      objections: [],
      unreadCount: 0,
    });
    const withRisks = inferConfidence({
      intent: 'UNKNOWN',
      riskFlags: ['LEGAL_RISK'],
      objections: [],
      unreadCount: 0,
    });
    expect(withRisks).toBeLessThan(baseline);
  });

  it('raises confidence when there are multiple unread messages', () => {
    const baseline = inferConfidence({
      intent: 'UNKNOWN',
      riskFlags: [],
      objections: [],
      unreadCount: 1,
    });
    const burst = inferConfidence({
      intent: 'UNKNOWN',
      riskFlags: [],
      objections: [],
      unreadCount: 5,
    });
    expect(burst).toBeGreaterThan(baseline);
  });

  it('clamps confidence to the [0.1, 0.98] range', () => {
    const veryLow = inferConfidence({
      intent: 'SUPPORT',
      riskFlags: ['A', 'B', 'C', 'D'],
      objections: [],
      unreadCount: 0,
    });
    expect(veryLow).toBeGreaterThanOrEqual(0.1);

    const veryHigh = inferConfidence({
      intent: 'BUYING',
      riskFlags: [],
      objections: ['price', 'trust', 'timing'],
      unreadCount: 99,
    });
    expect(veryHigh).toBeLessThanOrEqual(0.98);
  });

  it('returns a number with at most 3 decimal places', () => {
    const value = inferConfidence({
      intent: 'CURIOUS',
      riskFlags: [],
      objections: [],
      unreadCount: 1,
    });
    expect(value.toString()).toMatch(/^[0-9]+(\.[0-9]{1,3})?$/);
  });
});

describe('inferNextBestAction', () => {
  it('returns ESCALATE_HUMAN when any risk flag is present', () => {
    expect(
      inferNextBestAction(buildNextActionInput({ riskFlags: ['LEGAL_RISK'], unreadCount: 5 })),
    ).toBe('ESCALATE_HUMAN');
  });

  it('returns ASK_CLARIFYING for UNKNOWN intent with unread messages and low confidence', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({ intent: 'UNKNOWN', unreadCount: 1, confidence: 0.5 }),
      ),
    ).toBe('ASK_CLARIFYING');
  });

  it('does NOT ASK_CLARIFYING when confidence is at or above 0.68', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({ intent: 'UNKNOWN', unreadCount: 1, confidence: 0.68 }),
      ),
    ).not.toBe('ASK_CLARIFYING');
  });

  it('returns PAYMENT_RECOVERY when payment state is PENDING', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'CURIOUS',
          unreadCount: 1,
          paymentState: 'PENDING',
        }),
      ),
    ).toBe('PAYMENT_RECOVERY');
  });

  it('returns PAYMENT_RECOVERY when payment state is READY_TO_PAY', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'CURIOUS',
          unreadCount: 1,
          paymentState: 'READY_TO_PAY',
        }),
      ),
    ).toBe('PAYMENT_RECOVERY');
  });

  it('returns PAYMENT_RECOVERY when intent is PAYMENT', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'PAYMENT',
          unreadCount: 1,
        }),
      ),
    ).toBe('PAYMENT_RECOVERY');
  });

  it('returns SOCIAL_PROOF when price objection meets low trust on an unread', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'BUYING',
          unreadCount: 1,
          objections: ['price'],
          trustScore: 0.5,
          confidence: 0.8,
        }),
      ),
    ).toBe('SOCIAL_PROOF');
  });

  it('returns OFFER on unread when stage is HOT', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'BUYING',
          stage: 'HOT',
          unreadCount: 1,
          trustScore: 0.7,
          confidence: 0.8,
        }),
      ),
    ).toBe('OFFER');
  });

  it('returns OFFER on unread when stage is CHECKOUT', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'BUYING',
          stage: 'CHECKOUT',
          unreadCount: 1,
          paymentState: 'NONE',
          confidence: 0.8,
        }),
      ),
    ).toBe('OFFER');
  });

  it('returns OFFER on unread when urgency is high', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'BUYING',
          unreadCount: 1,
          urgencyScore: 0.8,
          confidence: 0.8,
        }),
      ),
    ).toBe('OFFER');
  });

  it('returns OFFER on unread when desires include resultado_rapido', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'BUYING',
          unreadCount: 1,
          desires: ['resultado_rapido'],
          confidence: 0.8,
        }),
      ),
    ).toBe('OFFER');
  });

  it('returns RESPOND on plain unread', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'CURIOUS',
          stage: 'WARM',
          unreadCount: 1,
          confidence: 0.8,
        }),
      ),
    ).toBe('RESPOND');
  });

  it('returns FOLLOWUP_URGENT after a full day of silence', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'CURIOUS',
          stage: 'WARM',
          unreadCount: 0,
          silenceMinutes: 24 * 60,
        }),
      ),
    ).toBe('FOLLOWUP_URGENT');
  });

  it('returns FOLLOWUP_URGENT when HOT stage has high urgency', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'CURIOUS',
          stage: 'HOT',
          unreadCount: 0,
          silenceMinutes: 60,
          urgencyScore: 0.75,
        }),
      ),
    ).toBe('FOLLOWUP_URGENT');
  });

  it('returns FOLLOWUP_SOFT after a soft-silence window', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'CURIOUS',
          stage: 'COLD',
          unreadCount: 0,
          silenceMinutes: 6 * 60,
        }),
      ),
    ).toBe('FOLLOWUP_SOFT');
  });

  it('returns FOLLOWUP_SOFT for WARM stages without urgent silence', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'CURIOUS',
          stage: 'WARM',
          unreadCount: 0,
          silenceMinutes: 10,
        }),
      ),
    ).toBe('FOLLOWUP_SOFT');
  });

  it('returns WAIT as the default silent fallback', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'CURIOUS',
          stage: 'COLD',
          unreadCount: 0,
          silenceMinutes: 5,
        }),
      ),
    ).toBe('WAIT');
  });
});

describe('summarizeState', () => {
  it('includes intent, stage and next best action', () => {
    const summary = summarizeState({
      intent: 'BUYING',
      stage: 'HOT',
      objections: [],
      nextBestAction: 'OFFER',
      paymentState: 'NONE',
      trustScore: 0.5,
      urgencyScore: 0.7,
      riskFlags: [],
    });
    expect(summary).toContain('intenção buying');
    expect(summary).toContain('estágio hot');
    expect(summary).toContain('próxima ação offer');
  });

  it('omits the payment segment when paymentState is NONE', () => {
    const summary = summarizeState({
      intent: 'BUYING',
      stage: 'WARM',
      objections: [],
      nextBestAction: 'RESPOND',
      paymentState: 'NONE',
      trustScore: 0.3,
      urgencyScore: 0.3,
      riskFlags: [],
    });
    expect(summary).not.toContain('pagamento');
  });

  it('includes the payment segment when paymentState is not NONE', () => {
    const summary = summarizeState({
      intent: 'PAYMENT',
      stage: 'CHECKOUT',
      objections: [],
      nextBestAction: 'PAYMENT_RECOVERY',
      paymentState: 'PENDING',
      trustScore: 0.5,
      urgencyScore: 0.5,
      riskFlags: [],
    });
    expect(summary).toContain('pagamento pending');
  });

  it('includes objections list when non-empty', () => {
    const summary = summarizeState({
      intent: 'OBJECTION',
      stage: 'WARM',
      objections: ['price', 'trust'],
      nextBestAction: 'SOCIAL_PROOF',
      paymentState: 'NONE',
      trustScore: 0.4,
      urgencyScore: 0.4,
      riskFlags: [],
    });
    expect(summary).toContain('objeções price, trust');
  });

  it('formats trust and urgency as percentages', () => {
    const summary = summarizeState({
      intent: 'CURIOUS',
      stage: 'WARM',
      objections: [],
      nextBestAction: 'RESPOND',
      paymentState: 'NONE',
      trustScore: 0.42,
      urgencyScore: 0.91,
      riskFlags: [],
    });
    expect(summary).toContain('confiança 42%');
    expect(summary).toContain('urgência 91%');
  });

  it('includes risk flags when non-empty', () => {
    const summary = summarizeState({
      intent: 'SUPPORT',
      stage: 'SUPPORT',
      objections: [],
      nextBestAction: 'ESCALATE_HUMAN',
      paymentState: 'NONE',
      trustScore: 0.3,
      urgencyScore: 0.6,
      riskFlags: ['LEGAL_RISK', 'SUPPORT_REQUIRED'],
    });
    expect(summary).toContain('riscos LEGAL_RISK, SUPPORT_REQUIRED');
  });
});
