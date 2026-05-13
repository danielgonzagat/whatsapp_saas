import { describe, it, expect, beforeEach } from 'vitest';

const envBackup = { ...process.env };

function clearOpenAiEnvs() {
  const keys = Object.keys(process.env).filter(
    (k) => k.startsWith('OPENAI_') || k === 'VOICE_RESPONSE_AUDIO_REQUIRED',
  );
  for (const k of keys) {
    delete process.env[k];
  }
}

describe('openai-models', () => {
  beforeEach(() => {
    clearOpenAiEnvs();
  });

  describe('resolveWorkerOpenAIModel', () => {
    it('returns default brain model when no env set', async () => {
      const { resolveWorkerOpenAIModel } = await import('../providers/openai-models');
      expect(resolveWorkerOpenAIModel('brain')).toBe('gpt-5.4');
    });

    it('returns default brain_fallback model when no env set', async () => {
      const { resolveWorkerOpenAIModel } = await import('../providers/openai-models');
      expect(resolveWorkerOpenAIModel('brain_fallback')).toBe('gpt-4.1');
    });

    it('returns default writer model when no env set', async () => {
      const { resolveWorkerOpenAIModel } = await import('../providers/openai-models');
      expect(resolveWorkerOpenAIModel('writer')).toBe('gpt-5.4-nano-2026-03-17');
    });

    it('returns default writer_fallback model when no env set', async () => {
      const { resolveWorkerOpenAIModel } = await import('../providers/openai-models');
      expect(resolveWorkerOpenAIModel('writer_fallback')).toBe('gpt-4.1');
    });

    it('returns default audio_understanding model when no env set', async () => {
      const { resolveWorkerOpenAIModel } = await import('../providers/openai-models');
      expect(resolveWorkerOpenAIModel('audio_understanding')).toBe('gpt-tempo-real-1.5');
    });

    it('returns default audio_understanding_fallback model when no env set', async () => {
      const { resolveWorkerOpenAIModel } = await import('../providers/openai-models');
      expect(resolveWorkerOpenAIModel('audio_understanding_fallback')).toBe('gpt-4o-mini-transcribe');
    });

    it('overrides brain model via OPENAI_BRAIN_MODEL env', async () => {
      process.env.OPENAI_BRAIN_MODEL = 'custom-brain';
      const { resolveWorkerOpenAIModel } = await import('../providers/openai-models');
      expect(resolveWorkerOpenAIModel('brain')).toBe('custom-brain');
    });

    it('overrides writer model via OPENAI_MODEL env when OPENAI_WRITER_MODEL not set', async () => {
      process.env.OPENAI_MODEL = 'global-model';
      const { resolveWorkerOpenAIModel } = await import('../providers/openai-models');
      expect(resolveWorkerOpenAIModel('writer')).toBe('global-model');
    });

    it('prefers OPENAI_WRITER_MODEL over OPENAI_MODEL for writer role', async () => {
      process.env.OPENAI_MODEL = 'global-model';
      process.env.OPENAI_WRITER_MODEL = 'writer-specific';
      const { resolveWorkerOpenAIModel } = await import('../providers/openai-models');
      expect(resolveWorkerOpenAIModel('writer')).toBe('writer-specific');
    });

    it('overrides writer_fallback via OPENAI_FALLBACK_MODEL', async () => {
      process.env.OPENAI_FALLBACK_MODEL = 'fallback-global';
      const { resolveWorkerOpenAIModel } = await import('../providers/openai-models');
      expect(resolveWorkerOpenAIModel('writer_fallback')).toBe('fallback-global');
    });

    it('prefers OPENAI_WRITER_FALLBACK_MODEL over OPENAI_FALLBACK_MODEL', async () => {
      process.env.OPENAI_FALLBACK_MODEL = 'fallback-global';
      process.env.OPENAI_WRITER_FALLBACK_MODEL = 'writer-fallback-specific';
      const { resolveWorkerOpenAIModel } = await import('../providers/openai-models');
      expect(resolveWorkerOpenAIModel('writer_fallback')).toBe('writer-fallback-specific');
    });

    it('ignores empty string env values and falls back to default', async () => {
      process.env.OPENAI_BRAIN_MODEL = '   ';
      const { resolveWorkerOpenAIModel } = await import('../providers/openai-models');
      expect(resolveWorkerOpenAIModel('brain')).toBe('gpt-5.4');
    });

    it('overrides audio_understanding via env', async () => {
      process.env.OPENAI_AUDIO_UNDERSTANDING_MODEL = 'custom-audio';
      const { resolveWorkerOpenAIModel } = await import('../providers/openai-models');
      expect(resolveWorkerOpenAIModel('audio_understanding')).toBe('custom-audio');
    });
  });

  describe('shouldRequireAudioReplyByDefault', () => {
    it('returns false when env not set', async () => {
      const { shouldRequireAudioReplyByDefault } = await import('../providers/openai-models');
      expect(shouldRequireAudioReplyByDefault()).toBe(false);
    });

    it('returns false when env set to false', async () => {
      process.env.VOICE_RESPONSE_AUDIO_REQUIRED = 'false';
      const { shouldRequireAudioReplyByDefault } = await import('../providers/openai-models');
      expect(shouldRequireAudioReplyByDefault()).toBe(false);
    });

    it('returns false when env set to something random', async () => {
      process.env.VOICE_RESPONSE_AUDIO_REQUIRED = 'yes';
      const { shouldRequireAudioReplyByDefault } = await import('../providers/openai-models');
      expect(shouldRequireAudioReplyByDefault()).toBe(false);
    });

    it('returns true when env set to "true"', async () => {
      process.env.VOICE_RESPONSE_AUDIO_REQUIRED = 'true';
      const { shouldRequireAudioReplyByDefault } = await import('../providers/openai-models');
      expect(shouldRequireAudioReplyByDefault()).toBe(true);
    });

    it('trims whitespace and returns true', async () => {
      process.env.VOICE_RESPONSE_AUDIO_REQUIRED = ' true ';
      const { shouldRequireAudioReplyByDefault } = await import('../providers/openai-models');
      expect(shouldRequireAudioReplyByDefault()).toBe(true);
    });
  });
});
