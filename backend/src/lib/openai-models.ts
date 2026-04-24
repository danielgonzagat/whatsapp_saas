import { ConfigService } from '@nestjs/config';

/** Backend open ai model role type. */
export type BackendOpenAIModelRole =
  | 'brain'
  | 'brain_fallback'
  | 'writer'
  | 'writer_fallback'
  | 'audio_understanding'
  | 'audio_understanding_fallback';

type ConfigLike = Pick<ConfigService, 'get'> | undefined;

const DEFAULT_MODELS: Record<BackendOpenAIModelRole, string> = {
  brain: 'gpt-5.4',
  brain_fallback: 'gpt-4.1',
  writer: 'gpt-5.4-nano-2026-03-17',
  writer_fallback: 'gpt-4.1',
  audio_understanding: 'gpt-tempo-real-1.5',
  audio_understanding_fallback: 'gpt-4o-mini-transcribe',
};

// Ordered ENV keys per role. First non-empty value wins.
const MODEL_ENV_KEYS: Record<BackendOpenAIModelRole, readonly string[]> = {
  brain: ['OPENAI_BRAIN_MODEL'],
  brain_fallback: ['OPENAI_BRAIN_FALLBACK_MODEL'],
  writer: ['OPENAI_WRITER_MODEL', 'OPENAI_MODEL'],
  writer_fallback: ['OPENAI_WRITER_FALLBACK_MODEL', 'OPENAI_FALLBACK_MODEL'],
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

export const DALLE3_MODEL = 'dall-e-3';
