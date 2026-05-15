import { ConfigService } from '@nestjs/config';

/** Backend open ai model role type. */
type BackendOpenAIModelRole =
  | 'brain'
  | 'brain_fallback'
  | 'writer'
  | 'writer_fallback'
  | 'guest_emergency'
  | 'image_generation'
  | 'audio_understanding'
  | 'audio_understanding_fallback';

type ConfigLike = Pick<ConfigService, 'get'> | undefined;

const DEFAULT_MODELS: Record<BackendOpenAIModelRole, string> = {
  brain: 'deepseek-v4-pro',
  brain_fallback: 'deepseek-v4-flash',
  writer: 'deepseek-v4-pro',
  writer_fallback: 'deepseek-v4-flash',
  guest_emergency: 'deepseek-v4-flash',
  image_generation: 'dall-e-3',
  audio_understanding: 'gpt-tempo-real-1.5',
  audio_understanding_fallback: 'gpt-4o-mini-transcribe',
};

export const CANONICAL_MODEL_IDS = {
  imageGeneration: DEFAULT_MODELS.image_generation,
  openAiTextMini: 'gpt-4o-mini',
  openAiTextOmni: 'gpt-4o',
  openAiTextMock: 'gpt-4o-mock',
  openAiTextStub: 'gpt-stub',
  openAiLegacyGpt4: 'gpt-4',
  openAiLegacyGpt35: 'gpt-3.5',
  openAiLegacyGpt35Turbo: 'gpt-3.5-turbo',
  anthropicHealthProbe: 'claude-3-haiku-20240307',
  anthropicSonnetTest: 'claude-sonnet',
} as const;

// Ordered ENV keys per role. First non-empty value wins.
const MODEL_ENV_KEYS: Record<BackendOpenAIModelRole, readonly string[]> = {
  brain: ['DEEPSEEK_BRAIN_MODEL', 'LLM_BRAIN_MODEL', 'OPENAI_BRAIN_MODEL'],
  brain_fallback: [
    'DEEPSEEK_BRAIN_FALLBACK_MODEL',
    'LLM_BRAIN_FALLBACK_MODEL',
    'OPENAI_BRAIN_FALLBACK_MODEL',
  ],
  writer: ['DEEPSEEK_WRITER_MODEL', 'LLM_WRITER_MODEL', 'OPENAI_WRITER_MODEL', 'OPENAI_MODEL'],
  writer_fallback: [
    'DEEPSEEK_WRITER_FALLBACK_MODEL',
    'LLM_WRITER_FALLBACK_MODEL',
    'OPENAI_WRITER_FALLBACK_MODEL',
    'OPENAI_FALLBACK_MODEL',
  ],
  guest_emergency: [
    'DEEPSEEK_GUEST_EMERGENCY_MODEL',
    'LLM_GUEST_EMERGENCY_MODEL',
    'OPENAI_GUEST_EMERGENCY_MODEL',
  ],
  image_generation: ['OPENAI_IMAGE_MODEL'],
  audio_understanding: ['OPENAI_AUDIO_UNDERSTANDING_MODEL'],
  audio_understanding_fallback: ['OPENAI_AUDIO_UNDERSTANDING_FALLBACK_MODEL'],
};

function readConfig(key: string, config?: ConfigLike): string | undefined {
  const fromConfig = config?.get<string>(key);
  const value = typeof fromConfig === 'string' && fromConfig.trim() ? fromConfig : process.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function firstConfiguredValue(keys: readonly string[], config?: ConfigLike): string | undefined {
  for (const key of keys) {
    const value = readConfig(key, config);
    if (value) {
      return value;
    }
  }
  return undefined;
}

/** Resolve backend open ai model. */
export function resolveBackendOpenAIModel(
  role: BackendOpenAIModelRole,
  config?: ConfigLike,
): string {
  return firstConfiguredValue(MODEL_ENV_KEYS[role], config) || DEFAULT_MODELS[role];
}

/** Should require audio reply by default. */
export function shouldRequireAudioReplyByDefault(config?: ConfigLike): boolean {
  return readConfig('VOICE_RESPONSE_AUDIO_REQUIRED', config) === 'true';
}
