import type { ChatCompletionMessageParam } from 'openai/resources/chat';
import {
  buildKloelLlmTestStubStream,
  extractLinkedProductHints,
  isKloelLlmTestStubEnabled,
} from './kloel-llm-test-stub';

describe('kloel-llm-test-stub', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('isKloelLlmTestStubEnabled', () => {
    it('returns false when NODE_ENV is production even if dummy key is set', () => {
      process.env.NODE_ENV = 'production';
      process.env.OPENAI_API_KEY = 'e2e-dummy-key';
      expect(isKloelLlmTestStubEnabled()).toBe(false);
    });

    it('returns true when OPENAI_API_KEY is the e2e dummy key', () => {
      process.env.NODE_ENV = 'test';
      process.env.OPENAI_API_KEY = 'e2e-dummy-key';
      expect(isKloelLlmTestStubEnabled()).toBe(true);
    });

    it('returns true when E2E_TEST_MODE is true', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.OPENAI_API_KEY;
      process.env.E2E_TEST_MODE = 'true';
      expect(isKloelLlmTestStubEnabled()).toBe(true);
    });

    it('returns false otherwise', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.OPENAI_API_KEY;
      delete process.env.E2E_TEST_MODE;
      delete process.env.KLOEL_LLM_STUB;
      expect(isKloelLlmTestStubEnabled()).toBe(false);
    });
  });

  describe('extractLinkedProductHints', () => {
    it('extracts product name and price from a system message containing the linked-product block', () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        {
          role: 'system',
          content:
            'PRODUTO VINCULADO AO PROMPT:\n- Origem: catálogo próprio do workspace\nPRODUTO 1: tmp-e2e-linked-Widget\n- Estado operacional: ativo | workflow APPROVED\n- Oferta principal: R$ 123,45 | categoria DIGITAL\n\nOutro contexto.',
        },
        { role: 'user', content: 'Qual o nome?' },
      ];
      const hints = extractLinkedProductHints(messages);
      expect(hints.productName).toBe('tmp-e2e-linked-Widget');
      expect(hints.productPrice).toBe('R$ 123,45');
    });

    it('returns null fields when no linked-product header is present', () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: 'No product context here.' },
      ];
      const hints = extractLinkedProductHints(messages);
      expect(hints.productName).toBeNull();
      expect(hints.productPrice).toBeNull();
    });
  });

  describe('buildKloelLlmTestStubStream', () => {
    it('streams chunks containing the extracted product name', async () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content:
            'PRODUTO VINCULADO AO PROMPT:\nPRODUTO 1: meu-produto\n- Oferta principal: R$ 9,99',
        },
      ];
      const stream = buildKloelLlmTestStubStream(messages);
      let combined = '';
      for await (const chunk of stream) {
        combined += chunk.choices[0]?.delta?.content || '';
      }
      expect(combined).toContain('meu-produto');
      expect(combined).toContain('R$ 9,99');
    });

    it('streams a fallback when no linked-product context is supplied', async () => {
      const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: 'no product' }];
      const stream = buildKloelLlmTestStubStream(messages);
      let combined = '';
      for await (const chunk of stream) {
        combined += chunk.choices[0]?.delta?.content || '';
      }
      expect(combined.length).toBeGreaterThan(0);
      expect(combined).toContain('[stub]');
    });
  });
});
