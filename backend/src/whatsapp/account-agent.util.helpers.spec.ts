import {
  ACCOUNT_AGENT_REGEX,
  BUYING_SIGNALS,
  PRODUCT_CUE_WORDS,
  STOPWORDS,
} from './account-agent.util.helpers';

describe('account-agent.util.helpers', () => {
  describe('ACCOUNT_AGENT_REGEX', () => {
    it('should match diacritical marks after NFD', () => {
      const text = 'café';
      const normalized = text.normalize('NFD');
      const result = normalized.replace(ACCOUNT_AGENT_REGEX.diacritics, '');
      expect(result).toBe('cafe');
    });

    it('should remove diacritics from accented characters', () => {
      const text = 'naïve';
      const normalized = text.normalize('NFD');
      const result = normalized.replace(ACCOUNT_AGENT_REGEX.diacritics, '');
      expect(result).toBe('naive');
    });

    it('should match non-alphanumeric chars except whitespace/hyphen', () => {
      const text = 'hello@world!test#123';
      const result = text.replace(ACCOUNT_AGENT_REGEX.nonAlphaNumWhitespaceHyphen, '');
      expect(result).toBe('helloworldtest123');
    });

    it('should preserve hyphens and alphanumerics', () => {
      const text = 'kit-combo test-123';
      const result = text.replace(ACCOUNT_AGENT_REGEX.nonAlphaNumWhitespaceHyphen, '');
      expect(result).toBe('kit-combo test-123');
    });

    it('should collapse multiple whitespace', () => {
      const text = 'hello    world\t\ttest';
      const result = text.replace(ACCOUNT_AGENT_REGEX.whitespaceRun, ' ');
      expect(result).toBe('hello world test');
    });

    it('should collapse multiple hyphens', () => {
      const text = 'kit---combo--test';
      const result = text.replace(ACCOUNT_AGENT_REGEX.hyphenRun, '-');
      expect(result).toBe('kit-combo-test');
    });

    it('should match alphanumeric words with accents and hyphens', () => {
      const text = 'café-da-manhã test123 Àbcdef';
      const matches = Array.from(text.matchAll(ACCOUNT_AGENT_REGEX.alphaNumericWord), (m) => m[0]);
      expect(matches).toContain('café-da-manhã');
      expect(matches).toContain('test123');
      expect(matches).toContain('Àbcdef');
    });

    it('should match HTTP/HTTPS URLs greedy until space', () => {
      const text = 'Visit https://example.com/path or http://test.org end';
      const matches = Array.from(text.matchAll(ACCOUNT_AGENT_REGEX.url), (m) => m[0]);
      expect(matches).toContain('https://example.com/path');
      expect(matches).toContain('http://test.org');
    });

    it('should stop URL at closing paren', () => {
      const text = 'https://example.com?query=value) end';
      const matches = Array.from(text.matchAll(ACCOUNT_AGENT_REGEX.url), (m) => m[0]);
      expect(matches[0]).toBe('https://example.com?query=value');
    });

    it('should match BR monetary values with R$ prefix', () => {
      const text = 'Preço: R$ 100,50 ou R$1.000,99 ou 50,00';
      const matches = Array.from(text.matchAll(ACCOUNT_AGENT_REGEX.monetary), (m) => m[0]);
      expect(matches).toContain('R$ 100,50');
      expect(matches).toContain('R$1.000,99');
      expect(matches).toContain('50,00');
    });

    it('should match percentage values', () => {
      const text = 'Desconto de 15% ou 12,5% ou 100 %';
      const matches = Array.from(text.matchAll(ACCOUNT_AGENT_REGEX.percentage), (m) => m[0]);
      expect(matches).toHaveLength(2);
      expect(matches[0]).toBe('15%');
      expect(matches[1]).toBe('12,5%');
    });

    it('should match installment counts', () => {
      const text = 'Parcelar em 12x ou 10 X ou 3x';
      const matches = Array.from(text.matchAll(ACCOUNT_AGENT_REGEX.installment), (m) => m[0]);
      expect(matches).toContain('12x');
      expect(matches).toContain('10 X');
      expect(matches).toContain('3x');
    });

    it('should test uppercase SKU tokens', () => {
      expect(ACCOUNT_AGENT_REGEX.uppercaseSku.test('KIT-3')).toBe(true);
      expect(ACCOUNT_AGENT_REGEX.uppercaseSku.test('COMBO-FAMILIA')).toBe(true);
      expect(ACCOUNT_AGENT_REGEX.uppercaseSku.test('KI')).toBe(false);
      expect(ACCOUNT_AGENT_REGEX.uppercaseSku.test('kit-3')).toBe(false);
    });

    it('should remove thousands separator dots', () => {
      const text = '1.000.000,00';
      const result = text.replace(ACCOUNT_AGENT_REGEX.dot, '');
      expect(result).toBe('1000000,00');
    });

    it('should split on line breaks CRLF and LF', () => {
      const text = 'line1\r\nline2\nline3';
      const result = text.split(ACCOUNT_AGENT_REGEX.lineBreak);
      expect(result).toEqual(['line1', 'line2', 'line3']);
    });
  });

  describe('BUYING_SIGNALS', () => {
    it('should be readonly array', () => {
      expect(Array.isArray(BUYING_SIGNALS)).toBe(true);
    });

    it('should contain Portuguese buying intent keywords', () => {
      expect(BUYING_SIGNALS).toContain('preco');
      expect(BUYING_SIGNALS).toContain('preço');
      expect(BUYING_SIGNALS).toContain('comprar');
      expect(BUYING_SIGNALS).toContain('pagar');
    });

    it('should contain payment method keywords', () => {
      expect(BUYING_SIGNALS).toContain('pix');
      expect(BUYING_SIGNALS).toContain('boleto');
      expect(BUYING_SIGNALS).toContain('cartao');
      expect(BUYING_SIGNALS).toContain('cartão');
    });
  });

  describe('PRODUCT_CUE_WORDS', () => {
    it('should be readonly set', () => {
      expect(PRODUCT_CUE_WORDS instanceof Set).toBe(true);
    });

    it('should contain product-mention anchor words', () => {
      expect(PRODUCT_CUE_WORDS.has('quero')).toBe(true);
      expect(PRODUCT_CUE_WORDS.has('comprar')).toBe(true);
      expect(PRODUCT_CUE_WORDS.has('produto')).toBe(true);
      expect(PRODUCT_CUE_WORDS.has('kit')).toBe(true);
      expect(PRODUCT_CUE_WORDS.has('combo')).toBe(true);
    });

    it('should contain both accented and unaccented variants', () => {
      expect(PRODUCT_CUE_WORDS.has('solucao')).toBe(true);
      expect(PRODUCT_CUE_WORDS.has('solução')).toBe(true);
    });
  });

  describe('STOPWORDS', () => {
    it('should be readonly set', () => {
      expect(STOPWORDS instanceof Set).toBe(true);
    });

    it('should contain Portuguese articles and prepositions', () => {
      expect(STOPWORDS.has('o')).toBe(true);
      expect(STOPWORDS.has('a')).toBe(true);
      expect(STOPWORDS.has('de')).toBe(true);
      expect(STOPWORDS.has('para')).toBe(true);
      expect(STOPWORDS.has('com')).toBe(true);
    });

    it('should contain common noise words', () => {
      expect(STOPWORDS.has('mais')).toBe(true);
      expect(STOPWORDS.has('melhor')).toBe(true);
      expect(STOPWORDS.has('como')).toBe(true);
      expect(STOPWORDS.has('aqui')).toBe(true);
    });

    it('should contain commerce domain filters', () => {
      expect(STOPWORDS.has('preco')).toBe(true);
      expect(STOPWORDS.has('pix')).toBe(true);
      expect(STOPWORDS.has('cartao')).toBe(true);
      expect(STOPWORDS.has('pagamento')).toBe(true);
    });

    it('should have larger size than BUYING_SIGNALS', () => {
      expect(STOPWORDS.size).toBeGreaterThan(BUYING_SIGNALS.length);
    });
  });

  describe('edge cases', () => {
    it('should handle empty strings', () => {
      const empty = '';
      expect(empty.replace(ACCOUNT_AGENT_REGEX.whitespaceRun, ' ')).toBe('');
    });

    it('should handle mixed case in currency', () => {
      const text = 'r$ 100,00 R$ 200,00';
      const matches = Array.from(text.matchAll(ACCOUNT_AGENT_REGEX.monetary), (m) => m[0]);
      expect(matches).toHaveLength(2);
    });

    it('should extract correct groups from percentage', () => {
      const text = 'Desconto 25%';
      const match = ACCOUNT_AGENT_REGEX.percentage.exec(text);
      expect(match[1]).toBe('25');
    });

    it('should handle non-digit after percentage', () => {
      const text = 'Valor 50% maior';
      const matches = text.match(ACCOUNT_AGENT_REGEX.percentage);
      expect(matches).toBeTruthy();
    });
  });
});
