import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AudioService } from './audio.service';
import { PlanLimitsService } from '../billing/plan-limits.service';

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
}));

jest.mock('../observability/ops-alert.service', () => ({
  OpsAlertService: jest.fn().mockImplementation(() => ({
    alertOnCriticalError: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../billing/plan-limits.service', () => ({
  PlanLimitsService: jest.fn().mockImplementation(() => ({
    ensureTokenBudget: jest.fn(),
    trackAiUsage: jest.fn(),
  })),
}));

jest.mock('../lib/openai-models', () => ({
  resolveBackendOpenAIModel: jest.fn().mockReturnValue('whisper-1'),
}));

jest.mock('openai', () => {
  const mockAudio = {
    transcriptions: { create: jest.fn() },
    speech: { create: jest.fn() },
  };
  return {
    default: jest.fn().mockImplementation(() => ({
      audio: mockAudio,
    })),
  };
});

jest.mock('node:fs', () => ({
  writeFileSync: jest.fn(),
  createReadStream: jest.fn().mockReturnValue({ pipe: jest.fn() }),
  existsSync: jest.fn().mockReturnValue(true),
  unlinkSync: jest.fn(),
}));

describe('AudioService', () => {
  let service: AudioService;
  let planLimits: { ensureTokenBudget: jest.Mock; trackAiUsage: jest.Mock };
  let openaiInstance: {
    audio: { transcriptions: { create: jest.Mock }; speech: { create: jest.Mock } };
  };

  beforeEach(async () => {
    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };

    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'sk-test-key';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AudioService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: PlanLimitsService, useValue: planLimits },
      ],
    }).compile();

    service = module.get<AudioService>(AudioService);
    const openaiMock = (await import('openai')) as unknown as {
      default: jest.Mock;
    };
    openaiInstance = openaiMock.default.mock.results[0]?.value as {
      audio: { transcriptions: { create: jest.Mock }; speech: { create: jest.Mock } };
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('transcribe', () => {
    it('transcribes audio buffer using OpenAI Whisper', async () => {
      openaiInstance.audio.transcriptions.create.mockResolvedValueOnce({
        text: 'Olá, isso é um teste de transcrição.',
        duration: 3.5,
        language: 'pt',
      });

      const result = await service.transcribe(Buffer.from('fake-audio'), 'pt', 'ws-1');

      expect(result.text).toBe('Olá, isso é um teste de transcrição.');
      expect(result.duration).toBe(3.5);
      expect(result.language).toBe('pt');
      expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith('ws-1');
    });

    it('handles guest/transient flow without workspaceId', async () => {
      openaiInstance.audio.transcriptions.create.mockResolvedValueOnce({
        text: 'Transcrição guest.',
        duration: 1.2,
        language: 'en',
      });

      const result = await service.transcribe(Buffer.from('guest-audio'));

      expect(result.text).toBe('Transcrição guest.');
      expect(planLimits.ensureTokenBudget).not.toHaveBeenCalled();
    });

    it('falls back to secondary model on primary model failure', async () => {
      openaiInstance.audio.transcriptions.create
        .mockRejectedValueOnce(new Error('primary model unavailable'))
        .mockResolvedValueOnce({
          text: 'Fallback transcription.',
          duration: 2.0,
          language: 'pt',
        });

      const result = await service.transcribe(Buffer.from('fallback-audio'), 'pt', 'ws-1');

      expect(result.text).toBe('Fallback transcription.');
      expect(openaiInstance.audio.transcriptions.create).toHaveBeenCalledTimes(2);
    });

    it('propagates errors when both primary and fallback fail', async () => {
      openaiInstance.audio.transcriptions.create.mockRejectedValue(
        new Error('all models unavailable'),
      );

      await expect(service.transcribe(Buffer.from('bad-audio'), 'pt', 'ws-1')).rejects.toThrow(
        'all models unavailable',
      );
    });
  });

  describe('textToSpeech', () => {
    it('generates speech from text', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      openaiInstance.audio.speech.create.mockResolvedValueOnce({
        arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer),
      });

      const result = await service.textToSpeech('Olá mundo', undefined, 'ws-1');

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith('ws-1');
    });

    it('generates HD speech from text', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      openaiInstance.audio.speech.create.mockResolvedValueOnce({
        arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer),
      });

      const result = await service.textToSpeechHD('Teste HD', undefined, 'ws-1');

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('transcribeFromBase64', () => {
    it('decodes base64 and delegates to transcribe', async () => {
      openaiInstance.audio.transcriptions.create.mockResolvedValueOnce({
        text: 'Base64 transcription.',
        duration: 1.5,
        language: 'pt',
      });

      const result = await service.transcribeFromBase64(
        'data:audio/mp3;base64,SGV5IHRoZXJl',
        'pt',
        'ws-1',
      );

      expect(result.text).toBe('Base64 transcription.');
      expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('transcribeFromUrl — SSRF defenses', () => {
    beforeEach(() => {
      process.env.CDN_BASE_URL = 'cdn.kloel.com';
      process.env.AUDIO_FETCH_ALLOWLIST = 'cdn.kloel.com';
    });

    afterEach(() => {
      delete process.env.CDN_BASE_URL;
      delete process.env.AUDIO_FETCH_ALLOWLIST;
    });

    it('rejects unlisted host', async () => {
      await expect(
        service.transcribeFromUrl('https://evil.example.com/audio.mp3', 'pt', 'ws-1'),
      ).rejects.toThrow();
    });

    it('rejects path with unsupported characters', async () => {
      await expect(
        service.transcribeFromUrl('https://cdn.kloel.com/audio@bad.mp3', 'pt', 'ws-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
