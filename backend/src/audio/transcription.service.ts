import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import * as path from 'path';
import FormData from 'form-data';

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);
  private readonly openaiKey: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.openaiKey = this.config.get<string>('OPENAI_API_KEY');
  }

  /**
   * Transcreve um arquivo de áudio usando OpenAI Whisper com retry e fallback.
   * @param filePath Caminho absoluto do arquivo de áudio (WAV/OGG/MP3/M4A)
   * @param language Código do idioma (opcional, ex: 'pt', 'en')
   */
  async transcribeAudio(
    filePath: string,
    language?: string,
  ): Promise<{ text: string; source: 'openai' | 'fallback' | 'error' }> {
    if (!existsSync(filePath)) {
      this.logger.error(`Arquivo não encontrado: ${filePath}`);
      return { text: '', source: 'error' };
    }

    // Tenta OpenAI Whisper com retry
    if (this.openaiKey) {
      const result = await this.transcribeWithOpenAI(filePath, language);
      if (result) {
        return { text: result, source: 'openai' };
      }
    }

    // Fallback: retorna vazio com log (pode ser expandido para Vosk/local STT)
    this.logger.warn(
      `Transcrição falhou para ${path.basename(filePath)}, usando fallback`,
    );
    return { text: '[Áudio não transcrito]', source: 'fallback' };
  }

  /**
   * Transcreve usando OpenAI Whisper API com retry exponencial.
   */
  private async transcribeWithOpenAI(
    filePath: string,
    language?: string,
  ): Promise<string | null> {
    const maxRetries = 3;
    const baseDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const form = new FormData();
        form.append('file', createReadStream(filePath));
        form.append('model', 'whisper-1');
        if (language) {
          form.append('language', language);
        }

        const response = await fetch(
          'https://api.openai.com/v1/audio/transcriptions',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.openaiKey}`,
              ...form.getHeaders(),
            },
            body: form as any,
          },
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return data.text || '';
      } catch (err: any) {
        this.logger.warn(
          `Transcrição OpenAI falhou (tentativa ${attempt}/${maxRetries}): ${err.message}`,
        );

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    return null;
  }

  /**
   * Baixa arquivo de URL e salva temporariamente.
   */
  async downloadToTemp(
    url: string,
    messageId: string,
  ): Promise<string | null> {
    try {
      const response = await fetch(url, { 
        signal: AbortSignal.timeout(30000) // 30s timeout
      });
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = this.guessExtension(url, response.headers.get('content-type'));
      const tempPath = path.join('/tmp', `audio_${messageId}${ext}`);
      
      await writeFile(tempPath, buffer);
      return tempPath;
    } catch (err: any) {
      this.logger.error(`Erro ao baixar áudio: ${err.message}`);
      return null;
    }
  }

  /**
   * Remove arquivo temporário.
   */
  async cleanup(filePath: string): Promise<void> {
    try {
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
    } catch {
      // Ignora erros de cleanup
    }
  }

  private guessExtension(url: string, contentType?: string | null): string {
    if (contentType?.includes('ogg')) return '.ogg';
    if (contentType?.includes('mp3') || contentType?.includes('mpeg')) return '.mp3';
    if (contentType?.includes('wav')) return '.wav';
    if (contentType?.includes('m4a') || contentType?.includes('mp4')) return '.m4a';
    
    // Tenta extrair da URL
    const match = url.match(/\.(ogg|mp3|wav|m4a|opus)(\?|$)/i);
    return match ? `.${match[1].toLowerCase()}` : '.ogg';
  }
}
