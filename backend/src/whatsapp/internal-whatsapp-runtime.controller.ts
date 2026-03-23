import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import {
  InboundMessage,
  InboundProcessorService,
} from './inbound-processor.service';

@Controller('internal/whatsapp-runtime')
export class InternalWhatsAppRuntimeController {
  constructor(private readonly inboundProcessor: InboundProcessorService) {}

  @Post('inbound')
  @Public()
  async ingestInbound(
    @Body() body: InboundMessage,
    @Headers('x-internal-key') internalKey?: string,
  ) {
    const expectedInternalKey = String(
      process.env.INTERNAL_API_KEY || '',
    ).trim();
    if (expectedInternalKey && internalKey !== expectedInternalKey) {
      throw new ForbiddenException('Invalid internal key');
    }

    const result = await this.inboundProcessor.process({
      ...body,
      provider: 'whatsapp-web-agent',
      ingestMode: body?.ingestMode || 'live',
    });

    return {
      success: true,
      ...result,
    };
  }
}
