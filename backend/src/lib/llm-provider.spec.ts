import OpenAI from 'openai';
import { createTextLlmClient, resolveTextLlmProvider } from './llm-provider';
import { CANONICAL_MODEL_IDS, resolveBackendOpenAIModel } from './openai-models';

jest.mock('openai', () => ({
  default: jest.fn().mockImplementation((options: Record<string, unknown>) => ({ options })),
}));

const TEXT_LLM_ENV_KEYS = [
  'DEEPSEEK_API_KEY',
  'LLM_API_KEY',
  'OPENAI_API_KEY',
  'DEEPSEEK_BASE_URL',
  'LLM_BASE_URL',
  'OPENAI_BASE_URL',
  'DEEPSEEK_BRAIN_MODEL',
  'LLM_BRAIN_MODEL',
  'OPENAI_BRAIN_MODEL',
  'DEEPSEEK_BRAIN_FALLBACK_MODEL',
  'LLM_BRAIN_FALLBACK_MODEL',
  'OPENAI_BRAIN_FALLBACK_MODEL',
  'DEEPSEEK_WRITER_MODEL',
  'LLM_WRITER_MODEL',
  'OPENAI_WRITER_MODEL',
  'OPENAI_MODEL',
  'DEEPSEEK_WRITER_FALLBACK_MODEL',
  'LLM_WRITER_FALLBACK_MODEL',
  'OPENAI_WRITER_FALLBACK_MODEL',
  'OPENAI_FALLBACK_MODEL',
] as const;

function clearTextLlmEnv(): void {
  for (const key of TEXT_LLM_ENV_KEYS) {
    delete process.env[key];
  }
}

describe('text LLM provider resolution', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(process, 'env', { ...originalEnv });
    clearTextLlmEnv();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses native OpenAI endpoint and OpenAI model defaults when only OPENAI_API_KEY is configured', () => {
    process.env.OPENAI_API_KEY = 'sk-openai-test';
    process.env.DEEPSEEK_BASE_URL = 'https://api.deepseek.invalid/v1';

    const client = createTextLlmClient(undefined, { timeout: 1234, maxRetries: 2 });

    expect(client).not.toBeNull();
    expect(resolveTextLlmProvider()).toBe('openai');
    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-openai-test',
      timeout: 1234,
      maxRetries: 2,
    });
    expect(resolveBackendOpenAIModel('brain')).toBe(CANONICAL_MODEL_IDS.openAiTextOmni);
    expect(resolveBackendOpenAIModel('writer_fallback')).toBe(CANONICAL_MODEL_IDS.openAiTextMini);
  });

  it('keeps DeepSeek endpoint and model defaults when DEEPSEEK_API_KEY is configured', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-deepseek-test';

    const client = createTextLlmClient();

    expect(client).not.toBeNull();
    expect(resolveTextLlmProvider()).toBe('deepseek');
    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-deepseek-test',
      baseURL: 'https://api.deepseek.com/v1',
      timeout: 60_000,
      maxRetries: 0,
    });
    expect(resolveBackendOpenAIModel('brain')).toBe('deepseek-v4-flash');
  });
});
