import { describe, expect, it } from 'vitest';

import {
  inferCorePain,
  inferNextBestQuestion,
  inferPreferredStyle,
} from '../processors/cia/cognitive-state/cognitive-state-inference';

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
