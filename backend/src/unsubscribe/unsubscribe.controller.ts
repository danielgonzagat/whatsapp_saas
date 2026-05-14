import { Controller, Get, Logger, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { WebhookEndpoint } from '../common/decorators/webhook-endpoint.decorator';
import { UnsubscribeService } from './unsubscribe.service';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://kloel.com';

@Controller('unsubscribe')
export class UnsubscribeController {
  private readonly logger = new Logger(UnsubscribeController.name);

  constructor(private readonly unsubscribeService: UnsubscribeService) {}

  @WebhookEndpoint('Email unsubscribe external link')
  @Get()
  async unsubscribe(@Query('token') token: string, @Res() res: Response) {
    if (!token || typeof token !== 'string' || !token.trim()) {
      this.logger.warn('Unsubscribe request with missing token');
      return res.redirect(`${FRONTEND_URL}/unsubscribed?error=missing_token`);
    }

    const result = await this.unsubscribeService.processUnsubscribeToken(token.trim());

    if (result.success) {
      this.logger.log(`Unsubscribe successful: email=${result.email} contactId=${result.contactId}`);
      return res.redirect(`${FRONTEND_URL}/unsubscribed`);
    }

    this.logger.warn(`Unsubscribe failed: error=${result.error}`);
    return res.redirect(`${FRONTEND_URL}/unsubscribed?error=${result.error || 'invalid_token'}`);
  }
}
