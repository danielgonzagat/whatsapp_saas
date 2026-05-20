import {
  BadRequestException,
  Body,
  Controller,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { resolveBackendOpenAIModel } from '../lib/openai-models';

/**
 * @cluster whatsapp_saas/backend/audio
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
type AudioSynthesizeBody = {
  text?: string;
  voice?: string;
};

@ApiTags('Audio')
@ApiBearerAuth()
@Controller('audio')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('ai')
export class AudioController {
  @InternalEndpoint('audio speech synthesis tool')
  @Post('synthesize')
  @ApiOperation({ summary: 'Synthesize speech from text' })
  async synthesize(@Body() body: AudioSynthesizeBody | null) {
    const text = String(body?.text ?? '').trim();
    if (!text) {
      throw new BadRequestException('text é obrigatório');
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('TTS não configurado neste ambiente');
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: resolveBackendOpenAIModel('audio_speech'),
        voice: body?.voice || 'alloy',
        input: text,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('TTS indisponível neste momento');
    }

    const audio = Buffer.from(await response.arrayBuffer());
    return {
      contentType: response.headers.get('content-type') || 'audio/mpeg',
      audioBase64: audio.toString('base64'),
    };
  }
}
