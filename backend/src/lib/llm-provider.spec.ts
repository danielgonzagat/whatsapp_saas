import OpenAI, { AuthenticationError, APIConnectionError } from 'openai';
import {
  createTextLlmClient,
  resolveTextLlmProvider,
  createTextLlmClientPool,
  chatCompletionWithProviderFallback,
  ProviderPoolExhaustedError,
} from './llm-provider';
import { CANONICAL_MODEL_IDS, resolveBackendOpenAIModel } from './openai-models';
jest.mock('openai', () => {
  const actual = jest.requireActual<typeof import('openai')>('openai');
  const MockOpenAI = jest.fn().mockImplementation((options: Record<string, unknown>) => ({
    options,
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  }));
  return {
    __esModule: true,
    default: MockOpenAI,
    AuthenticationError: actual.AuthenticationError,
    APIConnectionError: actual.APIConnectionError,
  };
});
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
    process.env.DEEPSEEK_API_KEY = 'fake-key';

    const client = createTextLlmClient();

    expect(client).not.toBeNull();
    expect(resolveTextLlmProvider()).toBe('deepseek');
    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: 'fake-key',
      baseURL: 'https://api.deepseek.com/v1',
      timeout: 60_000,
      maxRetries: 0,
    });
    expect(resolveBackendOpenAIModel('brain')).toBe('deepseek-v4-flash');
  });
});

// --- Provider-level fallback chain tests (PI-k1) ------------------------

describe('createTextLlmClientPool', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(process, 'env', { ...originalEnv });
    clearTextLlmEnv();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns an empty array when no provider keys are configured', () => {
    const pool = createTextLlmClientPool();
    expect(pool).toEqual([]);
  });

  it('returns one client when only DEEPSEEK_API_KEY is set', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-ds';
    const pool = createTextLlmClientPool();
    expect(pool).toHaveLength(1);
    expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-ds' }));
  });

  it('returns one client when only LLM_API_KEY is set', () => {
    process.env.LLM_API_KEY = 'sk-gen';
    const pool = createTextLlmClientPool();
    expect(pool).toHaveLength(1);
    expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-gen' }));
  });

  it('returns one client when only OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'sk-oai';
    const pool = createTextLlmClientPool();
    expect(pool).toHaveLength(1);
    expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-oai' }));
  });

  it('returns clients in env precedence order: deepseek > generic > openai', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-ds';
    process.env.LLM_API_KEY = 'sk-gen';
    process.env.OPENAI_API_KEY = 'sk-oai';

    const pool = createTextLlmClientPool();
    expect(pool).toHaveLength(3);

    const calls = (OpenAI as jest.Mock).mock.calls as Array<[{ apiKey: string; baseURL?: string }]>;
    expect(calls[0][0].apiKey).toBe('sk-ds');
    expect(calls[1][0].apiKey).toBe('sk-gen');
    expect(calls[2][0].apiKey).toBe('sk-oai');
  });

  it('skips providers whose key is not set when other keys are present', () => {
    process.env.OPENAI_API_KEY = 'sk-oai';
    const pool = createTextLlmClientPool();
    expect(pool).toHaveLength(1);
    const calls = (OpenAI as jest.Mock).mock.calls as Array<[{ apiKey: string; baseURL?: string }]>;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].apiKey).toBe('sk-oai');
  });

  it('respects timeout and maxRetries options', () => {
    process.env.LLM_API_KEY = 'sk-gen';
    const pool = createTextLlmClientPool(undefined, { timeout: 999, maxRetries: 3 });
    expect(pool).toHaveLength(1);
    expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ timeout: 999, maxRetries: 3 }));
  });

  it('includes baseURL for deepseek provider when key is set', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-ds';
    const pool = createTextLlmClientPool();
    expect(pool).toHaveLength(1);
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-ds',
        baseURL: 'https://api.deepseek.com/v1',
      }),
    );
  });

  it('respects custom DEEPSEEK_BASE_URL', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-ds';
    process.env.DEEPSEEK_BASE_URL = 'https://custom-ds.example.com/v1';
    void createTextLlmClientPool();
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-ds',
        baseURL: 'https://custom-ds.example.com/v1',
      }),
    );
  });

  it('does not include baseURL for openai when OPENAI_BASE_URL is unset', () => {
    process.env.OPENAI_API_KEY = 'sk-oai';
    const pool = createTextLlmClientPool();
    expect(pool).toHaveLength(1);
    const openaiCalls = (OpenAI as unknown as jest.Mock).mock.calls as Array<[{ apiKey: string }]>;
    const callArg = openaiCalls[0]?.[0];
    expect(callArg).not.toHaveProperty('baseURL');
  });
});

