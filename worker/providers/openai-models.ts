/** Worker open ai model role type. */
export type WorkerOpenAIModelRole =
  | 'brain'
  | 'brain_fallback'
  | 'writer'
  | 'writer_fallback'
  | 'audio_understanding'
  | 'audio_understanding_fallback';

const DEFAULT_MODELS: Record<WorkerOpenAIModelRole, string> = {
  brain: 'gpt-5.4',
  brain_fallback: 'gpt-4.1',
  writer: 'gpt-5.4-nano-2026-03-17',
  writer_fallback: 'gpt-4.1',
  audio_understanding: 'gpt-tempo-real-1.5',
  audio_understanding_fallback: 'gpt-4o-mini-transcribe',
};

function readEnv(key: string): string | undefined {
  const value = process.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

const ROLE_ENV_CHAIN: Record<WorkerOpenAIModelRole, readonly string[]> = {
  brain: ['OPENAI_BRAIN_MODEL'],
  brain_fallback: ['OPENAI_BRAIN_FALLBACK_MODEL'],
  writer: ['OPENAI_WRITER_MODEL', 'OPENAI_MODEL'],
  writer_fallback: ['OPENAI_WRITER_FALLBACK_MODEL', 'OPENAI_FALLBACK_MODEL'],
  audio_understanding: ['OPENAI_AUDIO_UNDERSTANDING_MODEL'],
  audio_understanding_fallback: ['OPENAI_AUDIO_UNDERSTANDING_FALLBACK_MODEL'],
};

function resolveFromChain(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = readEnv(key);
    if (value) {
      return value;
    }
  }
  return undefined;
}

/** Resolve worker open ai model. */
export function resolveWorkerOpenAIModel(role: WorkerOpenAIModelRole): string {
  return resolveFromChain(ROLE_ENV_CHAIN[role]) || DEFAULT_MODELS[role];
}

/** Should require audio reply by default. */
export function shouldRequireAudioReplyByDefault(): boolean {
  return readEnv('VOICE_RESPONSE_AUDIO_REQUIRED') === 'true';
}
