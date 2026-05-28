import { describe, expect, it } from 'vitest';

import {
  inferDesires,
  inferDisclosureLevel,
  inferEmotionalTone,
  inferObjections,
  inferRiskFlags,
  inferTrustSignals,
} from '../processors/cia/cognitive-state/cognitive-state-inference';

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
