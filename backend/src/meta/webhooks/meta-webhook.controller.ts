import { Controller, Get, Post, Body, Query, Headers, HttpCode, Logger, ForbiddenException } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { createHmac } from 'crypto';

@Controller('webhooks/meta')
export class MetaWebhookController {
  private readonly logger = new Logger(MetaWebhookController.name);

  @Public()
  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'kloel_meta_verify_2026';
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      this.logger.log('Meta webhook verified');
      return parseInt(challenge);
    }
    throw new ForbiddenException('Verification failed');
  }

  @Public()
  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Body() body: any,
    @Headers('x-hub-signature-256') signature: string,
  ) {
    // Validate signature
    const appSecret = process.env.META_APP_SECRET;
    if (appSecret && signature) {
      const expected = 'sha256=' + createHmac('sha256', appSecret).update(JSON.stringify(body)).digest('hex');
      if (signature !== expected) {
        this.logger.warn('Invalid Meta webhook signature');
        return 'ok';
      }
    }

    const object = body.object;
    this.logger.log(`Meta webhook: object=${object}, entries=${body.entry?.length || 0}`);

    for (const entry of body.entry || []) {
      try {
        switch (object) {
          case 'instagram':
            await this.handleInstagram(entry);
            break;
          case 'page':
            await this.handlePage(entry);
            break;
          case 'whatsapp_business_account':
            await this.handleWhatsAppCloud(entry);
            break;
        }
      } catch (err) {
        this.logger.error(`Meta webhook processing error: ${err}`);
      }
    }

    return 'ok';
  }

  private async handleInstagram(entry: any) {
    for (const msg of entry.messaging || []) {
      if (msg.message) {
        this.logger.log(`[IG] Message from ${msg.sender?.id}: ${msg.message?.text?.substring(0, 50)}`);
        // TODO: Route to InboundProcessorService when fully wired
      }
    }
    for (const change of entry.changes || []) {
      if (change.field === 'comments') {
        this.logger.log(`[IG] New comment: ${JSON.stringify(change.value).substring(0, 100)}`);
      }
    }
  }

  private async handlePage(entry: any) {
    for (const msg of entry.messaging || []) {
      if (msg.message) {
        this.logger.log(`[Messenger] Message from ${msg.sender?.id}: ${msg.message?.text?.substring(0, 50)}`);
      }
    }
  }

  private async handleWhatsAppCloud(entry: any) {
    for (const change of entry.changes || []) {
      if (change.field === 'messages') {
        for (const msg of change.value?.messages || []) {
          this.logger.log(`[WA Cloud] Message from ${msg.from}: ${msg.text?.body?.substring(0, 50)}`);
        }
      }
    }
  }
}
