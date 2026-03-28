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
import { Request, Response } from 'express';
import { WhatsAppBrainService } from './whatsapp-brain.service';
import { KloelService } from './kloel.service';

@Controller('kloel/whatsapp')
export class WhatsAppBrainController {
  private readonly logger = new Logger(WhatsAppBrainController.name);

  constructor(
    private readonly whatsappBrain: WhatsAppBrainService,
    private readonly kloelService: KloelService,
  ) {}

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const VERIFY_TOKEN =
      process.env.WHATSAPP_VERIFY_TOKEN || 'kloel_whatsapp_verify_2024';
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      this.logger.log('Webhook verificado');
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Verification failed');
  }

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

  @Get('status')
  getStatus() {
    return {
      status: 'online',
      service: 'KLOEL WhatsApp Brain',
      version: '1.0.0',
    };
  }
}
