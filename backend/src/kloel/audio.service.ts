import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '../logging/structured-logger';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { getTraceHeaders } from '../common/trace-headers';
import {
  validateAllowlistedUserUrl,
  validateNoInternalAccess,
} from '../common/utils/url-validator';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { OpsAlertService } from '../observability/ops-alert.service';
import {
  buildAllowlistedAudioFetchUrl,
  collectAudioAllowlist,
  estimateAudioTextTokens,
  stripAudioBase64Prefix,
} from './audio.helpers';

/** Audio service. */
@Injectable()
export class AudioService {
  private readonly logger = StructuredLogger.from(AudioService.name);
  private openai: OpenAI;

  constructor(
    private config: ConfigService,
    private readonly planLimits: PlanLimitsService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {
    this.openai = new OpenAI({
      apiKey:
        this.config.get<string>('DEEPSEEK_API_KEY') || this.config.get<string>('OPENAI_API_KEY'),
      baseURL: this.config.get<string>('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com/v1',
    });
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
    const tempFile = join(tmpdir(), `audio-${randomUUID()}.mp3`);

    try {
      // Write buffer to temp file (Whisper requires file)
      fs.writeFileSync(tempFile, audioBuffer);

      let transcription: OpenAI.Audio.Transcriptions.TranscriptionVerbose;
      try {
        // tokenBudget: caller responsible for pre-flight budget check
        await this.ensureBudget(workspaceId);
        transcription = await this.openai.audio.transcriptions.create({
          file: fs.createReadStream(tempFile),
          model: resolveBackendOpenAIModel('audio_understanding', this.config),
          language,
          response_format: 'verbose_json',
        });
      } catch (primaryError: unknown) {
        void this.opsAlert?.alertOnCriticalError(
          primaryError,
          'AudioService.resolveBackendOpenAIModel',
        );
        const errMsg = primaryError instanceof Error ? primaryError.message : String(primaryError);
        this.logger.warn(`Primary audio model failed, retrying with fallback: ${errMsg}`);
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
        estimateAudioTextTokens(transcription.text, language),
        'audio.transcribe',
      );
      return {
        text: transcription.text || '',
        duration: transcription.duration,
        language: transcription.language || language,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AudioService.estimateTextTokens');
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
      // SSRF defense: parse + validate against private/internal ranges, then
      // re-serialize through a fresh URL object so the request target is the
      // sanitizer's output (not the raw user-supplied string). The allowlist
      // check rejects anything outside the configured CDN/media hosts before
      // we hit the network.
      const safeUrl = validateNoInternalAccess(requestedUrl);
      this.validateAudioSourceUrl(safeUrl.toString());

      // CodeQL js/request-forgery barrier: rebuild the fetch URL with a host
      // taken verbatim from the server-controlled allowlist and a path that
      // has passed a strict whitelist regex. Both barriers (constant origin +
      // sanitized path) cut the taint flow from the user-supplied string.
      const fetchUrl = buildAllowlistedAudioFetchUrl(safeUrl, collectAudioAllowlist());

      const response = await fetch(fetchUrl.toString(), {
        headers: getTraceHeaders(),
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return this.transcribe(buffer, language, workspaceId);
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AudioService.transcribe');
      this.logger.error(`Failed to transcribe from URL: ${audioUrl}`, error);
      throw error;
    }
  }

  private validateAudioSourceUrl(rawUrl: string): void {
    const allowedHosts = collectAudioAllowlist();
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
    const base64Data = stripAudioBase64Prefix(base64Audio);
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
        voice: ttsVoice,
        input: text,
        speed: ttsSpeed,
        response_format: 'opus',
      });
      await this.trackUsage(workspaceId, estimateAudioTextTokens(text), 'audio.textToSpeech');

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AudioService.arrayBuffer');
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
        voice: ttsVoice,
        input: text,
        speed: ttsSpeed,
        response_format: 'opus',
      });
      await this.trackUsage(
        workspaceId,
        estimateAudioTextTokens(text) + 200,
        'audio.textToSpeechHD',
      );

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AudioService.arrayBuffer');
      this.logger.error('Text-to-speech HD failed:', error);
      throw error;
    }
  }
}
