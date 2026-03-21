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
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function resolveWorkerOpenAIModel(role: WorkerOpenAIModelRole): string {
  switch (role) {
    case "brain":
      return readEnv("OPENAI_BRAIN_MODEL") || DEFAULT_MODELS.brain;
    case "brain_fallback":
      return (
        readEnv("OPENAI_BRAIN_FALLBACK_MODEL") || DEFAULT_MODELS.brain_fallback
      );
    case "writer":
      return (
        readEnv("OPENAI_WRITER_MODEL") ||
        readEnv("OPENAI_MODEL") ||
        DEFAULT_MODELS.writer
      );
    case "writer_fallback":
      return (
        readEnv("OPENAI_WRITER_FALLBACK_MODEL") ||
        readEnv("OPENAI_FALLBACK_MODEL") ||
        DEFAULT_MODELS.writer_fallback
      );
    case "audio_understanding":
      return (
        readEnv("OPENAI_AUDIO_UNDERSTANDING_MODEL") ||
        DEFAULT_MODELS.audio_understanding
      );
    case "audio_understanding_fallback":
      return (
        readEnv("OPENAI_AUDIO_UNDERSTANDING_FALLBACK_MODEL") ||
        DEFAULT_MODELS.audio_understanding_fallback
      );
  }
}

export function shouldRequireAudioReplyByDefault(): boolean {
  return readEnv("VOICE_RESPONSE_AUDIO_REQUIRED") === "true";
}

export function resolveVoiceProvider(): string {
  return readEnv("VOICE_PROVIDER") || "elevenlabs";
}
