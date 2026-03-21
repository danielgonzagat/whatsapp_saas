import { ConfigService } from '@nestjs/config';

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

function readConfig(key: string, config?: ConfigLike): string | undefined {
  const fromConfig = config?.get<string>(key);
  const value =
    typeof fromConfig === 'string' && fromConfig.trim()
      ? fromConfig
      : process.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function resolveBackendOpenAIModel(
  role: BackendOpenAIModelRole,
  config?: ConfigLike,
): string {
  switch (role) {
    case 'brain':
      return (
        readConfig('OPENAI_BRAIN_MODEL', config) || DEFAULT_MODELS.brain
      );
    case 'brain_fallback':
      return (
        readConfig('OPENAI_BRAIN_FALLBACK_MODEL', config) ||
        DEFAULT_MODELS.brain_fallback
      );
    case 'writer':
      return (
        readConfig('OPENAI_WRITER_MODEL', config) ||
        readConfig('OPENAI_MODEL', config) ||
        DEFAULT_MODELS.writer
      );
    case 'writer_fallback':
      return (
        readConfig('OPENAI_WRITER_FALLBACK_MODEL', config) ||
        readConfig('OPENAI_FALLBACK_MODEL', config) ||
        DEFAULT_MODELS.writer_fallback
      );
    case 'audio_understanding':
      return (
        readConfig('OPENAI_AUDIO_UNDERSTANDING_MODEL', config) ||
        DEFAULT_MODELS.audio_understanding
      );
    case 'audio_understanding_fallback':
      return (
        readConfig('OPENAI_AUDIO_UNDERSTANDING_FALLBACK_MODEL', config) ||
        DEFAULT_MODELS.audio_understanding_fallback
      );
  }
}

export function resolveVoiceProvider(config?: ConfigLike): string {
  return readConfig('VOICE_PROVIDER', config) || 'elevenlabs';
}

export function shouldRequireAudioReplyByDefault(config?: ConfigLike): boolean {
  return readConfig('VOICE_RESPONSE_AUDIO_REQUIRED', config) === 'true';
}
