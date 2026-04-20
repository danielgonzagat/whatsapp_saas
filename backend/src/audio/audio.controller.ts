import {
  BadRequestException,
  Body,
  Controller,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import OpenAI from 'openai';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/** Audio controller. */
@ApiTags('audio')
@Controller('audio')
@UseGuards(JwtAuthGuard)
export class AudioController {
  @Post('synthesize')
  @ApiOperation({
    summary: 'Synthesizes speech from text via OpenAI TTS',
    description:
      'Converte texto em áudio usando a API OpenAI TTS. Requer OPENAI_API_KEY configurada no ambiente.',
  })
  async synthesize(
    @Body() body: { text?: string; voice?: string; speed?: number; idempotencyKey?: string },
  ) {
    if (!body?.text || body.text.trim().length === 0) {
      throw new BadRequestException('text é obrigatório');
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new ServiceUnavailableException(
        'TTS não configurado neste ambiente (OPENAI_API_KEY ausente)',
      );
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // tokenBudget: non-workspace context, budget tracked at caller level
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: (body.voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer') || 'alloy',
      input: body.text,
      ...(typeof body.speed === 'number' ? { speed: body.speed } : {}),
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      success: true,
      audio: buffer.toString('base64'),
      format: 'mp3',
    };
  }
}
