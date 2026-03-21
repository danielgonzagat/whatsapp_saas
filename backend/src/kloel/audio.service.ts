import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuid } from 'uuid';
import {
  resolveBackendOpenAIModel,
  resolveVoiceProvider,
} from '../lib/openai-models';

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);
  private openai: OpenAI;

  constructor(private config: ConfigService) {
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
          model: resolveBackendOpenAIModel(
            'audio_understanding_fallback',
            this.config,
          ),
          language,
          response_format: 'verbose_json',
        });
      }

      this.logger.log(
        `Transcription completed: ${transcription.text?.substring(0, 50)}...`,
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
  ): Promise<{
    text: string;
    duration?: number;
    language: string;
  }> {
    try {
      const response = await fetch(audioUrl);
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
  async textToSpeech(
    text: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova',
  ): Promise<Buffer> {
    try {
      if (resolveVoiceProvider(this.config) === 'elevenlabs') {
        const apiKey = this.config.get<string>('ELEVENLABS_API_KEY');
        if (apiKey) {
          const voiceId =
            this.config.get<string>('ELEVENLABS_VOICE_ID') ||
            process.env.ELEVENLABS_VOICE_ID ||
            '21m00Tcm4TlvDq8ikWAM';
          const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'xi-api-key': apiKey,
              },
              body: JSON.stringify({
                text,
                model_id:
                  this.config.get<string>('ELEVENLABS_MODEL_ID') ||
                  'eleven_multilingual_v2',
                voice_settings: {
                  stability: 0.45,
                  similarity_boost: 0.8,
                },
              }),
            },
          );

          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
          }

          this.logger.warn(
            `ElevenLabs TTS failed with status ${response.status}, using OpenAI fallback`,
          );
        }
      }

      const response = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice,
        input: text,
        response_format: 'mp3',
      });

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logger.error('Text-to-speech failed:', error);
      throw error;
    }
  }

  /**
   * Generates high-quality speech from text
   */
  async textToSpeechHD(
    text: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova',
  ): Promise<Buffer> {
    try {
      if (resolveVoiceProvider(this.config) === 'elevenlabs') {
        return this.textToSpeech(text, voice);
      }

      const response = await this.openai.audio.speech.create({
        model: 'tts-1-hd',
        voice,
        input: text,
        response_format: 'mp3',
      });

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logger.error('Text-to-speech HD failed:', error);
      throw error;
    }
  }
}
