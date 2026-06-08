/**
 * UTP-ABI-005/006 — abi-ab-harness.service.helpers extraction spec.
 *
 * Validates the text-mining / outcome-estimation helpers:
 *  - extractClaimsFromText
 *  - estimateCommercialOutcome
 */

import { estimateCommercialOutcome, extractClaimsFromText } from './abi-ab-harness.service.helpers';

describe('abi-ab-harness.service.helpers — extraction', () => {
  describe('extractClaimsFromText', () => {
    it('returns empty array for short text', () => {
      expect(extractClaimsFromText('Oi.')).toEqual([]);
      expect(extractClaimsFromText('')).toEqual([]);
    });

    it('extracts sentences longer than 10 chars', () => {
      const claims = extractClaimsFromText('Esta é uma frase longa suficiente. Curta.');
      expect(claims).toHaveLength(1);
      expect(claims[0].claim).toContain('Esta é uma frase longa');
    });

    it('truncates claims to 200 characters', () => {
      const longSentence = 'A'.repeat(250);
      const claims = extractClaimsFromText(longSentence);
      expect(claims).toHaveLength(1);
      expect(claims[0].claim.length).toBeLessThanOrEqual(200);
    });

    it('marks claims as proved when proof keywords present', () => {
      const claims = extractClaimsFromText('Segundo o relatório, os dados indicam crescimento.');
      expect(claims).toHaveLength(1);
      expect(claims[0].hasProof).toBe(true);
      expect(claims[0].proofSource).toBe('text-reference');
    });

    it('marks claims as hallucinated when no proof keywords', () => {
      const claims = extractClaimsFromText('O produto X é o melhor do mercado mundial');
      expect(claims).toHaveLength(1);
      expect(claims[0].hasProof).toBe(false);
      expect(claims[0].proofSource).toBeNull();
    });

    it('detects conforme as a proof keyword', () => {
      const claims = extractClaimsFromText('Conforme a política da empresa, isso é permitido.');
      expect(claims).toHaveLength(1);
      expect(claims[0].hasProof).toBe(true);
    });

    it('detects de acordo com as a proof keyword', () => {
      const claims = extractClaimsFromText(
        'De acordo com as normas vigentes, o prazo é de 30 dias.',
      );
      expect(claims).toHaveLength(1);
      expect(claims[0].hasProof).toBe(true);
    });

    it('correctly splits multiple sentences on punctuation', () => {
      const claims = extractClaimsFromText(
        'Primeira frase comprovada conforme relatório. Segunda frase sem prova alguma disso. Terceira com fonte confiável!',
      );
      expect(claims).toHaveLength(3);
      expect(claims[0].hasProof).toBe(true);
      expect(claims[1].hasProof).toBe(false);
      expect(claims[2].hasProof).toBe(true);
    });
  });

  describe('estimateCommercialOutcome', () => {
    it('returns null when no signals detected', () => {
      const result = estimateCommercialOutcome({
        responseText: 'Aqui está a informação solicitada.',
        workspaceId: 'ws_1',
      });
      expect(result).toBeNull();
    });

    it('detects conversion signal', () => {
      const result = estimateCommercialOutcome({
        responseText: 'Aproveite nossa oferta exclusiva! Clique aqui para comprar.',
        workspaceId: 'ws_1',
      });
      expect(result).not.toBeNull();
      expect(result.conversionSignal).toBe(true);
    });

    it('detects satisfaction signal', () => {
      const result = estimateCommercialOutcome({
        responseText: 'Muito obrigado pela sua confiança! Estamos satisfeitos em ajudar.',
        workspaceId: 'ws_1',
      });
      expect(result).not.toBeNull();
      expect(result.satisfactionSignal).toBe(true);
    });

    it('detects both signals simultaneously', () => {
      const result = estimateCommercialOutcome({
        responseText: 'Excelente! Aproveite o desconto exclusivo. Obrigado!',
        workspaceId: 'ws_1',
      });
      expect(result).not.toBeNull();
      expect(result.conversionSignal).toBe(true);
      expect(result.satisfactionSignal).toBe(true);
    });

    it('is case-insensitive', () => {
      const result = estimateCommercialOutcome({
        responseText: 'OBRIGADO! COMPRAR AGORA COM DESCONTO.',
        workspaceId: 'ws_1',
      });
      expect(result).not.toBeNull();
      expect(result.conversionSignal).toBe(true);
      expect(result.satisfactionSignal).toBe(true);
    });
  });
});
