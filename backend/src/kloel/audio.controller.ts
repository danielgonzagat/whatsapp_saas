import {
  Controller,
  Post,
  Body,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { AudioService } from './audio.service';
import { Response } from 'express';

// Multer file type
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('audio')
@Controller('kloel/audio')
export class AudioController {
  constructor(private readonly audioService: AudioService) {}

  @Post(':workspaceId/transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  @ApiOperation({ summary: 'Transcreve áudio usando Whisper' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        audio: {
          type: 'string',
          format: 'binary',
        },
        language: {
          type: 'string',
          default: 'pt',
        },
      },
    },
  })
  async transcribe(
    @Param('workspaceId') workspaceId: string,
    @UploadedFile() file: MulterFile,
    @Body('language') language = 'pt',
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo de áudio é obrigatório');
    }

    const result = await this.audioService.transcribe(file.buffer, language);

    return {
      success: true,
      workspaceId,
      transcription: result.text,
      duration: result.duration,
      language: result.language,
    };
  }

  @Post(':workspaceId/transcribe-url')
  @ApiOperation({ summary: 'Transcreve áudio a partir de URL' })
  async transcribeUrl(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { audioUrl: string; language?: string },
  ) {
    if (!body.audioUrl) {
      throw new BadRequestException('URL do áudio é obrigatória');
    }

    const result = await this.audioService.transcribeFromUrl(
      body.audioUrl,
      body.language || 'pt',
    );

    return {
      success: true,
      workspaceId,
      transcription: result.text,
      duration: result.duration,
      language: result.language,
    };
  }

  @Post(':workspaceId/transcribe-base64')
  @ApiOperation({ summary: 'Transcreve áudio a partir de base64' })
  async transcribeBase64(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { audio: string; language?: string },
  ) {
    if (!body.audio) {
      throw new BadRequestException('Áudio em base64 é obrigatório');
    }

    const result = await this.audioService.transcribeFromBase64(
      body.audio,
      body.language || 'pt',
    );

    return {
      success: true,
      workspaceId,
      transcription: result.text,
      duration: result.duration,
      language: result.language,
    };
  }

  @Post(':workspaceId/text-to-speech')
  @ApiOperation({ summary: 'Converte texto em áudio usando TTS' })
  async textToSpeech(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { 
      text: string; 
      voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
      hd?: boolean;
    },
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!body.text) {
      throw new BadRequestException('Texto é obrigatório');
    }

    const audioBuffer = body.hd
      ? await this.audioService.textToSpeechHD(body.text, body.voice || 'nova')
      : await this.audioService.textToSpeech(body.text, body.voice || 'nova');

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'attachment; filename="speech.mp3"',
    });

    return new StreamableFile(audioBuffer);
  }

  @Post(':workspaceId/text-to-speech-base64')
  @ApiOperation({ summary: 'Converte texto em áudio e retorna base64' })
  async textToSpeechBase64(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { 
      text: string; 
      voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
      hd?: boolean;
    },
  ) {
    if (!body.text) {
      throw new BadRequestException('Texto é obrigatório');
    }

    const audioBuffer = body.hd
      ? await this.audioService.textToSpeechHD(body.text, body.voice || 'nova')
      : await this.audioService.textToSpeech(body.text, body.voice || 'nova');

    const base64 = audioBuffer.toString('base64');
    const dataUrl = `data:audio/mpeg;base64,${base64}`;

    return {
      success: true,
      workspaceId,
      audio: dataUrl,
      format: 'mp3',
    };
  }
}
