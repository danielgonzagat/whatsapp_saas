import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  HttpCode,
  Logger,
  Res,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { Request, Response } from 'express';
import { WhatsAppBrainService } from './whatsapp-brain.service';
import { Public } from '../auth/public.decorator';
import { KloelService } from './kloel.service';

@Controller('kloel/whatsapp')
export class WhatsAppBrainController {
  private readonly logger = new Logger(WhatsAppBrainController.name);

  constructor(
    private readonly whatsappBrain: WhatsAppBrainService,
    private readonly kloelService: KloelService,
  ) {}

  @Public()
  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!VERIFY_TOKEN) {
      this.logger.error('WHATSAPP_VERIFY_TOKEN env var is not set');
      return res.status(500).send('Server misconfigured');
    }
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      this.logger.log('Webhook verificado');
      const sanitizedChallenge = sanitizeWebhookChallenge(challenge);
      if (!sanitizedChallenge) {
        return res.status(403).send('Verification failed');
      }
      return res.status(200).type('text/plain').send(sanitizedChallenge);
    }
    return res.status(403).send('Verification failed');
  }

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async receiveWebhook(
    @Req() req: Request,
    @Body() payload: any,
    @Query('workspace') workspaceId: string = 'default',
  ) {
    const signature = req.headers['x-hub-signature-256'] || req.headers['x-waha-signature'];
    if (!signature && process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Missing webhook signature');
    }

    // Validate HMAC-SHA256 signature against the request body
    const secret = process.env.WHATSAPP_API_WEBHOOK_SECRET || process.env.META_APP_SECRET;
    if (secret && signature) {
      const expected =
        'sha256=' + createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
      if (signature !== expected) {
        this.logger.warn('Invalid webhook signature');
        return { status: 'invalid_signature' };
      }
    }

    this.logger.log('Webhook POST recebido');
    try {
      await this.whatsappBrain.processWebhook(payload, workspaceId);
      return { status: 'ok' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  @Post('simulate/:workspaceId')
  async simulateConversation(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { customerMessage: string; customerPhone: string },
  ) {
    const response = await this.whatsappBrain.handleIncomingMessage({
      from: body.customerPhone,
      to: 'kloel_business',
      message: body.customerMessage,
      messageType: 'text',
      timestamp: new Date(),
      messageId: `sim_${Date.now()}`,
      workspaceId,
    });
    return { customerPhone: body.customerPhone, kloelResponse: response };
  }

  @Public()
  @Get('status')
  getStatus() {
    return {
      status: 'online',
      service: 'KLOEL WhatsApp Brain',
      version: '1.0.0',
    };
  }
}

function sanitizeWebhookChallenge(value: string): string {
  const challenge = String(value || '').trim();
  if (!challenge || challenge.length > 200) {
    return '';
  }

  for (const char of challenge) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    if (!isDigit && !isUpper && !isLower && char !== '_' && char !== '-' && char !== '.') {
      return '';
    }
  }

  return challenge;
}
