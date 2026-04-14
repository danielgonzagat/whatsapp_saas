import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { v4 as uuid } from 'uuid';
import { PlanLimitsService } from '../billing/plan-limits.service';
import {
  collectAllowedHosts,
  validateAllowlistedUserUrl,
  validateNoInternalAccess,
} from '../common/utils/url-validator';
import { resolveBackendOpenAIModel } from '../lib/openai-models';

const DATA_AUDIO___A_Z___BASE_RE = /^data:audio\/[a-z]+;base64,/;

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);
  private openai: OpenAI;

  constructor(
    private config: ConfigService,
    private readonly planLimits: PlanLimitsService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
  }

  private estimateTextTokens(...chunks: Array<string | undefined>) {
    const text = chunks.filter(Boolean).join(' ').trim();
    if (!text) {
      return 500;
    }
    return Math.max(200, Math.ceil(text.length / 4));
  }

  private async ensureBudget(workspaceId?: string) {
    if (!workspaceId) {
      this.logger.debug(
        'Audio request without workspace budget context; treating it as guest/transient flow.',
      );
      return;
    }
    await this.planLimits.ensureTokenBudget(workspaceId);
  }

  private async trackUsage(workspaceId: string | undefined, tokens: number, feature: string) {
    if (!workspaceId) {
      this.logger.debug(
        `[${feature}] guest/transient audio usage is not associated with a workspace budget.`,
      );
      return;
    }
    await this.planLimits.trackAiUsage(workspaceId, tokens).catch((error) => {
      this.logger.warn(`[${feature}] failed to track AI usage: ${error?.message || error}`);
    });
  }

  /**
   * Transcribes audio using OpenAI Whisper
   */
  async transcribe(
    audioBuffer: Buffer,
    language = 'pt',
    workspaceId?: string,
  ): Promise<{
    text: string;
    duration?: number;
    language: string;
  }> {
    const tempFile = path.join(os.tmpdir(), `audio-${uuid()}.mp3`);

    try {
      // Write buffer to temp file (Whisper requires file)
      fs.writeFileSync(tempFile, audioBuffer);

      let transcription;
      try {
        // tokenBudget: caller responsible for pre-flight budget check
        await this.ensureBudget(workspaceId);
        transcription = await this.openai.audio.transcriptions.create({
          file: fs.createReadStream(tempFile),
          model: resolveBackendOpenAIModel('audio_understanding', this.config),
          language,
          response_format: 'verbose_json',
        });
      } catch (primaryError) {
        this.logger.warn(
          `Primary audio model failed, retrying with fallback: ${
            (primaryError as Error)?.message || primaryError
          }`,
        );
        // tokenBudget: caller responsible for pre-flight budget check
        transcription = await this.openai.audio.transcriptions.create({
          file: fs.createReadStream(tempFile),
          model: resolveBackendOpenAIModel('audio_understanding_fallback', this.config),
          language,
          response_format: 'verbose_json',
        });
      }

      this.logger.log(`Transcription completed: ${transcription.text?.substring(0, 50)}...`);
      await this.trackUsage(
        workspaceId,
        this.estimateTextTokens(transcription.text, language),
        'audio.transcribe',
      );
      return {
        text: transcription.text || '',
        duration: transcription.duration,
        language: transcription.language || language,
      };
    } catch (error) {
      this.logger.error('Transcription failed:', error);
      throw error;
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }

  /**
   * Transcribes audio from URL
   */
  async transcribeFromUrl(
    audioUrl: string,
    language = 'pt',
    workspaceId?: string,
  ): Promise<{
    text: string;
    duration?: number;
    language: string;
  }> {
    try {
      const requestedUrl = String(audioUrl || '').trim();
      validateNoInternalAccess(requestedUrl);
      this.validateAudioSourceUrl(requestedUrl);

      const response = await fetch(requestedUrl, {
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return this.transcribe(buffer, language, workspaceId);
    } catch (error) {
      this.logger.error(`Failed to transcribe from URL: ${audioUrl}`, error);
      throw error;
    }
  }

  private validateAudioSourceUrl(rawUrl: string): void {
    const allowedHosts = collectAllowedHosts(
      process.env.AUDIO_FETCH_ALLOWLIST,
      process.env.CDN_BASE_URL,
      process.env.MEDIA_BASE_URL,
      process.env.R2_PUBLIC_URL,
    );

    if (allowedHosts.size === 0) {
      throw new BadRequestException('AUDIO_FETCH_ALLOWLIST not configured');
    }

    validateAllowlistedUserUrl(rawUrl, allowedHosts);
  }

  /**
   * Transcribes base64 encoded audio
   */
  async transcribeFromBase64(
    base64Audio: string,
    language = 'pt',
    workspaceId?: string,
  ): Promise<{
    text: string;
    duration?: number;
    language: string;
  }> {
    // Remove data URL prefix if present
    const base64Data = base64Audio.replace(DATA_AUDIO___A_Z___BASE_RE, '');
    const buffer = Buffer.from(base64Data, 'base64');

    return this.transcribe(buffer, language, workspaceId);
  }

  /**
   * Generates speech from text using OpenAI TTS
   */
  async textToSpeech(text: string, voice?: string, workspaceId?: string): Promise<Buffer> {
    try {
      const ttsVoice = voice || process.env.OPENAI_TTS_VOICE || 'nova';
      const ttsSpeed = Number.parseFloat(process.env.OPENAI_TTS_SPEED || '1.0');

      // tokenBudget: caller responsible for pre-flight budget check
      await this.ensureBudget(workspaceId);
      const response = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: ttsVoice as any,
        input: text,
        speed: ttsSpeed,
        response_format: 'opus',
      });
      await this.trackUsage(workspaceId, this.estimateTextTokens(text), 'audio.textToSpeech');

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logger.error('Text-to-speech failed:', error);
      throw error;
    }
  }

  /**
   * Generates high-quality speech from text using OpenAI TTS HD
   */
  async textToSpeechHD(text: string, voice?: string, workspaceId?: string): Promise<Buffer> {
    try {
      const ttsVoice = voice || process.env.OPENAI_TTS_VOICE || 'nova';
      const ttsSpeed = Number.parseFloat(process.env.OPENAI_TTS_SPEED || '1.0');

      // tokenBudget: caller responsible for pre-flight budget check
      await this.ensureBudget(workspaceId);
      const response = await this.openai.audio.speech.create({
        model: 'tts-1-hd',
        voice: ttsVoice as any,
        input: text,
        speed: ttsSpeed,
        response_format: 'opus',
      });
      await this.trackUsage(
        workspaceId,
        this.estimateTextTokens(text) + 200,
        'audio.textToSpeechHD',
      );

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logger.error('Text-to-speech HD failed:', error);
      throw error;
    }
  }
}
