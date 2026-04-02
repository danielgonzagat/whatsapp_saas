import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getTraceHeaders } from '../common/trace-headers'; // propagates X-Request-ID
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuid } from 'uuid';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PlanLimitsService } from '../billing/plan-limits.service';

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

  /**
   * Transcribes audio using OpenAI Whisper
   */
  async transcribe(
    audioBuffer: Buffer,
    language = 'pt',
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
        // tokenBudget: non-workspace context, budget tracked at caller level
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
        transcription = await this.openai.audio.transcriptions.create({
          file: fs.createReadStream(tempFile),
          model: resolveBackendOpenAIModel('audio_understanding_fallback', this.config),
          language,
          response_format: 'verbose_json',
        });
      }

      this.logger.log(`Transcription completed: ${transcription.text?.substring(0, 50)}...`);

      // TODO: wire workspaceId for budget tracking (transcribe has no workspaceId)
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
  ): Promise<{
    text: string;
    duration?: number;
    language: string;
  }> {
    try {
      const response = await fetch(audioUrl, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return this.transcribe(buffer, language);
    } catch (error) {
      this.logger.error(`Failed to transcribe from URL: ${audioUrl}`, error);
      throw error;
    }
  }

  /**
   * Transcribes base64 encoded audio
   */
  async transcribeFromBase64(
    base64Audio: string,
    language = 'pt',
  ): Promise<{
    text: string;
    duration?: number;
    language: string;
  }> {
    // Remove data URL prefix if present
    const base64Data = base64Audio.replace(/^data:audio\/[a-z]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    return this.transcribe(buffer, language);
  }

  /**
   * Generates speech from text using OpenAI TTS
   */
  async textToSpeech(text: string, voice?: string): Promise<Buffer> {
    try {
      const ttsVoice = voice || process.env.OPENAI_TTS_VOICE || 'nova';
      const ttsSpeed = parseFloat(process.env.OPENAI_TTS_SPEED || '1.0');

      // tokenBudget: non-workspace context, budget tracked at caller level
      const response = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: ttsVoice as any,
        input: text,
        speed: ttsSpeed,
        response_format: 'opus',
      });

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
  async textToSpeechHD(text: string, voice?: string): Promise<Buffer> {
    try {
      const ttsVoice = voice || process.env.OPENAI_TTS_VOICE || 'nova';
      const ttsSpeed = parseFloat(process.env.OPENAI_TTS_SPEED || '1.0');

      // tokenBudget: non-workspace context, budget tracked at caller level
      const response = await this.openai.audio.speech.create({
        model: 'tts-1-hd',
        voice: ttsVoice as any,
        input: text,
        speed: ttsSpeed,
        response_format: 'opus',
      });

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logger.error('Text-to-speech HD failed:', error);
      throw error;
    }
  }
}