describe('chatCompletionWithProviderFallback', () => {
  let mockClients: Array<{
    options: Record<string, unknown>;
    chat: { completions: { create: jest.Mock } };
  }>;

  const successResponse = { id: 'chat-ok', choices: [{ message: { content: 'hello' } }] };

  function makeClient(apiKey: string) {
    return {
      options: { apiKey },
      chat: { completions: { create: jest.fn() } },
    };
  }

  const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model: 'deepseek-v4-flash',
    messages: [{ role: 'user', content: 'hi' }],
  };

  beforeEach(() => {
    mockClients = [makeClient('sk-primary'), makeClient('sk-secondary')];
  });

  it('throws ProviderPoolExhaustedError when pool is empty', async () => {
    await expect(chatCompletionWithProviderFallback([], params)).rejects.toThrow(
      ProviderPoolExhaustedError,
    );

    await expect(chatCompletionWithProviderFallback([], params)).rejects.toThrow(
      'All configured LLM providers exhausted',
    );
  });

  it('returns immediately when the primary client succeeds', async () => {
    mockClients[0].chat.completions.create.mockResolvedValue(successResponse);

    const result = await chatCompletionWithProviderFallback(
      mockClients as unknown as OpenAI[],
      params,
    );

    expect(result).toEqual(successResponse);
    expect(mockClients[0].chat.completions.create).toHaveBeenCalledTimes(1);
    expect(mockClients[1].chat.completions.create).not.toHaveBeenCalled();
  });

  it('falls back to the secondary provider on AuthenticationError from primary', async () => {
    mockClients[0].chat.completions.create.mockRejectedValue(
      new AuthenticationError(401, undefined, undefined, undefined),
    );
    mockClients[1].chat.completions.create.mockResolvedValue(successResponse);

    const result = await chatCompletionWithProviderFallback(
      mockClients as unknown as OpenAI[],
      params,
    );

    expect(result).toEqual(successResponse);
    expect(mockClients[0].chat.completions.create).toHaveBeenCalledTimes(1);
    expect(mockClients[1].chat.completions.create).toHaveBeenCalledTimes(1);
    expect(mockClients[1].chat.completions.create).toHaveBeenCalledWith(params);
  });

  it('falls back to the secondary provider on APIConnectionError from primary', async () => {
    mockClients[0].chat.completions.create.mockRejectedValue(
      new APIConnectionError({ message: 'connection refused', cause: undefined }),
    );
    mockClients[1].chat.completions.create.mockResolvedValue(successResponse);

    const result = await chatCompletionWithProviderFallback(
      mockClients as unknown as OpenAI[],
      params,
    );

    expect(result).toEqual(successResponse);
    expect(mockClients[0].chat.completions.create).toHaveBeenCalledTimes(1);
    expect(mockClients[1].chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it('does NOT fall back on non-fallbackable errors (e.g. RateLimitError)', async () => {
    const rateLimitError = new Error('429 Too Many Requests');
    (rateLimitError as Record<string, unknown>).status = 429;
    mockClients[0].chat.completions.create.mockRejectedValue(rateLimitError);

    await expect(
      chatCompletionWithProviderFallback(mockClients as unknown as OpenAI[], params),
    ).rejects.toThrow('429 Too Many Requests');

    expect(mockClients[0].chat.completions.create).toHaveBeenCalledTimes(1);
    expect(mockClients[1].chat.completions.create).not.toHaveBeenCalled();
  });

  it('throws ProviderPoolExhaustedError when all providers fail with fallbackable errors', async () => {
    mockClients[0].chat.completions.create.mockRejectedValue(
      new AuthenticationError(401, undefined, undefined, undefined),
    );
    mockClients[1].chat.completions.create.mockRejectedValue(
      new APIConnectionError({ message: 'timeout', cause: undefined }),
    );

    const err = await chatCompletionWithProviderFallback(
      mockClients as unknown as OpenAI[],
      params,
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ProviderPoolExhaustedError);
    expect((err as ProviderPoolExhaustedError).errors).toHaveLength(2);
  });

  it('tries fallbackModel on the last provider when it fails with auth error', async () => {
    mockClients = [makeClient('sk-primary')]; // Single-provider pool
    mockClients[0].chat.completions.create.mockRejectedValueOnce(
      new AuthenticationError(401, undefined, undefined, undefined),
    );
    mockClients[0].chat.completions.create.mockResolvedValueOnce(successResponse);

    const result = await chatCompletionWithProviderFallback(
      mockClients as unknown as OpenAI[],
      params,
      'gpt-4o-mini',
    );

    expect(result).toEqual(successResponse);
    expect(mockClients[0].chat.completions.create).toHaveBeenCalledTimes(2);
    expect(mockClients[0].chat.completions.create).toHaveBeenNthCalledWith(1, params);
    expect(mockClients[0].chat.completions.create).toHaveBeenNthCalledWith(2, {
      ...params,
      model: 'gpt-4o-mini',
    });
  });

  it('throws ProviderPoolExhaustedError when fallbackModel also fails on last provider', async () => {
    mockClients = [makeClient('sk-primary')]; // Single-provider pool
    mockClients[0].chat.completions.create.mockRejectedValueOnce(
      new AuthenticationError(401, undefined, undefined, undefined),
    );
    mockClients[0].chat.completions.create.mockRejectedValueOnce(
      new APIConnectionError({ message: 'also down', cause: undefined }),
    );

    const err = await chatCompletionWithProviderFallback(
      mockClients as unknown as OpenAI[],
      params,
      'gpt-4o-mini',
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ProviderPoolExhaustedError);
    expect((err as ProviderPoolExhaustedError).errors).toHaveLength(2);
  });

  it('does NOT try fallbackModel on a non-last provider (only last provider gets model fallback)', async () => {
    const threeClients = [makeClient('sk-1'), makeClient('sk-2'), makeClient('sk-3')];
    threeClients[0].chat.completions.create.mockRejectedValue(
      new AuthenticationError(401, undefined, undefined, undefined),
    );
    threeClients[1].chat.completions.create.mockResolvedValue(successResponse);

    const result = await chatCompletionWithProviderFallback(
      threeClients as unknown as OpenAI[],
      params,
      'gpt-4o-mini',
    );

    expect(result).toEqual(successResponse);
    expect(threeClients[0].chat.completions.create).toHaveBeenCalledTimes(1);
    expect(threeClients[1].chat.completions.create).toHaveBeenCalledTimes(1);
    expect(threeClients[2].chat.completions.create).not.toHaveBeenCalled();
  });
});
