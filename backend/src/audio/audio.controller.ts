import { BadRequestException, Body, Controller, Post, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';

@ApiTags('audio')
@Controller('audio')
export class AudioController {
  @Public()
  @Post('synthesize')
  @ApiOperation({
    summary: 'Synthesizes speech from text (stub)',
    description:
      'Endpoint mantido para compatibilidade. Em ambientes sem provedor de TTS configurado, retorna resposta stub.',
  })
  async synthesize(
    @Body() body: { text?: string; voice?: string; speed?: number },
  ) {
    if (!body?.text || body.text.trim().length === 0) {
      throw new BadRequestException('text é obrigatório');
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new ServiceUnavailableException('TTS não configurado neste ambiente (OPENAI_API_KEY ausente)');
    }

    // TODO: implement real TTS using OpenAI API
    return {
      success: false,
      message: 'TTS não implementado ainda',
      voice: body.voice || null,
      speed: typeof body.speed === 'number' ? body.speed : null,
    };
  }
}
